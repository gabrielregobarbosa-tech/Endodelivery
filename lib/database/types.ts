export type Row = Record<string, unknown>;
export type DatabaseProvider = "sqlite" | "postgres";

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface AsyncStatement {
  get(...parameters: unknown[]): Promise<Row | undefined>;
  all(...parameters: unknown[]): Promise<Row[]>;
  run(...parameters: unknown[]): Promise<RunResult>;
}

/** Transaction callbacks must issue their queries through the supplied scoped client. */
export interface AsyncDatabase {
  readonly provider: DatabaseProvider;
  prepare(sql: string): AsyncStatement;
  exec(sql: string): Promise<void>;
  transaction<T>(callback: (transaction: AsyncDatabase) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type Database = AsyncDatabase;

/** Normalize aggregate counts while leaving clinical text and identifiers untouched. */
export function normalizeRow(row: Row): Row {
  const result = { ...row };
  for (const field of ["count", "visit_count", "ready", "version"]) {
    const value = result[field];
    if (typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
      result[field] = Number(value);
    }
  }
  return result;
}
