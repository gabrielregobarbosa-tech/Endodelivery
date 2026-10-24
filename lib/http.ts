import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function routeError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: "Confira os campos informados e tente novamente." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  // Keep SQL statements, paths, passwords and clinical content out of responses/logs.
  console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "Não foi possível concluir a operação. Tente novamente." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "Envie os dados no formato JSON.");
  }
  const limit = 2 * 1_048_576;
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new HttpError(413, "Os dados enviados excedem o limite permitido.");
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          await reader.cancel();
          throw new HttpError(413, "Os dados enviados excedem o limite permitido.");
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "Não foi possível ler o conteúdo enviado.");
    } finally {
      reader.releaseLock();
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
    return value;
  } catch {
    throw new HttpError(400, "O conteúdo JSON é inválido.");
  }
}

/** Reject browser requests that could use a session from another website. */
export function assertSameOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "Origem da solicitação não permitida.");
  }
  const origin = request.headers.get("origin");
  if (!origin) return; // Non-browser API clients have no Origin header.
  try {
    const originUrl = new URL(origin);
    const expectedUrl = new URL(process.env.APP_ORIGIN || request.url);
    if (originUrl.origin !== expectedUrl.origin) {
      throw new Error("Origin mismatch");
    }
  } catch {
    throw new HttpError(403, "Origem da solicitação não permitida.");
  }
}
