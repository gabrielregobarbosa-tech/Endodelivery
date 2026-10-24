import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ user: await requireUser() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
