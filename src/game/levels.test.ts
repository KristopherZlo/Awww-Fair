import { describe, expect, it } from "vitest";
import { CAMPAIGN_LEVELS, campaignProgressAfterWin, createDefaultCampaignProgress, isLevelUnlocked } from "./levels";

describe("campaign levels", () => {
  it("defines twenty four opponents with bilingual friendly names", () => {
    expect(CAMPAIGN_LEVELS).toHaveLength(24);
    expect(CAMPAIGN_LEVELS[0]).toMatchObject({
      level: 1,
      opponentName: "Биби",
      opponentNameEn: "Bibi"
    });
    expect(CAMPAIGN_LEVELS.every((level) => level.opponentName.length > 0 && level.opponentNameEn.length > 0)).toBe(true);
  });

  it("keeps difficulty non-decreasing from the first to final level", () => {
    const difficulties = CAMPAIGN_LEVELS.map((level) => level.aiDifficulty);

    for (let index = 1; index < difficulties.length; index += 1) {
      expect(difficulties[index]).toBeGreaterThanOrEqual(difficulties[index - 1]);
    }

    expect(difficulties[0]).toBe(1);
    expect(difficulties[difficulties.length - 1]).toBe(24);
  });

  it("unlocks only the first level by default and opens the next level after a win", () => {
    const initial = createDefaultCampaignProgress();

    expect(isLevelUnlocked(initial, 1)).toBe(true);
    expect(isLevelUnlocked(initial, 2)).toBe(false);

    const afterFirstWin = campaignProgressAfterWin(initial, 1);

    expect(afterFirstWin.completedLevels).toContain(1);
    expect(afterFirstWin.highestUnlockedLevel).toBe(2);
    expect(isLevelUnlocked(afterFirstWin, 2)).toBe(true);
    expect(isLevelUnlocked(afterFirstWin, 3)).toBe(false);
  });

  it("does not unlock past the final level", () => {
    const almostDone = { highestUnlockedLevel: 24, completedLevels: Array.from({ length: 23 }, (_, index) => index + 1) };
    const afterFinalWin = campaignProgressAfterWin(almostDone, 24);

    expect(afterFinalWin.highestUnlockedLevel).toBe(24);
    expect(afterFinalWin.completedLevels).toContain(24);
  });
});
