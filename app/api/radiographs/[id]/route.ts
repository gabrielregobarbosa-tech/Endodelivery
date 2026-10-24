import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, routeError } from "@/lib/http";
import { readImage, removeImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const row = getDb().prepare("SELECT filename FROM radiographs WHERE id = ? AND user_id = ?").get(id, user.id);
    if (!row) throw new HttpError(404, "Radiografia não encontrada.");
    let image: Buffer;
    try { image = await readImage(String(row.filename)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "Arquivo da radiografia não encontrado.");
      throw error;
    }
    return new Response(new Uint8Array(image), { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename=\"radiografia.jpg\"",
    } });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const db = getDb();
    const row = db.prepare("SELECT filename FROM radiographs WHERE id = ? AND user_id = ?").get(id, user.id);
    if (!row) throw new HttpError(404, "Radiografia não encontrada.");
    await removeImage(String(row.filename));
    db.prepare("DELETE FROM radiographs WHERE id = ? AND user_id = ?").run(id, user.id);
    return Response.json({ ok: true });
  } catch (error) { return routeError(error); }
}
