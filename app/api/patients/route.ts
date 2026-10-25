import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, readJson, routeError } from "@/lib/http";
import { ownPatient, parseBody, patientSchema } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const search = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 160);
    const patients = await getDb().prepare(`
      SELECT p.*, (SELECT CAST(COUNT(*) AS INTEGER) FROM visits v WHERE v.patient_id = p.id AND v.user_id = p.user_id) AS visit_count,
        (SELECT MAX(attended_at) FROM visits v WHERE v.patient_id = p.id AND v.user_id = p.user_id) AS last_visit
      FROM patients p WHERE p.user_id = ? AND (LOWER(p.name) LIKE LOWER(?) OR LOWER(p.referring_professional) LIKE LOWER(?))
      ORDER BY LOWER(p.name), p.created_at DESC
    `).all(user.id, `%${search}%`, `%${search}%`);
    return Response.json({ patients }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const value = parseBody(patientSchema, await readJson(request));
    const id = randomUUID();
    await getDb().prepare("INSERT INTO patients (id, user_id, name, referring_professional, birth_date, phone, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, user.id, value.name, value.referring_professional, value.birth_date, value.phone, value.notes, new Date().toISOString());
    return Response.json({ patient: await ownPatient(id, user.id) }, { status: 201 });
  } catch (error) { return routeError(error); }
}
