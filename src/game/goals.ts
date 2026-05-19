import type { CustomerCard, PlayedInfluence, PlayerId, PurchaseResult, Tag, TrendCard } from "./types";

export const PARTY_GOAL_REWARD = 2;

export type PartyGoalKind = "tag_sales" | "tag_money" | "no_influence_sale" | "sale_streak" | "price_sale";

export interface PartyGoal {
  id: string;
  title: string;
  kind: PartyGoalKind;
  target: number;
  progress: number;
  completed: boolean;
  reward: number;
  rewardClaimed: boolean;
  completedBy?: PlayerId | null;
  tag?: Tag;
  minPrice?: number;
  maxPrice?: number;
}

export interface PartyGoalReward {
  playerId: PlayerId;
  amount: number;
  goalTitle: string;
}

type RandomSource = () => number;

const FALLBACK_GOAL_TAGS: Tag[] = ["дорогое", "дешёвое", "напиток", "сладкое", "местное", "свежее", "быстрое", "детское"];

const TAG_MONEY_TARGETS: Partial<Record<Tag, number>> = {
  дорогое: 18,
  дешёвое: 10,
  напиток: 12,
  сладкое: 14,
  местное: 14,
  свежее: 12,
  быстрое: 12,
  детское: 12
};

function createGoal(goal: Omit<PartyGoal, "progress" | "completed" | "reward" | "rewardClaimed">): PartyGoal {
  return {
    ...goal,
    progress: 0,
    completed: false,
    reward: PARTY_GOAL_REWARD,
    rewardClaimed: false
  };
}

export function normalizePartyGoal(goal: PartyGoal): PartyGoal {
  return {
    ...goal,
    reward: typeof goal.reward === "number" ? goal.reward : PARTY_GOAL_REWARD,
    rewardClaimed: typeof goal.rewardClaimed === "boolean" ? goal.rewardClaimed : goal.completed,
    completedBy: goal.completedBy ?? null
  };
}

function relevantGoalTags(activeTrends: TrendCard[], currentCustomers: CustomerCard[]): Tag[] {
  const tags = new Set<Tag>();
  activeTrends.forEach((trend) => {
    trend.modifiers.forEach((modifier) => {
      if (modifier.value > 0) {
        tags.add(modifier.tag);
      }
    });
  });
  currentCustomers.forEach((customer) => {
    tags.add(customer.primaryTag);
    tags.add(customer.secondaryTag);
  });
  FALLBACK_GOAL_TAGS.forEach((tag) => tags.add(tag));
  return [...tags];
}

function uniqueGoals(goals: PartyGoal[]): PartyGoal[] {
  const seen = new Set<string>();
  return goals.filter((goal) => {
    if (seen.has(goal.id)) {
      return false;
    }
    seen.add(goal.id);
    return true;
  });
}

export function createPartyGoalPool(activeTrends: TrendCard[], currentCustomers: CustomerCard[]): PartyGoal[] {
  const tags = relevantGoalTags(activeTrends, currentCustomers);
  const tagGoals = tags.flatMap((tag) => [
    createGoal({
      id: `tag-sales-${tag}`,
      title: `Продайте 2 товара с тегом «${tag}»`,
      kind: "tag_sales",
      tag,
      target: 2
    }),
    createGoal({
      id: `tag-money-${tag}`,
      title: `Заработайте ${TAG_MONEY_TARGETS[tag] ?? 12} монет на товарах с тегом «${tag}»`,
      kind: "tag_money",
      tag,
      target: TAG_MONEY_TARGETS[tag] ?? 12
    })
  ]);

  return uniqueGoals([
    ...tagGoals,
    createGoal({
      id: "clean-sale",
      title: "Получите 3 продажи, не сыграв свою карту влияния",
      kind: "no_influence_sale",
      target: 3
    }),
    createGoal({
      id: "total-sales",
      title: "Сделайте 5 продаж за партию",
      kind: "sale_streak",
      target: 5
    }),
    createGoal({
      id: "cheap-sales",
      title: "Продайте 3 товара ценой 2 монеты или меньше",
      kind: "price_sale",
      target: 3,
      maxPrice: 2
    }),
    createGoal({
      id: "premium-sales",
      title: "Продайте 3 товара ценой 4 монеты или больше",
      kind: "price_sale",
      target: 3,
      minPrice: 4
    })
  ]);
}

export function isValidPartyGoalSet(goals: PartyGoal[], expectedSize = 3): boolean {
  if (goals.length !== expectedSize) {
    return false;
  }

  const ids = new Set(goals.map((goal) => goal.id));
  const kinds = new Set(goals.map((goal) => goal.kind));
  const tags = goals.flatMap((goal) => (goal.tag ? [goal.tag] : []));
  const uniqueTags = new Set(tags);
  const hasGeneralGoal = goals.some((goal) => !goal.tag);

  return (
    ids.size === goals.length &&
    kinds.size === goals.length &&
    uniqueTags.size === tags.length &&
    hasGeneralGoal &&
    goals.every((goal) => goal.title.length > 0 && goal.target > 0)
  );
}

export function createPartyGoalCombinations(pool: PartyGoal[], size = 3): PartyGoal[][] {
  const combinations: PartyGoal[][] = [];

  function collect(startIndex: number, current: PartyGoal[]) {
    if (current.length === size) {
      if (isValidPartyGoalSet(current, size)) {
        combinations.push(current);
      }
      return;
    }

    for (let index = startIndex; index < pool.length; index += 1) {
      collect(index + 1, [...current, pool[index]]);
    }
  }

  collect(0, []);
  return combinations;
}

export function createPartyGoals(activeTrends: TrendCard[], currentCustomers: CustomerCard[], random: RandomSource = Math.random): PartyGoal[] {
  const pool = createPartyGoalPool(activeTrends, currentCustomers);
  const combinations = createPartyGoalCombinations(pool, 3);
  const safeIndex = Math.min(combinations.length - 1, Math.max(0, Math.floor(random() * combinations.length)));
  const selected = combinations[safeIndex] ?? pool.slice(0, 3);
  return selected.map((goal) => createGoal(goal));
}

function priceMatches(goal: PartyGoal, price: number) {
  return (goal.minPrice === undefined || price >= goal.minPrice) && (goal.maxPrice === undefined || price <= goal.maxPrice);
}

function goalGainAndOwner(goal: PartyGoal, saleResults: PurchaseResult[], playedInfluences: PlayedInfluence[]) {
  let gained = 0;
  let rewardOwner: PlayerId | null = null;
  const influenceOwners = new Set(playedInfluences.map((influence) => influence.ownerId));

  const addGain = (result: PurchaseResult, amount: number) => {
    gained += amount;
    rewardOwner ??= result.winner?.ownerId ?? null;
  };

  for (const result of saleResults) {
    if (!result.winner) {
      continue;
    }

    if (goal.kind === "tag_sales" && goal.tag && result.winner.product.tags.includes(goal.tag)) {
      addGain(result, 1);
    }

    if (goal.kind === "tag_money" && goal.tag && result.winner.product.tags.includes(goal.tag)) {
      addGain(result, result.winner.payout);
    }

    if (goal.kind === "price_sale" && priceMatches(goal, result.winner.product.price)) {
      addGain(result, 1);
    }

    if (goal.kind === "sale_streak") {
      addGain(result, 1);
    }

    if (goal.kind === "no_influence_sale" && !influenceOwners.has(result.winner.ownerId)) {
      addGain(result, 1);
    }
  }

  return { gained, rewardOwner };
}

export function updatePartyGoalsAfterSales(goals: PartyGoal[], saleResults: PurchaseResult[], playedInfluences: PlayedInfluence[]) {
  const rewards: PartyGoalReward[] = [];

  const updatedGoals = goals.map((rawGoal) => {
    const goal = normalizePartyGoal(rawGoal);
    const { gained, rewardOwner } = goalGainAndOwner(goal, saleResults, playedInfluences);

    if (gained === 0) {
      return goal;
    }

    const progress = Math.min(goal.target, goal.progress + gained);
    const completed = progress >= goal.target;
    const shouldReward = completed && !goal.completed && !goal.rewardClaimed && rewardOwner !== null;

    if (shouldReward) {
      rewards.push({ playerId: rewardOwner!, amount: goal.reward, goalTitle: goal.title });
    }

    return {
      ...goal,
      progress,
      completed,
      rewardClaimed: goal.rewardClaimed || Boolean(shouldReward),
      completedBy: goal.completedBy ?? (shouldReward ? rewardOwner : null)
    };
  });

  return { goals: updatedGoals, rewards };
}
