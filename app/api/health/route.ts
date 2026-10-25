import { getDb, LATEST_DATABASE_VERSION } from "@/lib/db";
import { maxImageBytes } from "@/lib/storage";
import { routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const result = await db.prepare("SELECT 1 AS ready").get();
    const migration = await db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
    if (Number(result?.ready) !== 1 || Number(migration?.version) !== LATEST_DATABASE_VERSION) throw new Error("Database not ready");
    return Response.json({ status: "ok", database: "ready", max_upload_bytes: maxImageBytes() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = routeError(error);
    const details = await response.json();
    return Response.json({ status: "unavailable", ...details }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
