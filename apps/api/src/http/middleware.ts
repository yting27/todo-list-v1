import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { ZodType } from "zod";
import { ZodError } from "zod";

import type { SessionStore } from "../auth/session-store.js";
import type { Config } from "../config.js";
import { ProblemError } from "../domain/errors.js";
import type { Logger } from "../platform/logger.js";
import type { AuthenticatedRequest } from "./types.js";

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function requireTrustedOrigin(config: Config): RequestHandler {
  return (request, _response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    const fetchSite = request.get("sec-fetch-site");
    const origin = request.get("origin");
    if (
      fetchSite === "cross-site" ||
      (origin && !config.trustedOrigins.has(origin))
    ) {
      return next(
        new ProblemError({
          status: 403,
          code: "untrusted_origin",
          title: "Forbidden",
          detail: "Cross-origin state-changing requests are not allowed.",
        }),
      );
    }
    next();
  };
}

export function authenticate(
  sessions: SessionStore,
  cookieName: string,
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = (request.cookies as Record<string, string | undefined>)[
        cookieName
      ];
      const record = token ? await sessions.get(token) : null;
      if (!record || !token) {
        throw new ProblemError({
          status: 401,
          code: "authentication_required",
          title: "Authentication required",
          detail: "Sign in to continue.",
        });
      }
      (request as AuthenticatedRequest).auth = { ...record, token };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireCsrf(sessions: SessionStore): RequestHandler {
  return (request, _response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    const authenticated = request as AuthenticatedRequest;
    if (!sessions.verifyCsrf(authenticated.auth, request.get("x-csrf-token"))) {
      return next(
        new ProblemError({
          status: 403,
          code: "invalid_csrf_token",
          title: "Forbidden",
          detail: "The CSRF token is missing or invalid.",
        }),
      );
    }
    next();
  };
}

export function notFoundHandler(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  next(
    new ProblemError({
      status: 404,
      code: "route_not_found",
      title: "Not found",
      detail: `No route matches ${request.method} ${request.path}.`,
    }),
  );
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    void _next;
    let problem: ProblemError;
    if (error instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".") || "request";
        (errors[path] ??= []).push(issue.message);
      }
      problem = new ProblemError({
        status: 422,
        code: "validation_failed",
        title: "Validation failed",
        detail: "The request contains invalid values.",
        extensions: { errors },
      });
    } else if (error instanceof SyntaxError && "body" in error) {
      problem = new ProblemError({
        status: 400,
        code: "invalid_json",
        title: "Invalid JSON",
        detail: "The request body is not valid JSON.",
      });
    } else if (error instanceof ProblemError) {
      problem = error;
    } else {
      logger.error({ error, requestId: request.id }, "unhandled request error");
      problem = new ProblemError({
        status: 500,
        code: "internal_error",
        title: "Internal server error",
        detail: "An unexpected error occurred.",
      });
    }
    response
      .status(problem.status)
      .type("application/problem+json")
      .json({
        type: `https://todo.local/problems/${problem.code}`,
        title: problem.title,
        status: problem.status,
        detail: problem.message,
        instance: request.originalUrl,
        code: problem.code,
        ...problem.extensions,
      });
  };
}
