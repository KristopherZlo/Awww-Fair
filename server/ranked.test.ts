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
});
