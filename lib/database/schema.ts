/** Version 1 remains unchanged for existing local SQLite files. */
export const sqliteSchema = `
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

/** Keep wire DTO dates as ISO text, matching the original SQLite data model. */
const postgresTimestamp = `(to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;
export const postgresSchema = sqliteSchema
  .replaceAll("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))", postgresTimestamp)
  .replace("email TEXT NOT NULL COLLATE NOCASE UNIQUE", "email TEXT NOT NULL UNIQUE")
  .replace("CHECK (json_valid(canals) AND json_type(canals)='array')", "CHECK (jsonb_typeof(canals::jsonb)='array')")
  + "\nCREATE UNIQUE INDEX users_email_case_insensitive_idx ON users (lower(email));\n";

export const postgresMigrationTable = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT ${postgresTimestamp}
)`;

/** Migration 2 stores rate limits in the persistent database across serverless instances. */
export const authAttemptsSchema = `
CREATE TABLE auth_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
CREATE INDEX auth_attempts_reset_idx ON auth_attempts(reset_at);
`;
