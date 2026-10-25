import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type Row = Record<string, unknown>;

export const documentKind = z.enum(["prescription", "post_op"], {
  message: "Escolha receituário ou recomendações pós-operatórias.",
});

export const templateSchema = z.object({
  title: z.string().trim().min(1, "Informe o título do modelo.").max(160),
  kind: documentKind,
  content: z.string().trim().min(1, "Informe o conteúdo do modelo.").max(30000),
});

export const documentSchema = z.object({
  title: z.string().trim().min(1, "Informe o título do documento.").max(160),
  kind: documentKind,
  content: z.string().trim().min(1, "Informe o conteúdo do documento.").max(30000),
  patient_id: z.string().uuid("Paciente inválido.").nullable().optional().default(null),
  template_id: z.string().uuid("Modelo inválido.").nullable().optional().default(null),
});

// No defaults in PATCH: omitting a reference must preserve its existing value.
export const documentPatchSchema = z.object({
  title: z.string().trim().min(1, "Informe o título do documento.").max(160).optional(),
  kind: documentKind.optional(),
  content: z.string().trim().min(1, "Informe o conteúdo do documento.").max(30000).optional(),
  patient_id: z.string().uuid("Paciente inválido.").nullable().optional(),
  template_id: z.string().uuid("Modelo inválido.").nullable().optional(),
});

export function validated<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message || "Verifique os dados informados.");
  }
  return parsed.data;
}

export function withoutOwner(row: Row): Row {
  const result = { ...row };
  delete result.user_id;
  return result;
}

export async function templateForUser(id: string, userId: string): Promise<Row> {
  const row = await getDb().prepare("SELECT * FROM templates WHERE id = ? AND user_id = ?").get(id, userId);
  if (!row) throw new HttpError(404, "Modelo não encontrado.");
  return row as Row;
}

export async function documentForUser(id: string, userId: string): Promise<Row> {
  const row = await getDb().prepare(`
    SELECT d.*, p.name AS patient_name FROM documents d
    LEFT JOIN patients p ON p.id = d.patient_id AND p.user_id = d.user_id
    WHERE d.id = ? AND d.user_id = ?
  `).get(id, userId);
  if (!row) throw new HttpError(404, "Documento não encontrado.");
  return row as Row;
}

export async function checkDocumentReferences(
  userId: string,
  patientId: string | null | undefined,
  templateId: string | null | undefined,
): Promise<void> {
  if (patientId && !await getDb().prepare("SELECT id FROM patients WHERE id = ? AND user_id = ?").get(patientId, userId)) {
    throw new HttpError(404, "Paciente não encontrado.");
  }
  if (templateId) await templateForUser(templateId, userId);
}

/** Resolve the supported placeholders when a reusable model becomes a document. */
export async function personalizeDocument(content: string, userId: string, patientId: string | null): Promise<string> {
  const db = getDb();
  const profile = await db.prepare("SELECT name, cro FROM profiles WHERE user_id = ?").get(userId);
  const patient = patientId
    ? await db.prepare("SELECT name FROM patients WHERE id = ? AND user_id = ?").get(patientId, userId)
    : undefined;
  const replacements: Record<string, string> = {
    paciente: String(patient?.name || ""),
    profissional: String(profile?.name || ""),
    cro: String(profile?.cro || ""),
    data: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus" }).format(new Date()),
  };
  return content.replace(/\{\{\s*(paciente|profissional|cro|data)\s*\}\}/g, (_match, key: string) => replacements[key]);
}
