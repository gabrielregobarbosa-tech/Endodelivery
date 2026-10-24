import { z } from "zod";
import sharp from "sharp";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, HttpError, readJson, routeError } from "@/lib/http";
import { validated, withoutOwner, type Row } from "../templates/_shared";

export const runtime = "nodejs";

function validLogo(value: string): boolean {
  if (!value) return true;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 1024 * 1024 || bytes.length < 8) return false;
  if (match[1] === "png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome profissional.").max(160),
  specialty: z.string().trim().max(160).optional().default(""),
  cro: z.string().trim().max(60).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email("Informe um e-mail válido.").max(254)]).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  logo_data_url: z.string().max(1400000, "O logotipo deve ter até 1 MB.").refine(validLogo, "Envie um logotipo PNG ou JPEG de até 1 MB.").optional().default(""),
});

export async function GET() {
  try {
    const user = await requireUser();
    const profile = getDb().prepare("SELECT * FROM profiles WHERE user_id = ?").get(user.id);
    if (!profile) throw new HttpError(404, "Perfil profissional não encontrado.");
    return Response.json({ profile: withoutOwner(profile as Row) });
  } catch (error) { return routeError(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const data = validated(profileSchema, await readJson(request));
    if (data.logo_data_url) {
      try {
        const source = Buffer.from(data.logo_data_url.split(",")[1], "base64");
        const normalized = await sharp(source, { limitInputPixels: 16_777_216 })
          .rotate()
          .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        if (normalized.length > 1_048_576) throw new Error("Image exceeds storage limit");
        // Normalize the image and strip metadata before storing it in a profile.
        data.logo_data_url = `data:image/png;base64,${normalized.toString("base64")}`;
      } catch {
        throw new HttpError(400, "Não foi possível ler o logotipo. Escolha uma imagem PNG ou JPEG de até 1 MB.");
      }
    }
    getDb().prepare(`
      INSERT INTO profiles (user_id, name, specialty, cro, phone, email, address, logo_data_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, specialty = excluded.specialty,
        cro = excluded.cro, phone = excluded.phone, email = excluded.email,
        address = excluded.address, logo_data_url = excluded.logo_data_url
    `).run(user.id, data.name, data.specialty, data.cro, data.phone, data.email, data.address, data.logo_data_url);
    const profile = getDb().prepare("SELECT * FROM profiles WHERE user_id = ?").get(user.id);
    return Response.json({ profile: withoutOwner(profile as Row) });
  } catch (error) { return routeError(error); }
}
