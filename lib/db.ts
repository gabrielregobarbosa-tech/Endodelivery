import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";

export type Row = Record<string, SQLOutputValue>;

export function databasePath(): string {
  return process.env.DATABASE_PATH || resolve(process.cwd(), "data/endodelivery.sqlite");
}

export function storagePath(): string {
  return resolve(process.env.FILE_STORAGE_PATH || "data/uploads");
}

const schema = `
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL DEFAULT '',
  cro TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  logo_data_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE patients (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  referring_professional TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,user_id)
);
CREATE INDEX patients_owner_idx ON patients(user_id,name);
CREATE TABLE visits (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  attended_at TEXT NOT NULL,
  tooth TEXT NOT NULL DEFAULT '',
  treatment TEXT NOT NULL DEFAULT '',
  cement TEXT NOT NULL DEFAULT '',
  irrigant TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  canals TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(canals) AND json_type(canals)='array'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,user_id),
  UNIQUE(id,patient_id,user_id),
  FOREIGN KEY(patient_id,user_id) REFERENCES patients(id,user_id) ON DELETE CASCADE
);
CREATE INDEX visits_owner_patient_idx ON visits(user_id,patient_id,attended_at);
CREATE TABLE appointments (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  clinic TEXT NOT NULL DEFAULT '',
  procedure TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(patient_id,user_id) REFERENCES patients(id,user_id) ON DELETE CASCADE
);
CREATE INDEX appointments_owner_date_idx ON appointments(user_id,date,time);
CREATE TABLE radiographs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  visit_id TEXT,
  filename TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(patient_id,user_id) REFERENCES patients(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(visit_id,patient_id,user_id) REFERENCES visits(id,patient_id,user_id) ON DELETE CASCADE
);
CREATE INDEX radiographs_owner_patient_idx ON radiographs(user_id,patient_id);
CREATE TABLE templates (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('prescription','post_op')),
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,user_id)
);
CREATE INDEX templates_owner_idx ON templates(user_id);
CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id TEXT,
  template_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('prescription','post_op')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(patient_id,user_id) REFERENCES patients(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(template_id,user_id) REFERENCES templates(id,user_id)
);
CREATE INDEX documents_owner_idx ON documents(user_id,created_at);
`;

/** Open a migrated connection. Callers of this function own its lifecycle. */
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
      const migration = db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
      if (!migration) {
        db.exec(schema);
        db.prepare("INSERT INTO schema_migrations(version) VALUES (1)").run();
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

const globalDatabase = globalThis as unknown as { endoDeliveryDb?: DatabaseSync };

/** Persist a connection through Next.js development reloads. */
export function getDb(): DatabaseSync {
  globalDatabase.endoDeliveryDb ??= initializeDatabase();
  return globalDatabase.endoDeliveryDb;
}
