import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { imagePath, MAX_IMAGE_BYTES, readImage, readImageForm, removeImage, storageDirectory, writeRadiograph } from "@/lib/storage";

test("radiografia é normalizada para JPEG privado e removida de forma idempotente", async () => {
  const directory = await mkdtemp(join(tmpdir(), "endodelivery-storage-test-"));
  const previous = process.env.FILE_STORAGE_PATH;
  process.env.FILE_STORAGE_PATH = directory;
  try {
    const input = await sharp({ create: { width: 32, height: 48, channels: 4, background: "#789abc" } }).png().toBuffer();
    const filename = await writeRadiograph(input);
    assert.match(filename, /^[a-f0-9-]+\.jpg$/);
    const bytes = await readImage(filename);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 32);
    assert.equal(metadata.height, 48);
    assert.equal(metadata.exif, undefined);
    assert.equal((await stat(imagePath(filename))).mode & 0o777, 0o600);
    await removeImage(filename);
    await removeImage(filename);
    await assert.rejects(readImage(filename), { code: "ENOENT" });
  } finally {
    if (previous === undefined) delete process.env.FILE_STORAGE_PATH; else process.env.FILE_STORAGE_PATH = previous;
    await rm(directory, { force: true, recursive: true });
  }
});

test("armazenamento rejeita arquivos inválidos, SVG, tamanhos excessivos e travessia de diretórios", async () => {
  await assert.rejects(writeRadiograph(Buffer.from("não é uma imagem")), /JPEG, PNG ou WebP/);
  await assert.rejects(writeRadiograph(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')), /JPEG, PNG ou WebP/);
  await assert.rejects(writeRadiograph(Buffer.alloc(MAX_IMAGE_BYTES + 1)), /10 MB/);
  assert.throws(() => imagePath("../../patient-data"), /inválido/);
  const previous = process.env.FILE_STORAGE_PATH;
  process.env.FILE_STORAGE_PATH = "public/private-radiographs";
  try { assert.throws(storageDirectory, /fora da pasta pública/); }
  finally { if (previous === undefined) delete process.env.FILE_STORAGE_PATH; else process.env.FILE_STORAGE_PATH = previous; }
});

test("multipart exige tipo correto e preserva campos dentro do limite", async () => {
  const form = new FormData();
  form.set("caption", "Legenda fictícia");
  form.set("file", new File(["ficticio"], "example.png", { type: "image/png" }));
  const parsed = await readImageForm(new Request("http://localhost/api/upload", { method: "POST", body: form }));
  assert.equal(parsed.get("caption"), "Legenda fictícia");
  assert.ok(parsed.get("file") instanceof File);
  await assert.rejects(readImageForm(new Request("http://localhost/api/upload", { method: "POST", body: "invalid" })), /multipart/);
  const request = new Request("http://localhost/api/upload", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(MAX_IMAGE_BYTES + 1_000_000) }, body: "" });
  await assert.rejects(readImageForm(request), /10 MB/);
});
