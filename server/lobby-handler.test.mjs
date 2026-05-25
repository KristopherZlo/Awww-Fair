import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLobbyHandler } from "./lobby-handler.mjs";

const state = { phase: "planning", round: 1, players: [] };
const secureLobbyOptions = {
  initialStateFactory: () => state,
  applyEvent: (current, event) => ({ ...current, lastEvent: event })
};

async function startTestServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function readJson(response) {
  return response.json();
}

async function rawGet(baseUrl, requestPath) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        method: "GET",
        path: requestPath
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode, body, headers: response.headers }));
      }
    );
    request.on("error", reject);
    request.end();
  });
}

function deterministicIds() {
  const codes = ["AAAAA", "BBBBB", "CCCCC"];
  let tokenIndex = 0;

  return {
    codeFactory: () => codes.shift() ?? "DDDDD",
    tokenFactory: () => `token-${tokenIndex++}`
  };
}

describe("lobby handler hardening", () => {
  const cleanups = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("rejects oversized lobby bodies before parsing JSON", async () => {
    const server = await startTestServer(createLobbyHandler({ maxBodyBytes: 20, ...deterministicIds() }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/lobbies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, filler: "x".repeat(64) })
    });

    expect(response.status).toBe(413);
    expect(await readJson(response)).toEqual({ error: "Request body too large." });
  });

  it("returns a client error for malformed JSON instead of leaking a server exception", async () => {
    const server = await startTestServer(createLobbyHandler({ ...deterministicIds() }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/lobbies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json"
    });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ error: "Malformed JSON." });
  });

  it("generates high-entropy lobby codes by default", async () => {
    const server = await startTestServer(createLobbyHandler({ initialStateFactory: () => state }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/lobbies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const payload = await readJson(response);

    expect(response.status).toBe(201);
    expect(payload.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("rate limits repeated joins for missing lobby codes", async () => {
    let now = 5_000;
    const server = await startTestServer(
      createLobbyHandler({
        ...secureLobbyOptions,
        maxJoinAttempts: 2,
        joinAttemptWindowMs: 1_000,
        now: () => now
      })
    );
    cleanups.push(server.close);

    const first = await fetch(`${server.url}/api/lobbies/ZZZZZZZZ/join`, { method: "POST" });
    now += 1;
    const second = await fetch(`${server.url}/api/lobbies/ZZZZZZZZ/join`, { method: "POST" });
    now += 1;
    const third = await fetch(`${server.url}/api/lobbies/ZZZZZZZZ/join`, { method: "POST" });

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(third.status).toBe(429);
    expect(await readJson(third)).toEqual({ error: "Too many lobby join attempts." });
  });

  it("allows configured CORS origins and rejects unconfigured origins", async () => {
    const server = await startTestServer(createLobbyHandler({ env: { ALLOWED_ORIGINS: "https://good.example" }, ...deterministicIds() }));
    cleanups.push(server.close);

    const allowed = await fetch(`${server.url}/api/lobbies`, {
      method: "OPTIONS",
      headers: { Origin: "https://good.example" }
    });
    const rejected = await fetch(`${server.url}/api/lobbies`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" }
    });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://good.example");
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("accepts bearer lobby tokens while keeping query-token compatibility", async () => {
    const server = await startTestServer(createLobbyHandler({ ...secureLobbyOptions, ...deterministicIds() }));
    cleanups.push(server.close);

    const created = await readJson(
      await fetch(`${server.url}/api/lobbies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state })
      })
    );

    const bearer = await fetch(`${server.url}/api/lobbies/${created.code}`, {
      headers: { Authorization: `Bearer ${created.token}` }
    });
    const query = await fetch(`${server.url}/api/lobbies/${created.code}?token=${created.token}`);

    expect(bearer.status).toBe(200);
    expect(query.status).toBe(200);
  });

  it("expires inactive seats without removing seats that were recently touched", async () => {
    let now = 1_000;
    const server = await startTestServer(createLobbyHandler({ ...secureLobbyOptions, now: () => now, seatTimeoutMs: 10, ...deterministicIds() }));
    cleanups.push(server.close);

    const created = await readJson(
      await fetch(`${server.url}/api/lobbies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state })
      })
    );
    now = 1_001;
    const joined = await readJson(await fetch(`${server.url}/api/lobbies/${created.code}/join`, { method: "POST" }));
    now = 1_005;
    await fetch(`${server.url}/api/lobbies/${created.code}`, { headers: { Authorization: `Bearer ${created.token}` } });

    now = 1_013;
    const response = await fetch(`${server.url}/api/lobbies/${created.code}`, { headers: { Authorization: `Bearer ${created.token}` } });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(joined.playerId).toBe("B");
    expect(payload.seats).toEqual({ A: true, B: false });
  });

  it("removes expired rooms before enforcing the maximum room count", async () => {
    let now = 2_000;
    const server = await startTestServer(createLobbyHandler({ ...secureLobbyOptions, now: () => now, roomTtlMs: 5, maxRooms: 1, ...deterministicIds() }));
    cleanups.push(server.close);

    const first = await readJson(
      await fetch(`${server.url}/api/lobbies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state })
      })
    );
    now = 2_006;
    const second = await fetch(`${server.url}/api/lobbies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    });
    const expired = await fetch(`${server.url}/api/lobbies/${first.code}`, {
      headers: { Authorization: `Bearer ${first.token}` }
    });

    expect(second.status).toBe(201);
    expect(expired.status).toBe(404);
  });

  it("blocks decoded static path traversal outside the dist directory", async () => {
    const distDir = await mkdtemp(path.join(os.tmpdir(), "trend-market-dist-"));
    cleanups.push(() => rm(distDir, { recursive: true, force: true }));
    await mkdir(path.join(distDir, "assets"));
    await writeFile(path.join(distDir, "index.html"), "<main>game</main>");

    const server = await startTestServer(createLobbyHandler({ distDir, ...deterministicIds() }));
    cleanups.push(server.close);

    const response = await rawGet(server.url, "/%2e%2e%2fpackage.json");

    expect(response.status).toBe(403);
    expect(response.body).toBe("Forbidden");
  });

  it("adds defensive headers to static responses", async () => {
    const distDir = await mkdtemp(path.join(os.tmpdir(), "trend-market-dist-"));
    cleanups.push(() => rm(distDir, { recursive: true, force: true }));
    await writeFile(path.join(distDir, "index.html"), "<main>game</main>");

    const server = await startTestServer(createLobbyHandler({ distDir, ...deterministicIds() }));
    cleanups.push(server.close);

    const response = await rawGet(server.url, "/");

    expect(response.status).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("rejects direct lobby state replacement when server-side rules are configured", async () => {
    const server = await startTestServer(createLobbyHandler({ ...secureLobbyOptions, ...deterministicIds() }));
    cleanups.push(server.close);
    const created = await readJson(
      await fetch(`${server.url}/api/lobbies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: { phase: "game_end", players: [{ id: "A", money: 999 }] } })
      })
    );
    const joined = await readJson(await fetch(`${server.url}/api/lobbies/${created.code}/join`, { method: "POST" }));

    const forged = await fetch(`${server.url}/api/lobbies/${created.code}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${joined.token}` },
      body: JSON.stringify({ playerId: joined.playerId, state: { phase: "game_end", injected: true } })
    });
    const viewed = await readJson(await fetch(`${server.url}/api/lobbies/${created.code}`, { headers: { Authorization: `Bearer ${created.token}` } }));

    expect(forged.status).toBe(403);
    expect(await readJson(forged)).toEqual({ error: "Direct lobby state updates are disabled." });
    expect(viewed.state).toEqual(state);
  });

  it("accepts lobby events and applies them through the server reducer", async () => {
    const server = await startTestServer(createLobbyHandler({ ...secureLobbyOptions, ...deterministicIds() }));
    cleanups.push(server.close);
    const created = await readJson(
      await fetch(`${server.url}/api/lobbies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
    );

    const response = await fetch(`${server.url}/api/lobbies/${created.code}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ playerId: "A", eventType: "ready", payload: {} })
    });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.version).toBe(2);
    expect(payload.state).toEqual({ ...state, lastEvent: { actorId: "A", eventType: "ready", payload: {} } });
  });

  it("applies lobby restart as a server-created state instead of a client state replacement", async () => {
    const restartedState = { phase: "planning", round: 1, restarted: true };
    const server = await startTestServer(
      createLobbyHandler({
        ...secureLobbyOptions,
        initialStateFactory: (body) => (body?.eventType === "restart" ? restartedState : state),
        ...deterministicIds()
      })
    );
    cleanups.push(server.close);
    const created = await readJson(
      await fetch(`${server.url}/api/lobbies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
    );

    const response = await fetch(`${server.url}/api/lobbies/${created.code}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ playerId: "A", eventType: "restart", state: { phase: "game_end", injected: true } })
    });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.state).toEqual(restartedState);
  });
});
