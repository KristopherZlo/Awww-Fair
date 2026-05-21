import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "mariadb";

const SESSION_COOKIE = "tm_session";
const OAUTH_STATE_COOKIE = "tm_oauth_state";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

export interface OAuthProfile {
  providerUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  email?: string | null;
}

export interface AuthStore {
  findUserBySessionHash(tokenHash: string, now: Date): Promise<AuthUser | null>;
  createDevUser(profile: { displayName: string; avatarUrl?: string | null; email?: string | null }): Promise<AuthUser>;
  upsertOAuthUser(provider: "google" | "discord", profile: OAuthProfile): Promise<AuthUser>;
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
}

export function sessionTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  const cookies = header.split(";").map((part) => part.trim());
  const prefix = `${name}=`;
  return cookies.find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function oauthStateCookie(state: string, maxAge = OAUTH_STATE_TTL_SECONDS) {
  return `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function redirect(response: ServerResponse, location: string, headers: Record<string, string | string[]> = {}) {
  response.writeHead(302, { Location: location, ...headers });
  response.end();
}

function safeDisplayName(value: unknown) {
  const displayName = typeof value === "string" ? value.trim() : "";
  return displayName.slice(0, 80) || "Player";
}

function safeNullableString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

export function createAuthHandler({
  env = process.env,
  store,
  now = () => new Date(),
  tokenFactory = () => crypto.randomBytes(32).toString("base64url"),
  oauthStateFactory = () => crypto.randomBytes(24).toString("base64url"),
  fetch: fetchImpl = globalThis.fetch
}: {
  env?: Partial<Record<string, string | undefined>>;
  store: AuthStore;
  now?: () => Date;
  tokenFactory?: () => string;
  oauthStateFactory?: () => string;
  fetch?: typeof globalThis.fetch;
}) {
  return async function authHandler(request: IncomingMessage, response: ServerResponse) {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const parts = requestUrl.pathname.split("/").filter(Boolean);

    try {
      if (request.method === "GET" && parts[2] === "me") {
        const token = cookieValue(request, SESSION_COOKIE);
        const user = token ? await store.findUserBySessionHash(sessionTokenHash(token), now()) : null;
        json(response, 200, { user });
        return;
      }

      if (request.method === "POST" && parts[2] === "logout") {
        const token = cookieValue(request, SESSION_COOKIE);
        if (token) {
          await store.deleteSession(sessionTokenHash(token));
        }
        json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
        return;
      }

      if (request.method === "POST" && parts[2] === "dev-login") {
        if (env.AUTH_DEV_LOGIN !== "true") {
          json(response, 404, { error: "Dev login is disabled." });
          return;
        }

        const body = await readJson(request);
        const user = await store.createDevUser({
          displayName: safeDisplayName(body.displayName),
          email: safeNullableString(body.email, 255),
          avatarUrl: safeNullableString(body.avatarUrl, 512)
        });
        const token = tokenFactory();
        await store.createSession(sessionTokenHash(token), user.id, new Date(now().getTime() + SESSION_TTL_SECONDS * 1000));
        json(response, 200, { user }, { "Set-Cookie": sessionCookie(token) });
        return;
      }

      if (request.method === "GET" && (parts[2] === "google" || parts[2] === "discord") && parts[3] === "start") {
        const state = oauthStateFactory();
        redirect(response, oauthAuthorizeUrl(parts[2], env, state), { "Set-Cookie": oauthStateCookie(state) });
        return;
      }

      if (request.method === "GET" && (parts[2] === "google" || parts[2] === "discord") && parts[3] === "callback") {
        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");
        if (!code || !state || cookieValue(request, OAUTH_STATE_COOKIE) !== state) {
          json(response, 400, { error: "Invalid OAuth callback." });
          return;
        }

        const profile = await fetchOAuthProfile(parts[2], code, env, fetchImpl);
        const user = await store.upsertOAuthUser(parts[2], profile);
        const token = tokenFactory();
        await store.createSession(sessionTokenHash(token), user.id, new Date(now().getTime() + SESSION_TTL_SECONDS * 1000));
        redirect(response, "/", { "Set-Cookie": [sessionCookie(token), oauthStateCookie("", 0)] });
        return;
      }

      json(response, 404, { error: "Unknown auth route." });
    } catch {
      json(response, 500, { error: "Auth server error." });
    }
  };
}

function appBaseUrl(env: Partial<Record<string, string | undefined>>) {
  return (env.APP_BASE_URL ?? "http://127.0.0.1:5176").replace(/\/+$/, "");
}

function oauthAuthorizeUrl(provider: "google" | "discord", env: Partial<Record<string, string | undefined>>, state: string) {
  const redirectUri = `${appBaseUrl(env)}/api/auth/${provider}/callback`;
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
    state
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

async function fetchOAuthProfile(
  provider: "google" | "discord",
  code: string,
  env: Partial<Record<string, string | undefined>>,
  fetchImpl: typeof globalThis.fetch
): Promise<OAuthProfile> {
  const redirectUri = `${appBaseUrl(env)}/api/auth/${provider}/callback`;
  const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://discord.com/api/oauth2/token";
  const tokenResponse = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: provider === "google" ? env.GOOGLE_CLIENT_ID ?? "" : env.DISCORD_CLIENT_ID ?? "",
      client_secret: provider === "google" ? env.GOOGLE_CLIENT_SECRET ?? "" : env.DISCORD_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error("OAuth token exchange failed.");
  }

  const profileUrl = provider === "google" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://discord.com/api/users/@me";
  const profileResponse = await fetchImpl(profileUrl, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
  });
  const profile = (await profileResponse.json()) as Record<string, unknown>;
  if (provider === "google") {
    return {
      providerUserId: String(profile.id),
      displayName: safeDisplayName(profile.name),
      avatarUrl: safeNullableString(profile.picture, 512),
      email: safeNullableString(profile.email, 255)
    };
  }

  const avatarHash = safeNullableString(profile.avatar, 128);
  const userId = String(profile.id);
  return {
    providerUserId: userId,
    displayName: safeDisplayName(profile.global_name ?? profile.username),
    avatarUrl: avatarHash ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png` : null,
    email: safeNullableString(profile.email, 255)
  };
}

export class MariaDbAuthStore implements AuthStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async findUserBySessionHash(tokenHash: string, now: Date): Promise<AuthUser | null> {
    const rows = await this.pool.query(
      `SELECT u.id, u.display_name AS displayName, u.avatar_url AS avatarUrl, u.email
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`,
      [tokenHash, now]
    );
    return rows[0] ?? null;
  }

  async createDevUser(profile: { displayName: string; avatarUrl?: string | null; email?: string | null }): Promise<AuthUser> {
    const user: AuthUser = {
      id: crypto.randomUUID(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      email: profile.email ?? null
    };
    await this.pool.query(
      "INSERT INTO users (id, display_name, avatar_url, email) VALUES (?, ?, ?, ?)",
      [user.id, user.displayName, user.avatarUrl, user.email]
    );
    return user;
  }

  async upsertOAuthUser(provider: "google" | "discord", profile: OAuthProfile): Promise<AuthUser> {
    const existing = await this.pool.query(
      "SELECT user_id AS userId FROM oauth_accounts WHERE provider = ? AND provider_user_id = ? LIMIT 1",
      [provider, profile.providerUserId]
    );
    const user: AuthUser = {
      id: existing[0]?.userId ?? crypto.randomUUID(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      email: profile.email ?? null
    };
    await this.pool.query(
      `INSERT INTO users (id, display_name, avatar_url, email)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), avatar_url = VALUES(avatar_url), email = VALUES(email)`,
      [user.id, user.displayName, user.avatarUrl, user.email]
    );
    await this.pool.query(
      `INSERT INTO oauth_accounts (provider, provider_user_id, user_id, email, display_name, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), avatar_url = VALUES(avatar_url)`,
      [provider, profile.providerUserId, user.id, user.email, user.displayName, user.avatarUrl]
    );
    return user;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      [tokenHash, userId, expiresAt]
    );
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query("DELETE FROM user_sessions WHERE token_hash = ?", [tokenHash]);
  }
}
