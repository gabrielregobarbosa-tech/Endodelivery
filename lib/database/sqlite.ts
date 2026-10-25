import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { databasePath } from "./config";
import { databaseError } from "./errors";
import { sqliteSchema, authAttemptsSchema } from "./schema";
import { normalizeRow, type AsyncDatabase, type AsyncStatement, type Row } from "./types";

/** Preserve the original synchronous v1 bootstrap for existing files and integrity tools. */
export function initializeDatabase(path = databasePath()): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    if (path !== ":memory:") chmodSync(path, 0o600);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get()) {
        db.exec(sqliteSchema);
        db.prepare("INSERT INTO schema_migrations(version) VALUES (1)").run();
      }
      if (!db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get()) {
        db.exec(authAttemptsSchema);
        db.prepare("INSERT INTO schema_migrations(version) VALUES (2)").run();
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return db;
  } catch (error) { db.close(); throw error; }
}

class Mutex {
  private tail = Promise.resolve();
  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }
}

function parameters(values: unknown[]): SQLInputValue[] {
  return values.map((value) => {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value as SQLInputValue;
  });
}

class SqliteTransaction implements AsyncDatabase {
  readonly provider = "sqlite" as const;
  private sequence = 0;
  constructor(private readonly connection: DatabaseSync) {}

  prepare(sql: string): AsyncStatement {
    return {
      get: async (...values) => {
        try {
          const row = this.connection.prepare(sql).get(...parameters(values));
          return row ? normalizeRow(row as Row) : undefined;
        } catch (cause) { throw databaseError(cause); }
      },
      all: async (...values) => {
        try { return this.connection.prepare(sql).all(...parameters(values)).map((row) => normalizeRow(row as Row)); }
        catch (cause) { throw databaseError(cause); }
      },
      run: async (...values) => {
        try {
          const result = this.connection.prepare(sql).run(...parameters(values));
          return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
        } catch (cause) { throw databaseError(cause); }
      },
    };
  }

  async exec(sql: string): Promise<void> {
    try { this.connection.exec(sql); }
    catch (cause) { throw databaseError(cause); }
  }

  async transaction<T>(callback: (transaction: AsyncDatabase) => Promise<T>): Promise<T> {
    const name = `endodelivery_savepoint_${++this.sequence}`;
    await this.exec(`SAVEPOINT ${name}`);
    try {
      const result = await callback(this);
      await this.exec(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      try { await this.exec(`ROLLBACK TO SAVEPOINT ${name}`); await this.exec(`RELEASE SAVEPOINT ${name}`); }
      catch { /* Preserve the original failure; the outer transaction also rolls back. */ }
      throw error;
    }
  }

  async close(): Promise<void> { throw databaseError(new Error("Transaction client lifecycle is owned by its parent.")); }
}

export class SqliteDatabase implements AsyncDatabase {
  readonly provider = "sqlite" as const;
  private readonly mutex = new Mutex();
  private connection?: DatabaseSync;
  private closed = false;
  constructor(private readonly path: string, private readonly onClose?: () => void) {}

  private scoped(): SqliteTransaction {
    if (this.closed) throw databaseError(new Error("Database connection is closed."));
    try { this.connection ??= initializeDatabase(this.path); }
    catch (cause) { throw databaseError(cause); }
    return new SqliteTransaction(this.connection);
  }

  prepare(sql: string): AsyncStatement {
    return {
      get: (...values) => this.mutex.run(() => this.scoped().prepare(sql).get(...values)),
      all: (...values) => this.mutex.run(() => this.scoped().prepare(sql).all(...values)),
      run: (...values) => this.mutex.run(() => this.scoped().prepare(sql).run(...values)),
    };
  }

  async exec(sql: string): Promise<void> {
    if (/^\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql)) {
      throw databaseError(new Error("Use the scoped transaction API."));
    }
    await this.mutex.run(() => this.scoped().exec(sql));
  }

  async transaction<T>(callback: (transaction: AsyncDatabase) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      const scoped = this.scoped();
      await scoped.exec("BEGIN IMMEDIATE");
      try {
        const result = await callback(scoped);
        await scoped.exec("COMMIT");
        return result;
      } catch (error) {
        try { await scoped.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    await this.mutex.run(() => {
      if (this.closed) return;
      this.connection?.close();
      this.closed = true;
      this.onClose?.();
    });
  }
}
