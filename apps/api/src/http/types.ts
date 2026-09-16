import type { Request } from "express";

import type { SessionRecord } from "../auth/session-store.js";

// Add the auth property to the Express request type.
export interface AuthenticatedRequest extends Request {
  auth: SessionRecord & { token: string };
}

export function isAuthenticated(
  request: Request,
): request is AuthenticatedRequest {
  return "auth" in request;
}
