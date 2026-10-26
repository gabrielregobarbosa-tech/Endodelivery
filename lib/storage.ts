import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { del, get, put } from "@vercel/blob";
import sharp from "sharp";
import { HttpError } from "@/lib/http";
import { ServiceError } from "@/lib/service-errors";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const VERCEL_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const UUID_IMAGE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg";
const LOCAL_IMAGE = new RegExp(`^${UUID_IMAGE}$`, "i");
const BLOB_IMAGE = new RegExp(`^blob:(radiographs/${UUID_IMAGE})$`, "i");

type Environment = Record<string, string | undefined>;
type Provider = "local" | "vercel-blob";
type BlobAuthentication = { storeId: string; token?: never } | { token: string; storeId?: never };
type StorageConfiguration = { provider: "local" } | { provider: "vercel-blob"; authentication: BlobAuthentication };

export function maxImageBytes(env: Environment = process.env): number {
  return env.VERCEL === "1" ? VERCEL_MAX_IMAGE_BYTES : MAX_IMAGE_BYTES;
}

function sizeError(env: Environment): HttpError {
  return new HttpError(413, `A radiografia deve ter até ${maxImageBytes(env) / 1024 / 1024} MB. Exporte uma imagem menor e tente novamente.`);
}

function configuration(env: Environment): StorageConfiguration {
  const configured = env.STORAGE_PROVIDER?.trim();
  if (configured && !["local", "vercel-blob"].includes(configured)) throw new ServiceError("configuration", "STORAGE_PROVIDER_INVALID");
  const provider = configured || (env.VERCEL === "1" || env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID ? "vercel-blob" : "local");
  if (env.VERCEL === "1" && provider === "local") throw new ServiceError("configuration", "STORAGE_PERSISTENCE_REQUIRED");
  if (provider === "vercel-blob") {
    const storeId = env.BLOB_STORE_ID?.trim();
    // On Vercel, identity may arrive in request context rather than process.env.
    // Pass only the store: the SDK obtains and refreshes OIDC credentials itself.
    if (storeId && (env.VERCEL === "1" || env.VERCEL_OIDC_TOKEN?.trim())) {
      return { provider, authentication: { storeId } };
    }
    const token = env.BLOB_READ_WRITE_TOKEN?.trim();
    if (token) return { provider, authentication: { token } };
    throw new ServiceError("configuration", "STORAGE_NOT_CONFIGURED");
  }
  return { provider: "local" };
}

/** Validates configuration without returning credentials or contacting a storage service. */
export function storageProvider(env: Environment = process.env): Provider {
  return configuration(env).provider;
}

function localDirectory(env: Environment): string {
  const directory = resolve(env.FILE_STORAGE_PATH || "data/uploads");
  const publicDirectory = resolve("public");
  if (directory === publicDirectory || directory.startsWith(`${publicDirectory}${sep}`)) throw new ServiceError("configuration", "STORAGE_PATH_PUBLIC");
  return directory;
}

export function storageDirectory(): string { return localDirectory(process.env); }

function localImagePath(filename: string, env: Environment): string {
  if (!LOCAL_IMAGE.test(filename)) throw new Error("Identificador de arquivo inválido.");
  return resolve(localDirectory(env), filename);
}

export function imagePath(filename: string): string { return localImagePath(filename, process.env); }

function blobPath(reference: string): string {
  const match = BLOB_IMAGE.exec(reference);
  if (!match) throw new ServiceError("storage", "STORAGE_REFERENCE_INVALID");
  return match[1];
}

function missingImage(): NodeJS.ErrnoException {
  return Object.assign(new Error("Arquivo da radiografia não encontrado."), { code: "ENOENT" });
}

function operationalError(error: unknown): never {
  if (error instanceof ServiceError || error instanceof HttpError || (error as NodeJS.ErrnoException)?.code === "ENOENT") throw error;
  throw new ServiceError("storage", "STORAGE_UNAVAILABLE", error);
}

type PrivateBlobOptions = BlobAuthentication & { access: "private" };
export interface PrivateBlobClient {
  put(pathname: string, bytes: Buffer, options: PrivateBlobOptions & {
    addRandomSuffix: false; allowOverwrite: false; contentType: "image/jpeg"; cacheControlMaxAge: number;
  }): Promise<{ url: string; pathname: string }>;
  get(pathname: string, options: PrivateBlobOptions & { useCache: false }): Promise<{
    stream: ReadableStream<Uint8Array>; size: number; contentType: string;
  } | null>;
  del(pathname: string, options: BlobAuthentication): Promise<void>;
}

const privateBlobClient: PrivateBlobClient = {
  put: (pathname, bytes, options) => put(pathname, bytes, options),
  get: async (pathname, options) => {
    const result = await get(pathname, options);
    if (!result) return null;
    if (result.statusCode !== 200) throw new ServiceError("storage", "STORAGE_RESPONSE_INVALID");
    return { stream: result.stream, size: result.blob.size, contentType: result.blob.contentType };
  },
  del: (pathname, options) => del(pathname, options),
};

async function readBoundedImage(stream: ReadableStream<Uint8Array>, limit: number): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ServiceError("storage", "STORAGE_OBJECT_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

/** Unit tests inject a client; production always uses the official private Blob SDK. */
export function createRadiographStorage(options: { env?: Environment; blobClient?: PrivateBlobClient } = {}) {
  const env = options.env || process.env;
  const client = options.blobClient || privateBlobClient;
  return {
    async writeRadiograph(input: Buffer): Promise<string> {
      const settings = configuration(env);
      if (!input.length || input.length > maxImageBytes(env)) throw sizeError(env);
      let normalized: Buffer;
      try {
        const decoder = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "warning" });
        const metadata = await decoder.metadata();
        if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error("Formato não permitido.");
        // Preserve dimensions and remove EXIF; do not silently reduce diagnostic resolution.
        normalized = await decoder.rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
      } catch {
        throw new HttpError(400, "Envie uma imagem JPEG, PNG ou WebP válida, de até 20 megapixels.");
      }
      if (normalized.length > maxImageBytes(env)) throw sizeError(env);
      const filename = `${randomUUID()}.jpg`;
      try {
        if (settings.provider === "local") {
          await mkdir(localDirectory(env), { recursive: true, mode: 0o700 });
          await writeFile(localImagePath(filename, env), normalized, { mode: 0o600, flag: "wx" });
          return filename;
        }
        const pathname = `radiographs/${filename}`;
        const authentication = settings.authentication;
        const blob = await client.put(pathname, normalized, {
          ...authentication, access: "private", addRandomSuffix: false, allowOverwrite: false,
          contentType: "image/jpeg", cacheControlMaxAge: 60,
        });
        let privateResponse = false;
        try {
          const url = new URL(blob.url);
          privateResponse = url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
            && /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/i.test(url.hostname)
            && url.pathname === `/${pathname}` && blob.pathname === pathname;
        } catch { /* Malformed remote responses never become stored references. */ }
        if (!privateResponse) {
          await client.del(pathname, authentication);
          throw new ServiceError("configuration", "STORAGE_MUST_BE_PRIVATE");
        }
        // Persist only a logical pathname; the SDK derives its URL from the store or credential.
        return `blob:${pathname}`;
      } catch (error) { return operationalError(error); }
    },

    async readImage(reference: string): Promise<Buffer> {
      const settings = configuration(env);
      try {
        if (settings.provider === "local") return await readFile(localImagePath(reference, env));
        const blob = await client.get(blobPath(reference), { ...settings.authentication, access: "private", useCache: false });
        if (!blob) throw missingImage();
        if (blob.contentType !== "image/jpeg" || blob.size > maxImageBytes(env)) {
          await blob.stream.cancel();
          throw new ServiceError("storage", "STORAGE_OBJECT_INVALID");
        }
        const image = await readBoundedImage(blob.stream, maxImageBytes(env));
        if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) throw new ServiceError("storage", "STORAGE_OBJECT_INVALID");
        return image;
      } catch (error) { return operationalError(error); }
    },

    async removeImage(reference: string): Promise<void> {
      const settings = configuration(env);
      try {
        if (settings.provider === "vercel-blob") {
          await client.del(blobPath(reference), settings.authentication);
          return;
        }
        await unlink(localImagePath(reference, env));
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
        return operationalError(error);
      }
    },
  };
}

export const writeRadiograph = (input: Buffer): Promise<string> => createRadiographStorage().writeRadiograph(input);
export const readImage = (filename: string): Promise<Buffer> => createRadiographStorage().readImage(filename);
export const removeImage = (filename: string): Promise<void> => createRadiographStorage().removeImage(filename);

/** 4 MiB plus multipart overhead stays below Vercel's 4.5 MB request limit. */
export async function readImageForm(request: Request): Promise<FormData> {
  const limit = maxImageBytes() + 128 * 1024;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "multipart/form-data") throw new HttpError(400, "Envie a imagem em um formulário multipart.");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > limit) throw sizeError(process.env);
  if (!request.body) throw new HttpError(400, "Selecione uma imagem.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw sizeError(process.env);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Não foi possível ler o arquivo enviado.");
  } finally { reader.releaseLock(); }
}
