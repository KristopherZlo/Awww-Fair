import { describe, expect, it } from "vitest";
import { PRODUCT_CARDS, TREND_CARDS } from "../data/cards";
import {
  createPartyGoalCombinations,
  createPartyGoalPool,
  createPartyGoals,
  isValidPartyGoalSet,
  PARTY_GOAL_REWARD,
  updatePartyGoalsAfterSales,
  type PartyGoal
} from "./goals";
import type { CustomerCard, PlayedInfluence, ProductInstance, PurchaseResult } from "./types";

const cookie: ProductInstance = {
  instanceId: "cookie-1",
  cardId: "cookie",
  name: "Печенье",
  type: "product",
  tags: ["детское", "дешёвое"],
  price: 2,
  stock: 3,
  baseStock: 3,
  sprite: { col: 2, row: 1 }
};

const child: CustomerCard = {
  id: "child",
  name: "Ребёнок",
  type: "customer",
  primaryTag: "детское",
  secondaryTag: "сладкое",
  sprite: { col: 0, row: 0 }
};

function soldToA(product = cookie): PurchaseResult {
  return {
    customer: child,
    candidates: [],
    eligible: [],
    winner: {
      ownerId: "A",
      slotIndex: 0,
      product,
      appeal: { total: 4, breakdown: [] },
      payout: product.price,
      tip: 0,
      lateRoundBonus: 0,
      regularCustomerBonus: 0,
      preserveStock: false
    }
  };
}

describe("party goals", () => {
  it("returns a small coin reward once when a goal is completed", () => {
    const goals: PartyGoal[] = [
      {
        id: "clean-sale",
        title: "Продажа без влияний",
        kind: "no_influence_sale",
        target: 1,
        progress: 0,
        completed: false,
        reward: PARTY_GOAL_REWARD,
        rewardClaimed: false
      }
    ];

    const firstUpdate = updatePartyGoalsAfterSales(goals, [soldToA()], []);
    const secondUpdate = updatePartyGoalsAfterSales(firstUpdate.goals, [soldToA()], []);

    expect(firstUpdate.goals[0]).toMatchObject({ progress: 1, completed: true, rewardClaimed: true, completedBy: "A" });
    expect(firstUpdate.rewards).toEqual([{ playerId: "A", amount: PARTY_GOAL_REWARD, goalTitle: "Продажа без влияний" }]);
    expect(secondUpdate.rewards).toEqual([]);
  });

  it("does not complete a clean-sale goal when the seller played an influence card", () => {
    const goals: PartyGoal[] = [
      {
        id: "clean-sale",
        title: "Продажа без влияний",
        kind: "no_influence_sale",
        target: 1,
        progress: 0,
        completed: false,
        reward: PARTY_GOAL_REWARD,
        rewardClaimed: false
      }
    ];
    const playedInfluences: PlayedInfluence[] = [{ id: "coupons", name: "Купоны", ownerId: "A" }];

    const update = updatePartyGoalsAfterSales(goals, [soldToA()], playedInfluences);

    expect(update.goals[0].completed).toBe(false);
    expect(update.rewards).toEqual([]);
  });

  it("lets a clean-sale goal complete when only the opponent played influence cards", () => {
    const goals: PartyGoal[] = [
      {
        id: "clean-sale",
        title: "Продажа без своего влияния",
        kind: "no_influence_sale",
        target: 1,
        progress: 0,
        completed: false,
        reward: PARTY_GOAL_REWARD,
        rewardClaimed: false
      }
    ];
    const opponentInfluence: PlayedInfluence[] = [{ id: "coupons", name: "Купоны", ownerId: "B" }];

    const update = updatePartyGoalsAfterSales(goals, [soldToA()], opponentInfluence);

    expect(update.goals[0]).toMatchObject({ completed: true, completedBy: "A" });
    expect(update.rewards).toEqual([{ playerId: "A", amount: PARTY_GOAL_REWARD, goalTitle: "Продажа без своего влияния" }]);
  });

  it("creates different valid random party goal sets from the same market setup", () => {
    const firstGoals = createPartyGoals([TREND_CARDS.find((trend) => trend.id === "kids_day")!], [child], () => 0);
    const laterGoals = createPartyGoals([TREND_CARDS.find((trend) => trend.id === "kids_day")!], [child], () => 0.99);

    expect(firstGoals).toHaveLength(3);
    expect(laterGoals).toHaveLength(3);
    expect(firstGoals.map((goal) => goal.id)).not.toEqual(laterGoals.map((goal) => goal.id));
    expect(isValidPartyGoalSet(firstGoals)).toBe(true);
    expect(isValidPartyGoalSet(laterGoals)).toBe(true);
  });

  it("keeps every generated goal tied to products that exist in the game", () => {
    const productTags = new Set(PRODUCT_CARDS.flatMap((product) => product.tags));
    const pool = createPartyGoalPool([TREND_CARDS.find((trend) => trend.id === "kids_day")!], [child]);

    expect(pool.length).toBeGreaterThan(6);
    for (const goal of pool) {
      if (goal.tag) {
        expect(productTags.has(goal.tag), `${goal.title} should use an existing product tag`).toBe(true);
      }
    }
  });

  it("validates every possible party goal combination from the pool", () => {
    const pool = createPartyGoalPool([TREND_CARDS.find((trend) => trend.id === "kids_day")!], [child]);
    const combinations = createPartyGoalCombinations(pool, 3);

    expect(combinations.length).toBeGreaterThan(1);
    for (const goals of combinations) {
      expect(isValidPartyGoalSet(goals)).toBe(true);
      expect(() => updatePartyGoalsAfterSales(goals, [soldToA()], [])).not.toThrow();
    }
  });
});
