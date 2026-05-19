import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { lanUrls } from "./network-info.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT ?? 5176);
const publicPort = Number(process.env.PUBLIC_PORT ?? port);
const seatTimeoutMs = Number(process.env.LOBBY_SEAT_TIMEOUT_MS ?? 7000);
const rooms = new Map();

const json = (response, status, body) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(body));
};

const roomView = (room, seat) => ({
  code: room.code,
  playerId: seat,
  token: seat ? room.seats[seat]?.token : undefined,
  version: room.version,
  state: room.state,
  seats: {
    A: Boolean(room.seats.A),
    B: Boolean(room.seats.B)
  }
});

const touchSeat = (room, seat) => {
  if (seat && room.seats[seat]) {
    room.seats[seat].lastSeenAt = Date.now();
  }
};

const expireInactiveSeats = (room) => {
  if (!Number.isFinite(seatTimeoutMs) || seatTimeoutMs <= 0) {
    return;
  }

  const now = Date.now();
  let changed = false;
  for (const seat of ["A", "B"]) {
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
};

const token = () => crypto.randomBytes(12).toString("hex");

const makeCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

function findSeat(room, candidateToken) {
  if (room.seats.A?.token === candidateToken) {
    return "A";
  }
  if (room.seats.B?.token === candidateToken) {
    return "B";
  }
  return null;
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const targetPath = pathname === "/" ? path.join(distDir, "index.html") : path.join(distDir, pathname);
  const normalized = path.normalize(targetPath);

  if (!normalized.startsWith(distDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(normalized);
    const filePath = info.isDirectory() ? path.join(normalized, "index.html") : normalized;
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    const type =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "text/javascript; charset=utf-8"
            : ext === ".png"
              ? "image/png"
              : "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(data);
  } catch {
    try {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(path.join(distDir, "index.html")));
    } catch {
      response.writeHead(404);
      response.end("Run npm run build before serving production assets.");
    }
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const parts = requestUrl.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && parts[0] === "api" && parts[1] === "network") {
    json(response, 200, {
      port: publicPort,
      urls: lanUrls(publicPort)
    });
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "lobbies") {
    await serveStatic(request, response);
    return;
  }

  try {
    if (request.method === "POST" && parts.length === 2) {
      const body = await readBody(request);
      if (!body.state) {
        json(response, 400, { error: "Initial game state is required." });
        return;
      }

      let code = makeCode();
      while (rooms.has(code)) {
        code = makeCode();
      }

      const room = {
        code,
        version: 1,
        state: body.state,
        seats: {
          A: { token: token(), joinedAt: Date.now(), lastSeenAt: Date.now() },
          B: null
        },
        updatedAt: Date.now()
      };
      rooms.set(code, room);
      json(response, 201, roomView(room, "A"));
      return;
    }

    const code = parts[2]?.toUpperCase();
    const room = code ? rooms.get(code) : null;
    if (!room) {
      json(response, 404, { error: "Lobby not found." });
      return;
    }
    expireInactiveSeats(room);

    if (request.method === "POST" && parts[3] === "join") {
      const openSeat = !room.seats.A ? "A" : !room.seats.B ? "B" : null;
      if (!openSeat) {
        json(response, 409, { error: "Lobby already has two players." });
        return;
      }
      room.seats[openSeat] = { token: token(), joinedAt: Date.now(), lastSeenAt: Date.now() };
      room.version += 1;
      room.updatedAt = Date.now();
      json(response, 200, roomView(room, openSeat));
      return;
    }

    if (request.method === "GET" && parts.length === 3) {
      const seat = findSeat(room, requestUrl.searchParams.get("token"));
      if (!seat) {
        json(response, 401, { error: "Invalid lobby token." });
        return;
      }
      touchSeat(room, seat);
      json(response, 200, roomView(room, seat));
      return;
    }

    if (request.method === "POST" && parts[3] === "leave") {
      const body = await readBody(request);
      const seat = findSeat(room, body.token);
      if (!seat || seat !== body.playerId) {
        json(response, 401, { error: "Invalid lobby token." });
        return;
      }
      room.seats[seat] = null;
      room.version += 1;
      room.updatedAt = Date.now();
      json(response, 200, roomView(room, null));
      return;
    }

    if (request.method === "PUT" && parts[3] === "state") {
      const body = await readBody(request);
      const seat = findSeat(room, body.token);
      if (!seat || seat !== body.playerId) {
        json(response, 401, { error: "Invalid lobby token." });
        return;
      }
      if (!body.state) {
        json(response, 400, { error: "Game state is required." });
        return;
      }
      touchSeat(room, seat);
      room.state = body.state;
      room.version += 1;
      room.updatedAt = Date.now();
      json(response, 200, roomView(room, seat));
      return;
    }

    json(response, 404, { error: "Unknown lobby route." });
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : "Lobby server error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  const urls = lanUrls(publicPort);
  console.log(`Trend Market app: http://127.0.0.1:${publicPort}`);
  urls.forEach((url) => console.log(`Trend Market LAN: ${url}`));
  if (publicPort !== port) {
    console.log(`Trend Market lobby API: http://127.0.0.1:${port}`);
  }
});
