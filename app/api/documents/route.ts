import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, HttpError, readJson, routeError } from "@/lib/http";
import {
  checkDocumentReferences, documentForUser, documentSchema, personalizeDocument, validated, withoutOwner, type Row,
} from "../templates/_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const patientId = new URL(request.url).searchParams.get("patient_id");
    if (patientId) checkDocumentReferences(user.id, patientId, null);
    const documents = getDb().prepare(`
      SELECT d.*, p.name AS patient_name FROM documents d
      LEFT JOIN patients p ON p.id = d.patient_id AND p.user_id = d.user_id
      WHERE d.user_id = ? ${patientId ? "AND d.patient_id = ?" : ""}
      ORDER BY d.created_at DESC
    `).all(...(patientId ? [user.id, patientId] : [user.id]));
    return Response.json({ documents: documents.map((row) => withoutOwner(row as Row)) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const data = validated(documentSchema, await readJson(request));
    checkDocumentReferences(user.id, data.patient_id, data.template_id);
    const content = personalizeDocument(data.content, user.id, data.patient_id);
    if (content.length > 30000) throw new HttpError(400, "O documento preenchido excede o limite de 30.000 caracteres.");
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO documents (id, user_id, patient_id, template_id, title, content, kind, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, data.patient_id, data.template_id, data.title, content, data.kind, new Date().toISOString());
    return Response.json({ document: withoutOwner(documentForUser(id, user.id)) }, { status: 201 });
  } catch (error) { return routeError(error); }
}
