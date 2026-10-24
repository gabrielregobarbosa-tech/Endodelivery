import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, hashSessionToken, verifyPassword } from "../lib/auth";

test("passwords use independent salts and only matching passwords verify", async () => {
  const first = await hashPassword("Senha-de-teste-123!");
  const second = await hashPassword("Senha-de-teste-123!");
  assert.notEqual(first, second);
  assert.equal(first.includes("Senha-de-teste"), false);
  assert.equal(await verifyPassword("Senha-de-teste-123!", first), true);
  assert.equal(await verifyPassword("Senha-incorreta-123!", first), false);
  assert.equal(await verifyPassword("Senha-de-teste-123!", "malformed"), false);
});

test("session hashes are deterministic, irreversible digests", () => {
  assert.match(hashSessionToken("random-session-token"), /^[a-f0-9]{64}$/);
  assert.equal(hashSessionToken("same-token"), hashSessionToken("same-token"));
  assert.notEqual(hashSessionToken("first-token"), hashSessionToken("second-token"));
});
