import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.VERCEL === "1") {
  console.log("Build Next.js preparado para as funções da Vercel.");
  process.exit(0);
}

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");
if (!existsSync(resolve(standalone, "server.js"))) throw new Error("O build standalone não foi gerado.");
mkdirSync(resolve(standalone, ".next"), { recursive: true });
cpSync(resolve(root, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
cpSync(resolve(root, "public"), resolve(standalone, "public"), { recursive: true });
console.log("Servidor standalone preparado com os arquivos públicos.");
