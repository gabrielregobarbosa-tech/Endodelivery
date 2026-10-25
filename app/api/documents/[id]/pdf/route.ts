import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError, routeError } from "@/lib/http";
import { buildDocumentPdf, pdfResponse, type PdfPatient, type PdfProfile } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const db = getDb();
    const document = await db.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?").get(id, user.id);
    if (!document) throw new HttpError(404, "Documento não encontrado.");
    const profile = await db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(user.id);
    const patient = document.patient_id ? await db.prepare("SELECT name, birth_date, phone, referring_professional FROM patients WHERE id = ? AND user_id = ?").get(String(document.patient_id), user.id) : undefined;
    const bytes = await buildDocumentPdf({
      profile: { ...profile, name: String(profile?.name || user.name) } as unknown as PdfProfile,
      patient: patient as unknown as PdfPatient | undefined,
      title: String(document.title), content: String(document.content), created_at: String(document.created_at),
    });
    return pdfResponse(bytes, "documento-odontologico.pdf");
  } catch (error) { return routeError(error); }
}
