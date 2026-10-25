import assert from "node:assert/strict";
import test from "node:test";
import { professionalNameSchema, registrationSchema } from "../lib/validation";

test("professional names preserve accents, punctuation and Unicode spelling", () => {
  const names = ["Gabriel Barbosa", "Dr. Gabriel Barbosa", "Dr. Gabriel R. Barbosa", "Drª. Ana Maria", "João D'Ávila", "Dra. Joa\u0303o D’Ávila–Souza", "Dr. Ιωάννης Иванов", "李 明"];
  for (const name of names) {
    assert.equal(professionalNameSchema.parse(name), name);
    assert.equal(registrationSchema.parse({ name, email: "FICTICIO@EXAMPLE.TEST", password: "Senha-ficticia-123!" }).name, name);
  }
});

test("name validation rejects controls, malformed Unicode and unreasonable lengths", () => {
  for (const name of ["A", " ", "\ud800Nome", "Dr.\nNome", "Dr.\u202eNome", "A".repeat(121), "1234"]) {
    assert.equal(professionalNameSchema.safeParse(name).success, false);
  }
});

test("registration applies the same explicit email and password limits", () => {
  const input = { name: "Drª. Ana Maria", email: "  FICTICIO@EXAMPLE.TEST  ", password: "Senha-ficticia-123!" };
  assert.equal(registrationSchema.parse(input).email, "ficticio@example.test");
  assert.equal(registrationSchema.safeParse({ ...input, password: "curta" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, email: "email inválido" }).success, false);
});
