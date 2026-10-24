import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import sharp from "sharp";
import { HttpError } from "@/lib/http";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;

export function storageDirectory(): string {
  const directory = resolve(process.env.FILE_STORAGE_PATH || "data/uploads");
  const publicDirectory = resolve("public");
  if (directory === publicDirectory || directory.startsWith(`${publicDirectory}${sep}`)) {
    throw new Error("FILE_STORAGE_PATH deve ficar fora da pasta pública.");
  }
  return directory;
}

export function imagePath(filename: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i.test(filename)) {
    throw new Error("Identificador de arquivo inválido.");
  }
  return resolve(storageDirectory(), filename);
}

export async function writeRadiograph(input: Buffer): Promise<string> {
  if (!input.length || input.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "A radiografia deve ter até 10 MB.");
  }
  let normalized: Buffer;
  try {
    const decoder = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) !== 1) {
      throw new Error("Formato não permitido.");
    }
    // A saída não conserva EXIF, localização ou nome original do arquivo.
    normalized = await decoder.rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
  } catch {
    throw new HttpError(400, "Envie uma imagem JPEG, PNG ou WebP válida, de até 20 megapixels.");
  }
  await mkdir(storageDirectory(), { recursive: true, mode: 0o700 });
  const filename = `${randomUUID()}.jpg`;
  await writeFile(imagePath(filename), normalized, { mode: 0o600, flag: "wx" });
  return filename;
}

export async function readImage(filename: string): Promise<Buffer> {
  return readFile(imagePath(filename));
}

export async function removeImage(filename: string): Promise<void> {
  try {
    await unlink(imagePath(filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Used during synchronous database deletion transactions so cleanup can be retried. */
export function removeImageSync(filename: string): void {
  try {
    unlinkSync(imagePath(filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Limita o multipart antes de o parser manter o arquivo inteiro em memória. */
export async function readImageForm(request: Request): Promise<FormData> {
  const limit = MAX_IMAGE_BYTES + 128 * 1024;
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(400, "Envie a imagem em um formulário multipart.");
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > limit) throw new HttpError(413, "A radiografia deve ter até 10 MB.");
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
        throw new HttpError(413, "A radiografia deve ter até 10 MB.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Não foi possível ler o arquivo enviado.");
  } finally {
    reader.releaseLock();
  }
}
