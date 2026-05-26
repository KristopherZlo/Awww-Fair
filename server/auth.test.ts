import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
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
      const user: AuthUser = {
        id: `dev-${profile.displayName.toLowerCase()}`,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        avatarShape: "circle",
        email: profile.email ?? null,
        twoFactorEnabled: false,
        deactivatedAt: null,
        deleteAfter: null
      };
      users.set(user.id, user);
      return user;
    },
    async upsertOAuthUser(_provider, profile) {
      const user: AuthUser = {
        id: `oauth-${profile.providerUserId}`,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        avatarShape: "circle",
        email: profile.email ?? null,
        twoFactorEnabled: false,
        deactivatedAt: null,
        deleteAfter: null
      };
      users.set(user.id, user);
      return user;
    },
    async updateProfile(userId, profile) {
      const user = users.get(userId)!;
      const updated: AuthUser = {
        ...user,
        displayName: profile.displayName,
        avatarShape: profile.avatarShape ?? user.avatarShape,
        avatarUrl: profile.removeAvatar ? null : profile.avatarUrl ?? user.avatarUrl
      };
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

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string) {
  let bits = "";
  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, now: Date) {
  const counter = Math.floor(now.getTime() / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
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

  it("keeps dev login disabled when XAMPP defaults disable it", async () => {
    const server = await startTestServer(createAuthHandler({ env: { AUTH_DEV_LOGIN: "false" }, store: new MemoryAuthStore() }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "player", email: "attacker@example.test" })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Dev login is disabled." });
  });

  it("does not bind explicit dev login to the seeded player identity", async () => {
    const server = await startTestServer(
      createAuthHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        store: new MemoryAuthStore(),
        tokenFactory: () => "session-token"
      })
    );
    cleanups.push(server.close);

    const login = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "player", email: "p@example.test" })
    });
    const payload = await login.json();

    expect(login.status).toBe(200);
    expect(payload.user).toMatchObject({ displayName: "player", email: "p@example.test" });
    expect(payload.user.id).not.toBe("dev-player");
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
        avatarShape: "circle",
        email: "p@example.test",
        twoFactorEnabled: false,
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
    const multipart = multipartProfileBody("New Nick", { bytes: PNG_BYTES, fileName: "avatar.png", contentType: "image/png" });

    const response = await fetch(`${server.url}/api/auth/profile`, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": multipart.contentType }, body: multipart.body });
    const payload = await response.json();
    const unauthenticatedAvatar = await fetch(`${server.url}${payload.user.avatarUrl}`);
    const avatar = await fetch(`${server.url}${payload.user.avatarUrl}`, { headers: { Cookie: cookie } });

    expect(response.status).toBe(200);
    expect(payload.user).toMatchObject({
      displayName: "New Nick",
      avatarUrl: expect.stringMatching(/^\/api\/auth\/avatar\/.+\.png$/),
      deactivatedAt: null,
      deleteAfter: null
    });
    expect(avatar.status).toBe(200);
    expect(unauthenticatedAvatar.status).toBe(401);
    expect(await unauthenticatedAvatar.json()).toEqual({ error: "Login is required." });
    expect(avatar.headers.get("content-type")).toBe("image/png");
    expect(avatar.headers.get("x-content-type-options")).toBe("nosniff");
    expect(avatar.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(new Uint8Array(await avatar.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("sets up and toggles authenticator app two-factor authentication", async () => {
    const currentTime = new Date("2026-05-22T10:00:00.000Z");
    const server = await startTestServer(
      createAuthHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        store: new MemoryAuthStore(),
        tokenFactory: () => "session-token",
        now: () => currentTime
      })
    );
    cleanups.push(server.close);
    const login = await fetch(`${server.url}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Player", email: "p@example.test" })
    });
    const cookie = login.headers.get("set-cookie") ?? "";

    const setup = await fetch(`${server.url}/api/auth/two-factor/setup`, { method: "POST", headers: { Cookie: cookie } });
    const setupPayload = (await setup.json()) as { secret: string; otpauthUri: string; qrCodeSvg: string };
    expect(setup.status).toBe(200);
    expect(setupPayload.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setupPayload.otpauthUri).toContain("otpauth://totp/Trend%20Market:Player");
    expect(setupPayload.qrCodeSvg).toContain("<svg");

    const wrong = await fetch(`${server.url}/api/auth/two-factor/enable`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000000" })
    });
    const enabled = await fetch(`${server.url}/api/auth/two-factor/enable`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpCode(setupPayload.secret, currentTime) })
    });
    const enabledPayload = await enabled.json();
    const me = await fetch(`${server.url}/api/auth/me`, { headers: { Cookie: cookie } });
    const disabled = await fetch(`${server.url}/api/auth/two-factor/disable`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpCode(setupPayload.secret, currentTime) })
    });

    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "Invalid authenticator code." });
    expect(enabled.status).toBe(200);
    expect(enabledPayload.user).toMatchObject({ displayName: "Player", twoFactorEnabled: true });
    expect(enabledPayload.recoveryCodes).toHaveLength(8);
    expect((await me.json()).user).toMatchObject({ twoFactorEnabled: true });
    expect((await disabled.json()).user).toMatchObject({ twoFactorEnabled: false });
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

  it("rejects avatar uploads whose bytes do not match the declared image type", async () => {
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
    const multipart = multipartProfileBody("Player", { bytes: "<!doctype html><script>alert(1)</script>", fileName: "avatar.png", contentType: "image/png" });

    const response = await fetch(`${server.url}/api/auth/profile`, { method: "PATCH", headers: { Cookie: login.headers.get("set-cookie") ?? "", "Content-Type": multipart.contentType }, body: multipart.body });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Avatar file content does not match its declared image type." });
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
