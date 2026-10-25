import { randomUUID } from "node:crypto";
import { createSession, hashPassword, insertAccount, limitAuthAttempts } from "@/lib/auth";
import { getDb, isUniqueConstraintError } from "@/lib/db";
import { assertSameOrigin, HttpError, readJson, routeError } from "@/lib/http";
import { registrationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = registrationSchema.parse(await readJson(request));
    await limitAuthAttempts(request, "register");
    // Do the same costly password work before reporting an unusable registration.
    const passwordHash = await hashPassword(input.password);
    if (await getDb().prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(input.email)) {
      throw new HttpError(400, "Não foi possível criar a conta com os dados informados.");
    }
    const user = { id: randomUUID(), name: input.name, email: input.email };
    await insertAccount({ ...user, passwordHash });
    await createSession(user.id);
    return Response.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return routeError(new HttpError(400, "Não foi possível criar a conta com os dados informados."));
    }
    return routeError(error);
  }
}
