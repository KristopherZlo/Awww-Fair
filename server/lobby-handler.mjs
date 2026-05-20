import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { advertisedUrls } from "./listen-config.mjs";
import { lanUrls } from "./network-info.mjs";

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_MAX_ROOMS = 100;
const DEFAULT_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_SEAT_TIMEOUT_MS = 7000;
const ROOM_SEATS = ["A", "B"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsForRequest(request, env) {
  const origin = request.headers.origin;
  if (!origin) {
    return { allowed: true, headers: {} };
  }

  const allowed = allowedOrigins(env);
  const allOriginsAllowed = allowed.includes("*");
  if (!allOriginsAllowed && !allowed.includes(origin)) {
    return { allowed: false, headers: {} };
  }

  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Origin": allOriginsAllowed ? "*" : origin,
      Vary: "Origin"
    }
  };
}

function json(response, request, env, status, body) {
  const cors = corsForRequest(request, env);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...cors.headers
  });
  response.end(JSON.stringify(body));
}

function roomView(room, seat) {
  return {
    code: room.code,
    playerId: seat,
    token: seat ? room.seats[seat]?.token : undefined,
    version: room.version,
    state: room.state,
    seats: {
      A: Boolean(room.seats.A),
      B: Boolean(room.seats.B)
    }
  };
}

function touchSeat(room, seat, now) {
  if (seat && room.seats[seat]) {
    room.seats[seat].lastSeenAt = now;
    room.updatedAt = now;
  }
}

function expireInactiveSeats(room, now, seatTimeoutMs) {
  if (!Number.isFinite(seatTimeoutMs) || seatTimeoutMs <= 0) {
    return;
  }

  let changed = false;
  for (const seat of ROOM_SEATS) {
    const info = room.seats[seat];
    if (info && now - (info.lastSeenAt ?? info.joinedAt ?? room.updatedAt) > seatTimeoutMs) {
      room.seats[seat] = null;
      changed = true;
    }
  }

  if (changed) {
    room.version += 1;
    room.updatedAt = now;
  }
}

function cleanupExpiredRooms(rooms, now, roomTtlMs) {
  if (!Number.isFinite(roomTtlMs) || roomTtlMs <= 0) {
    return;
  }

  for (const [code, room] of rooms) {
    if (now - room.updatedAt > roomTtlMs) {
      rooms.delete(code);
    }
  }
}

function defaultTokenFactory() {
  return crypto.randomBytes(12).toString("hex");
}

function defaultCodeFactory() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function readBody(request, maxBodyBytes) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new HttpError(413, "Request body too large.");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Malformed JSON.");
  }
}

function tokenFromAuthorization(request) {
  const header = request.headers.authorization;
  const match = typeof header === "string" ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match?.[1]?.trim() || null;
}

function findSeat(room, candidateToken) {
  if (!candidateToken) {
    return null;
  }
  if (room.seats.A?.token === candidateToken) {
    return "A";
  }
  if (room.seats.B?.token === candidateToken) {
    return "B";
  }
  return null;
}

function staticContentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}

function resolveStaticPath(distDir, requestPathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPathname);
  } catch {
    throw new HttpError(400, "Bad path.");
  }

  const root = path.resolve(distDir);
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new HttpError(403, "Forbidden");
  }
  return resolved;
}

async function serveStatic(request, response, distDir) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);

  try {
    const resolved = resolveStaticPath(distDir, requestUrl.pathname);
    const info = await stat(resolved);
    const filePath = info.isDirectory() ? path.join(resolved, "index.html") : resolved;
    response.writeHead(200, { "Content-Type": staticContentType(filePath) });
    response.end(await readFile(filePath));
  } catch (error) {
    if (error instanceof HttpError) {
      response.writeHead(error.status);
      response.end(error.message);
      return;
    }

    try {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(path.join(distDir, "index.html")));
    } catch {
      response.writeHead(404);
      response.end("Run npm run build before serving production assets.");
    }
  }
}

function nextRoomCode(rooms, codeFactory) {
  for (let attempts = 0; attempts < 1000; attempts += 1) {
    const code = codeFactory();
    if (!rooms.has(code)) {
      return code;
    }
  }
  throw new HttpError(503, "Could not allocate a lobby code.");
}

function rejectDisallowedCors(request, response, env) {
  if (corsForRequest(request, env).allowed) {
    return false;
  }
  response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Origin is not allowed." }));
  return true;
}

export function createLobbyHandler(options = {}) {
  const env = options.env ?? process.env;
  const distDir = options.distDir ?? path.resolve("dist");
  const publicPort = finiteNumber(options.publicPort ?? env.PUBLIC_PORT ?? env.PORT, 5176);
  const seatTimeoutMs = finiteNumber(options.seatTimeoutMs ?? env.LOBBY_SEAT_TIMEOUT_MS, DEFAULT_SEAT_TIMEOUT_MS);
  const maxBodyBytes = finiteNumber(options.maxBodyBytes ?? env.LOBBY_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
  const maxRooms = finiteNumber(options.maxRooms ?? env.LOBBY_MAX_ROOMS, DEFAULT_MAX_ROOMS);
  const roomTtlMs = finiteNumber(options.roomTtlMs ?? env.LOBBY_ROOM_TTL_MS, DEFAULT_ROOM_TTL_MS);
  const rooms = options.rooms ?? new Map();
  const now = options.now ?? (() => Date.now());
  const codeFactory = options.codeFactory ?? defaultCodeFactory;
  const tokenFactory = options.tokenFactory ?? defaultTokenFactory;

  return async function lobbyHandler(request, response) {
    if (request.method === "OPTIONS") {
      if (rejectDisallowedCors(request, response, env)) {
        return;
      }
      json(response, request, env, 204, {});
      return;
    }

    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const parts = requestUrl.pathname.split("/").filter(Boolean);
    const isApiRoute = parts[0] === "api";

    if (isApiRoute && rejectDisallowedCors(request, response, env)) {
      return;
    }

    if (request.method === "GET" && parts[0] === "api" && parts[1] === "network") {
      json(response, request, env, 200, {
        port: publicPort,
        urls: advertisedUrls(env, lanUrls(publicPort))
      });
      return;
    }

    if (parts[0] !== "api" || parts[1] !== "lobbies") {
      await serveStatic(request, response, distDir);
      return;
    }

    try {
      cleanupExpiredRooms(rooms, now(), roomTtlMs);

      if (request.method === "POST" && parts.length === 2) {
        if (rooms.size >= maxRooms) {
          throw new HttpError(503, "Lobby capacity reached.");
        }

        const body = await readBody(request, maxBodyBytes);
        if (!body.state) {
          throw new HttpError(400, "Initial game state is required.");
        }

        const code = nextRoomCode(rooms, codeFactory);
        const timestamp = now();
        const room = {
          code,
          version: 1,
          state: body.state,
          seats: {
            A: { token: tokenFactory(), joinedAt: timestamp, lastSeenAt: timestamp },
            B: null
          },
          updatedAt: timestamp
        };
        rooms.set(code, room);
        json(response, request, env, 201, roomView(room, "A"));
        return;
      }

      const code = parts[2]?.toUpperCase();
      const room = code ? rooms.get(code) : null;
      if (!room) {
        throw new HttpError(404, "Lobby not found.");
      }
      expireInactiveSeats(room, now(), seatTimeoutMs);

      if (request.method === "POST" && parts[3] === "join") {
        const openSeat = !room.seats.A ? "A" : !room.seats.B ? "B" : null;
        if (!openSeat) {
          throw new HttpError(409, "Lobby already has two players.");
        }
        const timestamp = now();
        room.seats[openSeat] = { token: tokenFactory(), joinedAt: timestamp, lastSeenAt: timestamp };
        room.version += 1;
        room.updatedAt = timestamp;
        json(response, request, env, 200, roomView(room, openSeat));
        return;
      }

      if (request.method === "GET" && parts.length === 3) {
        const seat = findSeat(room, tokenFromAuthorization(request) ?? requestUrl.searchParams.get("token"));
        if (!seat) {
          throw new HttpError(401, "Invalid lobby token.");
        }
        touchSeat(room, seat, now());
        json(response, request, env, 200, roomView(room, seat));
        return;
      }

      if (request.method === "POST" && parts[3] === "leave") {
        const body = await readBody(request, maxBodyBytes);
        const seat = findSeat(room, tokenFromAuthorization(request) ?? body.token);
        if (!seat || seat !== body.playerId) {
          throw new HttpError(401, "Invalid lobby token.");
        }
        room.seats[seat] = null;
        room.version += 1;
        room.updatedAt = now();
        json(response, request, env, 200, roomView(room, null));
        return;
      }

      if (request.method === "PUT" && parts[3] === "state") {
        const body = await readBody(request, maxBodyBytes);
        const seat = findSeat(room, tokenFromAuthorization(request) ?? body.token);
        if (!seat || seat !== body.playerId) {
          throw new HttpError(401, "Invalid lobby token.");
        }
        if (!body.state) {
          throw new HttpError(400, "Game state is required.");
        }
        touchSeat(room, seat, now());
        room.state = body.state;
        room.version += 1;
        room.updatedAt = now();
        json(response, request, env, 200, roomView(room, seat));
        return;
      }

      throw new HttpError(404, "Unknown lobby route.");
    } catch (error) {
      if (error instanceof HttpError) {
        json(response, request, env, error.status, { error: error.message });
        return;
      }
      json(response, request, env, 500, { error: "Lobby server error." });
    }
  };
}

export function createLobbyServer(options = {}) {
  return createServer(createLobbyHandler(options));
}
