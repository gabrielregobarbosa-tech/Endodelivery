import { resolve } from "node:path";
import type { PoolConfig } from "pg";
import { ServiceError } from "@/lib/service-errors";

export function databasePath(): string {
  return process.env.DATABASE_PATH || resolve(process.cwd(), "data/endodelivery.sqlite");
}

export function storagePath(): string {
  return resolve(process.env.FILE_STORAGE_PATH || "data/uploads");
}

export type DatabaseConfiguration =
  | { provider: "sqlite"; path: string }
  | { provider: "postgres"; connectionString: string };

export function databaseConfiguration(): DatabaseConfiguration {
  const selected = process.env.DATABASE_PROVIDER;
  if (selected && !["sqlite", "postgres"].includes(selected)) {
    throw new ServiceError("configuration", "DATABASE_PROVIDER_INVALID");
  }
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (process.env.VERCEL === "1" && (selected === "sqlite" || !connectionString)) {
    throw new ServiceError("configuration", "PERSISTENT_DATABASE_REQUIRED");
  }
  if (selected === "postgres" && !connectionString) {
    throw new ServiceError("configuration", "DATABASE_URL_REQUIRED");
  }
  if (connectionString && selected !== "sqlite") return { provider: "postgres", connectionString };
  return { provider: "sqlite", path: databasePath() };
}

/** Remote databases always retain certificate and hostname validation. */
export function postgresPoolConfiguration(connectionString: string): PoolConfig {
  let url: URL;
  try { url = new URL(connectionString); }
  catch (cause) { throw new ServiceError("configuration", "DATABASE_URL_INVALID", cause); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") {
    throw new ServiceError("configuration", "DATABASE_URL_INVALID");
  }
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  const mode = url.searchParams.get("sslmode");
  if (mode === "no-verify") throw new ServiceError("configuration", "DATABASE_TLS_REQUIRED");
  if (!local) {
    if (mode && !["require", "verify-ca", "verify-full"].includes(mode)) {
      throw new ServiceError("configuration", "DATABASE_TLS_REQUIRED");
    }
    // Common pooled URLs use sslmode=require; enforce the stronger verify-full semantics.
    url.searchParams.set("sslmode", "verify-full");
  }
  if (local && mode && ["require", "verify-ca", "verify-full"].includes(mode)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return {
    connectionString: url.toString(),
    ssl: local && (!mode || mode === "disable") ? false : { rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    application_name: "endodelivery",
  };
}
