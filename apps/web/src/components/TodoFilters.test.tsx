import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { TodoFilters } from "./TodoFilters";

function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}

describe("TodoFilters", () => {
  it("stores filters in URL parameters and clears the cursor", () => {
    render(
      <MemoryRouter initialEntries={["/?cursor=old"]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <TodoFilters timezone="UTC" />
                <Location />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Completed" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "status=Completed",
    );
    expect(screen.getByTestId("location")).not.toHaveTextContent("cursor");
  });
});
