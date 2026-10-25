import assert from "node:assert/strict";
import test from "node:test";
import { routeError } from "../lib/http";
import { ServiceError } from "../lib/service-errors";

test("service failures have distinct safe messages and correlatable logs", async () => {
  const logs: string[] = [];
  const previous = console.error;
  console.error = (...args: unknown[]) => { logs.push(JSON.stringify(args)); };
  try {
    const messages = new Set<string>();
    for (const kind of ["configuration", "database", "storage"] as const) {
      const response = routeError(new ServiceError(kind, "TEST_FAILURE", new Error("sensitive-internal-test-detail")));
      assert.equal(response.status, 503);
      const body = await response.json();
      messages.add(body.error);
      assert.match(body.reference, /^[a-f0-9-]{36}$/);
      assert.equal(body.code, `SERVICE_${kind.toUpperCase()}`);
      assert.equal(JSON.stringify(body).includes("sensitive-internal-test-detail"), false);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(messages.size, 3);
    assert.equal(logs.length, 3);
    assert.equal(logs.join(" ").includes("sensitive-internal-test-detail"), false);
  } finally { console.error = previous; }
});
