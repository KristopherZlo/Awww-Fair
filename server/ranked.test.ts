import { describe, expect, it, vi } from "vitest";
import { MariaDbRankedStore, MemoryRankedStore, RankedService, getAllowedMmrRange, leaveCooldownSeconds, repeatMatchMultiplier } from "./ranked";
import { calculateMmrChange, type PlayerRating, type RankedMatchLog } from "../src/game/rating";
import { applyRankedReplayEvent, type RankedReplayEvent, type RankedReplayPlayerMap } from "../src/game/rankedReplay";
import { buildInitialState, seededRandom } from "../src/game/session";
import { DEFAULT_INITIAL_STATE_OPTIONS, DEFAULT_TURN_TIME_SECONDS } from "../src/game/sessionConfig";

function buildNoActionReplayEvents(match: { initialState: ReturnType<typeof buildInitialState>; playerAId: string; playerBId: string }) {
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

async function recordNoActionReplay(store: MemoryRankedStore, match: { id: string; initialState: ReturnType<typeof buildInitialState>; playerAId: string; playerBId: string }) {
  for (const event of buildNoActionReplayEvents(match)) {
    await store.recordMatchEvent({
      matchId: match.id,
      actorId: event.actorId,
      round: event.round,
      phase: event.phase,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: 1_000
    });
  }
}

describe("ranked matchmaking", () => {
  it("expands the MMR search range by wait time", () => {
    expect(getAllowedMmrRange(0)).toBe(100);
    expect(getAllowedMmrRange(15)).toBe(200);
    expect(getAllowedMmrRange(30)).toBe(300);
    expect(getAllowedMmrRange(60)).toBe(500);
  });

  it("cuts MMR change after repeated pair matches and escalates leave cooldowns", () => {
    expect(repeatMatchMultiplier(3)).toBe(1);
    expect(repeatMatchMultiplier(4)).toBe(0.5);
    expect(leaveCooldownSeconds(1)).toBe(0);
    expect(leaveCooldownSeconds(2)).toBe(0);
    expect(leaveCooldownSeconds(3)).toBe(3 * 60);
    expect(leaveCooldownSeconds(4)).toBe(10 * 60);
    expect(leaveCooldownSeconds(5)).toBe(15 * 60);
    expect(leaveCooldownSeconds(6)).toBe(60 * 60);
  });

  it("matches nearby queued players and leaves distant players waiting", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1580, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "c", mmr: 2300, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });

    expect(await service.joinQueue("a")).toEqual({ status: "waiting" });
    expect(await service.joinQueue("c")).toEqual({ status: "waiting" });
    expect(await service.joinQueue("b")).toMatchObject({
      status: "matched",
      match: { id: "match-1", playerAId: "a", playerBId: "b", seed: "seed-1", status: "active" }
    });
    expect(await store.currentMatchForPlayer("c")).toBeNull();
  });

  it("keeps a new player in hidden calibration and starts a bot match only after the calibration delay", async () => {
    let now = 1_000;
    const store = new MemoryRankedStore();
    const service = new RankedService({
      store,
      now: () => now,
      idFactory: () => "match-1",
      seedFactory: () => "seed-1",
      botDelayFactory: () => 5_000
    });

    await expect(service.publicRatingForPlayer("new-player")).resolves.toMatchObject({
      playerId: "new-player",
      mmr: null,
      rankedGames: 0,
      wins: 0,
      losses: 0,
      isCalibrating: true,
      calibrationGamesRemaining: 5
    });
    await expect(service.joinQueue("new-player")).resolves.toEqual({ status: "waiting" });

    now = 5_999;
    await expect(service.statusForPlayer("new-player")).resolves.toEqual({ status: "waiting" });

    now = 6_000;
    const matched = await service.statusForPlayer("new-player");

    expect(matched).toMatchObject({
      status: "matched",
      match: {
        id: "match-1",
        playerAId: "new-player",
        isCalibration: true,
        isBotMatch: true,
        botDifficulty: 3
      }
    });
    if (matched.status !== "matched") throw new Error("Expected bot match.");
    expect(matched.match.playerBId).toMatch(/^00000000-0000-4000-8000-/);
    expect(matched.match.initialState.aiPlayerId).toBe("B");
  });

  it("records calibration bot matches in history without exposing public MMR until five calibration games finish", async () => {
    const store = new MemoryRankedStore();
    const service = new RankedService({
      store,
      now: () => 10_000,
      idFactory: () => "match-1",
      seedFactory: () => "seed-1",
      botDelayFactory: () => 0
    });
    await service.joinQueue("new-player");
    const matched = await service.statusForPlayer("new-player");
    if (matched.status !== "matched") throw new Error("Expected bot match.");
    await recordNoActionReplay(store, matched.match);

    await service.settleMatch("new-player", {
      matchId: "match-1",
      playerACoins: 0,
      playerBCoins: 0,
      playerASales: 0,
      playerBSales: 0
    });

    await expect(store.ratingForPlayer("new-player")).resolves.toMatchObject({ rankedGames: 0, wins: 0, losses: 0, calibrationGames: 1 });
    await expect(service.publicRatingForPlayer("new-player")).resolves.toMatchObject({
      mmr: null,
      rankedGames: 0,
      wins: 0,
      losses: 0,
      isCalibrating: true,
      calibrationGamesRemaining: 4
    });
    await expect(service.matchHistoryForPlayer("new-player")).resolves.toMatchObject([
      {
        matchId: "match-1",
        isCalibration: true,
        playerADisplayName: "new-player"
      }
    ]);
  });

  it("matches calibrated human players immediately before scheduling a later fallback bot", async () => {
    let now = 1_000;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 5, wins: 3, losses: 2, lastRankedAt: null, calibrationGames: 5, ratingGames: 5 },
      { playerId: "b", mmr: 1520, rankedGames: 5, wins: 2, losses: 3, lastRankedAt: null, calibrationGames: 5, ratingGames: 5 },
      { playerId: "solo", mmr: 1490, rankedGames: 5, wins: 3, losses: 2, lastRankedAt: null, calibrationGames: 5, ratingGames: 5 }
    ]);
    const service = new RankedService({
      store,
      now: () => now,
      idFactory: () => "match-1",
      seedFactory: () => "seed-1",
      botDelayFactory: () => 7_000
    });

    await expect(service.joinQueue("a")).resolves.toEqual({ status: "waiting" });
    await expect(service.joinQueue("b")).resolves.toMatchObject({ status: "matched", match: { playerAId: "a", playerBId: "b", isBotMatch: false } });
    await expect(service.joinQueue("solo")).resolves.toEqual({ status: "waiting" });

    now = 37_999;
    await expect(service.statusForPlayer("solo")).resolves.toEqual({ status: "waiting" });

    now = 38_000;
    await expect(service.statusForPlayer("solo")).resolves.toMatchObject({ status: "matched", match: { playerAId: "solo", isBotMatch: true, isCalibration: false } });
  });

  it("creates deterministic ranked initial state from the match seed", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    const expectedInitialState = {
      ...buildInitialState(true, DEFAULT_TURN_TIME_SECONDS, DEFAULT_INITIAL_STATE_OPTIONS, seededRandom("seed-1")),
      phase: "planning" as const
    };

    await service.joinQueue("a");
    const result = await service.joinQueue("b");

    expect(result).toMatchObject({ status: "matched" });
    if (result.status !== "matched") throw new Error("Expected ranked match.");
    expect(result.match.initialState).toEqual(expectedInitialState);
    expect(result.match.firstPlayerId).toBe(expectedInitialState.firstPlayer === "A" ? "a" : "b");
  });

  it("replays recorded turn events before settling an active ranked match", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");

    const replayEvents = buildNoActionReplayEvents(matched.match);
    for (const event of replayEvents) {
      await service.recordEvent(event.actorId, { matchId: "match-1", round: event.round, phase: event.phase, eventType: event.eventType, payload: event.payload });
    }
    const settlement = await service.settleMatch("a", {
      matchId: "match-1",
      playerACoins: 0,
      playerBCoins: 0,
      playerASales: 0,
      playerBSales: 0
    });

    expect(replayEvents).toHaveLength(22);
    expect(settlement.log).toMatchObject({ winnerId: null, loserId: null, mmrChange: 0, playerAMmrAfter: 1500, playerBMmrAfter: 1500 });
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1500, wins: 0 });
  });

  it("lists ranked match events after a known sequence for participants", async () => {
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

    const events = await service.eventsForPlayer("a", "match-1", 1);

    expect(events).toEqual([
      { matchId: "match-1", sequence: 2, actorId: secondActorId, round: 1, phase: "planning", eventType: "ready", payload: { seat: secondActorId }, createdAt: 1_000 }
    ]);
    await expect(service.eventsForPlayer("c", "match-1", 0)).rejects.toThrow("Active ranked match not found.");
  });

  it("rejects settlement when submitted result does not match the ranked replay", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");

    for (const event of buildNoActionReplayEvents(matched.match)) {
      await service.recordEvent(event.actorId, { matchId: "match-1", round: event.round, phase: event.phase, eventType: event.eventType, payload: event.payload });
    }

    await expect(
      service.settleMatch("a", {
        matchId: "match-1",
        playerACoins: 10,
        playerBCoins: 0,
        playerASales: 1,
        playerBSales: 0
      })
    ).rejects.toThrow("Ranked replay result mismatch.");
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1500, wins: 0 });
    await expect(store.matchById("match-1")).resolves.toMatchObject({ status: "active" });
  });

  it("lets a disconnected player reconnect before the timeout", async () => {
    let now = 1_000;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => now, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");

    const disconnect = await service.disconnectFromMatch("a", "match-1");
    now = 60_000;
    const reconnect = await service.reconnectToMatch("a", "match-1");
    const match = await store.matchById("match-1");

    expect(disconnect).toEqual({ status: "reconnect_window", reconnectUntil: 61_000 });
    expect(reconnect).toMatchObject({ status: "matched", match: { id: "match-1", status: "active" } });
    expect(match?.playerADisconnectedAt).toBeNull();
    expect(await service.statusForPlayer("a")).toMatchObject({ status: "matched", match: { id: "match-1" } });
  });

  it("does not extend the reconnect deadline after a player reconnects and leaves again", async () => {
    let now = 1_000;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => now, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");

    const firstDisconnect = await service.disconnectFromMatch("a", "match-1");
    now = 20_000;
    await service.reconnectToMatch("a", "match-1");
    now = 30_000;
    const secondDisconnect = await service.disconnectFromMatch("a", "match-1");

    expect(firstDisconnect.reconnectUntil).toBe(61_000);
    expect(secondDisconnect.reconnectUntil).toBe(61_000);

    now = 61_001;
    await expect(service.statusForPlayer("b")).resolves.toEqual({ status: "idle" });
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ losses: 1 });
  });

  it("settles a disconnected player as the loser after the reconnect timeout", async () => {
    let now = 1_000;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => now, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");
    await service.disconnectFromMatch("a", "match-1");

    now = 61_001;
    const status = await service.statusForPlayer("b");
    const match = await store.matchById("match-1");
    const history = await store.matchHistoryForPlayer("a", 1);

    expect(status).toEqual({ status: "idle" });
    expect(match?.status).toBe("settled");
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1476, losses: 1 });
    await expect(store.ratingForPlayer("b")).resolves.toMatchObject({ mmr: 1524, wins: 1 });
    expect(history[0]).toMatchObject({ winnerId: "b", loserId: "a", playerACoins: 0, playerBCoins: 0, mmrChange: 24 });
  });

  it("settles disconnect loss even when replay events are unfinished", async () => {
    let now = 1_000;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => now, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");
    await service.recordEvent(matched.match.firstPlayerId, { matchId: "match-1", round: 1, phase: "planning", eventType: "ready", payload: {} });
    await service.disconnectFromMatch("a", "match-1");

    now = 91_001;
    await expect(service.statusForPlayer("b")).resolves.toEqual({ status: "idle" });
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1476, losses: 1 });
  });

  it("abandons a ranked match immediately when a player explicitly exits", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");

    const abandoned = await service.abandonMatch("a", "match-1");

    expect(abandoned.log).toMatchObject({ winnerId: "b", loserId: "a", mmrChange: 24 });
    await expect(service.statusForPlayer("a")).resolves.toEqual({ status: "idle" });
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1476, losses: 1 });
    await expect(store.leavePenaltyForPlayer("a")).resolves.toMatchObject({ leaveCount: 1, cooldownUntil: null, cleanGamesSinceLeave: 0 });
  });

  it("can abandon a ranked match even when old replay history is invalid", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");
    const firstActorId = matched.match.firstPlayerId;
    await store.recordMatchEvent({ matchId: "match-1", actorId: firstActorId, round: 1, phase: "planning", eventType: "ready", payload: {}, createdAt: 1_000 });
    await store.recordMatchEvent({ matchId: "match-1", actorId: firstActorId, round: 1, phase: "planning", eventType: "ready", payload: {}, createdAt: 1_001 });

    await expect(service.abandonMatch("a", "match-1")).resolves.toMatchObject({ log: { loserId: "a" } });
    await expect(service.statusForPlayer("a")).resolves.toEqual({ status: "idle" });
  });

  it("rejects out-of-turn ranked events before they corrupt replay history", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");
    const firstActorId = matched.match.firstPlayerId;

    await service.recordEvent(firstActorId, { matchId: "match-1", round: 1, phase: "planning", eventType: "ready", payload: {} });

    await expect(
      service.recordEvent(firstActorId, { matchId: "match-1", round: 1, phase: "planning", eventType: "ready", payload: {} })
    ).rejects.toThrow("Invalid ranked event.");
    await expect(store.eventsForMatch("match-1")).resolves.toHaveLength(1);
  });

  it("warns twice before blocking ranked queue on the third leave", async () => {
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
      now += 61_000;
      await service.statusForPlayer("b");
      await expect(store.leavePenaltyForPlayer("a")).resolves.toMatchObject({ leaveCount: leave + 1, cooldownUntil: null, cleanGamesSinceLeave: 0 });
      await expect(service.joinQueue("a")).resolves.toEqual({ status: "waiting" });
      await service.cancelQueue("a");
    }

    await service.joinQueue("a");
    await service.joinQueue("b");
    await service.disconnectFromMatch("a", "match-3");
    now += 61_000;
    await service.statusForPlayer("b");

    await expect(service.joinQueue("a")).rejects.toThrow("Ranked cooldown is active.");
    await expect(store.leavePenaltyForPlayer("a")).resolves.toMatchObject({ leaveCount: 3, cooldownUntil: now + 3 * 60 * 1000, cleanGamesSinceLeave: 0 });
    now += 3 * 60 * 1000 + 1;
    await expect(service.joinQueue("a")).resolves.toEqual({ status: "waiting" });
  });

  it("records a leave warning when an expired player tries to reconnect late", async () => {
    let now = 1_000;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => now, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");
    await service.disconnectFromMatch("a", "match-1");

    now = 61_001;

    await expect(service.reconnectToMatch("a", "match-1")).rejects.toThrow("Reconnect window expired.");
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1476, losses: 1 });
    await expect(store.leavePenaltyForPlayer("a")).resolves.toMatchObject({ leaveCount: 1, cooldownUntil: null, cleanGamesSinceLeave: 0 });
  });

  it("forgives one leave warning after five clean ranked completions", async () => {
    let matchIndex = 0;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    await store.recordLeavePenalty("a", { leaveCount: 2, cooldownUntil: null, cleanGamesSinceLeave: 4 });
    const service = new RankedService({
      store,
      now: () => 1_000,
      idFactory: () => `match-${++matchIndex}`,
      seedFactory: () => `seed-${matchIndex}`
    });

    await service.joinQueue("a");
    const matched = await service.joinQueue("b");
    if (matched.status !== "matched") throw new Error("Expected ranked match.");
    await recordNoActionReplay(store, matched.match);
    await service.settleMatch("a", {
      matchId: "match-1",
      playerACoins: 0,
      playerBCoins: 0,
      playerASales: 0,
      playerBSales: 0
    });

    await expect(store.leavePenaltyForPlayer("a")).resolves.toMatchObject({ leaveCount: 1, cooldownUntil: null, cleanGamesSinceLeave: 0 });
  });

  it("halves MMR change after repeated pair matches in one hour", async () => {
    let matchIndex = 0;
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({
      store,
      now: () => 10_000,
      idFactory: () => `match-${++matchIndex}`,
      seedFactory: () => `seed-${matchIndex}`
    });

    for (let index = 0; index < 4; index += 1) {
      await service.joinQueue("a");
      const matched = await service.joinQueue("b");
      if (matched.status !== "matched") throw new Error("Expected ranked match.");
      await recordNoActionReplay(store, matched.match);
      await service.settleMatch("a", {
        matchId: `match-${index + 1}`,
        playerACoins: 0,
        playerBCoins: 0,
        playerASales: 0,
        playerBSales: 0
      });
    }

    await service.joinQueue("a");
    await service.joinQueue("b");
    const winnerBefore = await store.ratingForPlayer("a");
    const loserBefore = await store.ratingForPlayer("b");
    const changeParams = {
      winnerMmr: winnerBefore.mmr,
      loserMmr: loserBefore.mmr,
      winnerRankedGames: winnerBefore.rankedGames,
      winnerCoins: 0,
      loserCoins: 0,
      winnerSales: 0,
      loserSales: 0
    };
    const fullChange = calculateMmrChange(changeParams);
    const reducedChange = calculateMmrChange({ ...changeParams, multiplier: 0.5 });

    const settlement = await service.abandonMatch("b", "match-5");

    expect(settlement.log.mmrChange).toBe(reducedChange);
    expect(settlement.log.mmrChange).toBeLessThan(fullChange);
  });

  it("settles MariaDB ranked matches inside one transaction", async () => {
    const operations: string[] = [];
    const playerA: PlayerRating = { playerId: "a", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: "2026-05-21T00:00:00.000Z" };
    const playerB: PlayerRating = { playerId: "b", mmr: 1482, rankedGames: 1, wins: 0, losses: 1, lastRankedAt: "2026-05-21T00:00:00.000Z" };
    const log: RankedMatchLog = {
      matchId: "match-1",
      playerAId: "a",
      playerBId: "b",
      winnerId: "a",
      loserId: "b",
      playerACoins: 10,
      playerBCoins: 5,
      playerASales: 4,
      playerBSales: 2,
      playerAMmrBefore: 1500,
      playerBMmrBefore: 1500,
      playerAMmrAfter: 1518,
      playerBMmrAfter: 1482,
      mmrChange: 18,
      firstPlayerId: "a",
      createdAt: "2026-05-21T00:00:00.000Z"
    };
    const connection = {
      beginTransaction: vi.fn(async () => {
        operations.push("begin");
      }),
      query: vi.fn(async () => {
        operations.push("query");
      }),
      commit: vi.fn(async () => {
        operations.push("commit");
      }),
      rollback: vi.fn(async () => {
        operations.push("rollback");
      }),
      release: vi.fn(async () => {
        operations.push("release");
      })
    };
    const pool = {
      query: vi.fn(),
      getConnection: vi.fn(async () => connection)
    };
    const store = new MariaDbRankedStore(pool as unknown as ConstructorParameters<typeof MariaDbRankedStore>[0]);

    await store.settleMatch(log, playerA, playerB);

    expect(pool.query).not.toHaveBeenCalled();
    expect(operations).toEqual(["begin", "query", "query", "query", "commit", "release"]);
  });

  it("qualifies MariaDB match history columns after joining player users", async () => {
    const pool = {
      query: vi.fn(async <T = unknown>(...args: unknown[]): Promise<T> => {
        const sql = String(args[0]);
        const values = args[1];
        expect(sql).toContain("ranked_matches.id AS matchId");
        expect(sql).toContain("ranked_matches.player_a_id AS playerAId");
        expect(sql).toContain("ranked_matches.player_b_id AS playerBId");
        expect(sql).toContain("ranked_matches.created_at AS createdAt");
        expect(sql).toContain("ORDER BY ranked_matches.created_at DESC");
        expect(values).toEqual(["dev-player", "dev-player", 10]);
        return [
          {
            matchId: "match-1",
            playerAId: "dev-player",
            playerBId: "seed-mira",
            playerADisplayName: "player",
            playerBDisplayName: "Mira",
            winnerId: "dev-player",
            loserId: "seed-mira",
            playerACoins: 42,
            playerBCoins: 36,
            playerASales: 7,
            playerBSales: 6,
            playerAMmrBefore: 1524,
            playerBMmrBefore: 1606,
            playerAMmrAfter: 1548,
            playerBMmrAfter: 1582,
            mmrChange: 24,
            firstPlayerId: "dev-player",
            isCalibration: false,
            createdAt: new Date("2026-05-20T09:00:00.000Z")
          }
        ] as T;
      }),
      getConnection: vi.fn()
    };
    const store = new MariaDbRankedStore(pool as unknown as ConstructorParameters<typeof MariaDbRankedStore>[0]);

    const history = await store.matchHistoryForPlayer("dev-player", 10);

    expect(history).toEqual([
      {
        matchId: "match-1",
        playerAId: "dev-player",
        playerBId: "seed-mira",
        playerADisplayName: "player",
        playerBDisplayName: "Mira",
        winnerId: "dev-player",
        loserId: "seed-mira",
        playerACoins: 42,
        playerBCoins: 36,
        playerASales: 7,
        playerBSales: 6,
        playerAMmrBefore: 1524,
        playerBMmrBefore: 1606,
        playerAMmrAfter: 1548,
        playerBMmrAfter: 1582,
        mmrChange: 24,
        firstPlayerId: "dev-player",
        isCalibration: false,
        createdAt: "2026-05-20T09:00:00.000Z"
      }
    ]);
  });
});
