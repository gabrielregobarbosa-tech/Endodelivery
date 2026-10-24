import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSession, hashPassword, insertAccount, limitAuthAttempts } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSameOrigin, HttpError, readJson, routeError } from "@/lib/http";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    limitAuthAttempts(request, "register");
    const input = registerSchema.parse(await readJson(request));
    // Do the same costly password work before reporting an unusable registration.
    const passwordHash = await hashPassword(input.password);
    if (getDb().prepare("SELECT id FROM users WHERE email = ?").get(input.email)) {
      throw new HttpError(400, "Não foi possível criar a conta com os dados informados.");
    }
    const user = { id: randomUUID(), name: input.name, email: input.email };
    insertAccount({ ...user, passwordHash });
    await createSession(user.id);
    return Response.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
