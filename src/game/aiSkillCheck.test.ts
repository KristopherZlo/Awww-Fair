import { describe, expect, it } from "vitest";
import { INFLUENCE_CARDS, UPGRADE_CARDS } from "../data/cards";
import { runAiSkillCheck } from "./aiSkillCheck";

describe("AI skill check", () => {
  it("shows that stronger decisions beat valid random decisions over many games", () => {
    const result = runAiSkillCheck({ games: 240, seed: 90210 });

    expect(result.games).toBe(240);
    expect(result.strongWinRate).toBeGreaterThanOrEqual(0.62);
    expect(result.baselineWinRate).toBeLessThanOrEqual(0.36);
    expect(result.noSaleRate).toBeGreaterThanOrEqual(0.08);
    expect(result.noSaleRate).toBeLessThanOrEqual(0.24);
    expect(result.tipRateOfSales).toBeGreaterThanOrEqual(0.15);
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
});
