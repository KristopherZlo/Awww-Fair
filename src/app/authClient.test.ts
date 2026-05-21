import { describe, expect, it, vi } from "vitest";
import { devLogin, loadCurrentUser, logout } from "./authClient";

describe("auth client", () => {
  it("loads the current user from the auth API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ user: { id: "u1", displayName: "User", avatarUrl: null, email: null } })));

    await expect(loadCurrentUser()).resolves.toEqual({ id: "u1", displayName: "User", avatarUrl: null, email: null });
  });

  it("posts dev login details and returns the logged-in user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ user: { id: "u2", displayName: "Dev", avatarUrl: null, email: "d@example.test" } })));

    await expect(devLogin({ displayName: "Dev", email: "d@example.test" })).resolves.toEqual({
      id: "u2",
      displayName: "Dev",
      avatarUrl: null,
      email: "d@example.test"
    });
  });

  it("posts logout to clear the session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
});
