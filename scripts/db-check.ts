import { getDb, LATEST_DATABASE_VERSION, type AsyncDatabase } from "../lib/db";
import { ServiceError } from "../lib/service-errors";

let database: AsyncDatabase | undefined;
try {
  database = getDb();
  if (database.provider === "sqlite") {
    const result = await database.prepare("PRAGMA integrity_check").get();
    if (result?.integrity_check !== "ok") throw new Error("A integridade do banco falhou.");
  } else {
    const result = await database.prepare("SELECT 1 AS ready").get();
    if (result?.ready !== 1) throw new Error("A conexão com o banco falhou.");
  }
  const migration = await database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
  if (migration?.version !== LATEST_DATABASE_VERSION) throw new Error("A migração do banco não foi aplicada.");
  console.log(`${database.provider}: conexão e migrações verificadas.`);
} catch (error) {
  // Raw driver/URL exceptions can contain connection details; expose only the stable diagnostic code.
  console.error(error instanceof ServiceError
    ? `Não foi possível verificar o banco (${error.code}). Confira a configuração e a disponibilidade do serviço.`
    : "Não foi possível verificar a conexão, a integridade ou as migrações do banco.");
  process.exitCode = 1;
} finally {
  try { await database?.close(); }
  catch { console.error("Não foi possível encerrar a conexão de verificação do banco."); process.exitCode = 1; }
}
