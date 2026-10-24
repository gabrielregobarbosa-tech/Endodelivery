import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, readJson, routeError } from "@/lib/http";
import { removeImageSync } from "@/lib/storage";
import { bodyObject, ownPatient, parseBody, patientSchema, visitDto, type Row } from "../_shared";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const patient = ownPatient(id, user.id);
    const visits = (getDb().prepare("SELECT * FROM visits WHERE patient_id = ? AND user_id = ? ORDER BY attended_at DESC, created_at DESC").all(id, user.id) as Row[]).map(visitDto);
    const radiographs = getDb().prepare("SELECT id, patient_id, visit_id, caption, created_at FROM radiographs WHERE patient_id = ? AND user_id = ? ORDER BY created_at DESC").all(id, user.id);
    const documents = getDb().prepare("SELECT id, patient_id, template_id, title, content, kind, created_at FROM documents WHERE patient_id = ? AND user_id = ? ORDER BY created_at DESC").all(id, user.id);
    return Response.json({ patient, visits, radiographs, documents }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const existing = ownPatient(id, user.id);
    const value = parseBody(patientSchema, { ...existing, ...bodyObject(await readJson(request)) });
    getDb().prepare("UPDATE patients SET name = ?, referring_professional = ?, birth_date = ?, phone = ?, notes = ? WHERE id = ? AND user_id = ?")
      .run(value.name, value.referring_professional, value.birth_date, value.phone, value.notes, id, user.id);
    return Response.json({ patient: ownPatient(id, user.id) });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    ownPatient(id, user.id);
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const files = db.prepare("SELECT filename FROM radiographs WHERE patient_id = ? AND user_id = ?").all(id, user.id) as { filename: string }[];
      // Keep metadata until cleanup succeeds, enabling a retry if a file cannot be removed.
      // No await in this transaction: concurrent uploads cannot leave orphaned files.
      for (const file of files) removeImageSync(file.filename);
      db.prepare("DELETE FROM patients WHERE id = ? AND user_id = ?").run(id, user.id);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return Response.json({ deleted: true });
  } catch (error) { return routeError(error); }
}
