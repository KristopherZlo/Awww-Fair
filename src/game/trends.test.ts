import { describe, expect, it } from "vitest";
import { TREND_CARDS } from "../data/cards";
import { drawCompatibleTrends, trendsContradict } from "./trends";

describe("trend selection", () => {
  it("detects opposite modifiers on the same tag as a contradiction", () => {
    const discountDay = TREND_CARDS.find((trend) => trend.id === "discount_day")!;
    const luxuryEvening = TREND_CARDS.find((trend) => trend.id === "luxury_evening")!;

    expect(trendsContradict(discountDay, luxuryEvening)).toBe(true);
  });

  it("draws initial active trends without positive and negative modifiers for the same tag", () => {
    const deck = [
      TREND_CARDS.find((trend) => trend.id === "discount_day")!,
      TREND_CARDS.find((trend) => trend.id === "luxury_evening")!,
      TREND_CARDS.find((trend) => trend.id === "kids_day")!,
      TREND_CARDS.find((trend) => trend.id === "sweet_day")!
    ];

    const [selected, rest] = drawCompatibleTrends(deck, 3);

    expect(selected.map((trend) => trend.id)).toEqual(["discount_day", "kids_day", "sweet_day"]);
    expect(rest.map((trend) => trend.id)).toEqual(["luxury_evening"]);
  });

  it("uses the same compatibility rule when previewing or drawing the next shifted trend", () => {
    const shiftedActive = [TREND_CARDS.find((trend) => trend.id === "discount_day")!];
    const deck = [
      TREND_CARDS.find((trend) => trend.id === "luxury_evening")!,
      TREND_CARDS.find((trend) => trend.id === "kids_day")!
    ];

    const [selected, rest] = drawCompatibleTrends(deck, 1, shiftedActive);

    expect(selected.map((trend) => trend.id)).toEqual(["kids_day"]);
    expect(rest.map((trend) => trend.id)).toEqual(["luxury_evening"]);
  });
});
