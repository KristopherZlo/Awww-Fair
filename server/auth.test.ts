import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthHandler, MemoryAuthStore, sessionTokenHash, type AuthStore, type AuthUser } from "./auth";

async function startTestServer(handler: ReturnType<typeof createAuthHandler>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function multipartProfileBody(displayName: string, avatar: { bytes: Uint8Array | string; fileName: string; contentType: string }) {
  const boundary = "----trendmarket-test-boundary";
  const bytes = typeof avatar.bytes === "string" ? Buffer.from(avatar.bytes) : Buffer.from(avatar.bytes);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="displayName"\r\n\r\n${displayName}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="${avatar.fileName}"\r\nContent-Type: ${avatar.contentType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function memoryStore(): AuthStore {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<string, string>();
  return {
    async findUserBySessionHash(tokenHash) {
      const userId = sessions.get(tokenHash);
      return userId ? users.get(userId) ?? null : null;
    },
    async createDevUser(profile) {
      const user = {
        id: `dev-${profile.displayName.toLowerCase()}`,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        email: profile.email ?? null,
        deactivatedAt: null,
        deleteAfter: null
      };
      users.set(user.id, user);
      return user;
    },
    async upsertOAuthUser(_provider, profile) {
      const user = {
        id: `oauth-${profile.providerUserId}`,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        email: profile.email ?? null,
        deactivatedAt: null,
        deleteAfter: null
      };
      users.set(user.id, user);
      return user;
    },
    async updateProfile(userId, profile) {
      const user = users.get(userId)!;
      const updated = { ...user, displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? user.avatarUrl };
      users.set(userId, updated);
      return updated;
    },
    async deactivateUser(userId, deactivatedAt, deleteAfter) {
      const user = users.get(userId)!;
      const updated = { ...user, deactivatedAt: deactivatedAt.toISOString(), deleteAfter: deleteAfter.toISOString() };
      users.set(userId, updated);
      return updated;
    },
    async cancelDeletion(userId) {
      const user = users.get(userId)!;
      const updated = { ...user, deactivatedAt: null, deleteAfter: null };
      users.set(userId, updated);
      return updated;
    },
    async purgeExpiredDeactivatedUsers() {
      return [];
    },
    async createSession(tokenHash, userId) {
      sessions.set(tokenHash, userId);
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    }
  };
}

describe("auth handler", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("hashes session tokens without exposing the plaintext token", () => {
    expect(sessionTokenHash("secret-token")).toBe("930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94");
  });

  it("rejects dev login unless AUTH_DEV_LOGIN is enabled", async () => {
    const server = await startTestServer(createAuthHandler({ env: {}, store: memoryStore() }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Player" })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Dev login is disabled." });
  });

  it("creates a dev session and reads it through /me", async () => {
    const server = await startTestServer(
      createAuthHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        store: memoryStore(),
        tokenFactory: () => "session-token"
      })
    );
    cleanups.push(server.close);

    const login = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Player", email: "p@example.test" })
    });
    const cookie = login.headers.get("set-cookie") ?? "";
    const me = await fetch(`${server.url}/api/auth/me`, { headers: { Cookie: cookie } });

    expect(login.status).toBe(200);
    expect(cookie).toContain("tm_session=session-token");
    expect(await me.json()).toEqual({
      user: {
        id: "dev-player",
        displayName: "Player",
        avatarUrl: null,
        email: "p@example.test",
        deactivatedAt: null,
        deleteAfter: null
      }
    });
  });

  it("starts and completes Google OAuth with a state cookie", async () => {
    const fetchCalls: string[] = [];
    const server = await startTestServer(
      createAuthHandler({
        env: {
          APP_BASE_URL: "https://game.example",
          GOOGLE_CLIENT_ID: "google-client",
          GOOGLE_CLIENT_SECRET: "google-secret"
        },
        store: memoryStore(),
        oauthStateFactory: () => "oauth-state",
        tokenFactory: () => "session-token",
        fetch: async (url) => {
          fetchCalls.push(String(url));
          if (String(url).includes("oauth2.googleapis.com/token")) {
            return Response.json({ access_token: "access-token" });
          }
          return Response.json({
            id: "google-user",
            name: "Google Player",
            picture: "https://avatar.example/p.png",
            email: "google@example.test"
          });
        }
      })
    );
    cleanups.push(server.close);

    const start = await fetch(`${server.url}/api/auth/google/start`, { redirect: "manual" });
    const stateCookie = start.headers.get("set-cookie") ?? "";
    const callback = await fetch(`${server.url}/api/auth/google/callback?code=abc&state=oauth-state`, {
      redirect: "manual",
      headers: { Cookie: stateCookie }
    });

    expect(start.status).toBe(302);
    expect(start.headers.get("location")).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(stateCookie).toContain("tm_oauth_state=oauth-state");
    expect(callback.status).toBe(302);
    expect(callback.headers.get("set-cookie")).toContain("tm_session=session-token");
    expect(callback.headers.get("location")).toBe("/");
    expect(fetchCalls).toEqual(["https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v2/userinfo"]);
  });

  it("redirects OAuth callbacks back to the Apache public path", async () => {
    const server = await startTestServer(
      createAuthHandler({
        env: {
          APP_BASE_URL: "http://192.168.1.24",
          GOOGLE_CLIENT_ID: "google-client",
          GOOGLE_CLIENT_SECRET: "google-secret",
          PUBLIC_PATH: "trendmarket"
        },
        store: memoryStore(),
        oauthStateFactory: () => "oauth-state",
        tokenFactory: () => "session-token",
        fetch: async (url) => {
          if (String(url).includes("oauth2.googleapis.com/token")) {
            return Response.json({ access_token: "access-token" });
          }
          return Response.json({
            id: "google-user",
            name: "Google Player",
            picture: "https://avatar.example/p.png",
            email: "google@example.test"
          });
        }
      })
    );
    cleanups.push(server.close);

    const start = await fetch(`${server.url}/api/auth/google/start`, { redirect: "manual" });
    const callback = await fetch(`${server.url}/api/auth/google/callback?code=abc&state=oauth-state`, {
      redirect: "manual",
      headers: { Cookie: start.headers.get("set-cookie") ?? "" }
    });

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/trendmarket/");
  });

  it("updates the authenticated profile and serves an uploaded avatar", async () => {
    const avatarDir = await mkdtemp(path.join(tmpdir(), "trendmarket-avatar-"));
    cleanups.push(() => rm(avatarDir, { recursive: true, force: true }));
    const server = await startTestServer(
      createAuthHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        store: new MemoryAuthStore(),
        tokenFactory: () => "session-token",
        avatarDir
      })
    );
    cleanups.push(server.close);
    const login = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Player", email: "p@example.test" })
    });
    const cookie = login.headers.get("set-cookie") ?? "";
    const multipart = multipartProfileBody("New Nick", { bytes: new Uint8Array([137, 80, 78, 71]), fileName: "avatar.png", contentType: "image/png" });

    const response = await fetch(`${server.url}/api/auth/profile`, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": multipart.contentType }, body: multipart.body });
    const payload = await response.json();
    const avatar = await fetch(`${server.url}${payload.user.avatarUrl}`);

    expect(response.status).toBe(200);
    expect(payload.user).toMatchObject({
      displayName: "New Nick",
      avatarUrl: expect.stringMatching(/^\/api\/auth\/avatar\/.+\.png$/),
      deactivatedAt: null,
      deleteAfter: null
    });
    expect(avatar.status).toBe(200);
    expect(avatar.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await avatar.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("rejects unsupported avatar uploads", async () => {
    const avatarDir = await mkdtemp(path.join(tmpdir(), "trendmarket-avatar-"));
    cleanups.push(() => rm(avatarDir, { recursive: true, force: true }));
    const server = await startTestServer(
      createAuthHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        store: new MemoryAuthStore(),
        tokenFactory: () => "session-token",
        avatarDir
      })
    );
    cleanups.push(server.close);
    const login = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Player" })
    });
    const multipart = multipartProfileBody("Player", { bytes: "bad", fileName: "avatar.txt", contentType: "text/plain" });

    const response = await fetch(`${server.url}/api/auth/profile`, { method: "PATCH", headers: { Cookie: login.headers.get("set-cookie") ?? "", "Content-Type": multipart.contentType }, body: multipart.body });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unsupported avatar type." });
  });

  it("deactivates, cancels deletion, and lazily purges expired profiles", async () => {
    let currentTime = new Date("2026-05-22T10:00:00.000Z");
    const avatarDir = await mkdtemp(path.join(tmpdir(), "trendmarket-avatar-"));
    cleanups.push(() => rm(avatarDir, { recursive: true, force: true }));
    const server = await startTestServer(
      createAuthHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        store: new MemoryAuthStore(),
        tokenFactory: () => "session-token",
        now: () => currentTime,
        avatarDir
      })
    );
    cleanups.push(server.close);
    const login = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Player", email: "p@example.test" })
    });
    const cookie = login.headers.get("set-cookie") ?? "";

    const wrong = await fetch(`${server.url}/api/auth/deactivate`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" })
    });
    const deactivated = await fetch(`${server.url}/api/auth/deactivate`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "УДАЛИТЬ ПРОФИЛЬ" })
    });
    const deactivatedPayload = await deactivated.json();
    const cancelled = await fetch(`${server.url}/api/auth/cancel-deletion`, { method: "POST", headers: { Cookie: cookie } });
    await fetch(`${server.url}/api/auth/deactivate`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "УДАЛИТЬ ПРОФИЛЬ" })
    });
    currentTime = new Date("2026-06-06T10:00:00.000Z");
    const purgedMe = await fetch(`${server.url}/api/auth/me`, { headers: { Cookie: cookie } });

    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "Type УДАЛИТЬ ПРОФИЛЬ to deactivate profile." });
    expect(deactivatedPayload.user).toMatchObject({
      displayName: "Player",
      deactivatedAt: "2026-05-22T10:00:00.000Z",
      deleteAfter: "2026-06-05T10:00:00.000Z"
    });
    expect((await cancelled.json()).user).toMatchObject({ deactivatedAt: null, deleteAfter: null });
    expect(await purgedMe.json()).toEqual({ user: null });
  });
});
