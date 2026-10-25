import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresDatabase } from "../lib/database/postgres";
import { postgresPoolConfiguration } from "../lib/database/config";
import { databaseErrorCode, isUniqueConstraintError } from "../lib/database/errors";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("Defina TEST_DATABASE_URL para um PostgreSQL exclusivo de testes. Esta suíte não utiliza DATABASE_URL nem pula os testes.");

async function isolated<T>(run: (url: string, clients: PostgresDatabase[]) => Promise<T>): Promise<T> {
  const administration = new Pool(postgresPoolConfiguration(connectionString!));
  const schema = `endodelivery_test_${randomUUID().replaceAll("-", "")}`;
  const clients: PostgresDatabase[] = [];
  try {
    await administration.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(connectionString!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    return await run(url.toString(), clients);
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    await administration.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await administration.end();
  }
}

test("PostgreSQL cold starts concurrently apply both migrations once and persist Unicode data", async () => {
  await isolated(async (url, clients) => {
    for (let index = 0; index < 4; index += 1) clients.push(new PostgresDatabase(url));
    const versions = await Promise.all(clients.map((client) => client.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()));
    assert.deepEqual(versions.map((row) => row?.version), [2, 2, 2, 2]);
    assert.equal((await clients[0].prepare("SELECT COUNT(*) AS count FROM schema_migrations").get())?.count, 2);
    await clients[0].prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)")
      .run("professional", "João D'Ávila · Drª. Ana Maria", "persist@example.test", "persistent-hash");
    await Promise.all(clients.map((client) => client.close()));
    const reader = new PostgresDatabase(url);
    clients.push(reader);
    const saved = await reader.prepare("SELECT name,password_hash,created_at FROM users WHERE id = ?").get("professional");
    assert.equal(saved?.name, "João D'Ávila · Drª. Ana Maria");
    assert.equal(saved?.password_hash, "persistent-hash");
    assert.match(String(saved?.created_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

test("PostgreSQL enforces case-insensitive uniqueness, clinical JSON and cross-account foreign keys", async () => {
  await isolated(async (url, clients) => {
    const database = new PostgresDatabase(url);
    clients.push(database);
    const insertUser = database.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)");
    await insertUser.run("owner", "Dr. Gabriel R. Barbosa", "owner@example.test", "hash");
    await insertUser.run("other", "Outro profissional fictício", "other@example.test", "hash");
    await assert.rejects(insertUser.run("duplicate", "Teste", "OWNER@EXAMPLE.TEST", "hash"), isUniqueConstraintError);
    await database.prepare("INSERT INTO patients(id,user_id,name) VALUES (?,?,?)").run("patient", "owner", "Paciente fictício");
    const insertVisit = database.prepare("INSERT INTO visits(id,user_id,patient_id,attended_at,canals) VALUES (?,?,?,?,?)");
    await assert.rejects(insertVisit.run("foreign", "other", "patient", "2026-10-24", "[]"), (error) => databaseErrorCode(error) === "23503");
    await assert.rejects(insertVisit.run("invalid", "owner", "patient", "2026-10-24", "{}"), (error) => databaseErrorCode(error) === "23514");
    await insertVisit.run("visit", "owner", "patient", "2026-10-24", '[{"name":"MV","odontometry":"21 mm","laf":"35"}]');
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM visits").get())?.count, 1);
  });
});

test("PostgreSQL scoped transactions roll back callbacks and share atomic persistent rate limits", async () => {
  await isolated(async (url, clients) => {
    const database = new PostgresDatabase(url);
    const second = new PostgresDatabase(url);
    clients.push(database, second);
    const intentional = new Error("callback failure must retain its identity");
    await assert.rejects(database.transaction(async (scoped) => {
      await scoped.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("rollback", "Teste", "rollback@example.test", "hash");
      throw intentional;
    }), (error) => error === intentional);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM users").get())?.count, 0);
    const statement = "INSERT INTO auth_attempts(key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = auth_attempts.count + 1 RETURNING count";
    const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? database : second).prepare(statement).get("fictitious-window", "2099-01-01T00:00:00.000Z")));
    assert.equal(new Set(attempts.map((row) => row?.count)).size, 20);
    assert.equal((await second.prepare("SELECT count FROM auth_attempts WHERE key = ?").get("fictitious-window"))?.count, 20);
    await database.transaction(async (scoped) => {
      await scoped.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("kept", "Drª. Ana Maria", "kept@example.test", "hash");
      await assert.rejects(scoped.transaction(async (nested) => {
        await nested.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("nested", "Teste", "nested@example.test", "hash");
        throw intentional;
      }), (error) => error === intentional);
    });
    assert.deepEqual(await second.prepare("SELECT name FROM users").all(), [{ name: "Drª. Ana Maria" }]);
  });
});
