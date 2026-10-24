import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, readJson, routeError } from "@/lib/http";
import { removeImageSync } from "@/lib/storage";
import { bodyObject, ownVisit, parseBody, visitDto, visitSchema } from "../../patients/_shared";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const existing = visitDto(ownVisit(id, user.id));
    const value = parseBody(visitSchema, { ...existing, ...bodyObject(await readJson(request)) });
    getDb().prepare("UPDATE visits SET attended_at = ?, tooth = ?, treatment = ?, cement = ?, irrigant = ?, notes = ?, canals = ? WHERE id = ? AND user_id = ?")
      .run(value.attended_at, value.tooth, value.treatment, value.cement, value.irrigant, value.notes, JSON.stringify(value.canals), id, user.id);
    return Response.json({ visit: visitDto(ownVisit(id, user.id)) });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    ownVisit(id, user.id);
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const files = db.prepare("SELECT filename FROM radiographs WHERE visit_id = ? AND user_id = ?").all(id, user.id) as { filename: string }[];
      for (const file of files) removeImageSync(file.filename);
      db.prepare("DELETE FROM visits WHERE id = ? AND user_id = ?").run(id, user.id);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return Response.json({ deleted: true });
  } catch (error) { return routeError(error); }
}
