import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, readJson, routeError } from "@/lib/http";
import { appointmentDto, appointmentSchema, isoDate, ownPatient, parseBody } from "../patients/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const date = new URL(request.url).searchParams.get("date");
    if (date) parseBody(isoDate, date);
    const query = `SELECT a.*, p.name AS patient_name FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id AND p.user_id = a.user_id WHERE a.user_id = ? ${date ? "AND a.date = ?" : ""} ORDER BY a.date ASC, a.time ASC, a.created_at ASC`;
    const appointments = date ? await getDb().prepare(query).all(user.id, date) : await getDb().prepare(query).all(user.id);
    return Response.json({ appointments }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const value = parseBody(appointmentSchema, await readJson(request));
    if (value.patient_id) await ownPatient(value.patient_id, user.id);
    const id = randomUUID();
    await getDb().prepare("INSERT INTO appointments (id, user_id, patient_id, date, time, clinic, procedure, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, user.id, value.patient_id, value.date, value.time, value.clinic, value.procedure, value.status, new Date().toISOString());
    return Response.json({ appointment: await appointmentDto(id, user.id) }, { status: 201 });
  } catch (error) { return routeError(error); }
}
