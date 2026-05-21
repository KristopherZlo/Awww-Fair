import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthHandler, sessionTokenHash, type AuthStore, type AuthUser } from "./auth";

async function startTestServer(handler: ReturnType<typeof createAuthHandler>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
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
        email: profile.email ?? null
      };
      users.set(user.id, user);
      return user;
    },
    async upsertOAuthUser(_provider, profile) {
      const user = {
        id: `oauth-${profile.providerUserId}`,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        email: profile.email ?? null
      };
      users.set(user.id, user);
      return user;
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
        email: "p@example.test"
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
});
