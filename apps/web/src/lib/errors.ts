import { ApiError } from "./api";

const problemMessages: Readonly<Record<string, string>> = {
  authentication_required: "Your session has expired. Please sign in again.",
  cross_workspace_dependency:
    "Choose an active prerequisite from this workspace.",
  dependency_cycle: "That prerequisite would create a circular dependency.",
  duplicate_dependency: "That prerequisite has already been added.",
  forbidden: "You do not have permission to do that.",
  if_match_required: "Refresh this TODO and try again.",
  in_progress_would_be_blocked:
    "An in-progress TODO cannot have an incomplete prerequisite.",
  internal_error: "Something went wrong. Please try again.",
  invalid_credentials: "The email or password is incorrect.",
  invalid_csrf_token:
    "Your session could not be verified. Refresh the page and try again.",
  invalid_cursor:
    "This page link is no longer valid. Start from the first page.",
  invalid_dependency: "Choose active prerequisites from this workspace.",
  invalid_due_at: "Enter a valid due date and time.",
  invalid_if_match: "Refresh this TODO and try again.",
  invalid_json: "The request could not be processed. Please try again.",
  invalid_priority: "Choose a valid TODO priority.",
  invalid_status: "Choose a valid TODO status.",
  invalid_timezone: "Enter a valid timezone.",
  member_exists: "That person is already a member of this workspace.",
  member_remove_forbidden: "The workspace owner cannot be removed.",
  not_found: "The requested item could not be found.",
  owner_change_forbidden: "The workspace owner role cannot be changed.",
  rate_limited: "Too many attempts. Please try again later.",
  registration_conflict: "An account could not be created with those details.",
  reopen_requires_confirmation:
    "Review the affected TODOs before reopening this prerequisite.",
  route_not_found: "The requested page could not be found.",
  self_dependency: "A TODO cannot depend on itself.",
  stale_version:
    "This TODO changed since you opened it. Review the latest version and try again.",
  todo_blocked: "Complete all prerequisites before starting this TODO.",
  todo_has_dependents:
    "Remove active prerequisite links before deleting this TODO.",
  untrusted_origin:
    "This request could not be verified. Refresh the page and try again.",
  validation_failed: "Check the entered values and try again.",
};

/** Returns safe, user-facing copy without exposing RFC 9457 `detail`. */
export function describeApiError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;

  const code = error.problem.code;
  if (code && problemMessages[code]) return problemMessages[code];

  switch (error.status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to do that.";
    case 404:
      return "The requested item could not be found.";
    case 409:
    case 412:
      return "The data changed since you opened it. Refresh and try again.";
    case 422:
      return "Check the entered values and try again.";
    case 429:
      return "Too many attempts. Please try again later.";
    default:
      return error.status >= 500
        ? "Something went wrong. Please try again."
        : fallback;
  }
}
