import { describe, expect, it, vi } from "vitest";
import { cancelProfileDeletion, deactivateProfile, devLogin, loadCurrentUser, logout, updateProfile } from "./authClient";

describe("auth client", () => {
  it("loads the current user from the auth API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ user: { id: "u1", displayName: "User", avatarUrl: null, email: null, deactivatedAt: null, deleteAfter: null } })));

    await expect(loadCurrentUser()).resolves.toEqual({ id: "u1", displayName: "User", avatarUrl: null, email: null, deactivatedAt: null, deleteAfter: null });
  });

  it("posts dev login details and returns the logged-in user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ user: { id: "u2", displayName: "Dev", avatarUrl: null, email: "d@example.test", deactivatedAt: null, deleteAfter: null } })));

    await expect(devLogin({ displayName: "Dev", email: "d@example.test" })).resolves.toEqual({
      id: "u2",
      displayName: "Dev",
      avatarUrl: null,
      email: "d@example.test",
      deactivatedAt: null,
      deleteAfter: null
    });
  });

  it("explains when the auth API proxy is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));

    await expect(devLogin({ displayName: "Dev" })).rejects.toThrow(/API server unavailable.*npm run dev:lan/i);
  });

  it("posts logout to clear the session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  it("updates profile details with multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ user: { id: "u1", displayName: "New Nick", avatarUrl: "/api/auth/avatar/a.png", email: null, deactivatedAt: null, deleteAfter: null } }));
    vi.stubGlobal("fetch", fetchMock);
    const avatar = new File(["png"], "avatar.png", { type: "image/png" });

    await expect(updateProfile({ displayName: "New Nick", avatar })).resolves.toMatchObject({
      displayName: "New Nick",
      avatarUrl: "/api/auth/avatar/a.png"
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/profile", {
      method: "PATCH",
      body: expect.any(FormData)
    });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("displayName")).toBe("New Nick");
    expect(form.get("avatar")).toBe(avatar);
  });

  it("deactivates and cancels profile deletion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "u1", displayName: "User", avatarUrl: null, email: null, deactivatedAt: "2026-05-22T10:00:00.000Z", deleteAfter: "2026-06-05T10:00:00.000Z" } }))
      .mockResolvedValueOnce(Response.json({ user: { id: "u1", displayName: "User", avatarUrl: null, email: null, deactivatedAt: null, deleteAfter: null } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deactivateProfile("УДАЛИТЬ ПРОФИЛЬ")).resolves.toMatchObject({ deactivatedAt: "2026-05-22T10:00:00.000Z" });
    await expect(cancelProfileDeletion()).resolves.toMatchObject({ deactivatedAt: null, deleteAfter: null });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "УДАЛИТЬ ПРОФИЛЬ" })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/cancel-deletion", { method: "POST" });
  });
});
