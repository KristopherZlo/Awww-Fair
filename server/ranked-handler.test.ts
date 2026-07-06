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

type RankedAuthUserInput = Pick<AuthUser, "id" | "displayName" | "avatarUrl" | "email"> &
  Partial<Pick<AuthUser, "avatarShape" | "twoFactorEnabled" | "deactivatedAt" | "deleteAfter">>;

function authStore(user: RankedAuthUserInput): AuthStore {
  const normalizedUser: AuthUser = {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    avatarShape: user.avatarShape ?? "circle",
    email: user.email,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    deactivatedAt: user.deactivatedAt ?? null,
    deleteAfter: user.deleteAfter ?? null
  };
  return {
    async findUserBySessionHash(tokenHash) {
      return tokenHash === sessionTokenHash("token") ? normalizedUser : null;
    },
    async createDevUser() {
      return normalizedUser;
    },
    async upsertOAuthUser() {
      return normalizedUser;
    },
    async updateProfile() {
      return normalizedUser;
    },
    async deactivateUser() {
      return { ...normalizedUser, deactivatedAt: "2026-05-22T00:00:00.000Z", deleteAfter: "2026-06-05T00:00:00.000Z" };
    },
    async cancelDeletion() {
      return { ...normalizedUser, deactivatedAt: null, deleteAfter: null };
    },
    async purgeExpiredDeactivatedUsers() {
      return [];
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
      { playerId: "a", displayName: "Alice", mmr: 1600, rankedGames: 6, wins: 4, losses: 2, lastRankedAt: null, calibrationGames: 5, ratingGames: 6 },
      { playerId: "b", displayName: "Boris", mmr: 1500, rankedGames: 5, wins: 2, losses: 3, lastRankedAt: null, calibrationGames: 5, ratingGames: 5 },
      { playerId: "c", displayName: "Carla", mmr: 1700, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null, calibrationGames: 2, ratingGames: 2 }
    ]);
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service: new RankedService({ store }) }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/leaderboard?page=1&pageSize=1&search=bo`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      leaderboard: [{ playerId: "b", displayName: "Boris", avatarUrl: null, mmr: 1500, rankedGames: 5, wins: 2, losses: 3 }],
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1
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
    const store = new MemoryRankedStore([{ playerId: "a", mmr: 1518, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null, calibrationGames: 2, ratingGames: 2 }]);
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service: new RankedService({ store }) }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/rating`, { headers: { Cookie: "tm_session=token" } });

    expect(await response.json()).toEqual({
      rating: {
        playerId: "a",
        mmr: null,
        rankedGames: 0,
        wins: 0,
        losses: 0,
        lastRankedAt: null,
        isCalibrating: true,
        calibrationGamesRemaining: 3,
        penalty: {
          leaveWarnings: 0,
          cleanGamesUntilForgiven: null,
          cooldownUntil: null,
          queueBlocked: false
        }
      }
    });
  });

  it("returns authenticated player match history", async () => {
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
    await service.settleMatch("a", { matchId: "match-1", playerACoins: 0, playerBCoins: 0, playerASales: 0, playerBSales: 0 });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/history?limit=20`, { headers: { Cookie: "tm_session=token" } });
    const payload = await response.json();

    expect(payload.history[0]).toMatchObject({ matchId: "match-1", winnerId: null, loserId: null, mmrChange: 0 });
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

  it("rejects zero-event ranked settlement instead of trusting submitted result totals", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 10, ratingGames: 10, calibrationGames: 5, wins: 5, losses: 5, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 10, ratingGames: 10, calibrationGames: 5, wins: 5, losses: 5, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/settle`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1", playerACoins: 999, playerBCoins: 0, playerASales: 99, playerBSales: 0 })
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Ranked replay is incomplete." });
    expect(await store.eventsForMatch("match-1")).toEqual([]);
    await expect(service.statusForPlayer("a")).resolves.toMatchObject({ status: "matched" });
  });

  it("rejects bot ranked settlement until server-side replay reaches game end", async () => {
    const store = new MemoryRankedStore([{ playerId: "human", mmr: 1500, rankedGames: 0, ratingGames: 0, calibrationGames: 0, wins: 0, losses: 0, lastRankedAt: null }]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-bot", seedFactory: () => "seed-bot", botDelayFactory: () => 0 });
    await service.joinQueue("human");
    const status = await service.statusForPlayer("human");
    if (status.status !== "matched") throw new Error("Expected bot match.");
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "human", displayName: "Human", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/settle`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-bot", playerACoins: 999, playerBCoins: 0, playerASales: 99, playerBSales: 0 })
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Ranked replay is incomplete." });
    await expect(service.statusForPlayer("human")).resolves.toMatchObject({ status: "matched" });
  });

  it("records bot ranked actions on the server when the bot has the active turn", async () => {
    const store = new MemoryRankedStore([{ playerId: "human", mmr: 1500, rankedGames: 0, ratingGames: 0, calibrationGames: 0, wins: 0, losses: 0, lastRankedAt: null }]);
    let now = 1_000;
    const service = new RankedService({ store, now: () => now, idFactory: () => "match-bot", seedFactory: () => "seed-1", botDelayFactory: () => 0 });
    await service.joinQueue("human");
    const status = await service.statusForPlayer("human");
    if (status.status !== "matched") throw new Error("Expected bot match.");
    expect(status.match.firstPlayerId).toBe(status.match.playerBId);

    expect(await service.eventsForPlayer("human", "match-bot")).toEqual([]);

    now = 11_000;
    const events = await service.eventsForPlayer("human", "match-bot");

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.actorId === status.match.playerBId)).toBe(true);
  });

  it("rejects oversized ranked JSON bodies before parsing", async () => {
    const store = new MemoryRankedStore([{ playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }]);
    const service = new RankedService({ store, now: () => 1_000 });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service, maxBodyBytes: 20 }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/disconnect`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1", filler: "x".repeat(64) })
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Request body too large." });
  });

  it("returns ranked events after a requested sequence", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");
    const firstActorId = matched.match.firstPlayerId;
    const secondActorId = firstActorId === "a" ? "b" : "a";
    await service.recordEvent(firstActorId, { matchId: "match-1", round: 1, phase: "planning", eventType: "ready", payload: { seat: firstActorId } });
    await service.recordEvent(secondActorId, { matchId: "match-1", round: 1, phase: "planning", eventType: "ready", payload: { seat: secondActorId } });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/events?matchId=match-1&after=1`, { headers: { Cookie: "tm_session=token" } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      events: [{ matchId: "match-1", sequence: 2, actorId: secondActorId, eventType: "ready", payload: { seat: secondActorId } }]
    });
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

    expect(await disconnect.json()).toEqual({ status: "reconnect_window", reconnectUntil: 61_000 });
    expect(await reconnect.json()).toMatchObject({ status: "matched", match: { id: "match-1", status: "active" } });
  });

  it("abandons an authenticated ranked match immediately", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/abandon`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1" })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ log: { matchId: "match-1", winnerId: "b", loserId: "a" } });
    await expect(service.statusForPlayer("a")).resolves.toEqual({ status: "idle" });
  });

  it("returns a structured cooldown error when ranked queue is locked", async () => {
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
    for (let leave = 0; leave < 3; leave += 1) {
      await service.joinQueue("a");
      await service.joinQueue("b");
      await service.disconnectFromMatch("a", `match-${leave + 1}`);
      now += 61_000;
      await service.statusForPlayer("b");
    }
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/queue`, { method: "POST", headers: { Cookie: "tm_session=token" } });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Ranked cooldown is active.",
      penalty: {
        leaveWarnings: 3,
        cleanGamesUntilForgiven: 5,
        cooldownUntil: now + 3 * 60 * 1000,
        queueBlocked: true
      }
    });
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
