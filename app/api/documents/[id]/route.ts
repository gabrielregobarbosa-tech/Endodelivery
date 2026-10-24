import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, HttpError, readJson, routeError } from "@/lib/http";
import {
  checkDocumentReferences, documentForUser, documentPatchSchema, documentSchema, validated, withoutOwner,
} from "../../templates/_shared";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json({ document: withoutOwner(documentForUser(id, user.id)) });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const existing = documentForUser(id, user.id);
    const input = validated(documentPatchSchema, await readJson(request));
    if (!Object.keys(input).length) throw new HttpError(400, "Informe ao menos um campo para atualizar.");
    const data = validated(documentSchema, { ...existing, ...input });
    checkDocumentReferences(user.id, data.patient_id, data.template_id);
    getDb().prepare(`
      UPDATE documents SET patient_id = ?, template_id = ?, title = ?, content = ?, kind = ?
      WHERE id = ? AND user_id = ?
    `).run(data.patient_id, data.template_id, data.title, data.content, data.kind, id, user.id);
    return Response.json({ document: withoutOwner(documentForUser(id, user.id)) });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    documentForUser(id, user.id);
    getDb().prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(id, user.id);
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}
