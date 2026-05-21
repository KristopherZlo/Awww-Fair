import { describe, expect, it, vi } from "vitest";
import { MariaDbRankedStore, MemoryRankedStore, RankedService, getAllowedMmrRange, leaveCooldownSeconds, repeatMatchMultiplier } from "./ranked";
import { calculateMmrChange, type PlayerRating, type RankedMatchLog } from "../src/game/rating";
import { buildInitialState, seededRandom } from "../src/game/session";
import { DEFAULT_INITIAL_STATE_OPTIONS, DEFAULT_TURN_TIME_SECONDS } from "../src/game/sessionConfig";

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
    expect(leaveCooldownSeconds(2)).toBe(5 * 60);
    expect(leaveCooldownSeconds(3)).toBe(30 * 60);
    expect(leaveCooldownSeconds(4)).toBe(60 * 60);
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

  it("records turn events and settles an active ranked match", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");

    const event = await service.recordEvent("a", {
      matchId: "match-1",
      round: 1,
      phase: "planning",
      eventType: "place_product",
      payload: { slotIndex: 0 }
    });
    const settlement = await service.settleMatch("a", {
      matchId: "match-1",
      playerACoins: 10,
      playerBCoins: 5,
      playerASales: 4,
      playerBSales: 2
    });

    expect(event).toMatchObject({ matchId: "match-1", sequence: 1, actorId: "a", eventType: "place_product" });
    expect(settlement.log).toMatchObject({ winnerId: "a", loserId: "b", mmrChange: 26, playerAMmrAfter: 1526, playerBMmrAfter: 1474 });
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1526, wins: 1 });
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
    now = 90_000;
    const reconnect = await service.reconnectToMatch("a", "match-1");
    const match = await store.matchById("match-1");

    expect(disconnect).toEqual({ status: "reconnect_window", reconnectUntil: 91_000 });
    expect(reconnect).toMatchObject({ status: "matched", match: { id: "match-1", status: "active" } });
    expect(match?.playerADisconnectedAt).toBeNull();
    expect(await service.statusForPlayer("a")).toMatchObject({ status: "matched", match: { id: "match-1" } });
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

    now = 91_001;
    const status = await service.statusForPlayer("b");
    const match = await store.matchById("match-1");
    const history = await store.matchHistoryForPlayer("a", 1);

    expect(status).toEqual({ status: "idle" });
    expect(match?.status).toBe("settled");
    await expect(store.ratingForPlayer("a")).resolves.toMatchObject({ mmr: 1476, losses: 1 });
    await expect(store.ratingForPlayer("b")).resolves.toMatchObject({ mmr: 1524, wins: 1 });
    expect(history[0]).toMatchObject({ winnerId: "b", loserId: "a", playerACoins: 0, playerBCoins: 0, mmrChange: 24 });
  });

  it("blocks ranked queue while a repeated leaver is on cooldown", async () => {
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

    await expect(service.joinQueue("a")).rejects.toThrow("Ranked cooldown is active.");
    now += 5 * 60 * 1000 + 1;
    await expect(service.joinQueue("a")).resolves.toEqual({ status: "waiting" });
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
      await service.joinQueue("b");
      await service.settleMatch("a", {
        matchId: `match-${index + 1}`,
        playerACoins: 10,
        playerBCoins: 10,
        playerASales: 4,
        playerBSales: 4
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
      winnerCoins: 10,
      loserCoins: 5,
      winnerSales: 4,
      loserSales: 2
    };
    const fullChange = calculateMmrChange(changeParams);
    const reducedChange = calculateMmrChange({ ...changeParams, multiplier: 0.5 });

    const settlement = await service.settleMatch("a", {
      matchId: "match-5",
      playerACoins: 10,
      playerBCoins: 5,
      playerASales: 4,
      playerBSales: 2
    });

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
    const store = new MariaDbRankedStore(pool);

    await store.settleMatch(log, playerA, playerB);

    expect(pool.query).not.toHaveBeenCalled();
    expect(operations).toEqual(["begin", "query", "query", "query", "commit", "release"]);
  });
});
