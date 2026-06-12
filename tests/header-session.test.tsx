// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HeaderAccountLink } from "../components/HeaderAccountLink";
import { __resetSessionForTests } from "../lib/use-session";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  __resetSessionForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetSessionForTests();
});

describe("header session indicator", () => {
  it("leaves the Your data link unchanged while signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401))
    );
    render(<HeaderAccountLink />);

    await waitFor(() => expect(screen.queryByTestId("session-indicator")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Your data" })).toHaveAttribute("href", "/account");
  });

  it("shows a subtle signed-in indicator with the email in the title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          id: "u_1",
          email: "sam@example.com",
          kind: "buyer",
        })
      )
    );
    render(<HeaderAccountLink />);

    await waitFor(() => expect(screen.getByTestId("session-indicator")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Your data" })).toHaveAttribute(
      "title",
      "Signed in as sam@example.com"
    );
  });
});
