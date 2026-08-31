import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TodoForm } from "./TodoForm";

describe("TodoForm", () => {
  it("submits a workspace-zoned RFC 3339 due date", () => {
    const submit = vi.fn();
    render(
      <TodoForm
        timezone="Asia/Kuala_Lumpur"
        options={[]}
        submitting={false}
        submitLabel="Create"
        onSubmit={submit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Prepare demo" },
    });
    fireEvent.change(screen.getByLabelText(/Due in/), {
      target: { value: "2026-09-01T09:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Prepare demo",
        dueAt: "2026-09-01T01:30:00.000Z",
      }),
    );
  });
});
