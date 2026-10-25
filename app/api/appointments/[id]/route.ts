import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, readJson, routeError } from "@/lib/http";
import { appointmentDto, appointmentSchema, bodyObject, ownPatient, parseBody } from "../../patients/_shared";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const existing = await appointmentDto(id, user.id);
    const value = parseBody(appointmentSchema, { ...existing, ...bodyObject(await readJson(request)) });
    if (value.patient_id) await ownPatient(value.patient_id, user.id);
    await getDb().prepare("UPDATE appointments SET patient_id = ?, date = ?, time = ?, clinic = ?, procedure = ?, status = ? WHERE id = ? AND user_id = ?")
      .run(value.patient_id, value.date, value.time, value.clinic, value.procedure, value.status, id, user.id);
    return Response.json({ appointment: await appointmentDto(id, user.id) });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    await appointmentDto(id, user.id);
    await getDb().prepare("DELETE FROM appointments WHERE id = ? AND user_id = ?").run(id, user.id);
    return Response.json({ deleted: true });
  } catch (error) { return routeError(error); }
}
