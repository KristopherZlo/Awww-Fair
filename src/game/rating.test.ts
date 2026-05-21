import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYER_RATING,
  applyRankedResult,
  buildRankedMatchLog,
  calculateMmrChange,
  expectedScore,
  getCoinMarginFactor,
  getKFactor,
  getRankedWinner,
  getSalesFactor
} from "./rating";

describe("ranked MMR", () => {
  it("resolves winners by coins, then sales, then full draw", () => {
    expect(getRankedWinner([{ playerId: "a", coins: 12, sales: 1 }, { playerId: "b", coins: 10, sales: 8 }])).toBe("a");
    expect(getRankedWinner([{ playerId: "a", coins: 10, sales: 4 }, { playerId: "b", coins: 10, sales: 5 }])).toBe("b");
    expect(getRankedWinner([{ playerId: "a", coins: 10, sales: 4 }, { playerId: "b", coins: 10, sales: 4 }])).toBeNull();
  });

  it("calculates expected score, K-factor, and margin factors", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 4);
    expect(expectedScore(1500, 1600)).toBeCloseTo(0.36, 2);
    expect(getKFactor(0)).toBe(48);
    expect(getKFactor(10)).toBe(32);
    expect(getKFactor(30)).toBe(24);
    expect(getKFactor(100)).toBe(16);
    expect(getCoinMarginFactor(30, 10)).toBe(1.15);
    expect(getSalesFactor(8, 1)).toBe(1.03);
  });

  it("uses one rounded MMR change for winner and loser", () => {
    expect(
      calculateMmrChange({
        winnerMmr: 1500,
        loserMmr: 1500,
        winnerRankedGames: 0,
        winnerCoins: 10,
        loserCoins: 5,
        winnerSales: 4,
        loserSales: 2
      })
    ).toBe(26);
  });

  it("applies ranked result and builds a match log", () => {
    const winner = { ...DEFAULT_PLAYER_RATING, playerId: "a" };
    const loser = { ...DEFAULT_PLAYER_RATING, playerId: "b" };
    const result = applyRankedResult({ winner, loser, winnerCoins: 10, loserCoins: 5, winnerSales: 4, loserSales: 2, now: "2026-05-21T00:00:00.000Z" });
    const log = buildRankedMatchLog({
      matchId: "m1",
      playerA: winner,
      playerB: loser,
      playerACoins: 10,
      playerBCoins: 5,
      playerASales: 4,
      playerBSales: 2,
      firstPlayerId: "a",
      createdAt: "2026-05-21T00:00:00.000Z",
      result
    });

    expect(result).toMatchObject({ winnerChange: 26, loserChange: -26, winnerNewMmr: 1526, loserNewMmr: 1474 });
    expect(winner).toMatchObject({ mmr: 1526, rankedGames: 1, wins: 1, losses: 0 });
    expect(loser).toMatchObject({ mmr: 1474, rankedGames: 1, wins: 0, losses: 1 });
    expect(log).toMatchObject({ winnerId: "a", loserId: "b", playerAMmrBefore: 1500, playerAMmrAfter: 1526, mmrChange: 26 });
  });
});
