import { describe, expect, it, vi } from "vitest";
import { joinRankedQueue, loadLeaderboard } from "./rankedClient";

describe("ranked client", () => {
  it("loads leaderboard entries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ leaderboard: [{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }] })));

    await expect(loadLeaderboard()).resolves.toEqual([{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }]);
  });

  it("joins ranked queue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "waiting" })));

    await expect(joinRankedQueue()).resolves.toEqual({ status: "waiting" });
  });
});
