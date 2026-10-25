import { z } from "zod";

function isWellFormed(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) return false;
  }
  return true;
}

/** Keep the spelling and punctuation entered by the professional, without normalization. */
export const professionalNameSchema = z.string()
  .trim()
  .min(2, "Informe seu nome profissional com pelo menos 2 caracteres.")
  .max(120, "O nome profissional deve ter até 120 caracteres.")
  .refine((value) => isWellFormed(value) && /\p{L}/u.test(value)
    && !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value),
  "Informe um nome válido, sem caracteres de controle.");

export const registrationSchema = z.object({
  name: professionalNameSchema,
  email: z.string().trim().email("Informe um e-mail válido.").max(254, "O e-mail deve ter até 254 caracteres.").transform((value) => value.toLowerCase()),
  password: z.string().min(10, "Use uma senha com pelo menos 10 caracteres.").max(128, "Use uma senha de até 128 caracteres."),
});
