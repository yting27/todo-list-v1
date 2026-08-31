import type { Request } from "express";

import type { SessionRecord } from "../auth/session-store.js";

export interface AuthenticatedRequest extends Request {
  auth: SessionRecord & { token: string };
}

export function isAuthenticated(
  request: Request,
): request is AuthenticatedRequest {
  return "auth" in request;
}
