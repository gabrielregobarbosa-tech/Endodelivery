import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const root = process.cwd();
nextEnv.loadEnvConfig(root, false);
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || !["--port", "-p"].includes(args[0]))) {
  throw new Error("Use npm start ou npm start -- --port 3000.");
}
const port = args[1] || process.env.PORT || "3000";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Porta inválida.");
process.env.PORT = port;
process.env.HOSTNAME ||= "0.0.0.0";
process.env.DATABASE_PATH = resolve(root, process.env.DATABASE_PATH || "data/endodelivery.sqlite");
process.env.FILE_STORAGE_PATH = resolve(root, process.env.FILE_STORAGE_PATH || "data/uploads");
const publicDirectory = resolve(root, "public");
if (process.env.FILE_STORAGE_PATH === publicDirectory || process.env.FILE_STORAGE_PATH.startsWith(publicDirectory + sep)) {
  throw new Error("FILE_STORAGE_PATH deve ficar fora da pasta pública.");
}
const server = resolve(root, ".next/standalone/server.js");
if (!existsSync(server)) throw new Error("Execute npm run build antes de iniciar o servidor.");
await import(pathToFileURL(server).href);
