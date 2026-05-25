import crypto from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Pool } from "mariadb";
import { publicPath } from "./listen-config.mjs";
import { securityHeaders } from "./security-headers.mjs";

const SESSION_COOKIE = "tm_session";
const OAUTH_STATE_COOKIE = "tm_oauth_state";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const PROFILE_DELETE_CONFIRMATION = "УДАЛИТЬ ПРОФИЛЬ";
const PROFILE_DELETE_DELAY_MS = 14 * 24 * 60 * 60 * 1000;
const AVATAR_ROUTE_PREFIX = "/api/auth/avatar/";
const AVATAR_MAX_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([255, 216, 255]);
const RIFF_SIGNATURE = Buffer.from("RIFF", "ascii");
const WEBP_SIGNATURE = Buffer.from("WEBP", "ascii");
type AvatarType = {
  extension: string;
  contentType: string;
  isValid: (data: Buffer) => boolean;
};
const AVATAR_TYPES = new Map<string, AvatarType>([
  ["image/png", { extension: "png", contentType: "image/png", isValid: (data: Buffer) => startsWithBytes(data, PNG_SIGNATURE) }],
  ["image/jpeg", { extension: "jpg", contentType: "image/jpeg", isValid: (data: Buffer) => startsWithBytes(data, JPEG_SIGNATURE) }],
  [
    "image/webp",
    {
      extension: "webp",
      contentType: "image/webp",
      isValid: (data: Buffer) => startsWithBytes(data, RIFF_SIGNATURE) && startsWithBytes(data, WEBP_SIGNATURE, 8)
    }
  ]
]);

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  deactivatedAt: string | null;
  deleteAfter: string | null;
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
  updateProfile(userId: string, profile: { displayName: string; avatarUrl?: string | null }): Promise<AuthUser>;
  deactivateUser(userId: string, deactivatedAt: Date, deleteAfter: Date): Promise<AuthUser>;
  cancelDeletion(userId: string): Promise<AuthUser>;
  purgeExpiredDeactivatedUsers(now: Date): Promise<string[]>;
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
}

export function sessionTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { ...securityHeaders(), "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

class AuthHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function startsWithBytes(data: Buffer, signature: Buffer, offset = 0) {
  return data.length >= offset + signature.length && data.subarray(offset, offset + signature.length).equals(signature);
}

async function readRawBody(request: IncomingMessage, maxBytes = 64 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new AuthHttpError(413, "Request body is too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = (await readRawBody(request)).toString("utf8");
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
  response.writeHead(302, { ...securityHeaders(), Location: location, ...headers });
  response.end();
}

function safeDisplayName(value: unknown) {
  const displayName = typeof value === "string" ? value.trim() : "";
  return displayName.slice(0, 80) || "Player";
}

function safeNullableString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function dateString(value: unknown): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function authUserFromRow(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    displayName: String(row.displayName ?? row.display_name ?? "Player"),
    avatarUrl: safeNullableString(row.avatarUrl ?? row.avatar_url, 512),
    email: safeNullableString(row.email, 255),
    deactivatedAt: dateString(row.deactivatedAt ?? row.deactivated_at),
    deleteAfter: dateString(row.deleteAfter ?? row.delete_after)
  };
}

type ProfileAvatarUpload = {
  data: Buffer;
  contentType: string;
};

type ProfileUpdatePayload = {
  displayName: string;
  avatar?: ProfileAvatarUpload;
};

function multipartBoundary(contentType: string) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return match?.[1] ?? match?.[2] ?? "";
}

async function readProfileUpdate(request: IncomingMessage): Promise<ProfileUpdatePayload> {
  const contentType = request.headers["content-type"] ?? "";
  if (contentType.includes("multipart/form-data")) {
    const boundary = multipartBoundary(contentType);
    if (!boundary) {
      throw new AuthHttpError(400, "Invalid multipart form.");
    }
    const body = await readRawBody(request, AVATAR_MAX_BYTES + 64 * 1024);
    return parseProfileMultipart(body, boundary);
  }

  const body = await readJson(request);
  return { displayName: safeDisplayName(body.displayName) };
}

function parseProfileMultipart(body: Buffer, boundary: string): ProfileUpdatePayload {
  const fields = new Map<string, string>();
  let avatar: ProfileAvatarUpload | undefined;
  const raw = body.toString("latin1");
  for (const part of raw.split(`--${boundary}`)) {
    if (!part || part === "--\r\n" || part === "--") {
      continue;
    }
    const normalized = part.replace(/^\r\n/, "").replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const headerEnd = normalized.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      continue;
    }
    const headerLines = normalized.slice(0, headerEnd).split("\r\n");
    const content = normalized.slice(headerEnd + 4);
    const disposition = headerLines.find((line) => line.toLowerCase().startsWith("content-disposition:")) ?? "";
    const name = /name="([^"]+)"/.exec(disposition)?.[1] ?? "";
    if (!name) {
      continue;
    }
    const filename = /filename="([^"]*)"/.exec(disposition)?.[1] ?? "";
    if (filename) {
      const type = headerLines.find((line) => line.toLowerCase().startsWith("content-type:"))?.split(":").slice(1).join(":").trim().toLowerCase() ?? "";
      avatar = { data: Buffer.from(content, "latin1"), contentType: type };
    } else {
      fields.set(name, Buffer.from(content, "latin1").toString("utf8"));
    }
  }
  return { displayName: safeDisplayName(fields.get("displayName")), avatar };
}

function avatarFileNameFromUrl(avatarUrl: string) {
  if (!avatarUrl.startsWith(AVATAR_ROUTE_PREFIX)) {
    return null;
  }
  const file = avatarUrl.slice(AVATAR_ROUTE_PREFIX.length);
  return /^[a-z0-9-]+\.(png|jpg|webp)$/i.test(file) ? file : null;
}

function avatarPath(avatarDir: string, file: string) {
  const resolvedDir = path.resolve(avatarDir);
  const resolvedFile = path.resolve(resolvedDir, file);
  if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new AuthHttpError(400, "Invalid avatar file.");
  }
  return resolvedFile;
}

export function defaultAvatarDir(env: Partial<Record<string, string | undefined>> = process.env) {
  return path.resolve(env.AVATAR_UPLOAD_DIR ?? path.join(process.cwd(), "..", "..", "trendmarket-private", "avatars"));
}

async function saveAvatarUpload(userId: string, upload: ProfileAvatarUpload | undefined, avatarDir: string): Promise<string | undefined> {
  if (!upload || upload.data.length === 0) {
    return undefined;
  }
  const avatarType = AVATAR_TYPES.get(upload.contentType);
  if (!avatarType) {
    throw new AuthHttpError(400, "Unsupported avatar type.");
  }
  if (upload.data.length > AVATAR_MAX_BYTES) {
    throw new AuthHttpError(413, "Avatar file is too large.");
  }
  if (!avatarType.isValid(upload.data)) {
    throw new AuthHttpError(400, "Avatar file content does not match its declared image type.");
  }
  await mkdir(avatarDir, { recursive: true });
  const file = `${userId}-${crypto.randomUUID()}.${avatarType.extension}`;
  await writeFile(avatarPath(avatarDir, file), upload.data, { flag: "wx" });
  return `${AVATAR_ROUTE_PREFIX}${file}`;
}

async function deleteUploadedAvatar(avatarUrl: string | null | undefined, avatarDir: string) {
  if (!avatarUrl) {
    return;
  }
  const file = avatarFileNameFromUrl(avatarUrl);
  if (!file) {
    return;
  }
  await unlink(avatarPath(avatarDir, file)).catch(() => undefined);
}

async function serveAvatar(file: string, avatarDir: string, response: ServerResponse) {
  if (!/^[a-z0-9-]+\.(png|jpg|webp)$/i.test(file)) {
    json(response, 404, { error: "Avatar not found." });
    return;
  }
  const extension = file.split(".").pop()?.toLowerCase();
  const contentType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  try {
    const body = await readFile(avatarPath(avatarDir, file));
    response.writeHead(200, { ...securityHeaders(), "Content-Type": contentType, "Cache-Control": "private, max-age=86400" });
    response.end(body);
  } catch {
    json(response, 404, { error: "Avatar not found." });
  }
}

export function createAuthHandler({
  env = process.env,
  store,
  now = () => new Date(),
  tokenFactory = () => crypto.randomBytes(32).toString("base64url"),
  oauthStateFactory = () => crypto.randomBytes(24).toString("base64url"),
  fetch: fetchImpl = globalThis.fetch,
  avatarDir = defaultAvatarDir(env)
}: {
  env?: Partial<Record<string, string | undefined>>;
  store: AuthStore;
  now?: () => Date;
  tokenFactory?: () => string;
  oauthStateFactory?: () => string;
  fetch?: typeof globalThis.fetch;
  avatarDir?: string;
}) {
  return async function authHandler(request: IncomingMessage, response: ServerResponse) {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const parts = requestUrl.pathname.split("/").filter(Boolean);

    try {
      const currentTime = now();
      const purgedAvatarUrls = await store.purgeExpiredDeactivatedUsers(currentTime);
      await Promise.all(purgedAvatarUrls.map((avatarUrl) => deleteUploadedAvatar(avatarUrl, avatarDir)));

      if (request.method === "GET" && parts[2] === "avatar" && parts[3]) {
        const token = cookieValue(request, SESSION_COOKIE);
        const user = token ? await store.findUserBySessionHash(sessionTokenHash(token), currentTime) : null;
        if (!user) {
          json(response, 401, { error: "Login is required." });
          return;
        }
        if (user.deactivatedAt) {
          json(response, 403, { error: "Profile is scheduled for deletion." });
          return;
        }
        await serveAvatar(parts[3], avatarDir, response);
        return;
      }

      if (request.method === "GET" && parts[2] === "me") {
        const token = cookieValue(request, SESSION_COOKIE);
        const user = token ? await store.findUserBySessionHash(sessionTokenHash(token), currentTime) : null;
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
        await store.createSession(sessionTokenHash(token), user.id, new Date(currentTime.getTime() + SESSION_TTL_SECONDS * 1000));
        json(response, 200, { user }, { "Set-Cookie": sessionCookie(token) });
        return;
      }

      if (request.method === "PATCH" && parts[2] === "profile") {
        const token = cookieValue(request, SESSION_COOKIE);
        const user = token ? await store.findUserBySessionHash(sessionTokenHash(token), currentTime) : null;
        if (!user) {
          json(response, 401, { error: "Login is required." });
          return;
        }
        const profile = await readProfileUpdate(request);
        const avatarUrl = await saveAvatarUpload(user.id, profile.avatar, avatarDir);
        try {
          const updated = await store.updateProfile(user.id, { displayName: profile.displayName, avatarUrl });
          if (avatarUrl && avatarUrl !== user.avatarUrl) {
            await deleteUploadedAvatar(user.avatarUrl, avatarDir);
          }
          json(response, 200, { user: updated });
        } catch (error) {
          await deleteUploadedAvatar(avatarUrl, avatarDir);
          throw error;
        }
        return;
      }

      if (request.method === "POST" && parts[2] === "deactivate") {
        const token = cookieValue(request, SESSION_COOKIE);
        const user = token ? await store.findUserBySessionHash(sessionTokenHash(token), currentTime) : null;
        if (!user) {
          json(response, 401, { error: "Login is required." });
          return;
        }
        const body = await readJson(request);
        if (body.confirmation !== PROFILE_DELETE_CONFIRMATION) {
          throw new AuthHttpError(400, "Type УДАЛИТЬ ПРОФИЛЬ to deactivate profile.");
        }
        const updated = await store.deactivateUser(user.id, currentTime, new Date(currentTime.getTime() + PROFILE_DELETE_DELAY_MS));
        json(response, 200, { user: updated });
        return;
      }

      if (request.method === "POST" && parts[2] === "cancel-deletion") {
        const token = cookieValue(request, SESSION_COOKIE);
        const user = token ? await store.findUserBySessionHash(sessionTokenHash(token), currentTime) : null;
        if (!user) {
          json(response, 401, { error: "Login is required." });
          return;
        }
        json(response, 200, { user: await store.cancelDeletion(user.id) });
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
        await store.createSession(sessionTokenHash(token), user.id, new Date(currentTime.getTime() + SESSION_TTL_SECONDS * 1000));
        redirect(response, appHomePath(env), { "Set-Cookie": [sessionCookie(token), oauthStateCookie("", 0)] });
        return;
      }

      json(response, 404, { error: "Unknown auth route." });
    } catch (error) {
      if (error instanceof AuthHttpError) {
        json(response, error.status, { error: error.message });
        return;
      }
      json(response, 500, { error: "Auth server error." });
    }
  };
}

function appBaseUrl(env: Partial<Record<string, string | undefined>>) {
  return (env.APP_BASE_URL ?? "http://127.0.0.1:5176").replace(/\/+$/, "");
}

function appHomePath(env: Partial<Record<string, string | undefined>>) {
  const path = publicPath(env);
  return path ? `/${path}/` : "/";
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

export class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, AuthUser>();
  private readonly sessions = new Map<string, { userId: string; expiresAt: Date }>();
  private readonly oauthUsers = new Map<string, string>();

  async findUserBySessionHash(tokenHash: string, now: Date): Promise<AuthUser | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= now) {
      this.sessions.delete(tokenHash);
      return null;
    }
    const user = this.users.get(session.userId);
    return user ? { ...user } : null;
  }

  async createDevUser(profile: { displayName: string; avatarUrl?: string | null; email?: string | null }): Promise<AuthUser> {
    const userId = crypto.randomUUID();
    const existingUser = this.users.get(userId);
    const user: AuthUser = {
      id: userId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      email: profile.email ?? null,
      deactivatedAt: existingUser?.deactivatedAt ?? null,
      deleteAfter: existingUser?.deleteAfter ?? null
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async upsertOAuthUser(provider: "google" | "discord", profile: OAuthProfile): Promise<AuthUser> {
    const accountKey = `${provider}:${profile.providerUserId}`;
    const existingId = this.oauthUsers.get(accountKey);
    const existingUser = existingId ? this.users.get(existingId) : null;
    const user: AuthUser = {
      id: existingId ?? crypto.randomUUID(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      email: profile.email ?? null,
      deactivatedAt: existingUser?.deactivatedAt ?? null,
      deleteAfter: existingUser?.deleteAfter ?? null
    };
    this.users.set(user.id, user);
    this.oauthUsers.set(accountKey, user.id);
    return { ...user };
  }

  async updateProfile(userId: string, profile: { displayName: string; avatarUrl?: string | null }): Promise<AuthUser> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }
    const updated = {
      ...user,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? user.avatarUrl
    };
    this.users.set(userId, updated);
    return { ...updated };
  }

  async deactivateUser(userId: string, deactivatedAt: Date, deleteAfter: Date): Promise<AuthUser> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }
    const updated = { ...user, deactivatedAt: deactivatedAt.toISOString(), deleteAfter: deleteAfter.toISOString() };
    this.users.set(userId, updated);
    return { ...updated };
  }

  async cancelDeletion(userId: string): Promise<AuthUser> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }
    const updated = { ...user, deactivatedAt: null, deleteAfter: null };
    this.users.set(userId, updated);
    return { ...updated };
  }

  async purgeExpiredDeactivatedUsers(now: Date): Promise<string[]> {
    const expired = [...this.users.values()].filter((user) => user.deleteAfter && new Date(user.deleteAfter) <= now);
    const expiredIds = new Set(expired.map((user) => user.id));
    const avatarUrls = expired.map((user) => user.avatarUrl).filter((avatarUrl): avatarUrl is string => Boolean(avatarUrl));
    for (const user of expired) {
      this.users.set(user.id, {
        ...user,
        displayName: `Deleted profile ${user.id.slice(0, 8)}`,
        avatarUrl: null,
        email: null,
        deactivatedAt: null,
        deleteAfter: null
      });
    }
    for (const [tokenHash, session] of this.sessions) {
      if (expiredIds.has(session.userId)) {
        this.sessions.delete(tokenHash);
      }
    }
    for (const [accountKey, userId] of this.oauthUsers) {
      if (expiredIds.has(userId)) {
        this.oauthUsers.delete(accountKey);
      }
    }
    return avatarUrls;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}

export class MariaDbAuthStore implements AuthStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async findUserBySessionHash(tokenHash: string, now: Date): Promise<AuthUser | null> {
    const rows = await this.pool.query(
      `SELECT u.id, u.display_name AS displayName, u.avatar_url AS avatarUrl, u.email,
        u.deactivated_at AS deactivatedAt, u.delete_after AS deleteAfter
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`,
      [tokenHash, now]
    );
    return rows[0] ? authUserFromRow(rows[0]) : null;
  }

  async createDevUser(profile: { displayName: string; avatarUrl?: string | null; email?: string | null }): Promise<AuthUser> {
    const user: AuthUser = {
      id: crypto.randomUUID(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      email: profile.email ?? null,
      deactivatedAt: null,
      deleteAfter: null
    };
    await this.pool.query(
      "INSERT INTO users (id, display_name, avatar_url, email) VALUES (?, ?, ?, ?)",
      [user.id, user.displayName, user.avatarUrl, user.email]
    );
    const rows = await this.pool.query(
      `SELECT id, display_name AS displayName, avatar_url AS avatarUrl, email,
        deactivated_at AS deactivatedAt, delete_after AS deleteAfter
       FROM users WHERE id = ? LIMIT 1`,
      [user.id]
    );
    return rows[0] ? authUserFromRow(rows[0]) : user;
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
      email: profile.email ?? null,
      deactivatedAt: null,
      deleteAfter: null
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
    const rows = await this.pool.query(
      `SELECT id, display_name AS displayName, avatar_url AS avatarUrl, email,
        deactivated_at AS deactivatedAt, delete_after AS deleteAfter
       FROM users WHERE id = ? LIMIT 1`,
      [user.id]
    );
    return rows[0] ? authUserFromRow(rows[0]) : user;
  }

  async updateProfile(userId: string, profile: { displayName: string; avatarUrl?: string | null }): Promise<AuthUser> {
    if (profile.avatarUrl) {
      await this.pool.query("UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?", [profile.displayName, profile.avatarUrl, userId]);
    } else {
      await this.pool.query("UPDATE users SET display_name = ? WHERE id = ?", [profile.displayName, userId]);
    }
    const rows = await this.pool.query(
      `SELECT id, display_name AS displayName, avatar_url AS avatarUrl, email,
        deactivated_at AS deactivatedAt, delete_after AS deleteAfter
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (!rows[0]) {
      throw new Error("User not found.");
    }
    return authUserFromRow(rows[0]);
  }

  async deactivateUser(userId: string, deactivatedAt: Date, deleteAfter: Date): Promise<AuthUser> {
    await this.pool.query("UPDATE users SET deactivated_at = ?, delete_after = ? WHERE id = ?", [deactivatedAt, deleteAfter, userId]);
    const rows = await this.pool.query(
      `SELECT id, display_name AS displayName, avatar_url AS avatarUrl, email,
        deactivated_at AS deactivatedAt, delete_after AS deleteAfter
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (!rows[0]) {
      throw new Error("User not found.");
    }
    return authUserFromRow(rows[0]);
  }

  async cancelDeletion(userId: string): Promise<AuthUser> {
    await this.pool.query("UPDATE users SET deactivated_at = NULL, delete_after = NULL WHERE id = ?", [userId]);
    const rows = await this.pool.query(
      `SELECT id, display_name AS displayName, avatar_url AS avatarUrl, email,
        deactivated_at AS deactivatedAt, delete_after AS deleteAfter
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (!rows[0]) {
      throw new Error("User not found.");
    }
    return authUserFromRow(rows[0]);
  }

  async purgeExpiredDeactivatedUsers(now: Date): Promise<string[]> {
    const rows = await this.pool.query("SELECT id, avatar_url AS avatarUrl FROM users WHERE delete_after IS NOT NULL AND delete_after <= ?", [now]);
    const users = rows.map((row: Record<string, unknown>) => ({ id: String(row.id), avatarUrl: safeNullableString(row.avatarUrl, 512) }));
    if (!users.length) {
      return [];
    }
    const ids = users.map((user: { id: string }) => user.id);
    const placeholders = ids.map(() => "?").join(",");
    await this.pool.query(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`, ids);
    await this.pool.query(`DELETE FROM oauth_accounts WHERE user_id IN (${placeholders})`, ids);
    await this.pool.query(`DELETE FROM ranked_queue WHERE player_id IN (${placeholders})`, ids).catch(() => undefined);
    await this.pool.query(
      `UPDATE users
       SET display_name = CONCAT('Deleted profile ', LEFT(id, 8)),
         avatar_url = NULL,
         email = NULL,
         deactivated_at = NULL,
         delete_after = NULL
       WHERE id IN (${placeholders})`,
      ids
    );
    return users.map((user: { avatarUrl: string | null }) => user.avatarUrl).filter((avatarUrl: string | null): avatarUrl is string => Boolean(avatarUrl));
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
