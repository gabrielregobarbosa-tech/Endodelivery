import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "../lib/db";

test("migrations preserve records and are repeatable across connections", () => {
  const dir = mkdtempSync(join(tmpdir(), "endodelivery-schema-"));
  const path = join(dir, "nested", "test.sqlite");
  let db = initializeDatabase(path);
  try {
    db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)").run("user-1", "Teste", "test@example.com", "hash");
    db.close();
    db = initializeDatabase(path);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()?.count, 1);
    assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
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
