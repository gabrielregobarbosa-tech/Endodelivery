import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, readJson, routeError } from "@/lib/http";
import { templateSchema, validated, withoutOwner, type Row } from "./_shared";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const templates = await getDb().prepare("SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC, title").all(user.id);
    return Response.json({ templates: templates.map((row) => withoutOwner(row as Row)) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const data = validated(templateSchema, await readJson(request));
    const template = { id: randomUUID(), ...data, created_at: new Date().toISOString() };
    await getDb().prepare("INSERT INTO templates (id, user_id, title, kind, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(template.id, user.id, template.title, template.kind, template.content, template.created_at);
    return Response.json({ template }, { status: 201 });
  } catch (error) { return routeError(error); }
}
