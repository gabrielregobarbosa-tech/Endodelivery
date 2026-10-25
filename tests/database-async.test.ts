import assert from "node:assert/strict";
import test from "node:test";
import { SqliteDatabase } from "../lib/database/sqlite";
import { databaseConfiguration, postgresPoolConfiguration } from "../lib/database/config";
import { postgresPlaceholders } from "../lib/database/sql";
import { isUniqueConstraintError } from "../lib/database/errors";
import { ServiceError } from "../lib/service-errors";

test("asynchronous SQLite transactions isolate interleaved requests until commit", async () => {
  const database = new SqliteDatabase(":memory:");
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let outsideCompleted = false;
  try {
    const transaction = database.transaction(async (scoped) => {
      await scoped.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("tx-user", "Dr. Exemplo", "one@example.test", "hash");
      entered();
      await waiting;
      await scoped.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("tx-user-2", "Drª. Exemplo", "two@example.test", "hash");
    });
    await started;
    const outside = database.prepare("SELECT COUNT(*) AS count FROM users").get().then((row) => { outsideCompleted = true; return row; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(outsideCompleted, false, "another request must not join an open transaction");
    release();
    await transaction;
    assert.equal((await outside)?.count, 2);
  } finally { release(); await database.close(); }
});

test("asynchronous SQLite rolls back failures and supports scoped nested savepoints", async () => {
  const database = new SqliteDatabase(":memory:");
  const expected = new Error("intentional rollback");
  try {
    await assert.rejects(database.transaction(async (scoped) => {
      await scoped.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("rolled-back", "Teste", "rollback@example.test", "hash");
      throw expected;
    }), (error) => error === expected);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM users").get())?.count, 0);
    await database.transaction(async (scoped) => {
      await scoped.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("kept", "Dr. Gabriel R. Barbosa", "kept@example.test", "hash");
      await assert.rejects(scoped.transaction(async (nested) => {
        await nested.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("nested", "Teste", "nested@example.test", "hash");
        throw expected;
      }), (error) => error === expected);
    });
    const users = await database.prepare("SELECT name FROM users").all();
    assert.deepEqual(users, [{ name: "Dr. Gabriel R. Barbosa" }]);
    await assert.rejects(database.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("duplicate", "Teste", "KEPT@EXAMPLE.TEST", "hash"), isUniqueConstraintError);
    await assert.rejects(database.exec("BEGIN"), ServiceError);
  } finally { await database.close(); }
});

test("database selection fails closed on Vercel without a managed database", () => {
  const names = ["VERCEL", "DATABASE_PROVIDER", "DATABASE_URL", "POSTGRES_URL", "DATABASE_PATH"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.VERCEL = "1";
    process.env.DATABASE_PATH = "/tmp/clinical.sqlite";
    assert.throws(databaseConfiguration, (error) => error instanceof ServiceError && error.code === "PERSISTENT_DATABASE_REQUIRED");
    process.env.POSTGRES_URL = "postgresql://example.invalid/clinic";
    assert.equal(databaseConfiguration().provider, "postgres");
    process.env.DATABASE_PROVIDER = "sqlite";
    assert.throws(databaseConfiguration, ServiceError);
    delete process.env.VERCEL;
    assert.equal(databaseConfiguration().provider, "sqlite");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("PostgreSQL configuration preserves TLS verification and allows plain loopback test connections", () => {
  const remote = postgresPoolConfiguration("postgresql://user:fictional@example.invalid/clinic?sslmode=require");
  assert.equal(new URL(String(remote.connectionString)).searchParams.get("sslmode"), "verify-full");
  assert.deepEqual(remote.ssl, { rejectUnauthorized: true });
  assert.equal(postgresPoolConfiguration("postgresql://test@127.0.0.1:55432/test").ssl, false);
  assert.throws(() => postgresPoolConfiguration("postgresql://example.invalid/clinic?sslmode=disable"), ServiceError);
  assert.throws(() => postgresPoolConfiguration("postgresql://localhost/clinic?sslmode=no-verify"), ServiceError);
  assert.throws(() => postgresPoolConfiguration("https://example.invalid/clinic"), ServiceError);
});

test("PostgreSQL placeholders leave quoted text, identifiers and nested comments untouched", () => {
  const sql = `SELECT ?, '?', "field?", 'D''Ávila?', $$?$$, $body$?$body$ /* ? /* ? */ ? */ -- ?
  , ?`;
  const compiled = postgresPlaceholders(sql);
  assert.equal(compiled.count, 2);
  assert.equal(compiled.text, `SELECT $1, '?', "field?", 'D''Ávila?', $$?$$, $body$?$body$ /* ? /* ? */ ? */ -- ?
  , $2`);
  assert.equal(postgresPlaceholders("SELECT '\\', ?").text, "SELECT '\\', $1");
  assert.equal(postgresPlaceholders("SELECT E'escaped\\'?', ?").count, 1);
});
