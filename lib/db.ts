import { createHash } from "node:crypto";
import { databaseConfiguration } from "./database/config";
import { PostgresDatabase } from "./database/postgres";
import { SqliteDatabase } from "./database/sqlite";
import type { AsyncDatabase } from "./database/types";

export { databaseConfiguration, databasePath, storagePath, postgresPoolConfiguration } from "./database/config";
export { databaseErrorCode, isUniqueConstraintError } from "./database/errors";
export { initializeDatabase } from "./database/sqlite";
export type { AsyncDatabase, AsyncStatement, Database, DatabaseProvider, Row, RunResult } from "./database/types";
export const LATEST_DATABASE_VERSION = 2;

const globalDatabases = globalThis as unknown as { endodeliveryAsyncDatabases?: Map<string, AsyncDatabase> };
const databases = globalDatabases.endodeliveryAsyncDatabases ??= new Map<string, AsyncDatabase>();

/** Use managed PostgreSQL when configured. Vercel never falls back to local/temporary clinical files. */
export function getDb(): AsyncDatabase {
  const configuration = databaseConfiguration();
  const identity = configuration.provider === "postgres" ? configuration.connectionString : configuration.path;
  const key = `${configuration.provider}:${createHash("sha256").update(identity).digest("hex")}`;
  let database = databases.get(key);
  if (!database) {
    const onClose = () => databases.delete(key);
    database = configuration.provider === "postgres"
      ? new PostgresDatabase(configuration.connectionString, onClose)
      : new SqliteDatabase(configuration.path, onClose);
    databases.set(key, database);
  }
  return database;
}

export async function closeAsyncDatabases(): Promise<void> {
  await Promise.all([...databases.values()].map((database) => database.close()));
}
