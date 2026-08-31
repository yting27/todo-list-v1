export interface ProblemOptions {
  status: number;
  code: string;
  title: string;
  detail: string;
  extensions?: Record<string, unknown>;
}

export class ProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly extensions: Record<string, unknown>;

  constructor(options: ProblemOptions) {
    super(options.detail);
    this.name = "ProblemError";
    this.status = options.status;
    this.code = options.code;
    this.title = options.title;
    this.extensions = options.extensions ?? {};
  }
}

export function badRequest(
  code: string,
  detail: string,
  extensions?: Record<string, unknown>,
) {
  return new ProblemError({
    status: 422,
    code,
    title: "Validation failed",
    detail,
    ...(extensions ? { extensions } : {}),
  });
}

export function forbidden(
  detail = "You do not have permission to perform this action.",
) {
  return new ProblemError({
    status: 403,
    code: "forbidden",
    title: "Forbidden",
    detail,
  });
}

export function notFound(detail = "The requested resource was not found.") {
  return new ProblemError({
    status: 404,
    code: "not_found",
    title: "Not found",
    detail,
  });
}

export function conflict(
  code: string,
  detail: string,
  extensions?: Record<string, unknown>,
) {
  return new ProblemError({
    status: 409,
    code,
    title: "Conflict",
    detail,
    ...(extensions ? { extensions } : {}),
  });
}

export function staleVersion() {
  return new ProblemError({
    status: 412,
    code: "stale_version",
    title: "Precondition failed",
    detail:
      "The TODO changed after it was loaded. Fetch the current version and review your changes.",
  });
}
