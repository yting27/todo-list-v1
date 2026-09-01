import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import { describeApiError } from "./errors";

function apiError(status: number, code: string | undefined, detail: string) {
  return new ApiError(status, {
    type: "about:blank",
    title: "Request failed",
    status,
    detail,
    ...(code ? { code } : {}),
  });
}

describe("describeApiError", () => {
  it("maps a problem code to user-facing copy", () => {
    const error = apiError(
      409,
      "todo_has_dependents",
      "technical database detail",
    );

    expect(describeApiError(error, "Could not delete TODO.")).toBe(
      "Remove active prerequisite links before deleting this TODO.",
    );
  });

  it("uses safe status copy for an unknown problem code", () => {
    const error = apiError(422, "new_server_code", "technical server detail");

    expect(describeApiError(error, "Request failed.")).toBe(
      "Check the entered values and try again.",
    );
  });

  it("uses the caller fallback instead of an unknown server detail", () => {
    const error = apiError(418, "new_server_code", "technical server detail");

    expect(describeApiError(error, "Request failed.")).toBe("Request failed.");
  });

  it("uses the caller fallback instead of an arbitrary error message", () => {
    expect(
      describeApiError(
        new Error("network implementation detail"),
        "Try again.",
      ),
    ).toBe("Try again.");
  });
});
