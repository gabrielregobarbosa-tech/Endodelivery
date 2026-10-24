import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const result = getDb().prepare("SELECT 1 AS ready").get();
    const migration = getDb().prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
    if (result?.ready !== 1 || migration?.version !== 1) throw new Error("Database not ready");
    return Response.json({ status: "ok", database: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
