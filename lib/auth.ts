import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { User } from "@/lib/types";

export type { User } from "@/lib/types";

const SESSION_COOKIE = "endodelivery_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_COST = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, PASSWORD_COST, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await derivePassword(password, salt);
  return `scrypt$131072$8$1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$131072$8$1") return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const candidate = await derivePassword(password, salt);
  return timingSafeEqual(candidate, expected);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_SECONDS,
};

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const db = getDb();
  const now = new Date();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)").run(
    hashSessionToken(token), userId, new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(),
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
  cookieStore.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
}

export async function requireUser(): Promise<User> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new HttpError(401, "Entre na sua conta para continuar.");
  }
  const row = getDb().prepare(`
    SELECT users.id, users.name, users.email
    FROM users JOIN sessions ON sessions.user_id = users.id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashSessionToken(token), new Date().toISOString());
  if (!row) throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
  return { id: String(row.id), name: String(row.name), email: String(row.email) };
}

/** Create an account and its editable empty clinical templates atomically. */
export function insertAccount(input: User & { passwordHash: string }): void {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)")
      .run(input.id, input.name, input.email, input.passwordHash);
    db.prepare("INSERT INTO profiles(user_id,name,email) VALUES (?,?,?)")
      .run(input.id, input.name, input.email);
    const insertTemplate = db.prepare("INSERT INTO templates(id,user_id,title,kind,content) VALUES (?,?,?,?,?)");
    insertTemplate.run(randomUUID(), input.id, "Receituário", "prescription",
      "Paciente: {{paciente}}\nData: {{data}}\n\n[Insira a prescrição individualizada: medicamento, concentração, posologia e duração.]\n\n{{profissional}}\nCRO: {{cro}}");
    insertTemplate.run(randomUUID(), input.id, "Orientações pós-operatórias", "post_op",
      "Paciente: {{paciente}}\nData: {{data}}\n\n[Registre as orientações individualizadas, cuidados e sinais que exigem contato com o profissional.]\n\n{{profissional}}\nCRO: {{cro}}");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

interface AttemptWindow { count: number; resetAt: number }
const globals = globalThis as unknown as { endoDeliveryAuthAttempts?: Map<string, AttemptWindow> };
const attempts = globals.endoDeliveryAuthAttempts ??= new Map<string, AttemptWindow>();

/** Use a trusted reverse proxy that overwrites incoming client IP headers in production. */
export function limitAuthAttempts(request: Request, action: "login" | "register"): void {
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip") || "local").slice(0, 128);
  const key = `${action}:${ip}`;
  const now = Date.now();
  for (const [entryKey, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(entryKey);
  }
  // Bound memory use; refuse new clients when full rather than losing active limits.
  if (attempts.size >= 10_000 && !attempts.has(key)) {
    throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
  const current = attempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  current.count += 1;
  attempts.set(key, current);
  if (current.count > (action === "login" ? 20 : 8)) {
    throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
}
