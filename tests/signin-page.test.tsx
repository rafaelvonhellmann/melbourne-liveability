// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SignInPage from "../app/signin/page";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/signin page", () => {
  it("wires the visible label to the email input", () => {
    render(<SignInPage />);

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("id", "signin-email");
    expect(input).toHaveAttribute("type", "email");
  });

  it("submits a magic-link request and shows the sent state", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: "sent" }, 202));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await screen.findByText("Check your email.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/magic-link",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "sam@example.com" }),
      })
    );
  });

  it("shows the same sent state for rate-limited responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "rate_limited" }, 429))
    );
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await screen.findByText("Check your email.");
    expect(screen.queryByText(/rate/i)).not.toBeInTheDocument();
  });

  it("renders unavailable when the account service is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await waitFor(() =>
      expect(screen.getByText(/Accounts aren't live yet/i)).toBeInTheDocument()
    );
  });
});
