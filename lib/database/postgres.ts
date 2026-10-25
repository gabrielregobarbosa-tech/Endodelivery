import { Pool, type PoolClient, type PoolConfig, type QueryResult } from "pg";
import { databaseError } from "./errors";
import { postgresPoolConfiguration } from "./config";
import { authAttemptsSchema, postgresMigrationTable, postgresSchema } from "./schema";
import { postgresPlaceholders } from "./sql";
import { normalizeRow, type AsyncDatabase, type AsyncStatement, type Row } from "./types";

interface PgConnection {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
}

class PostgresTransaction implements AsyncDatabase {
  readonly provider = "postgres" as const;
  private sequence = 0;
  constructor(private readonly connection: PgConnection) {}

  private async query(sql: string, values: unknown[] = []): Promise<QueryResult> {
    const compiled = postgresPlaceholders(sql);
    if (compiled.count !== values.length) throw databaseError(new Error("Invalid parameter count."));
    try { return await this.connection.query(compiled.text, values); }
    catch (cause) { throw databaseError(cause); }
  }

  prepare(sql: string): AsyncStatement {
    return {
      get: async (...values) => {
        const result = await this.query(sql, values);
        return result.rows[0] ? normalizeRow(result.rows[0] as Row) : undefined;
      },
      all: async (...values) => (await this.query(sql, values)).rows.map((row) => normalizeRow(row as Row)),
      run: async (...values) => ({ changes: (await this.query(sql, values)).rowCount || 0 }),
    };
  }

  async exec(sql: string): Promise<void> {
    try { await this.connection.query(sql); }
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
      catch { /* Preserve the original failure. */ }
      throw error;
    }
  }

  async close(): Promise<void> { throw databaseError(new Error("Transaction client lifecycle is owned by its parent.")); }
}

export class PostgresDatabase implements AsyncDatabase {
  readonly provider = "postgres" as const;
  private readonly pool: Pool;
  private ready?: Promise<void>;
  private closed = false;
  constructor(connectionString: string, private readonly onClose?: () => void, poolOverrides: Pick<PoolConfig, "max"> = {}) {
    this.pool = new Pool({ ...postgresPoolConfiguration(connectionString), ...poolOverrides });
    // pg removes failed idle clients from its pool; do not log connection strings or SQL.
    this.pool.on("error", () => { this.ready = undefined; });
  }

  private async migrate(): Promise<void> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      // Serializes simultaneous serverless cold starts, including migration table creation.
      await client.query("SELECT pg_advisory_xact_lock(1162757199, 1)");
      await client.query(postgresMigrationTable);
      const current = await client.query("SELECT version FROM schema_migrations WHERE version = 1");
      if (!current.rowCount) {
        await client.query(postgresSchema);
        await client.query("INSERT INTO schema_migrations(version) VALUES (1)");
      }
      const second = await client.query("SELECT version FROM schema_migrations WHERE version = 2");
      if (!second.rowCount) {
        await client.query(authAttemptsSchema);
        await client.query("INSERT INTO schema_migrations(version) VALUES (2)");
      }
      await client.query("COMMIT");
    } catch (cause) {
      try { await client?.query("ROLLBACK"); } catch { /* Preserve the original connection/migration error. */ }
      throw databaseError(cause);
    } finally { client?.release(); }
  }

  private async ensureReady(): Promise<void> {
    if (this.closed) throw databaseError(new Error("Database pool is closed."));
    this.ready ??= this.migrate().catch((error) => { this.ready = undefined; throw error; });
    await this.ready;
  }

  prepare(sql: string): AsyncStatement {
    return {
      get: async (...values) => { await this.ensureReady(); return new PostgresTransaction(this.pool).prepare(sql).get(...values); },
      all: async (...values) => { await this.ensureReady(); return new PostgresTransaction(this.pool).prepare(sql).all(...values); },
      run: async (...values) => { await this.ensureReady(); return new PostgresTransaction(this.pool).prepare(sql).run(...values); },
    };
  }

  async exec(sql: string): Promise<void> {
    if (/^\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql)) {
      throw databaseError(new Error("Use the scoped transaction API."));
    }
    await this.ensureReady();
    await new PostgresTransaction(this.pool).exec(sql);
  }

  async transaction<T>(callback: (transaction: AsyncDatabase) => Promise<T>): Promise<T> {
    await this.ensureReady();
    let client: PoolClient;
    try { client = await this.pool.connect(); }
    catch (cause) { throw databaseError(cause); }
    try {
      const scoped = new PostgresTransaction(client);
      await scoped.exec("BEGIN");
      const result = await callback(scoped);
      await scoped.exec("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      // Ownership/validation/storage errors thrown by the callback keep their original HTTP semantics.
      throw error;
    } finally { client.release(); }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
    this.onClose?.();
  }
}
