import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, readJson, routeError } from "@/lib/http";
import { ownPatient, ownVisit, parseBody, visitSchema, visitDto } from "../../_shared";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id: patientId } = await context.params;
    await ownPatient(patientId, user.id);
    const value = parseBody(visitSchema, await readJson(request));
    const id = randomUUID();
    await getDb().prepare("INSERT INTO visits (id, user_id, patient_id, attended_at, tooth, treatment, cement, irrigant, notes, canals, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, user.id, patientId, value.attended_at, value.tooth, value.treatment, value.cement, value.irrigant, value.notes, JSON.stringify(value.canals), new Date().toISOString());
    return Response.json({ visit: visitDto(await ownVisit(id, user.id)) }, { status: 201 });
  } catch (error) { return routeError(error); }
}
