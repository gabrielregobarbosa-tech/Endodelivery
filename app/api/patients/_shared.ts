import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type Row = Record<string, unknown>;

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? "Confira os dados informados.");
  }
  return result.data;
}

export function bodyObject(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Envie os dados no formato de um objeto JSON.");
  }
  return value as Row;
}

export const text = (maximum: number) => z.string().trim().max(maximum, `Use no máximo ${maximum} caracteres.`);
export const requiredText = (maximum: number) => text(maximum).min(1, "Preencha os campos obrigatórios.");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").refine((value) => {
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Informe uma data válida.");

export const patientSchema = z.object({
  name: requiredText(160),
  referring_professional: text(160).default(""),
  birth_date: z.union([isoDate, z.literal("")]).default(""),
  phone: text(40).default(""),
  notes: text(10000).default(""),
});

export const canalSchema = z.object({
  name: requiredText(40),
  odontometry: text(80).default(""),
  laf: text(80).default(""),
});

export const visitSchema = z.object({
  attended_at: isoDate,
  tooth: requiredText(40),
  treatment: requiredText(10000),
  cement: text(160).default(""),
  irrigant: text(500).default(""),
  notes: text(20000).default(""),
  canals: z.array(canalSchema).max(16, "Informe até 16 canais por atendimento.").default([]),
});

export const appointmentSchema = z.object({
  patient_id: z.union([z.string().uuid("Selecione um paciente válido."), z.literal(""), z.null()]).optional().transform((value) => value || null),
  date: isoDate,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
  clinic: requiredText(200),
  procedure: requiredText(200),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
});

export async function ownPatient(id: string, userId: string, db = getDb(), lock = false): Promise<Row> {
  const locking = lock && db.provider === "postgres" ? " FOR UPDATE" : "";
  const patient = await db.prepare(`SELECT * FROM patients WHERE id = ? AND user_id = ?${locking}`).get(id, userId) as Row | undefined;
  if (!patient) throw new HttpError(404, "Paciente não encontrado.");
  return patient;
}

export async function ownVisit(id: string, userId: string, db = getDb(), lock = false): Promise<Row> {
  const locking = lock && db.provider === "postgres" ? " FOR UPDATE" : "";
  const visit = await db.prepare(`SELECT * FROM visits WHERE id = ? AND user_id = ?${locking}`).get(id, userId) as Row | undefined;
  if (!visit) throw new HttpError(404, "Atendimento não encontrado.");
  return visit;
}

export function visitDto(visit: Row): Row {
  return { ...visit, canals: JSON.parse(String(visit.canals || "[]")) };
}

export async function appointmentDto(id: string, userId: string): Promise<Row> {
  const appointment = await getDb().prepare("SELECT a.*, p.name AS patient_name FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id AND p.user_id = a.user_id WHERE a.id = ? AND a.user_id = ?").get(id, userId) as Row | undefined;
  if (!appointment) throw new HttpError(404, "Compromisso não encontrado.");
  return appointment;
}
