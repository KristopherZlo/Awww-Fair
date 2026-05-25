import { describe, expect, it } from "vitest";
import { CUSTOMER_CARDS, PRODUCT_CARDS } from "../data/cards";
import type { ProductCard, ProductInstance } from "../game/types";
import type { GameState } from "./types";
import { normalizeSavedGameState } from "./persistence";

function productInstance(card: ProductCard, suffix: string): ProductInstance {
  return {
    instanceId: `${card.id}-${suffix}`,
    cardId: card.id,
    name: card.name,
    type: card.type,
    tags: card.tags,
    price: card.price,
    stock: card.stock,
    baseStock: card.stock,
    sprite: card.sprite
  };
}

function savedStateWithPersonalitySale(): GameState {
  const customer = CUSTOMER_CARDS.find((candidate) => candidate.id === "office_worker")!;
  const product = productInstance(PRODUCT_CARDS.find((candidate) => candidate.id === "coffee")!, "saved");
  const candidate = {
    ownerId: "A" as const,
    slotIndex: 0,
    product,
    appeal: {
      total: 4,
      breakdown: [
        { label: "главное желание: напиток", value: 3 },
        { label: "характер: берёт хиты дня", value: 1 }
      ]
    },
    trendScore: 0,
    requirements: [{ kind: "trend_score" as const, actual: 0, required: 2, passed: false }]
  };
  const result = {
    customer,
    appealThreshold: 5,
    candidates: [candidate],
    eligible: [],
    winner: null,
    personalityChoice: {
      kind: "second_best" as const,
      applied: true,
      appealGap: 1,
      maxAppealGap: 1,
      firstChoice: { ownerId: "A" as const, slotIndex: 0, productInstanceId: product.instanceId },
      secondChoice: { ownerId: "A" as const, slotIndex: 0, productInstanceId: product.instanceId }
    }
  };

  return {
    phase: "planning",
    round: 1,
    firstPlayer: "A",
    activePlayer: "A",
    players: [
      {
        id: "A",
        name: "A",
        money: 0,
        sales: 0,
        shelfSlots: 3,
        shelf: [product, null, null],
        productHand: [],
        influenceHand: [],
        upgrades: [],
        planned: false,
        productActionUsed: false,
        influenceActionUsed: false,
        tableBonusUsed: false,
        color: "red"
      },
      {
        id: "B",
        name: "B",
        money: 0,
        sales: 0,
        shelfSlots: 3,
        shelf: [null, null, null],
        productHand: [],
        influenceHand: [],
        upgrades: [],
        planned: false,
        productActionUsed: false,
        influenceActionUsed: false,
        tableBonusUsed: false,
        color: "blue"
      }
    ],
    productDeck: [],
    influenceDeck: [],
    customerDeck: [customer],
    trendDeck: [],
    upgradeDeck: [],
    activeTrends: [],
    currentCustomers: [customer],
    playedInfluences: [],
    roundBonuses: [],
    saleResults: [result],
    saleInsights: [],
    lastSaleReview: {
      round: 1,
      results: [result],
      insights: []
    },
    logs: [],
    selectedProductId: null,
    selectedInfluenceId: null,
    selectedTag: "сладкое",
    upgradeOffer: [],
    upgradeQueue: [],
    choiceDraft: null,
    pause: { active: false, pausedBy: null },
    partyGoals: [],
    sound: true,
    aiPlayerId: null,
    aiMode: null,
    aiDifficulty: null,
    aiScore: 0,
    aiIntent: null,
    campaignRun: null,
    turnTimeSeconds: 45
  };
}

describe("normalizeSavedGameState", () => {
  it("removes customer personality effects from restored standard games", () => {
    const normalized = normalizeSavedGameState(savedStateWithPersonalitySale());

    expect(normalized.currentCustomers.every((customer) => !customer.personality)).toBe(true);
    expect(normalized.customerDeck.every((customer) => !customer.personality)).toBe(true);
    expect(normalized.saleResults[0].customer.personality).toBeUndefined();
    expect(normalized.saleResults[0].candidates[0].appeal.breakdown.some((line) => line.label.startsWith("характер"))).toBe(false);
    expect(normalized.saleResults[0].candidates[0].appeal.total).toBe(3);
    expect(normalized.saleResults[0].candidates[0].requirements).toBeUndefined();
    expect(normalized.saleResults[0].personalityChoice).toBeUndefined();
    expect(normalized.lastSaleReview?.results[0].candidates[0].requirements).toBeUndefined();
    expect(normalized.lastSaleReview?.results[0].personalityChoice).toBeUndefined();
  });
});
