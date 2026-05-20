import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_LEVELS,
  type CampaignLevelRules,
  campaignCustomerForRules,
  campaignProgressAfterWin,
  campaignRulesForLevel,
  createDefaultCampaignProgress,
  isLevelUnlocked
} from "./levels";
import { CUSTOMER_CARDS, PRODUCT_CARDS } from "../data/cards";
import { createProductInstance, resolveCustomerPurchase } from "./engine";
import type { PlayerId, PlayerState, ProductInstance } from "./types";

const BASE_GAME_RULES: CampaignLevelRules = {
  trendCount: 3,
  partyGoalCount: 3,
  influenceHandSize: 2,
  purchaseAppealThreshold: 5,
  customerPersonalityMode: "off"
};

function rulesEqual(left: CampaignLevelRules, right: CampaignLevelRules) {
  return (
    left.trendCount === right.trendCount &&
    left.partyGoalCount === right.partyGoalCount &&
    left.influenceHandSize === right.influenceHandSize &&
    left.purchaseAppealThreshold === right.purchaseAppealThreshold &&
    left.customerPersonalityMode === right.customerPersonalityMode
  );
}

function product(id: string, instanceId = id): ProductInstance {
  const card = PRODUCT_CARDS.find((candidate) => candidate.id === id);
  if (!card) {
    throw new Error(`Missing product ${id}`);
  }
  return createProductInstance(card, instanceId);
}

function player(id: PlayerId, shelf: Array<ProductInstance | null>): PlayerState {
  return {
    id,
    name: `Player ${id}`,
    money: 0,
    sales: 0,
    shelfSlots: shelf.length,
    shelf,
    productHand: [],
    influenceHand: [],
    upgrades: [],
    planned: false,
    productActionUsed: false,
    influenceActionUsed: false,
    tableBonusUsed: false,
    color: id === "A" ? "red" : "blue"
  };
}

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

  it("uses requested safe opponent names for level five and the finale", () => {
    const levelFive = CAMPAIGN_LEVELS.find((level) => level.level === 5);
    const finalLevel = CAMPAIGN_LEVELS.find((level) => level.level === 24);

    expect(CAMPAIGN_LEVELS.some((level) => level.opponentName === "Пипа" || level.opponentNameEn === "Pipa")).toBe(false);
    expect(levelFive).toMatchObject({ opponentName: "Луми", opponentNameEn: "Lumi" });
    expect(finalLevel).toMatchObject({ opponentName: "Йода", opponentNameEn: "Yoda", opponentSpecies: "кролик" });
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

  it("uses tutorial rules for the first campaign level", () => {
    expect(campaignRulesForLevel(1)).toMatchObject({
      trendCount: 0,
      partyGoalCount: 0,
      influenceHandSize: 0,
      purchaseAppealThreshold: 3,
      customerPersonalityMode: "off"
    });
  });

  it("walks every campaign level whose rules differ from the base game", () => {
    const specialRuleRows = CAMPAIGN_LEVELS.map((level) => ({
      level: level.level,
      ...campaignRulesForLevel(level.level)
    })).filter((row) => !rulesEqual(row, BASE_GAME_RULES));

    expect(specialRuleRows).toEqual([
      { level: 1, trendCount: 0, partyGoalCount: 0, influenceHandSize: 0, purchaseAppealThreshold: 3, customerPersonalityMode: "off" },
      { level: 2, trendCount: 0, partyGoalCount: 0, influenceHandSize: 0, purchaseAppealThreshold: 3, customerPersonalityMode: "off" },
      { level: 3, trendCount: 1, partyGoalCount: 0, influenceHandSize: 0, purchaseAppealThreshold: 4, customerPersonalityMode: "off" },
      { level: 4, trendCount: 1, partyGoalCount: 1, influenceHandSize: 0, purchaseAppealThreshold: 4, customerPersonalityMode: "off" },
      { level: 5, trendCount: 2, partyGoalCount: 1, influenceHandSize: 0, purchaseAppealThreshold: 5, customerPersonalityMode: "off" },
      { level: 6, trendCount: 2, partyGoalCount: 2, influenceHandSize: 0, purchaseAppealThreshold: 5, customerPersonalityMode: "off" },
      { level: 7, trendCount: 3, partyGoalCount: 2, influenceHandSize: 1, purchaseAppealThreshold: 5, customerPersonalityMode: "off" },
      { level: 8, trendCount: 3, partyGoalCount: 3, influenceHandSize: 1, purchaseAppealThreshold: 5, customerPersonalityMode: "off" }
    ]);
  });

  it("keeps each special campaign ruleset earnable with its unlocked mechanics", () => {
    const student = CUSTOMER_CARDS.find((customer) => customer.id === "student")!;
    const primaryOnlyProduct = product("cookie", "primary-only");
    const perfectProduct = product("bread", "perfect-match");

    for (const level of CAMPAIGN_LEVELS.slice(0, 8)) {
      const rules = campaignRulesForLevel(level.level);
      const campaignCustomer = campaignCustomerForRules(student, rules);
      const sellableProduct = rules.purchaseAppealThreshold <= 3 ? primaryOnlyProduct : perfectProduct;

      const result = resolveCustomerPurchase({
        customer: campaignCustomer,
        players: [player("A", [sellableProduct]), player("B", [null])],
        trends: [],
        influences: [],
        roundBonuses: [],
        firstPlayer: "A",
        customerIndex: 0,
        round: 1,
        rules: { appealThreshold: rules.purchaseAppealThreshold }
      });

      expect(result.winner?.ownerId, `level ${level.level}`).toBe("A");
      expect(result.winner?.payout, `level ${level.level}`).toBe(sellableProduct.price);
    }
  });

  it("ramps campaign rules without hidden unavailable requirements", () => {
    const trendChaser = CUSTOMER_CARDS.find((customer) => customer.personality?.kind === "trend_chaser")!;
    const modeRank = { off: 0, simple: 1, all: 2 } satisfies Record<CampaignLevelRules["customerPersonalityMode"], number>;
    let previous = campaignRulesForLevel(1);

    for (const level of CAMPAIGN_LEVELS.slice(1, 9)) {
      const current = campaignRulesForLevel(level.level);

      expect(current.trendCount - previous.trendCount, `trend jump at level ${level.level}`).toBeLessThanOrEqual(1);
      expect(current.partyGoalCount - previous.partyGoalCount, `goal jump at level ${level.level}`).toBeLessThanOrEqual(1);
      expect(current.influenceHandSize - previous.influenceHandSize, `influence jump at level ${level.level}`).toBeLessThanOrEqual(1);
      expect(current.purchaseAppealThreshold - previous.purchaseAppealThreshold, `threshold jump at level ${level.level}`).toBeLessThanOrEqual(1);
      expect(modeRank[current.customerPersonalityMode] - modeRank[previous.customerPersonalityMode], `personality jump at level ${level.level}`).toBeLessThanOrEqual(1);

      if (current.trendCount < BASE_GAME_RULES.trendCount) {
        expect(campaignCustomerForRules(trendChaser, current).personality, `level ${level.level}`).toBeUndefined();
      }

      previous = current;
    }
  });

  it("removes personalities that depend on locked campaign systems", () => {
    const trendChaser = CUSTOMER_CARDS.find((customer) => customer.personality?.kind === "trend_chaser")!;
    const bargainHunter = CUSTOMER_CARDS.find((customer) => customer.personality?.kind === "bargain_hunter")!;

    expect(campaignCustomerForRules(trendChaser, campaignRulesForLevel(1)).personality).toBeUndefined();
    expect(campaignCustomerForRules(bargainHunter, campaignRulesForLevel(1)).personality).toBeUndefined();
    expect(campaignCustomerForRules(trendChaser, campaignRulesForLevel(2)).personality).toBeUndefined();
    expect(campaignCustomerForRules(bargainHunter, campaignRulesForLevel(2)).personality).toBeUndefined();
  });

  it("keeps the old personality progression available for DLC-enabled rules", () => {
    const trendChaser = CUSTOMER_CARDS.find((customer) => customer.personality?.kind === "trend_chaser")!;
    const bargainHunter = CUSTOMER_CARDS.find((customer) => customer.personality?.kind === "bargain_hunter")!;

    expect(campaignRulesForLevel(2, { customerPersonalitiesEnabled: true }).customerPersonalityMode).toBe("simple");
    expect(campaignRulesForLevel(8, { customerPersonalitiesEnabled: true }).customerPersonalityMode).toBe("all");
    expect(campaignCustomerForRules(trendChaser, campaignRulesForLevel(2, { customerPersonalitiesEnabled: true })).personality).toBeUndefined();
    expect(campaignCustomerForRules(bargainHunter, campaignRulesForLevel(2, { customerPersonalitiesEnabled: true })).personality).toBe(bargainHunter.personality);
    expect(campaignCustomerForRules(trendChaser, campaignRulesForLevel(8, { customerPersonalitiesEnabled: true })).personality).toBe(trendChaser.personality);
  });
});
