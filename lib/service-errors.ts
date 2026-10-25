export type ServiceKind = "configuration" | "database" | "storage";

/** Operational failures expose only a stable code, never connection strings or SQL. */
export class ServiceError extends Error {
  readonly status = 503;
  constructor(public readonly kind: ServiceKind, public readonly code: string, cause?: unknown) {
    super("O serviço necessário não está disponível.", { cause });
    this.name = "ServiceError";
  }
}
