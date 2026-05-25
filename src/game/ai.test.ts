import { describe, expect, it } from "vitest";
import { CUSTOMER_CARDS, INFLUENCE_CARDS, PRODUCT_CARDS, TREND_CARDS, UPGRADE_CARDS } from "../data/cards";
import { createProductInstance } from "./engine";
import { chooseAiProductChoice, chooseAiUpgrade, planAiPlanningTurn, planAiPlanningTurnForDifficulty, planWeakAiPlanningTurn } from "./ai";
import type { InfluenceCard, PlayerId, PlayerState, ProductInstance, UpgradeCard } from "./types";

function product(id: string, instanceId = id): ProductInstance {
  const card = PRODUCT_CARDS.find((candidate) => candidate.id === id);
  if (!card) {
    throw new Error(`Missing product ${id}`);
  }
  return createProductInstance(card, instanceId);
}

function influence(id: string): InfluenceCard {
  const card = INFLUENCE_CARDS.find((candidate) => candidate.id === id);
  if (!card) {
    throw new Error(`Missing influence ${id}`);
  }
  return card;
}

function upgrade(id: string): UpgradeCard {
  const card = UPGRADE_CARDS.find((candidate) => candidate.id === id);
  if (!card) {
    throw new Error(`Missing upgrade ${id}`);
  }
  return card;
}

function player(id: PlayerId, shelf: Array<ProductInstance | null>, productHand: ProductInstance[], influenceHand: InfluenceCard[] = []): PlayerState {
  return {
    id,
    name: `Player ${id}`,
    money: 0,
    sales: 0,
    shelfSlots: shelf.length,
    shelf,
    productHand,
    influenceHand,
    upgrades: [],
    planned: false,
    productActionUsed: false,
    influenceActionUsed: false,
    tableBonusUsed: false,
    color: id === "A" ? "red" : "blue"
  };
}

describe("AI planner", () => {
  it("rewards a useful product and influence plan", () => {
    const plan = planAiPlanningTurn(
      {
        players: [
          player("A", [null, null, null], []),
          player("B", [null, null, null], [product("bread", "bread-1"), product("cake", "cake-1")], [influence("sweet_smell")])
        ],
        currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
        activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "sweet_day")!],
        playedInfluences: [],
        roundBonuses: [],
        productDeckLength: 3,
        influenceDeckLength: 3
      },
      "B"
    );

    expect(plan.productMove?.productInstanceId).toBe("cake-1");
    expect(plan.productMove?.slotIndex).toBe(0);
    expect(plan.influenceMove?.cardId).toBe("sweet_smell");
    expect(plan.scoreDelta).toBeGreaterThan(0);
  });

  it("penalizes a weak product and influence situation", () => {
    const plan = planAiPlanningTurn(
      {
        players: [
          player("A", [null], []),
          player("B", [product("toy", "toy-on-shelf")], [product("bread", "bread-1")], [influence("bad_ads")])
        ],
        currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
        activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "kids_day")!],
        playedInfluences: [],
        roundBonuses: [],
        productDeckLength: 0,
        influenceDeckLength: 0
      },
      "B"
    );

    expect(plan.productMove).toBeNull();
    expect(plan.influenceMove).toBeNull();
    expect(plan.scoreDelta).toBeLessThan(0);
  });

  it("chooses the highest value affordable upgrade", () => {
    const buyer = player("B", [null, null, null], []);
    buyer.money = 9;

    const choice = chooseAiUpgrade(
      buyer,
      ["regular_customers", "extra_shelf", "bright_sign"].map((id) => UPGRADE_CARDS.find((candidate) => candidate.id === id)!)
    );

    expect(choice?.upgradeId).toBe("extra_shelf");
    expect(choice?.score).toBeGreaterThan(0);
  });

  it("uses the ad table when +1 appeal turns an unserved customer into a buyer", () => {
    const adTablePlayer = player("B", [product("cake", "cake-on-shelf"), null, null], [], []);
    adTablePlayer.upgrades = [upgrade("ad_table")];

    const plan = planAiPlanningTurn(
      {
        players: [player("A", [null, null, null], []), adTablePlayer],
        currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
        activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "sweet_day")!],
        playedInfluences: [],
        roundBonuses: [],
        productDeckLength: 3,
        influenceDeckLength: 3
      },
      "B"
    );

    expect(plan.tableBonusMove).toEqual({ slotIndex: 0, score: expect.any(Number) });
    expect(plan.scoreDelta).toBeGreaterThan(0);
  });

  it("does not replace a higher payout winning shelf product with a lower payout product", () => {
    const plan = planAiPlanningTurn(
      {
        players: [
          player("A", [null], []),
          player("B", [product("toy", "toy-on-shelf")], [product("smoothie", "smoothie-1")])
        ],
        currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
        activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "kids_day")!],
        playedInfluences: [],
        roundBonuses: [],
        productDeckLength: 0,
        influenceDeckLength: 0
      },
      "B"
    );

    expect(plan.productMove).toBeNull();
  });

  it("chooses drawn products by exact sale payout, not only tag value", () => {
    const aiPlayer = player("B", [null], []);
    const choice = chooseAiProductChoice(
      {
        players: [player("A", [null], []), aiPlayer],
        currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
        activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "kids_day")!],
        playedInfluences: [],
        roundBonuses: [],
        productDeckLength: 0,
        influenceDeckLength: 0
      },
      aiPlayer,
      [product("smoothie", "smoothie-choice"), product("toy", "toy-choice")]
    );

    expect(choice?.cardId).toBe("toy-choice");
  });

  it("can intentionally choose a weaker product plan for training mode", () => {
    const input = {
      players: [
        player("A", [null, null, null], []),
        player("B", [null, null, null], [product("bread", "bread-1"), product("cake", "cake-1")], [influence("sweet_smell")])
      ],
      currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
      activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "sweet_day")!],
      playedInfluences: [],
      roundBonuses: [],
      productDeckLength: 3,
      influenceDeckLength: 3
    };

    const strong = planAiPlanningTurn(input, "B");
    const weak = planWeakAiPlanningTurn(input, "B");

    expect(strong.productMove?.productInstanceId).toBe("cake-1");
    expect(weak.productMove?.productInstanceId).toBe("bread-1");
    expect(weak.influenceMove).toBeNull();
    expect(weak.scoreDelta).toBeLessThan(strong.scoreDelta);
  });

  it("fills empty shelf slots before making intentionally bad replacements in weak plans", () => {
    const plan = planWeakAiPlanningTurn(
      {
        players: [
          player("A", [null, null, null], []),
          player("B", [product("toy", "toy-on-shelf"), null, null], [product("bread", "bread-1"), product("cookie", "cookie-1")])
        ],
        currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
        activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "kids_day")!],
        playedInfluences: [],
        roundBonuses: [],
        productDeckLength: 3,
        influenceDeckLength: 3
      },
      "B"
    );

    expect(plan.productMove?.slotIndex).not.toBe(0);
    expect(plan.productMove?.slotIndex).toBeGreaterThan(0);
  });

  it("uses weak plans for early campaign levels and full plans for later levels", () => {
    const input = {
      players: [
        player("A", [null, null, null], []),
        player("B", [null, null, null], [product("bread", "bread-1"), product("cake", "cake-1")], [influence("sweet_smell")])
      ],
      currentCustomers: [CUSTOMER_CARDS.find((candidate) => candidate.id === "child")!],
      activeTrends: [TREND_CARDS.find((candidate) => candidate.id === "sweet_day")!],
      playedInfluences: [],
      roundBonuses: [],
      productDeckLength: 3,
      influenceDeckLength: 3
    };

    const earlyLevel = planAiPlanningTurnForDifficulty(input, "B", 3);
    const lateLevel = planAiPlanningTurnForDifficulty(input, "B", 18);

    expect(earlyLevel.influenceMove).toBeNull();
    expect(lateLevel.influenceMove?.cardId).toBe("sweet_smell");
    expect(lateLevel.scoreDelta).toBeGreaterThan(earlyLevel.scoreDelta);
  });
});
