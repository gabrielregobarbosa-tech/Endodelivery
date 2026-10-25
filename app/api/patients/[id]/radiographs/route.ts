import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, routeError } from "@/lib/http";
import { readImageForm, removeImage, writeRadiograph } from "@/lib/storage";
import { ownPatient } from "../../_shared";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let filename: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id: patientId } = await context.params;
    const db = getDb();
    await ownPatient(patientId, user.id, db);
    const form = await readImageForm(request);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Selecione uma imagem.");
    const caption = String(form.get("caption") || "").trim();
    if (caption.length > 500) throw new HttpError(400, "A legenda deve ter até 500 caracteres.");
    const visitId = String(form.get("visit_id") || "").trim() || null;
    if (visitId && !await db.prepare("SELECT id FROM visits WHERE id = ? AND patient_id = ? AND user_id = ?").get(visitId, patientId, user.id)) {
      throw new HttpError(404, "Atendimento não encontrado para este paciente.");
    }
    const storedFilename = await writeRadiograph(Buffer.from(await file.arrayBuffer()));
    filename = storedFilename;
    const id = randomUUID();
    const radiograph = await db.transaction(async (tx) => {
      // Lock the parent before creating metadata so concurrent patient deletion cannot orphan an upload.
      await ownPatient(patientId, user.id, tx, true);
      if (visitId && !await tx.prepare("SELECT id FROM visits WHERE id = ? AND patient_id = ? AND user_id = ?").get(visitId, patientId, user.id)) {
        throw new HttpError(404, "Atendimento não encontrado para este paciente.");
      }
      await tx.prepare("INSERT INTO radiographs (id, user_id, patient_id, visit_id, filename, caption) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, user.id, patientId, visitId, storedFilename, caption);
      return tx.prepare("SELECT id, patient_id, visit_id, caption, created_at FROM radiographs WHERE id = ? AND user_id = ?").get(id, user.id);
    });
    filename = undefined;
    return Response.json({ radiograph }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (filename) await removeImage(filename).catch(() => console.error("radiograph_cleanup_failed"));
    return routeError(error);
  }
}
