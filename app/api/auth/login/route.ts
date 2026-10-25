import { z } from "zod";
import { createSession, hashPassword, limitAuthAttempts, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, HttpError, readJson, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = loginSchema.parse(await readJson(request));
    await limitAuthAttempts(request, "login", input.email);
    const account = await getDb().prepare("SELECT id,name,email,password_hash FROM users WHERE LOWER(email) = ?").get(input.email);
    let valid = false;
    if (account) valid = await verifyPassword(input.password, String(account.password_hash));
    else await hashPassword(input.password); // Keep nonexistent-account responses equally costly.
    if (!account || !valid) throw new HttpError(401, "E-mail ou senha inválidos.");
    const user = { id: String(account.id), name: String(account.name), email: String(account.email) };
    await createSession(user.id);
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
