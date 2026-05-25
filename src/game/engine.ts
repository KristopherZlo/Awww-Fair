import type {
  AppealInput,
  AppealLine,
  AppealResult,
  CustomerCard,
  PlayedInfluence,
  PlayerId,
  PlayerState,
  ProductCard,
  ProductInstance,
  PurchaseCandidate,
  PurchasePersonalityChoice,
  PurchaseResult,
  PurchaseRules,
  PurchaseWinner,
  TrendCard,
  UpgradeCard
} from "./types";

export const PURCHASE_APPEAL_THRESHOLD = 5;
export const TIP_APPEAL_THRESHOLD = 9;
export const LATE_ROUND_BONUS_ROUND = 8;

export function createProductInstance(card: ProductCard, instanceId: string, stockBonus = 0): ProductInstance {
  return {
    instanceId,
    cardId: card.id,
    name: card.name,
    type: card.type,
    tags: [...card.tags],
    price: card.price,
    stock: card.stock + stockBonus,
    baseStock: card.stock + stockBonus,
    sprite: card.sprite
  };
}

export function buildDeck<T>(cards: T[], copies = 1): T[] {
  return Array.from({ length: copies }, () => cards).flat();
}

export function shuffleDeck<T>(cards: T[], random: () => number = Math.random): T[] {
  const deck = [...cards];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function hasUpgrade(upgrades: UpgradeCard[], effect: UpgradeCard["effect"]): boolean {
  return upgrades.some((upgrade) => upgrade.effect === effect);
}

export function productHandLimit(player: PlayerState): number {
  return 4 + (hasUpgrade(player.upgrades, "mini_storage") ? 1 : 0);
}

function pushLine(lines: AppealLine[], label: string, value: number) {
  if (value !== 0) {
    lines.push({ label, value });
  }
}

export function focusTrendModifierValue(value: number) {
  if (value > 0) {
    return value + 1;
  }
  if (value < 0) {
    return value - 1;
  }
  return value;
}

export function trendModifierValue(value: number, isFocusTrend: boolean) {
  return isFocusTrend ? focusTrendModifierValue(value) : value;
}

function trendScoreForProduct(product: ProductInstance, trends: TrendCard[]) {
  return trends.reduce((total, trend, trendIndex) => {
    return (
      total +
      trend.modifiers.reduce((sum, modifier) => {
        if (!product.tags.includes(modifier.tag)) {
          return sum;
        }
        return sum + Math.max(0, trendModifierValue(modifier.value, trendIndex === 0));
      }, 0)
    );
  }, 0);
}

function addCustomerPersonalityAppeal(lines: AppealLine[], customer: CustomerCard, product: ProductInstance) {
  const personality = customer.personality;
  if (!personality) {
    return;
  }

  if (personality.kind === "bargain_hunter" && (product.tags.includes("дешёвое") || product.price <= 2)) {
    pushLine(lines, `характер: ${personality.label.toLocaleLowerCase("ru-RU")}`, 1);
  }
}

export function calculateAppeal({
  product,
  ownerId,
  slotIndex,
  customer,
  trends,
  influences,
  ownerUpgrades,
  roundBonuses
}: AppealInput): AppealResult {
  const breakdown: AppealLine[] = [];

  if (product.tags.includes(customer.primaryTag)) {
    pushLine(breakdown, `главное желание: ${customer.primaryTag}`, 3);
  }

  if (product.tags.includes(customer.secondaryTag)) {
    pushLine(breakdown, `второе желание: ${customer.secondaryTag}`, 2);
  }

  addCustomerPersonalityAppeal(breakdown, customer, product);

  for (const [trendIndex, trend] of trends.entries()) {
    for (const modifier of trend.modifiers) {
      if (product.tags.includes(modifier.tag)) {
        const isFocusTrend = trendIndex === 0;
        const label = isFocusTrend ? `${trend.name}: ${modifier.tag} (главный тренд)` : `${trend.name}: ${modifier.tag}`;
        pushLine(breakdown, label, trendModifierValue(modifier.value, isFocusTrend));
      }
    }
  }

  for (const influence of influences) {
    for (const modifier of influence.modifiers ?? []) {
      if (product.tags.includes(modifier.tag)) {
        pushLine(breakdown, `${influence.name}: ${modifier.tag}`, modifier.value);
      }
    }

    for (const adjustment of influence.productAdjustments ?? []) {
      if (adjustment.ownerId === ownerId && adjustment.slotIndex === slotIndex) {
        pushLine(breakdown, adjustment.label, adjustment.value);
      }
    }
  }

  for (const adjustment of roundBonuses) {
    if (adjustment.ownerId === ownerId && adjustment.slotIndex === slotIndex) {
      pushLine(breakdown, adjustment.label, adjustment.value);
    }
  }

  if (slotIndex === 0 && hasUpgrade(ownerUpgrades, "beautiful_window")) {
    pushLine(breakdown, "Красивая витрина", 1);
  }

  return {
    total: breakdown.reduce((sum, line) => sum + line.value, 0),
    breakdown
  };
}

function tiePreferenceOwners(players: PlayerState[], influences: PlayedInfluence[]): Set<PlayerId> {
  const owners = new Set<PlayerId>();
  for (const influence of influences) {
    if (influence.tieOwner) {
      owners.add(influence.tieOwner);
    }
  }
  for (const player of players) {
    if (hasUpgrade(player.upgrades, "bright_sign")) {
      owners.add(player.id);
    }
  }
  return owners;
}

function playerById(players: PlayerState[], id: PlayerId): PlayerState {
  const player = players.find((candidate) => candidate.id === id);
  if (!player) {
    throw new Error(`Unknown player ${id}`);
  }
  return player;
}

function preserveStockFor(candidate: PurchaseCandidate, influences: PlayedInfluence[], roundBonuses: ProductAdjustmentLike[]): boolean {
  const adjustments = [
    ...influences.flatMap((influence) => influence.productAdjustments ?? []),
    ...roundBonuses
  ];
  return adjustments.some(
    (adjustment) =>
      adjustment.ownerId === candidate.ownerId &&
      adjustment.slotIndex === candidate.slotIndex &&
      adjustment.preserveStock
  );
}

interface ProductAdjustmentLike {
  ownerId: PlayerId;
  slotIndex: number;
  value: number;
  label: string;
  preserveStock?: boolean;
}

function candidateRef(candidate: PurchaseCandidate) {
  return {
    ownerId: candidate.ownerId,
    slotIndex: candidate.slotIndex,
    productInstanceId: candidate.product.instanceId
  };
}

export function resolveCustomerPurchase({
  customer,
  players,
  trends,
  influences,
  roundBonuses,
  firstPlayer,
  customerIndex,
  round,
  rules
}: {
  customer: CustomerCard;
  players: PlayerState[];
  trends: TrendCard[];
  influences: PlayedInfluence[];
  roundBonuses: ProductAdjustmentLike[];
  firstPlayer: PlayerId;
  customerIndex: number;
  round: number;
  rules?: Partial<PurchaseRules>;
}): PurchaseResult {
  const appealThreshold = rules?.appealThreshold ?? PURCHASE_APPEAL_THRESHOLD;
  let candidates: PurchaseCandidate[] = [];

  for (const player of players) {
    player.shelf.forEach((product, slotIndex) => {
      if (!product || product.stock <= 0) {
        return;
      }

      candidates.push({
        ownerId: player.id,
        slotIndex,
        product,
        trendScore: trendScoreForProduct(product, trends),
        appeal: calculateAppeal({
          product,
          ownerId: player.id,
          slotIndex,
          customer,
          trends,
          influences,
          ownerUpgrades: player.upgrades,
          roundBonuses: roundBonuses as AppealInput["roundBonuses"]
        })
      });
    });
  }

  const personality = customer.personality;
  if (personality?.kind === "trend_chaser") {
    candidates = candidates.map((candidate) => {
      const actual = candidate.trendScore ?? 0;
      return {
        ...candidate,
        requirements: [
          ...(candidate.requirements ?? []),
          {
            kind: "trend_score" as const,
            actual,
            required: personality.minTrendScore,
            passed: actual >= personality.minTrendScore
          }
        ]
      };
    });
  }

  let eligible = candidates.filter((candidate) => candidate.appeal.total >= appealThreshold);
  if (personality?.kind === "trend_chaser") {
    eligible = eligible.filter((candidate) => candidate.requirements?.every((requirement) => requirement.passed));
  }

  if (eligible.length === 0) {
    return { customer, appealThreshold, candidates, eligible, winner: null };
  }

  const preferredOwners = tiePreferenceOwners(players, influences);
  const sortedEligible = [...eligible].sort((left, right) => {
    if (right.appeal.total !== left.appeal.total) {
      return right.appeal.total - left.appeal.total;
    }

    const leftPreferred = preferredOwners.has(left.ownerId);
    const rightPreferred = preferredOwners.has(right.ownerId);
    if (leftPreferred !== rightPreferred) {
      return leftPreferred ? -1 : 1;
    }

    if (left.product.price !== right.product.price) {
      return left.product.price - right.product.price;
    }

    const leftMoney = playerById(players, left.ownerId).money;
    const rightMoney = playerById(players, right.ownerId).money;
    if (leftMoney !== rightMoney) {
      return leftMoney - rightMoney;
    }

    if (left.ownerId !== right.ownerId) {
      return left.ownerId === firstPlayer ? -1 : 1;
    }

    return left.slotIndex - right.slotIndex;
  });
  let winnerCandidate = sortedEligible[0];
  let personalityChoice: PurchasePersonalityChoice | undefined;

  if (personality?.kind === "second_best" && sortedEligible[1]) {
    const firstChoice = winnerCandidate;
    const secondChoice = sortedEligible[1];
    const appealGap = firstChoice.appeal.total - secondChoice.appeal.total;
    const applied = appealGap <= personality.maxAppealGap;
    personalityChoice = {
      kind: "second_best",
      applied,
      appealGap,
      maxAppealGap: personality.maxAppealGap,
      firstChoice: candidateRef(firstChoice),
      secondChoice: candidateRef(secondChoice)
    };
    if (applied) {
      winnerCandidate = secondChoice;
    }
  }

  const owner = playerById(players, winnerCandidate.ownerId);
  const tip = winnerCandidate.appeal.total >= TIP_APPEAL_THRESHOLD ? 1 : 0;
  const lateRoundBonus = round >= LATE_ROUND_BONUS_ROUND ? 1 : 0;
  const regularCustomerBonus = customerIndex === 0 && hasUpgrade(owner.upgrades, "regular_customers") ? 1 : 0;
  const preserveStock = preserveStockFor(winnerCandidate, influences, roundBonuses);

  const winner: PurchaseWinner = {
    ...winnerCandidate,
    payout: winnerCandidate.product.price + tip + lateRoundBonus + regularCustomerBonus,
    tip,
    lateRoundBonus,
    regularCustomerBonus,
    preserveStock
  };

  return { customer, appealThreshold, candidates, eligible, winner, personalityChoice };
}
