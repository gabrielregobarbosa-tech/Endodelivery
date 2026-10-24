import { getDb } from "../lib/db";

const result = getDb().prepare("PRAGMA integrity_check").get();
if (result?.integrity_check !== "ok") throw new Error("A integridade do banco falhou.");
console.log("SQLite: conexão, migrações e integridade verificadas.");
