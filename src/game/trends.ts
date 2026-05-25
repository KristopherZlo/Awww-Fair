import type { TrendCard } from "./types";

function modifierSign(value: number) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

export function trendsContradict(left: TrendCard, right: TrendCard) {
  return left.modifiers.some((leftModifier) =>
    right.modifiers.some((rightModifier) => leftModifier.tag === rightModifier.tag && modifierSign(leftModifier.value) + modifierSign(rightModifier.value) === 0)
  );
}

function isCompatibleWithActive(candidate: TrendCard, activeTrends: TrendCard[]) {
  return activeTrends.every((trend) => !trendsContradict(candidate, trend));
}

export function drawCompatibleTrends(deck: TrendCard[], count: number, activeTrends: TrendCard[] = []): [TrendCard[], TrendCard[]] {
  const selected: TrendCard[] = [];
  const rest: TrendCard[] = [];

  for (const trend of deck) {
    if (selected.length < count && isCompatibleWithActive(trend, [...activeTrends, ...selected])) {
      selected.push(trend);
    } else {
      rest.push(trend);
    }
  }

  return [selected, rest];
}
