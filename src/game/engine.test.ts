import { describe, expect, it } from "vitest";
import { calculateAppeal, LATE_ROUND_BONUS_ROUND, PURCHASE_APPEAL_THRESHOLD, resolveCustomerPurchase, TIP_APPEAL_THRESHOLD } from "./engine";
import type { CustomerCard, PlayerState, ProductInstance, TrendCard } from "./types";

const toy: ProductInstance = {
  instanceId: "toy-1",
  cardId: "toy",
  name: "Игрушка",
  type: "product",
  tags: ["детское", "дорогое"],
  price: 5,
  stock: 1,
  baseStock: 1,
  sprite: { col: 1, row: 1 }
};

const cake: ProductInstance = {
  instanceId: "cake-1",
  cardId: "cake",
  name: "Торт",
  type: "product",
  tags: ["сладкое", "дорогое"],
  price: 4,
  stock: 2,
  baseStock: 2,
  sprite: { col: 2, row: 0 }
};

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

const trends: TrendCard[] = [
  {
    id: "sweet_day",
    name: "Сладкий день",
    type: "trend",
    modifiers: [{ tag: "сладкое", value: 1 }]
  },
  {
    id: "kids_day",
    name: "День детей",
    type: "trend",
    modifiers: [{ tag: "детское", value: 2 }]
  }
];

function player(id: "A" | "B", money: number, shelf: Array<ProductInstance | null>): PlayerState {
  return {
    id,
    name: `Игрок ${id}`,
    money,
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

describe("Trend Market engine", () => {
  it("adds customer tag matches and active trend modifiers to appeal breakdown", () => {
    const result = calculateAppeal({
      product: toy,
      ownerId: "B",
      slotIndex: 0,
      customer: child,
      trends,
      influences: [],
      ownerUpgrades: [],
      roundBonuses: []
    });

    expect(result.total).toBe(5);
    expect(result.breakdown.map((line) => line.value)).toEqual([3, 2]);
  });

  it("boosts only the first active trend as the focus trend", () => {
    const focusedKidsTrends: TrendCard[] = [
      {
        id: "kids_day",
        name: "День детей",
        type: "trend",
        modifiers: [{ tag: "детское", value: 2 }]
      },
      {
        id: "luxury_evening",
        name: "Роскошный вечер",
        type: "trend",
        modifiers: [{ tag: "дорогое", value: 2 }]
      }
    ];

    const result = calculateAppeal({
      product: toy,
      ownerId: "B",
      slotIndex: 0,
      customer: child,
      trends: focusedKidsTrends,
      influences: [],
      ownerUpgrades: [],
      roundBonuses: []
    });

    expect(result.breakdown).toEqual([
      { label: "главное желание: детское", value: 3 },
      { label: "День детей: детское (главный тренд)", value: 3 },
      { label: "Роскошный вечер: дорогое", value: 2 }
    ]);
    expect(result.total).toBe(8);
  });

  it("resolves ties by cheaper product before player money or first player marker", () => {
    const result = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 10, [cake]), player("B", 1, [toy])],
      trends: [
        {
          id: "sweet_day",
          name: "Сладкий день",
          type: "trend",
          modifiers: [{ tag: "сладкое", value: 1 }]
        }
      ],
      influences: [],
      roundBonuses: [
        { ownerId: "A", slotIndex: 0, value: 1, label: "Тестовый минимум" },
        { ownerId: "B", slotIndex: 0, value: 2, label: "Тестовый минимум" }
      ],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    expect(result.winner?.ownerId).toBe("A");
    expect(result.winner?.product.name).toBe("Торт");
    expect(result.winner?.appeal.total).toBe(5);
  });

  it("lets a tie-preference influence win an equal appeal before cheaper product tiebreaker", () => {
    const result = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 10, [cake]), player("B", 1, [toy])],
      trends: [],
      influences: [{ id: "lucky_sign", name: "Удачная вывеска", ownerId: "B", tieOwner: "B" }],
      roundBonuses: [
        { ownerId: "A", slotIndex: 0, value: 3, label: "Тестовое равенство" },
        { ownerId: "B", slotIndex: 0, value: 2, label: "Тестовое равенство" }
      ],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    expect(result.winner?.ownerId).toBe("B");
    expect(result.winner?.product.name).toBe("Игрушка");
  });

  it("adds a bargain hunter personality bonus to cheap products", () => {
    const bargainCustomer = {
      ...child,
      personality: {
        kind: "bargain_hunter",
        label: "Любит скидки",
        description: "Дешёвые товары получают +1 привлекательности."
      }
    } as CustomerCard;

    const result = calculateAppeal({
      product: cookie,
      ownerId: "A",
      slotIndex: 0,
      customer: bargainCustomer,
      trends: [],
      influences: [],
      ownerUpgrades: [],
      roundBonuses: []
    });

    expect(result.breakdown).toContainEqual({ label: "характер: любит скидки", value: 1 });
    expect(result.total).toBe(4);
  });

  it("makes trend chaser customers buy only when a product has enough trend appeal", () => {
    const trendCustomer = {
      ...child,
      personality: {
        kind: "trend_chaser",
        label: "Следит за модой",
        description: "Покупает только товары с заметным трендовым бонусом.",
        minTrendScore: 2
      }
    } as CustomerCard;

    const withoutTrend = resolveCustomerPurchase({
      customer: trendCustomer,
      players: [player("A", 0, [toy])],
      trends: [],
      influences: [],
      roundBonuses: [],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    const withTrend = resolveCustomerPurchase({
      customer: trendCustomer,
      players: [player("A", 0, [toy])],
      trends: [
        {
          id: "kids_day",
          name: "День детей",
          type: "trend",
          modifiers: [{ tag: "детское", value: 2 }]
        }
      ],
      influences: [],
      roundBonuses: [],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    expect(withoutTrend.winner).toBeNull();
    expect(withTrend.winner?.product.name).toBe("Игрушка");
  });

  it("lets curious customers pick the second-best product when scores are close", () => {
    const curiousCustomer = {
      ...child,
      personality: {
        kind: "second_best",
        label: "Любопытный выбор",
        description: "Иногда берёт второй вариант, если он почти не хуже.",
        maxAppealGap: 1
      }
    } as CustomerCard;

    const result = resolveCustomerPurchase({
      customer: curiousCustomer,
      players: [player("A", 10, [toy]), player("B", 10, [cake])],
      trends: [],
      influences: [],
      roundBonuses: [
        { ownerId: "A", slotIndex: 0, value: 3, label: "Тестовый лидер" },
        { ownerId: "B", slotIndex: 0, value: 3, label: "Тестовый минимум" }
      ],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    expect(result.winner?.ownerId).toBe("B");
    expect(result.winner?.product.name).toBe("Торт");
  });

  it("rejects purchases below minimum appeal and leaves the customer unserved", () => {
    const result = resolveCustomerPurchase({
      customer: {
        id: "office_worker",
        name: "Офисник",
        type: "customer",
        primaryTag: "напиток",
        secondaryTag: "быстрое",
        sprite: { col: 0, row: 1 }
      },
      players: [player("A", 0, [cake]), player("B", 0, [toy])],
      trends: [],
      influences: [],
      roundBonuses: [],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    expect(result.winner).toBeNull();
  });

  it("requires at least 5 appeal before a customer buys", () => {
    const belowThreshold = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 0, [toy])],
      trends: [],
      influences: [],
      roundBonuses: [{ ownerId: "A", slotIndex: 0, value: 1, label: "Тестовый бонус" }],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });
    const atThreshold = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 0, [toy])],
      trends: [
        {
          id: "kids_day",
          name: "День детей",
          type: "trend",
          modifiers: [{ tag: "детское", value: 1 }]
        }
      ],
      influences: [],
      roundBonuses: [],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    expect(PURCHASE_APPEAL_THRESHOLD).toBe(5);
    expect(belowThreshold.candidates[0].appeal.total).toBe(4);
    expect(belowThreshold.winner).toBeNull();
    expect(atThreshold.candidates[0].appeal.total).toBe(5);
    expect(atThreshold.winner?.product.name).toBe("Игрушка");
  });

  it("awards tips only from 9 appeal", () => {
    const eightAppeal = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 0, [toy])],
      trends: [
        {
          id: "kids_day",
          name: "День детей",
          type: "trend",
          modifiers: [{ tag: "детское", value: 2 }]
        }
      ],
      influences: [],
      roundBonuses: [{ ownerId: "A", slotIndex: 0, value: 2, label: "Тестовый бонус" }],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });
    const nineAppeal = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 0, [toy])],
      trends: [
        {
          id: "kids_day",
          name: "День детей",
          type: "trend",
          modifiers: [{ tag: "детское", value: 2 }]
        }
      ],
      influences: [],
      roundBonuses: [{ ownerId: "A", slotIndex: 0, value: 3, label: "Тестовый бонус" }],
      firstPlayer: "A",
      customerIndex: 0,
      round: 1
    });

    expect(TIP_APPEAL_THRESHOLD).toBe(9);
    expect(eightAppeal.winner?.appeal.total).toBe(8);
    expect(eightAppeal.winner?.tip).toBe(0);
    expect(nineAppeal.winner?.appeal.total).toBe(9);
    expect(nineAppeal.winner?.tip).toBe(1);
  });

  it("adds the late-round payout bonus only in round 8", () => {
    const roundSeven = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 0, [toy])],
      trends: [],
      influences: [],
      roundBonuses: [{ ownerId: "A", slotIndex: 0, value: 2, label: "Тестовый минимум" }],
      firstPlayer: "A",
      customerIndex: 0,
      round: 7
    });
    const roundEight = resolveCustomerPurchase({
      customer: child,
      players: [player("A", 0, [toy])],
      trends: [],
      influences: [],
      roundBonuses: [{ ownerId: "A", slotIndex: 0, value: 2, label: "Тестовый минимум" }],
      firstPlayer: "A",
      customerIndex: 0,
      round: 8
    });

    expect(LATE_ROUND_BONUS_ROUND).toBe(8);
    expect(roundSeven.winner?.lateRoundBonus).toBe(0);
    expect(roundEight.winner?.lateRoundBonus).toBe(1);
  });
});
