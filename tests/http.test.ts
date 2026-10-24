import assert from "node:assert/strict";
import test from "node:test";
import { assertSameOrigin, HttpError, readJson, routeError } from "../lib/http";

test("mutations reject cross-site origins and accept same-origin requests", () => {
  assert.doesNotThrow(() => assertSameOrigin(new Request("https://endo.example/api/patients", { method: "POST", headers: { origin: "https://endo.example" } })));
  assert.throws(() => assertSameOrigin(new Request("https://endo.example/api/patients", { method: "POST", headers: { origin: "https://other.example" } })), (error) => error instanceof HttpError && error.status === 403);
  assert.throws(() => assertSameOrigin(new Request("https://endo.example/api/patients", { method: "POST", headers: { "sec-fetch-site": "cross-site" } })), (error) => error instanceof HttpError && error.status === 403);
  assert.throws(() => assertSameOrigin(new Request("https://endo.example/api/patients", { method: "POST", headers: { origin: "null" } })), (error) => error instanceof HttpError && error.status === 403);
});

test("explicit public origin supports a trusted reverse proxy", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://endo.example";
  try {
    assert.doesNotThrow(() => assertSameOrigin(new Request("http://127.0.0.1:3000/api/patients", { method: "POST", headers: { origin: "https://endo.example" } })));
    assert.throws(() => assertSameOrigin(new Request("http://127.0.0.1:3000/api/patients", { method: "POST", headers: { origin: "https://other.example" } })), (error) => error instanceof HttpError && error.status === 403);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("JSON parser requires an object and enforces size bounds", async () => {
  const req = (body: string, type = "application/json") => new Request("http://localhost/api/test", { method: "POST", headers: { "content-type": type }, body });
  assert.deepEqual(await readJson(req('{"name":"Ana"}')), { name: "Ana" });
  await assert.rejects(() => readJson(req("[]")), (error) => error instanceof HttpError && error.status === 400);
  await assert.rejects(() => readJson(req("broken")), (error) => error instanceof HttpError && error.status === 400);
  await assert.rejects(() => readJson(req("{}", "text/plain")), (error) => error instanceof HttpError && error.status === 415);
  await assert.rejects(() => readJson(req("{}", "text/plain; value=application/json")), (error) => error instanceof HttpError && error.status === 415);
  await assert.rejects(() => readJson(req('"' + "x".repeat(2 * 1_048_576) + '"')), (error) => error instanceof HttpError && error.status === 413);
});

test("unreadable request streams become safe client errors", async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new Error("Unreadable body")); } });
  const request = new Request("http://localhost/api/test", {
    method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(() => readJson(request), (error) => error instanceof HttpError && error.status === 400);
});

test("known API errors preserve safe status and JSON messages", async () => {
  const response = routeError(new HttpError(404, "Paciente não encontrado."));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Paciente não encontrado." });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
