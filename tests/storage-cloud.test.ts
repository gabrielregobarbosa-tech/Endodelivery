import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  createRadiographStorage, maxImageBytes, MAX_IMAGE_BYTES, readImageForm, storageProvider,
  VERCEL_MAX_IMAGE_BYTES, type PrivateBlobClient,
} from "@/lib/storage";
import { ServiceError } from "@/lib/service-errors";

const token = "fictitious-unit-test-token";
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
  const service = createRadiographStorage({ env: { VERCEL: "1", FILE_STORAGE_PATH: neverCreated } });
  try {
    assert.throws(() => storageProvider({ VERCEL: "1" }), serviceCode("STORAGE_NOT_CONFIGURED"));
    assert.throws(() => storageProvider({ VERCEL: "1", STORAGE_PROVIDER: "local" }), serviceCode("STORAGE_PERSISTENCE_REQUIRED"));
    assert.throws(() => storageProvider({ STORAGE_PROVIDER: "public" }), serviceCode("STORAGE_PROVIDER_INVALID"));
    await assert.rejects(service.writeRadiograph(await inputImage()), serviceCode("STORAGE_NOT_CONFIGURED"));
    await assert.rejects(service.readImage(reference()), serviceCode("STORAGE_NOT_CONFIGURED"));
    await assert.rejects(service.removeImage(reference()), serviceCode("STORAGE_NOT_CONFIGURED"));
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
