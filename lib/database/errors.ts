import { ServiceError } from "@/lib/service-errors";

export function databaseError(cause: unknown): ServiceError {
  return cause instanceof ServiceError ? cause : new ServiceError("database", "DATABASE_UNAVAILABLE", cause);
}

export function databaseErrorCode(error: unknown): string | number | undefined {
  const visited = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const value = current as { code?: string; errcode?: number; cause?: unknown };
    if (value.errcode) return value.errcode;
    if (value.code && value.code !== "DATABASE_UNAVAILABLE") return value.code;
    current = value.cause;
  }
  return undefined;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return ["23505", "SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_PRIMARYKEY", 2067, 1555].includes(databaseErrorCode(error) ?? "");
}
