import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "../lib/db";
import { DatabaseSync } from "node:sqlite";
import { sqliteSchema } from "../lib/database/schema";

test("migrations preserve records and are repeatable across connections", () => {
  const dir = mkdtempSync(join(tmpdir(), "endodelivery-schema-"));
  const path = join(dir, "nested", "test.sqlite");
  let db = initializeDatabase(path);
  try {
    db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("user-1", "Teste", "test@example.com", "hash");
    db.close();
    db = initializeDatabase(path);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()?.count, 2);
    assert.equal(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()?.version, 2);
    assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upgrading an existing v1 database preserves professional names, hashes and clinical records", () => {
  const dir = mkdtempSync(join(tmpdir(), "endodelivery-v1-upgrade-"));
  const path = join(dir, "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT 'legacy')");
  legacy.exec(sqliteSchema);
  legacy.prepare("INSERT INTO schema_migrations(version) VALUES (1)").run();
  legacy.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)")
    .run("legacy-user", "Drª. Ana D'Ávila", "legacy@example.test", "preserved-hash");
  legacy.prepare("INSERT INTO patients(id,user_id,name) VALUES (?,?,?)")
    .run("legacy-patient", "legacy-user", "Paciente fictício preservado");
  legacy.close();
  const upgraded = initializeDatabase(path);
  try {
    const user = upgraded.prepare("SELECT name,password_hash FROM users WHERE id = ?").get("legacy-user");
    assert.equal(user?.name, "Drª. Ana D'Ávila");
    assert.equal(user?.password_hash, "preserved-hash");
    assert.equal(upgraded.prepare("SELECT COUNT(*) AS count FROM patients").get()?.count, 1);
    assert.equal(upgraded.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()?.version, 2);
    upgraded.prepare("INSERT INTO auth_attempts(key,count,reset_at) VALUES (?,?,?)").run("test-window", 1, "2099-01-01T00:00:00.000Z");
    assert.equal(upgraded.prepare("SELECT count FROM auth_attempts WHERE key = ?").get("test-window")?.count, 1);
  } finally { upgraded.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("database prevents cross-account patient relations and rejects invalid clinical JSON", () => {
  const db = initializeDatabase(":memory:");
  try {
    const insertUser = db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)");
    insertUser.run("u1", "One", "one@example.com", "hash");
    insertUser.run("u2", "Two", "two@example.com", "hash");
    db.prepare("INSERT INTO patients(id,user_id,name) VALUES (?,?,?)").run("p1", "u1", "Paciente");
    const insertVisit = db.prepare("INSERT INTO visits(id,user_id,patient_id,attended_at,canals) VALUES (?,?,?,?,?)");
    assert.throws(() => insertVisit.run("v1", "u2", "p1", "2026-10-24", "[]"), /FOREIGN KEY/);
    assert.throws(() => insertVisit.run("v2", "u1", "p1", "2026-10-24", "{}"), /CHECK constraint/);
    insertVisit.run("v3", "u1", "p1", "2026-10-24", '[{"name":"MV","odontometry":"20","laf":"25"}]');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM visits").get()?.count, 1);
    assert.throws(() => insertUser.run("u3", "Duplicate", "ONE@EXAMPLE.COM", "hash"), /UNIQUE/);
  } finally {
    db.close();
  }
});
