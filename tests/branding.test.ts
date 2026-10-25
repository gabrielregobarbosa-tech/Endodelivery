import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import test from "node:test";
import sharp from "sharp";
import manifest from "@/app/manifest";
import nextConfig from "../next.config";

const publicDirectory = resolve(process.cwd(), "public");

function publicAsset(url: string): string {
  const parsed = new URL(url, "https://endodelivery.example");
  assert.equal(parsed.origin, "https://endodelivery.example", "Os ícones não devem depender de serviços externos.");
  const path = resolve(publicDirectory, `.${parsed.pathname}`);
  assert.ok(path.startsWith(publicDirectory + sep));
  return path;
}

test("marca e favicon usam o mesmo SVG vetorial sem conteúdo ativo ou imagens incorporadas", async () => {
  const source = await readFile(publicAsset("/brand/mark.svg"));
  assert.deepEqual(await readFile(publicAsset("/icon.svg")), source);
  const svg = source.toString("utf8");
  assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?!#)/i);
  assert.match(svg, /#145E58/i);
  assert.match(svg, /#FFFFFF/i);
  const rasterized = await sharp(source).resize(32, 32).png().toBuffer();
  const { channels } = await sharp(rasterized).stats();
  assert.ok(channels.slice(0, 3).some((channel) => channel.stdev > 0), "O ícone deve conter o símbolo, não uma imagem vazia.");
});

test("ícones exportados atendem dimensões e transparência das plataformas", async () => {
  const assets = [
    { url: "/brand/favicon-16.png", size: 16 },
    { url: "/brand/favicon-32.png", size: 32 },
    { url: "/brand/apple-touch-icon.png", size: 180, opaque: true },
    { url: "/icon-192.png", size: 192 },
    { url: "/icon-512.png", size: 512 },
    { url: "/icon-maskable-512.png", size: 512, opaque: true },
    { url: "/brand/ios-app-icon-1024.png", size: 1024, opaque: true },
  ];
  for (const asset of assets) {
    const metadata = await sharp(publicAsset(asset.url)).metadata();
    assert.equal(metadata.format, "png", asset.url);
    assert.equal(metadata.width, asset.size, asset.url);
    assert.equal(metadata.height, asset.size, asset.url);
    if (asset.opaque) assert.equal(metadata.hasAlpha, false, `${asset.url} deve ter fundo opaco.`);
  }
});

test("manifest anuncia arquivos existentes com tamanhos corretos e permitidos pela CSP", async () => {
  const configuration = manifest();
  const icons = configuration.icons ?? [];
  assert.ok(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of icons) {
    const metadata = await sharp(publicAsset(icon.src)).metadata();
    assert.equal(icon.type, metadata.format === "svg" ? "image/svg+xml" : "image/png", icon.src);
    if (icon.sizes !== "any") assert.equal(icon.sizes, `${metadata.width}x${metadata.height}`, icon.src);
    if (icon.purpose === "maskable") assert.equal(metadata.hasAlpha, false, icon.src);
  }
  assert.ok(nextConfig.headers);
  const headers = await nextConfig.headers();
  const contentPolicy = headers.find((entry) => entry.source === "/:path*")?.headers
    .find((header) => header.key.toLowerCase() === "content-security-policy")?.value;
  assert.ok(contentPolicy, "A política de conteúdo deve estar configurada.");
  const imagePolicy = contentPolicy.split(";").find((directive) => directive.trim().startsWith("img-src "));
  assert.ok(imagePolicy?.split(/\s+/).includes("'self'"), "A CSP deve permitir os ícones locais.");
});

test("instalação do service worker encontra todos os recursos públicos anunciados", async () => {
  const worker = await readFile(publicAsset("/sw.js"), "utf8");
  const declaration = worker.match(/const PUBLIC_ASSETS = (\[[^;]+\]);/);
  assert.ok(declaration, "A lista de recursos offline deve estar disponível para validação.");
  const resources = JSON.parse(declaration[1]) as string[];
  for (const resource of resources) {
    assert.doesNotMatch(resource, /^\/api\/|\/patients|\/documents|\/profile/);
    assert.ok((await readFile(publicAsset(resource))).byteLength > 0, resource);
  }
});
