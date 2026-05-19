import { describe, expect, it } from "vitest";
import { INFLUENCE_CARDS, TAGS, TREND_CARDS, UPGRADE_CARDS } from "../data/cards";
import {
  runAiSkillCheck,
  runAiVsAiBonusMatrix,
  runAiVsAiComebackMatrix,
  runAiVsAiEconomyComebackMatrix,
  runAiVsAiNoviceHandicapMatrix,
  runAiVsAiScenario,
  runAiVsAiSkillGapMatrix,
  runAiVsAiSymmetryCheck,
  runAiVsAiTrendMatrix,
  runAiVsAiUpgradeDuelMatrix
} from "./aiSkillCheck";

describe("AI skill check", () => {
  it("shows that stronger decisions beat valid random decisions over many games", () => {
    const result = runAiSkillCheck({ games: 240, seed: 90210 });

    expect(result.games).toBe(240);
    expect(result.strongWinRate).toBeGreaterThanOrEqual(0.62);
    expect(result.baselineWinRate).toBeLessThanOrEqual(0.36);
    expect(result.noSaleRate).toBeGreaterThanOrEqual(0.08);
    expect(result.noSaleRate).toBeLessThanOrEqual(0.24);
    expect(result.tipRateOfSales).toBeGreaterThanOrEqual(0.14);
    expect(result.productSpread).toBeLessThanOrEqual(3);
    expect(result.goalsPerGame).toBeGreaterThanOrEqual(1.2);
    expect(result.sales).toBeGreaterThan(result.games * 8);
  });

  it("covers every playable upgrade and influence in AI-vs-AI balance runs", () => {
    const result = runAiSkillCheck({ games: 600, seed: 440044 });

    expect(result.upgradeRows.map((row) => row.id).sort()).toEqual(UPGRADE_CARDS.map((upgrade) => upgrade.id).sort());
    expect(result.influenceRows.map((row) => row.id).sort()).toEqual(INFLUENCE_CARDS.map((influence) => influence.id).sort());
    expect(result.upgradeRows.every((row) => row.picks > 0)).toBe(true);
    expect(result.influenceRows.every((row) => row.plays > 0)).toBe(true);
  });

  it("runs full-strength AI mirror games with a single starting upgrade advantage", () => {
    const result = runAiVsAiScenario({
      games: 20,
      seed: 10101,
      firstPlayer: "A",
      bonusPlayerId: "A",
      bonusUpgradeId: "extra_shelf"
    });

    expect(result.games).toBe(20);
    expect(result.firstPlayer).toBe("A");
    expect(result.bonusPlayerId).toBe("A");
    expect(result.noBonusPlayerId).toBe("B");
    expect(result.aWins + result.bWins + result.draws).toBe(20);
    expect(result.bonusPlayerWins).toBe(result.aWins);
    expect(result.noBonusPlayerWins).toBe(result.bWins);
    expect(result.averageMoney.A).toBeGreaterThanOrEqual(0);
    expect(result.averageMoney.B).toBeGreaterThanOrEqual(0);
  });

  it("builds one hundred-game bonus scenarios for every starting player, bonus owner, and upgrade", () => {
    const result = runAiVsAiBonusMatrix({ gamesPerScenario: 100, seed: 20202 });

    expect(result.gamesPerScenario).toBe(100);
    expect(result.scenarios).toHaveLength(UPGRADE_CARDS.length * 2 * 2);
    expect(new Set(result.scenarios.map((scenario) => scenario.bonusUpgradeId))).toEqual(new Set(UPGRADE_CARDS.map((upgrade) => upgrade.id)));
    expect(result.scenarios.every((scenario) => scenario.games === 100)).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.bonusPlayerId !== null && scenario.noBonusPlayerId !== null)).toBe(true);
  });

  it("tracks comeback wins when one full-strength AI starts with worse cards", () => {
    const result = runAiVsAiComebackMatrix({ gamesPerScenario: 20, seed: 30303 });

    expect(result.scenarios).toHaveLength(4);
    expect(result.scenarios.every((scenario) => scenario.games === 20)).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.favoredHandPlayerId !== null && scenario.underdogPlayerId !== null)).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.comebackWins === scenario.underdogWins)).toBe(true);
  });

  it("keeps full-strength mirror games symmetric without starting bonuses", () => {
    const result = runAiVsAiSymmetryCheck({ gamesPerScenario: 80, seed: 40404 });

    expect(result.scenarios).toHaveLength(2);
    expect(result.summary.games).toBe(160);
    expect(result.summary.firstPlayerWinRate).toBeGreaterThanOrEqual(0.38);
    expect(result.summary.firstPlayerWinRate).toBeLessThanOrEqual(0.62);
    expect(result.summary.maxPlayerWinRateGap).toBeLessThanOrEqual(0.18);
  });

  it("measures first-player advantage separately from player identity", () => {
    const result = runAiVsAiSymmetryCheck({ gamesPerScenario: 80, seed: 50505 });

    expect(result.summary.firstPlayerWins + result.summary.secondPlayerWins + result.summary.draws).toBe(result.summary.games);
    expect(result.summary.firstPlayerWinRate).toBeGreaterThanOrEqual(0.35);
    expect(result.summary.firstPlayerWinRate).toBeLessThanOrEqual(0.65);
    expect(result.summary.averageMoneyMarginForFirstPlayer).toBeGreaterThanOrEqual(-5);
    expect(result.summary.averageMoneyMarginForFirstPlayer).toBeLessThanOrEqual(5);
  });

  it("builds a starting-upgrade duel matrix for every upgrade against every upgrade", () => {
    const result = runAiVsAiUpgradeDuelMatrix({ gamesPerScenario: 20, seed: 60606 });

    expect(result.gamesPerScenario).toBe(20);
    expect(result.scenarios).toHaveLength(UPGRADE_CARDS.length * UPGRADE_CARDS.length * 2);
    expect(new Set(result.scenarios.map((scenario) => scenario.aUpgradeId))).toEqual(new Set(UPGRADE_CARDS.map((upgrade) => upgrade.id)));
    expect(new Set(result.scenarios.map((scenario) => scenario.bUpgradeId))).toEqual(new Set(UPGRADE_CARDS.map((upgrade) => upgrade.id)));
    expect(result.summary.mostDominantUpgradeId).toEqual(expect.any(String));
  });

  it("checks whether money leads can be overcome by better starting cards", () => {
    const result = runAiVsAiEconomyComebackMatrix({ gamesPerScenario: 20, seed: 70707, startingMoneyLead: 3 });

    expect(result.scenarios).toHaveLength(4);
    expect(result.scenarios.every((scenario) => scenario.moneyLeaderId !== scenario.favoredHandPlayerId)).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.startingMoneyLead === 3)).toBe(true);
    expect(result.summary.games).toBe(80);
    expect(result.summary.handFavoredWins + result.summary.moneyLeaderWins + result.summary.draws).toBe(80);
  });

  it("measures a strong AI with worse cards against weaker AI difficulties with better cards", () => {
    const result = runAiVsAiSkillGapMatrix({ gamesPerScenario: 16, seed: 80808, weakerDifficulties: [6, 12, 18] });

    expect(result.scenarios).toHaveLength(12);
    expect(new Set(result.scenarios.map((scenario) => scenario.weakerDifficulty))).toEqual(new Set([6, 12, 18]));
    expect(result.scenarios.every((scenario) => scenario.strongPlayerId !== scenario.weakerPlayerId)).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.favoredHandPlayerId === scenario.weakerPlayerId)).toBe(true);
    expect(result.summary.strongWins + result.summary.weakerWins + result.summary.draws).toBe(result.summary.games);
  });

  it("covers every opening trend and tracks tag sales in strong mirror games", () => {
    const result = runAiVsAiTrendMatrix({ gamesPerScenario: 12, seed: 90909 });

    expect(result.scenarios).toHaveLength(TREND_CARDS.length * 2);
    expect(new Set(result.scenarios.map((scenario) => scenario.focusTrendId))).toEqual(new Set(TREND_CARDS.map((trend) => trend.id)));
    expect(result.summary.coveredTagIds.sort()).toEqual([...TAGS].sort());
    expect(result.summary.productSpread).toBeLessThanOrEqual(4);
  });

  it("keeps strong mirror sale-health metrics in a useful range", () => {
    const result = runAiVsAiScenario({ games: 160, seed: 100100, firstPlayer: "random" });

    expect(result.sales).toBeGreaterThan(result.games * 8);
    expect(result.noSaleRate).toBeGreaterThanOrEqual(0.04);
    expect(result.noSaleRate).toBeLessThanOrEqual(0.18);
    expect(result.tipRateOfSales).toBeGreaterThanOrEqual(0.16);
    expect(result.tipRateOfSales).toBeLessThanOrEqual(0.36);
  });

  it("compares beginner handicap types against a full-strength opponent", () => {
    const result = runAiVsAiNoviceHandicapMatrix({ gamesPerScenario: 16, seed: 111111, noviceDifficulty: 6 });

    expect(result.scenarios).toHaveLength(16);
    expect(new Set(result.scenarios.map((scenario) => scenario.handicapKind))).toEqual(new Set(["none", "starting_upgrade", "starting_money", "favored_hand"]));
    expect(result.scenarios.every((scenario) => scenario.novicePlayerId !== scenario.strongPlayerId)).toBe(true);
    expect(result.summary.games).toBe(256);
    expect(result.summary.noviceWins + result.summary.strongWins + result.summary.draws).toBe(256);
  });
});
