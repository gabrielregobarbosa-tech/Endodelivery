import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, HttpError, readJson, routeError } from "@/lib/http";
import { templateForUser, templateSchema, validated, withoutOwner } from "../_shared";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json({ template: withoutOwner(await templateForUser(id, user.id)) });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const existing = await templateForUser(id, user.id);
    const input = validated(templateSchema.partial(), await readJson(request));
    if (!Object.keys(input).length) throw new HttpError(400, "Informe ao menos um campo para atualizar.");
    const data = validated(templateSchema, { ...existing, ...input });
    await getDb().prepare("UPDATE templates SET title = ?, kind = ?, content = ? WHERE id = ? AND user_id = ?")
      .run(data.title, data.kind, data.content, id, user.id);
    return Response.json({ template: withoutOwner(await templateForUser(id, user.id)) });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    // Generated documents retain their own content when their source template is removed.
    await getDb().transaction(async (tx) => {
      // Serialize new document references before detaching existing ones.
      const locking = tx.provider === "postgres" ? " FOR UPDATE" : "";
      const template = await tx.prepare(`SELECT id FROM templates WHERE id = ? AND user_id = ?${locking}`).get(id, user.id);
      if (!template) throw new HttpError(404, "Modelo não encontrado.");
      await tx.prepare("UPDATE documents SET template_id = NULL WHERE template_id = ? AND user_id = ?").run(id, user.id);
      await tx.prepare("DELETE FROM templates WHERE id = ? AND user_id = ?").run(id, user.id);
    });
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}
