import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

test("Vercel without persistent services returns safe configuration failures and creates no local clinical database", { timeout: 60_000 }, async () => {
  assert.ok(existsSync(".next/BUILD_ID"), "Execute npm run build:vercel antes deste teste.");
  const directory = mkdtempSync(join(tmpdir(), "endodelivery-serverless-"));
  const databasePath = join(directory, "must-not-exist.sqlite");
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((done) => reservation.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production", VERCEL: "1",
      DATABASE_PROVIDER: "postgres", DATABASE_URL: "", POSTGRES_URL: "", DATABASE_PATH: databasePath,
      STORAGE_PROVIDER: "vercel-blob", BLOB_READ_WRITE_TOKEN: "", APP_ORIGIN: origin,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-16_000); });
  try {
    let ready = false;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch { /* The server has not yet started listening. */ }
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(ready, "O servidor de produção não iniciou para o teste serverless.");
    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 503);
    assert.equal((await health.json()).code, "SERVICE_CONFIGURATION");
    const register = (name: string) => fetch(`${origin}/api/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ name, email: "unconfigured-fictional@example.test", password: "Teste-ficticio-123!" }),
    });
    const invalid = await register("Dr.\nNome");
    assert.equal(invalid.status, 400);
    const response = await register("Drª. Ana Maria");
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "SERVICE_CONFIGURATION");
    assert.match(body.reference, /^[a-f0-9-]{36}$/);
    assert.match(response.headers.get("cache-control") || "", /(?:^|,\s*)no-store(?:,|$)/);
    assert.equal(JSON.stringify(body).includes("DATABASE_URL"), false);
    assert.equal(JSON.stringify(body).includes(databasePath), false);
    assert.equal(existsSync(databasePath), false);
    assert.ok(logs.includes("PERSISTENT_DATABASE_REQUIRED"));
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise<void>((done) => child.once("exit", () => done()));
      child.kill("SIGTERM");
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([exited, new Promise<void>((done) => { timer = setTimeout(() => { child.kill("SIGKILL"); done(); }, 5000); })]);
      if (timer) clearTimeout(timer);
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
