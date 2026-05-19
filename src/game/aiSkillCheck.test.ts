import { describe, expect, it } from "vitest";
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
});
