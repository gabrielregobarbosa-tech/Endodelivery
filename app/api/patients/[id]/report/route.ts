import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError, routeError } from "@/lib/http";
import { buildClinicalReport, pdfResponse, type PdfPatient, type PdfProfile, type PdfVisit } from "@/lib/pdf";
import { readImage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const db = getDb();
    const patient = await db.prepare("SELECT name, birth_date, phone, referring_professional FROM patients WHERE id = ? AND user_id = ?").get(id, user.id);
    if (!patient) throw new HttpError(404, "Paciente não encontrado.");
    const profile = await db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(user.id);
    const visitRows = await db.prepare("SELECT * FROM visits WHERE patient_id = ? AND user_id = ? ORDER BY attended_at ASC, created_at ASC").all(id, user.id);
    const visits = visitRows.map((row) => ({ ...row, canals: JSON.parse(String(row.canals || "[]")) })) as unknown as PdfVisit[];
    const images = await db.prepare("SELECT filename, caption, created_at FROM radiographs WHERE patient_id = ? AND user_id = ? ORDER BY created_at ASC").all(id, user.id);
    const radiographs = await Promise.all(images.map(async (row) => ({
      image: await readImage(String(row.filename)), caption: String(row.caption), created_at: String(row.created_at),
    })));
    const bytes = await buildClinicalReport({
      profile: { ...profile, name: String(profile?.name || user.name) } as unknown as PdfProfile,
      patient: patient as unknown as PdfPatient, visits, radiographs,
    });
    return pdfResponse(bytes, "relatorio-endodontico.pdf");
  } catch (error) { return routeError(error); }
}
