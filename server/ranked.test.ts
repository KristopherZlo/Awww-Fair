import { describe, expect, it } from "vitest";
import { MemoryRankedStore, RankedService, getAllowedMmrRange, leaveCooldownSeconds, repeatMatchMultiplier } from "./ranked";

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
});
