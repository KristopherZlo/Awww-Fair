import { describe, expect, it, vi } from "vitest";
import { joinRankedQueue, loadLeaderboard, loadMatchHistory, loadMyRating } from "./rankedClient";

describe("ranked client", () => {
  it("loads leaderboard entries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ leaderboard: [{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }] })));

    await expect(loadLeaderboard()).resolves.toEqual([{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }]);
  });

  it("joins ranked queue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "waiting" })));

    await expect(joinRankedQueue()).resolves.toEqual({ status: "waiting" });
  });

  it("loads the current player rating", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ rating: { playerId: "a", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null } })));

    await expect(loadMyRating()).resolves.toEqual({ playerId: "a", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null });
  });

  it("loads the current player match history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ history: [{ matchId: "m1", winnerId: "a", loserId: "b", playerAId: "a", playerBId: "b", mmrChange: 18 }] }))
    );

    await expect(loadMatchHistory()).resolves.toEqual([{ matchId: "m1", winnerId: "a", loserId: "b", playerAId: "a", playerBId: "b", mmrChange: 18 }]);
  });
});
