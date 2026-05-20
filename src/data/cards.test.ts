import { describe, expect, it } from "vitest";
import { CUSTOMER_CARDS, INFLUENCE_CARDS, PRODUCT_CARDS, TAGS, TREND_CARDS, UPGRADE_CARDS } from "./cards";

describe("Trend Market card balance", () => {
  it("keeps every tag represented across products, customers, trends, and influence", () => {
    for (const tag of TAGS) {
      const productCount = PRODUCT_CARDS.filter((product) => product.tags.includes(tag)).length;
      const customerCount = CUSTOMER_CARDS.filter((customer) => customer.primaryTag === tag || customer.secondaryTag === tag).length;
      const trendCount = TREND_CARDS.filter((trend) => trend.modifiers.some((modifier) => modifier.tag === tag)).length;
      const influenceCount = INFLUENCE_CARDS.filter((card) => JSON.stringify(card.effect).includes(tag)).length;

      expect(productCount, `${tag} should appear on at least 3 products`).toBeGreaterThanOrEqual(3);
      expect(customerCount, `${tag} should appear on at least 3 customers`).toBeGreaterThanOrEqual(3);
      expect(trendCount, `${tag} should appear on at least 2 trends`).toBeGreaterThanOrEqual(2);
      expect(influenceCount, `${tag} should appear on at least 1 influence`).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses the tuned product stocks for weak and dominant products", () => {
    const stockById = Object.fromEntries(PRODUCT_CARDS.map((product) => [product.id, product.stock]));

    expect(stockById.bread).toBe(2);
    expect(stockById.cookie).toBe(2);
    expect(stockById.cheese).toBe(2);
    expect(stockById.smoothie).toBe(2);
    expect(stockById.honey).toBe(3);
  });

  it("keeps the exact customer personalities used by purchase rules", () => {
    expect(Object.fromEntries(CUSTOMER_CARDS.map((customer) => [customer.id, customer.personality]))).toEqual({
      child: { kind: "second_best", label: "Любопытный выбор", description: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", maxAppealGap: 1 },
      student: { kind: "bargain_hunter", label: "Любит скидки", description: "Дешёвые товары получают +1 привлекательности." },
      tourist: { kind: "trend_chaser", label: "Верит афишам", description: "Покупает только при заметной поддержке тренда.", minTrendScore: 2 },
      grandma: { kind: "second_best", label: "Присматривается", description: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", maxAppealGap: 1 },
      office_worker: { kind: "trend_chaser", label: "Берёт хиты дня", description: "Покупает только товары с трендовым бонусом.", minTrendScore: 2 },
      athlete: { kind: "trend_chaser", label: "Следит за модой", description: "Покупает только при сильном тренде.", minTrendScore: 3 },
      family: { kind: "bargain_hunter", label: "Семейный бюджет", description: "Дешёвые товары получают +1 привлекательности." },
      gourmet: { kind: "trend_chaser", label: "Ищет рекомендацию", description: "Покупает только при сильном тренде.", minTrendScore: 3 },
      driver: { kind: "bargain_hunter", label: "Берёт по акции", description: "Дешёвые товары получают +1 привлекательности." },
      blogger: { kind: "trend_chaser", label: "Охотится за хайпом", description: "Покупает только при сильном тренде.", minTrendScore: 3 },
      schoolkid: { kind: "bargain_hunter", label: "Копит сдачу", description: "Дешёвые товары получают +1 привлекательности." },
      sweet_tooth: { kind: "second_best", label: "Хочет сюрприз", description: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", maxAppealGap: 1 },
      farmer: { kind: "second_best", label: "Сравнивает прилавки", description: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", maxAppealGap: 1 },
      rich: { kind: "trend_chaser", label: "Покупает модное", description: "Покупает только при трендовом бонусе.", minTrendScore: 2 },
      rushing: { kind: "bargain_hunter", label: "Не любит переплаты", description: "Дешёвые товары получают +1 привлекательности." },
      vacationer: { kind: "second_best", label: "Выбирает настроение", description: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", maxAppealGap: 1 }
    });
  });

  it("keeps tag influence cards at +1 while targeted influence remains stronger", () => {
    const tagInfluences = INFLUENCE_CARDS.filter((card) => card.effect.kind === "tag_modifier");
    const showcase = INFLUENCE_CARDS.find((card) => card.id === "showcase");
    const neighborQueue = INFLUENCE_CARDS.find((card) => card.id === "neighbor_queue");

    expect(tagInfluences).toHaveLength(8);
    for (const card of tagInfluences) {
      if (card.effect.kind !== "tag_modifier") {
        throw new Error("expected tag modifier");
      }
      expect(card.description).toContain("+1");
      expect(card.effect.modifiers).toEqual([{ tag: card.effect.modifiers[0].tag, value: 1 }]);
    }
    expect(showcase?.effect).toMatchObject({ kind: "target_own_bonus", value: 2 });
    expect(neighborQueue?.effect).toMatchObject({ kind: "target_opponent_penalty", value: -2 });
  });

  it("removes negative-value and tie-only filler bonuses from playable card pools", () => {
    const upgradeIds = UPGRADE_CARDS.map((upgrade) => upgrade.id);
    const influenceIds = INFLUENCE_CARDS.map((influence) => influence.id);

    expect(upgradeIds).not.toContain("cozy_decor");
    expect(influenceIds).not.toContain("lucky_sign");
  });

  it("uses tuned upgrade costs", () => {
    const costByEffect = Object.fromEntries(UPGRADE_CARDS.map((upgrade) => [upgrade.effect, upgrade.cost]));

    expect(costByEffect.extra_shelf).toBe(9);
    expect(costByEffect.supplier).toBe(8);
    expect(costByEffect.mini_storage).toBe(5);
    expect(costByEffect.beautiful_window).toBe(4);
    expect(costByEffect.regular_customers).toBe(4);
    expect(costByEffect.bright_sign).toBe(3);
    expect(costByEffect.ad_table).toBe(6);
  });
});
