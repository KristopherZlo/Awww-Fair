import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { sessionTokenHash, type AuthStore, type AuthUser } from "./auth";
import { createRankedHandler } from "./ranked-handler";
import { MemoryRankedStore, RankedService } from "./ranked";
import { applyRankedReplayEvent, type RankedReplayEvent, type RankedReplayPlayerMap } from "../src/game/rankedReplay";

async function startTestServer(handler: ReturnType<typeof createRankedHandler>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function authStore(user: AuthUser): AuthStore {
  return {
    async findUserBySessionHash(tokenHash) {
      return tokenHash === sessionTokenHash("token") ? user : null;
    },
    async createDevUser() {
      return user;
    },
    async upsertOAuthUser() {
      return user;
    },
    async createSession() {},
    async deleteSession() {}
  };
}

function replayEventsFor(match: { initialState: ReturnType<typeof import("../src/game/session").buildInitialState>; playerAId: string; playerBId: string }) {
  const events: Array<RankedReplayEvent & { round: number; phase: string }> = [];
  const playerMap: RankedReplayPlayerMap = { playerAId: match.playerAId, playerBId: match.playerBId };
  let state = match.initialState;
  while (state.phase !== "game_end") {
    const actorSeat = state.phase === "upgrade" ? state.upgradeQueue[0] : state.activePlayer;
    const event = {
      actorId: actorSeat === "A" ? match.playerAId : match.playerBId,
      eventType: state.phase === "upgrade" ? "skip_upgrade" : "ready",
      payload: {},
      round: state.round,
      phase: state.phase
    };
    events.push(event);
    state = applyRankedReplayEvent(state, event, playerMap);
  }
  return events;
}

describe("ranked handler", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("rejects unauthenticated ranked queue access", async () => {
    const service = new RankedService({ store: new MemoryRankedStore() });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/queue`, { method: "POST" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Login is required for ranked." });
  });

  it("serves leaderboard without requiring login", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1600, rankedGames: 2, wins: 2, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 1, wins: 0, losses: 1, lastRankedAt: null }
    ]);
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service: new RankedService({ store }) }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/leaderboard`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      leaderboard: [
        { playerId: "a", displayName: "a", avatarUrl: null, mmr: 1600, rankedGames: 2, wins: 2, losses: 0 },
        { playerId: "b", displayName: "b", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 0, losses: 1 }
      ]
    });
  });

  it("queues an authenticated player and exposes queue status", async () => {
    const store = new MemoryRankedStore([{ playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }]);
    const service = new RankedService({ store, now: () => 1_000 });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const queued = await fetch(`${server.url}/api/ranked/queue`, { method: "POST", headers: { Cookie: "tm_session=token" } });
    const status = await fetch(`${server.url}/api/ranked/status`, { headers: { Cookie: "tm_session=token" } });

    expect(await queued.json()).toEqual({ status: "waiting" });
    expect(await status.json()).toEqual({ status: "waiting" });
  });

  it("returns the authenticated player rating", async () => {
    const store = new MemoryRankedStore([{ playerId: "a", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null }]);
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service: new RankedService({ store }) }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/rating`, { headers: { Cookie: "tm_session=token" } });

    expect(await response.json()).toEqual({ rating: { playerId: "a", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null } });
  });

  it("returns authenticated player match history", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");
    await service.settleMatch("a", { matchId: "match-1", playerACoins: 10, playerBCoins: 5, playerASales: 4, playerBSales: 2 });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/history`, { headers: { Cookie: "tm_session=token" } });
    const payload = await response.json();

    expect(payload.history[0]).toMatchObject({ matchId: "match-1", winnerId: "a", loserId: "b", mmrChange: 26 });
  });

  it("records ranked events and settles the current match", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");
    for (const replayEvent of replayEventsFor(matched.match)) {
      await service.recordEvent(replayEvent.actorId, {
        matchId: "match-1",
        round: replayEvent.round,
        phase: replayEvent.phase,
        eventType: replayEvent.eventType,
        payload: replayEvent.payload
      });
    }
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const settlement = await fetch(`${server.url}/api/ranked/settle`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1", playerACoins: 0, playerBCoins: 0, playerASales: 0, playerBSales: 0 })
    });

    expect(await settlement.json()).toMatchObject({ log: { winnerId: null, mmrChange: 0 } });
  });

  it("disconnects and reconnects an authenticated match participant", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const disconnect = await fetch(`${server.url}/api/ranked/disconnect`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1" })
    });
    const reconnect = await fetch(`${server.url}/api/ranked/reconnect`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1" })
    });

    expect(await disconnect.json()).toEqual({ status: "reconnect_window", reconnectUntil: 91_000 });
    expect(await reconnect.json()).toMatchObject({ status: "matched", match: { id: "match-1", status: "active" } });
  });

  it("returns a cooldown error when ranked queue is locked", async () => {
    let now = 1_000;
    let matchIndex = 0;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({
      store,
      now: () => now,
      idFactory: () => `match-${++matchIndex}`,
      seedFactory: () => `seed-${matchIndex}`
    });
    for (let leave = 0; leave < 2; leave += 1) {
      await service.joinQueue("a");
      await service.joinQueue("b");
      await service.disconnectFromMatch("a", `match-${leave + 1}`);
      now += 91_000;
      await service.statusForPlayer("b");
    }
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/queue`, { method: "POST", headers: { Cookie: "tm_session=token" } });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Ranked cooldown is active." });
  });

  it("returns a replay mismatch error when submitted ranked result is invalid", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");
    for (const event of replayEventsFor(matched.match)) {
      await service.recordEvent(event.actorId, { matchId: "match-1", round: event.round, phase: event.phase, eventType: event.eventType, payload: event.payload });
    }
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/settle`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1", playerACoins: 3, playerBCoins: 0, playerASales: 1, playerBSales: 0 })
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Ranked replay result mismatch." });
  });
});
