import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAppHandler } from "./app-handler";
import { sessionTokenHash, type AuthStore } from "./auth";
import { MemoryRankedStore, RankedService } from "./ranked";

async function startTestServer(handler: ReturnType<typeof createAppHandler>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function store(): AuthStore {
  return {
    async findUserBySessionHash() {
      return null;
    },
    async createDevUser() {
      return { id: "dev", displayName: "Dev", avatarUrl: null, email: null };
    },
    async upsertOAuthUser() {
      return { id: "oauth", displayName: "OAuth", avatarUrl: null, email: null };
    },
    async createSession() {},
    async deleteSession() {}
  };
}

describe("app handler", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("routes auth API requests before falling back to the lobby handler", async () => {
    let fallbackCalled = false;
    const server = await startTestServer(
      createAppHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        authStore: store(),
        rankedService: new RankedService({ store: new MemoryRankedStore() }),
        tokenFactory: () => "token",
        fallbackHandler: (_request: IncomingMessage, response: ServerResponse) => {
          fallbackCalled = true;
          response.writeHead(204);
          response.end();
        }
      })
    );
    cleanups.push(server.close);

    const auth = await fetch(`${server.url}/api/auth/dev-login`, { method: "POST", body: JSON.stringify({ displayName: "Dev" }) });
    const lobby = await fetch(`${server.url}/api/lobbies`);

    expect(auth.status).toBe(200);
    expect(fallbackCalled).toBe(true);
    expect(lobby.status).toBe(204);
  });

  it("routes ranked API requests before falling back to the lobby handler", async () => {
    const rankedAuthStore: AuthStore = {
      ...store(),
      async findUserBySessionHash(tokenHash) {
        return tokenHash === sessionTokenHash("token") ? { id: "dev", displayName: "Dev", avatarUrl: null, email: null } : null;
      }
    };
    const server = await startTestServer(
      createAppHandler({
        authStore: rankedAuthStore,
        rankedService: new RankedService({
          store: new MemoryRankedStore([{ playerId: "dev", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }]),
          now: () => 1_000
        }),
        fallbackHandler: (_request: IncomingMessage, response: ServerResponse) => {
          response.writeHead(204);
          response.end();
        }
      })
    );
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/queue`, { method: "POST", headers: { Cookie: "tm_session=token" } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "waiting" });
  });

  it("supports dev login and ranked rating without MariaDB in memory dev mode", async () => {
    const server = await startTestServer(
      createAppHandler({
        env: { AUTH_DEV_LOGIN: "true", DEV_MEMORY_STORE: "true" },
        tokenFactory: () => "token"
      })
    );
    cleanups.push(server.close);

    const auth = await fetch(`${server.url}/api/auth/dev-login`, { method: "POST", body: JSON.stringify({ displayName: "Dev" }) });
    const cookie = auth.headers.get("set-cookie") ?? "";
    const rating = await fetch(`${server.url}/api/ranked/rating`, { headers: { Cookie: cookie } });

    expect(auth.status).toBe(200);
    expect(await auth.json()).toEqual({ user: { id: expect.any(String), displayName: "Dev", avatarUrl: null, email: null } });
    expect(rating.status).toBe(200);
    expect(await rating.json()).toMatchObject({
      rating: {
        playerId: expect.any(String),
        mmr: null,
        rankedGames: 0,
        wins: 0,
        losses: 0,
        lastRankedAt: null,
        isCalibrating: true,
        calibrationGamesRemaining: 5
      }
    });
  });

  it("seeds the player dev account with ranked history and leaderboard data in memory dev mode", async () => {
    const server = await startTestServer(
      createAppHandler({
        env: { AUTH_DEV_LOGIN: "true", DEV_MEMORY_STORE: "true" },
        tokenFactory: () => "player-token"
      })
    );
    cleanups.push(server.close);

    const auth = await fetch(`${server.url}/api/auth/dev-login`, { method: "POST", body: JSON.stringify({ displayName: "player" }) });
    const cookie = auth.headers.get("set-cookie") ?? "";
    const rating = await fetch(`${server.url}/api/ranked/rating`, { headers: { Cookie: cookie } });
    const history = await fetch(`${server.url}/api/ranked/history`, { headers: { Cookie: cookie } });
    const leaderboard = await fetch(`${server.url}/api/ranked/leaderboard?page=1&pageSize=10`);
    const playerSearch = await fetch(`${server.url}/api/ranked/leaderboard?page=1&pageSize=10&search=player`);

    expect(await auth.json()).toEqual({ user: { id: "dev-player", displayName: "player", avatarUrl: null, email: null } });
    expect(await rating.json()).toMatchObject({ rating: { playerId: "dev-player", mmr: 1548, rankedGames: 5, wins: 3, losses: 2 } });
    expect(await history.json()).toMatchObject({
      history: [
        { matchId: "seed-player-match-3", playerAId: "dev-player", playerBDisplayName: "Nova", winnerId: "dev-player" },
        { matchId: "seed-player-match-2", playerAId: "seed-mira", playerADisplayName: "Mira", playerBId: "dev-player", winnerId: "seed-mira" },
        { matchId: "seed-player-match-1", playerAId: "dev-player", playerBDisplayName: "Riley", winnerId: "dev-player" }
      ]
    });
    expect(await leaderboard.json()).toMatchObject({
      total: 5,
      leaderboard: [
        { playerId: "seed-mira", displayName: "Mira", mmr: 1630 },
        { playerId: "seed-nova", displayName: "Nova", mmr: 1586 },
        { playerId: "dev-player", displayName: "player", mmr: 1548 },
        { playerId: "seed-riley", displayName: "Riley", mmr: 1492 },
        { playerId: "seed-kai", displayName: "Kai", mmr: 1410 }
      ]
    });
    expect(await playerSearch.json()).toMatchObject({
      total: 1,
      leaderboard: [{ playerId: "dev-player", displayName: "player", mmr: 1548 }]
    });
  });
});
