import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import {
  createRadiographStorage, maxImageBytes, MAX_IMAGE_BYTES, readImageForm, storageProvider,
  VERCEL_MAX_IMAGE_BYTES, type PrivateBlobClient,
} from "@/lib/storage";
import { ServiceError } from "@/lib/service-errors";

const token = "fictitious-unit-test-token";
const storeId = "store_fictitious-unit-store";
const env = { VERCEL: "1", STORAGE_PROVIDER: "vercel-blob", BLOB_READ_WRITE_TOKEN: token };
const reference = () => `blob:radiographs/${randomUUID()}.jpg`;
const serviceCode = (code: string) => (error: unknown) => error instanceof ServiceError && error.code === code;

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

async function inputImage(): Promise<Buffer> {
  return sharp({ create: { width: 24, height: 36, channels: 4, background: "#687b89" } }).png().toBuffer();
}

test("Vercel exige armazenamento persistente configurado e nunca cria diretório de fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "endodelivery-storage-config-"));
  const neverCreated = join(directory, "not-created");
  try {
    for (const incomplete of [
      { VERCEL: "1" },
      { VERCEL: "1", BLOB_STORE_ID: " " },
      { VERCEL: "1", VERCEL_OIDC_TOKEN: "fictitious-identity-without-store" },
      { BLOB_STORE_ID: storeId },
      { BLOB_STORE_ID: storeId, VERCEL_OIDC_TOKEN: " " },
      { STORAGE_PROVIDER: "vercel-blob", BLOB_READ_WRITE_TOKEN: " " },
    ]) {
      const settings = { ...incomplete, FILE_STORAGE_PATH: neverCreated };
      const service = createRadiographStorage({ env: settings });
      assert.throws(() => storageProvider(settings), serviceCode("STORAGE_NOT_CONFIGURED"));
      await assert.rejects(service.writeRadiograph(await inputImage()), serviceCode("STORAGE_NOT_CONFIGURED"));
      await assert.rejects(service.readImage(reference()), serviceCode("STORAGE_NOT_CONFIGURED"));
      await assert.rejects(service.removeImage(reference()), serviceCode("STORAGE_NOT_CONFIGURED"));
    }
    assert.throws(() => storageProvider({ VERCEL: "1", STORAGE_PROVIDER: "local" }), serviceCode("STORAGE_PERSISTENCE_REQUIRED"));
    assert.throws(() => storageProvider({ STORAGE_PROVIDER: "public" }), serviceCode("STORAGE_PROVIDER_INVALID"));
    await assert.rejects(stat(neverCreated), { code: "ENOENT" });
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("adaptador de Blob usa operações privadas autenticadas e salva somente uma referência lógica", async () => {
  const objects = new Map<string, Buffer>();
  let reads = 0;
  const client: PrivateBlobClient = {
    async put(pathname, bytes, options) {
      assert.equal(options.access, "private"); assert.equal(options.token, token);
      assert.equal(options.addRandomSuffix, false); assert.equal(options.allowOverwrite, false);
      assert.equal(options.contentType, "image/jpeg"); assert.equal(options.cacheControlMaxAge, 60);
      objects.set(pathname, Buffer.from(bytes));
      return { pathname, url: `https://unit-store.private.blob.vercel-storage.com/${pathname}` };
    },
    async get(pathname, options) {
      assert.equal(options.access, "private"); assert.equal(options.useCache, false); assert.equal(options.token, token);
      reads++;
      const bytes = objects.get(pathname);
      return bytes ? { stream: stream(new Uint8Array(bytes)), size: bytes.length, contentType: "image/jpeg" } : null;
    },
    async del(pathname, options) { assert.equal(options.token, token); objects.delete(pathname); },
  };
  const service = createRadiographStorage({ env, blobClient: client });
  const key = await service.writeRadiograph(await inputImage());
  assert.match(key, /^blob:radiographs\/[a-f0-9-]+\.jpg$/);
  assert.ok(!key.includes("https:") && !key.includes(token));
  const bytes = await service.readImage(key);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "jpeg"); assert.equal(metadata.width, 24); assert.equal(metadata.height, 36);
  assert.equal(metadata.exif, undefined); assert.equal(reads, 1);
  await service.removeImage(key); await service.removeImage(key);
  assert.equal(objects.size, 0);
  await assert.rejects(service.readImage(key), { code: "ENOENT" });
  const count = reads;
  for (const invalid of ["blob:https://untrusted.example/image.jpg", "blob:radiographs/../image.jpg", "https://untrusted.example/a.jpg", `${randomUUID()}.jpg`]) {
    await assert.rejects(service.readImage(invalid), serviceCode("STORAGE_REFERENCE_INVALID"));
    await assert.rejects(service.removeImage(invalid), serviceCode("STORAGE_REFERENCE_INVALID"));
  }
  assert.equal(reads, count);
});

test("store conectado usa OIDC do SDK em todas as operações sem copiar credenciais de identidade", async () => {
  for (const settings of [
    // Vercel can supply identity through request context, without an env token.
    { VERCEL: "1", BLOB_STORE_ID: storeId },
    { ...env, BLOB_STORE_ID: storeId },
    { BLOB_STORE_ID: storeId, VERCEL_OIDC_TOKEN: "fictitious-rotating-identity" },
  ]) {
    const objects = new Map<string, Buffer>();
    const calls: string[] = [];
    const assertIdentity = (options: object) => {
      assert.equal((options as { storeId: string }).storeId, storeId);
      assert.ok(!Object.hasOwn(options, "token"));
      assert.ok(!Object.hasOwn(options, "oidcToken"));
    };
    const client: PrivateBlobClient = {
      async put(pathname, bytes, options) {
        assertIdentity(options); assert.equal(options.access, "private");
        assert.equal(options.allowOverwrite, false); assert.equal(options.addRandomSuffix, false);
        objects.set(pathname, Buffer.from(bytes)); calls.push("put");
        return { pathname, url: `https://unit-store.private.blob.vercel-storage.com/${pathname}` };
      },
      async get(pathname, options) {
        assertIdentity(options); assert.equal(options.access, "private"); assert.equal(options.useCache, false);
        calls.push("get");
        const bytes = objects.get(pathname);
        return bytes ? { stream: stream(bytes), size: bytes.length, contentType: "image/jpeg" } : null;
      },
      async del(pathname, options) { assertIdentity(options); calls.push("del"); objects.delete(pathname); },
    };
    assert.equal(storageProvider(settings), "vercel-blob");
    const service = createRadiographStorage({ env: settings, blobClient: client });
    const key = await service.writeRadiograph(await inputImage());
    assert.match(key, /^blob:radiographs\/[a-f0-9-]+\.jpg$/);
    assert.ok(!key.includes(storeId));
    const bytes = await service.readImage(key);
    assert.equal((await sharp(bytes).metadata()).format, "jpeg");
    await service.removeImage(key);
    assert.deepEqual(calls, ["put", "get", "del"]);
    assert.equal(objects.size, 0);
    await assert.rejects(service.readImage(key), { code: "ENOENT" });
  }
});

test("SDK instalado resolve a identidade atual do contexto Vercel a cada operação sem acessar a rede", async () => {
  const contextKey = Symbol.for("@vercel/request-context");
  const previousContext = Object.getOwnPropertyDescriptor(globalThis, contextKey);
  const previousDispatcher = getGlobalDispatcher();
  const transport = new MockAgent();
  transport.disableNetConnect();
  const previousEnv = { BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN, VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN };
  const identities = [0, 1, 2].map(sequence => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, sub: "fictitious-test", sequence })).toString("base64url");
    return `eyJhbGciOiJub25lIn0.${payload}.fictitious-signature`;
  });
  let currentIdentity = identities[0];
  let pathname = "";
  const api = transport.get("https://vercel.com");
  const privateStore = transport.get("https://fictitious-unit-store.private.blob.vercel-storage.com");
  const image = await sharp(await inputImage()).jpeg().toBuffer();
  try {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL_OIDC_TOKEN;
    Object.defineProperty(globalThis, contextKey, { configurable: true, value: {
      get: () => ({ headers: { "x-vercel-oidc-token": currentIdentity } }),
    } });
    setGlobalDispatcher(transport);
    api.intercept({ method: "PUT", path: /^\/api\/blob\/\?pathname=/, headers: {
      authorization: `Bearer ${identities[0]}`, "x-vercel-blob-store-id": "fictitious-unit-store", "x-vercel-blob-access": "private",
    } }).reply(options => {
      pathname = new URL(options.path, "https://vercel.com").searchParams.get("pathname")!;
      return { statusCode: 200, data: { pathname, url: `https://fictitious-unit-store.private.blob.vercel-storage.com/${pathname}` } };
    });
    const service = createRadiographStorage({ env: { VERCEL: "1", BLOB_STORE_ID: storeId } });
    const key = await service.writeRadiograph(await inputImage());
    assert.equal(key, `blob:${pathname}`);
    currentIdentity = identities[1];
    privateStore.intercept({ method: "GET", path: `/${pathname}?cache=0`, headers: {
      authorization: `Bearer ${identities[1]}`,
    } }).reply(200, image, { headers: { "content-type": "image/jpeg", "content-length": String(image.length) } });
    assert.deepEqual(await service.readImage(key), image);
    currentIdentity = identities[2];
    api.intercept({ method: "POST", path: "/api/blob/delete", headers: {
      authorization: `Bearer ${identities[2]}`, "x-vercel-blob-store-id": "fictitious-unit-store",
    } }).reply(200, {});
    await service.removeImage(key);
    transport.assertNoPendingInterceptors();
  } finally {
    setGlobalDispatcher(previousDispatcher);
    if (previousContext) Object.defineProperty(globalThis, contextKey, previousContext);
    else Reflect.deleteProperty(globalThis, contextKey);
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await transport.close();
  }
});

test("fora da Vercel um token estático autentica um store sem identidade OIDC", async () => {
  const calls: string[] = [];
  const client: PrivateBlobClient = {
    async put(pathname, bytes, options) {
      assert.equal(options.token, token); assert.ok(!Object.hasOwn(options, "storeId"));
      calls.push("put");
      return { pathname, url: `https://unit-store.private.blob.vercel-storage.com/${pathname}` };
    },
    async get(pathname, options) {
      assert.equal(options.token, token); assert.ok(!Object.hasOwn(options, "storeId"));
      calls.push("get"); return null;
    },
    async del(pathname, options) {
      assert.equal(options.token, token); assert.ok(!Object.hasOwn(options, "storeId")); calls.push("del");
    },
  };
  const settings = { BLOB_STORE_ID: storeId, BLOB_READ_WRITE_TOKEN: token };
  assert.equal(storageProvider(settings), "vercel-blob");
  const service = createRadiographStorage({ env: settings, blobClient: client });
  const key = await service.writeRadiograph(await inputImage());
  await assert.rejects(service.readImage(key), { code: "ENOENT" });
  await service.removeImage(key);
  assert.deepEqual(calls, ["put", "get", "del"]);
});

test("identidade OIDC sem store mantém armazenamento local fora da Vercel", async () => {
  const directory = await mkdtemp(join(tmpdir(), "endodelivery-unrelated-identity-"));
  const settings = { VERCEL_OIDC_TOKEN: "fictitious-token-no-blob", FILE_STORAGE_PATH: directory };
  const client: PrivateBlobClient = {
    async put() { throw new Error("Identidade genérica não deve selecionar Blob."); },
    async get() { throw new Error("Identidade genérica não deve selecionar Blob."); },
    async del() { throw new Error("Identidade genérica não deve selecionar Blob."); },
  };
  try {
    assert.equal(storageProvider(settings), "local");
    const service = createRadiographStorage({ env: settings, blobClient: client });
    const key = await service.writeRadiograph(await inputImage());
    assert.match(key, /^[a-f0-9-]+\.jpg$/);
    const metadata = await sharp(await service.readImage(key)).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 24); assert.equal(metadata.height, 36);
    await service.removeImage(key);
    await assert.rejects(stat(join(directory, key)), { code: "ENOENT" });
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("OIDC mantém a rejeição de store público e usa a mesma identidade para remover o objeto", async () => {
  let removed = "";
  const client: PrivateBlobClient = {
    async put(pathname, bytes, options) {
      assert.equal(options.storeId, storeId); assert.ok(!Object.hasOwn(options, "token"));
      return { pathname, url: `https://unit-store.public.blob.vercel-storage.com/${pathname}` };
    },
    async get() { throw new Error("Não deve consultar o objeto público."); },
    async del(pathname, options) {
      assert.deepEqual(options, { storeId }); removed = pathname;
    },
  };
  const service = createRadiographStorage({ env: { VERCEL: "1", BLOB_STORE_ID: storeId }, blobClient: client });
  await assert.rejects(service.writeRadiograph(await inputImage()), serviceCode("STORAGE_MUST_BE_PRIVATE"));
  assert.match(removed, /^radiographs\/[a-f0-9-]+\.jpg$/);
});

test("uma resposta de store público é rejeitada e o objeto recém-enviado é removido", async () => {
  let removed = "";
  const client: PrivateBlobClient = {
    async put(pathname) { return { pathname, url: `https://unit-store.public.blob.vercel-storage.com/${pathname}` }; },
    async get() { throw new Error("Não deve consultar o objeto público."); },
    async del(pathname) { removed = pathname; },
  };
  const service = createRadiographStorage({ env, blobClient: client });
  await assert.rejects(service.writeRadiograph(await inputImage()), serviceCode("STORAGE_MUST_BE_PRIVATE"));
  assert.match(removed, /^radiographs\/[a-f0-9-]+\.jpg$/);
});

test("limite Vercel de 4 MiB preserva margem para multipart e difere do limite local de 10 MiB", async () => {
  assert.equal(maxImageBytes({ VERCEL: "1" }), VERCEL_MAX_IMAGE_BYTES);
  assert.equal(maxImageBytes({}), MAX_IMAGE_BYTES);
  assert.ok(VERCEL_MAX_IMAGE_BYTES + 128 * 1024 < 4_500_000);
  const service = createRadiographStorage({ env });
  await assert.rejects(service.writeRadiograph(Buffer.alloc(VERCEL_MAX_IMAGE_BYTES + 1)), /4 MB/);
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const request = new Request("http://localhost/api/upload", { method: "POST", headers: {
      "content-type": "multipart/form-data; boundary=x", "content-length": String(VERCEL_MAX_IMAGE_BYTES + 1_000_000),
    }, body: "" });
    await assert.rejects(readImageForm(request), /4 MB/);
  } finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
});

test("falhas remotas são classificadas sem revelar mensagens internas e leituras são limitadas", async () => {
  const client: PrivateBlobClient = {
    async put() { throw new Error("diagnóstico interno do serviço fictício"); },
    async get() { throw new Error("diagnóstico interno do serviço fictício"); },
    async del() { throw new Error("diagnóstico interno do serviço fictício"); },
  };
  const service = createRadiographStorage({ env, blobClient: client });
  await assert.rejects(service.readImage(reference()), error => serviceCode("STORAGE_UNAVAILABLE")(error) && !(error as Error).message.includes("diagnóstico"));
  await assert.rejects(service.writeRadiograph(await inputImage()), serviceCode("STORAGE_UNAVAILABLE"));
  await assert.rejects(service.removeImage(reference()), serviceCode("STORAGE_UNAVAILABLE"));
  const oversized: PrivateBlobClient = {
    ...client,
    async get() { return { stream: stream(new Uint8Array(VERCEL_MAX_IMAGE_BYTES + 1)), size: 1, contentType: "image/jpeg" }; },
  };
  await assert.rejects(createRadiographStorage({ env, blobClient: oversized }).readImage(reference()), serviceCode("STORAGE_OBJECT_TOO_LARGE"));
});
