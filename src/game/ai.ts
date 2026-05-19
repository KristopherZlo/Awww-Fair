import type {
  CustomerCard,
  InfluenceCard,
  PlayedInfluence,
  PlayerId,
  PlayerState,
  ProductAdjustment,
  ProductInstance,
  Tag,
  TrendCard,
  UpgradeCard
} from "./types";
import { calculateAppeal, hasUpgrade, PURCHASE_APPEAL_THRESHOLD, TIP_APPEAL_THRESHOLD, trendModifierValue } from "./engine";

export interface AiPlanningInput {
  players: PlayerState[];
  currentCustomers: CustomerCard[];
  activeTrends: TrendCard[];
  playedInfluences: PlayedInfluence[];
  roundBonuses: ProductAdjustment[];
  productDeckLength: number;
  influenceDeckLength: number;
}

export interface AiProductMove {
  productInstanceId: string;
  slotIndex: number;
  score: number;
}

export interface AiInfluenceMove {
  cardId: string;
  score: number;
  targetTag?: Tag;
  targetOwnerId?: PlayerId;
  targetSlotIndex?: number;
}

export interface AiTableBonusMove {
  slotIndex: number;
  score: number;
}

export interface AiPlanningPlan {
  productMove: AiProductMove | null;
  influenceMove: AiInfluenceMove | null;
  tableBonusMove: AiTableBonusMove | null;
  scoreDelta: number;
  notes: string[];
}

export interface AiUpgradeChoice {
  upgradeId: string;
  score: number;
}

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function rewardFor(score: number) {
  return Math.max(1, Math.min(6, Math.round(score)));
}

function playerById(players: PlayerState[], id: PlayerId): PlayerState {
  const player = players.find((candidate) => candidate.id === id);
  if (!player) {
    throw new Error(`Unknown player ${id}`);
  }
  return player;
}

function tagDemandScore(current: AiPlanningInput, tag: Tag) {
  const customerDemand = current.currentCustomers.reduce((total, customer) => {
    return total + (customer.primaryTag === tag ? 3 : 0) + (customer.secondaryTag === tag ? 2 : 0);
  }, 0);
  const trendDemand = current.activeTrends.reduce((total, trend, index) => {
    return total + trend.modifiers.reduce((sum, modifier) => sum + (modifier.tag === tag ? trendModifierValue(modifier.value, index === 0) : 0), 0);
  }, 0);
  const influenceDemand = current.playedInfluences.reduce((total, influence) => {
    return total + (influence.modifiers?.reduce((sum, modifier) => sum + (modifier.tag === tag ? modifier.value : 0), 0) ?? 0);
  }, 0);

  return customerDemand + trendDemand + influenceDemand;
}

function productLearningValue(current: AiPlanningInput, product: ProductInstance) {
  const tagValue = product.tags.reduce((total, tag) => total + tagDemandScore(current, tag), 0);
  return tagValue + product.price * 0.35 + Math.min(product.stock, 3) * 0.35;
}

function countShelfTag(player: PlayerState, tag: Tag) {
  return player.shelf.reduce((total, product) => total + (product?.tags.includes(tag) ? 1 : 0), 0);
}

function collectRelevantTags(current: AiPlanningInput) {
  const tags = new Set<Tag>();
  current.currentCustomers.forEach((customer) => {
    tags.add(customer.primaryTag);
    tags.add(customer.secondaryTag);
  });
  current.activeTrends.forEach((trend) => trend.modifiers.forEach((modifier) => tags.add(modifier.tag)));
  current.playedInfluences.forEach((influence) => influence.modifiers?.forEach((modifier) => tags.add(modifier.tag)));
  current.players.forEach((player) => {
    [...player.shelf, ...player.productHand].forEach((product) => product?.tags.forEach((tag) => tags.add(tag)));
  });
  return [...tags];
}

function chooseBestProductMove(current: AiPlanningInput, player: PlayerState): AiProductMove | null {
  if (player.productActionUsed || player.productHand.length === 0) {
    return null;
  }

  let best: AiProductMove | null = null;
  for (const product of player.productHand) {
    for (let slotIndex = 0; slotIndex < player.shelf.length; slotIndex += 1) {
      const existingProduct = player.shelf[slotIndex];
      const baseScore = productLearningValue(current, product);
      const replaceCost = existingProduct ? productLearningValue(current, existingProduct) * 0.75 : -1.5;
      const score = baseScore - replaceCost;
      if (!best || score > best.score) {
        best = { productInstanceId: product.instanceId, slotIndex, score };
      }
    }
  }

  return best && best.score >= 0.5 ? best : null;
}

function chooseWeakProductMove(current: AiPlanningInput, player: PlayerState): AiProductMove | null {
  if (player.productActionUsed || player.productHand.length === 0) {
    return null;
  }

  let worst: AiProductMove | null = null;
  for (const product of player.productHand) {
    for (let slotIndex = 0; slotIndex < player.shelf.length; slotIndex += 1) {
      const existingProduct = player.shelf[slotIndex];
      const baseScore = productLearningValue(current, product);
      const replaceCost = existingProduct ? productLearningValue(current, existingProduct) * 0.75 : -1.5;
      const score = baseScore - replaceCost;
      if (!worst || score < worst.score) {
        worst = { productInstanceId: product.instanceId, slotIndex, score };
      }
    }
  }

  return worst;
}

function bestShelfSlot(current: AiPlanningInput, player: PlayerState): { slotIndex: number; product: ProductInstance; score: number } | null {
  let best: { slotIndex: number; product: ProductInstance; score: number } | null = null;
  for (let slotIndex = 0; slotIndex < player.shelf.length; slotIndex += 1) {
    const product = player.shelf[slotIndex];
    if (!product) {
      continue;
    }
    const score = productLearningValue(current, product);
    if (!best || score > best.score) {
      best = { slotIndex, product, score };
    }
  }
  return best;
}

function chooseBestTableBonusMove(current: AiPlanningInput, player: PlayerState): AiTableBonusMove | null {
  if (!hasUpgrade(player.upgrades, "ad_table") || player.tableBonusUsed || current.currentCustomers.length === 0) {
    return null;
  }

  let best: AiTableBonusMove | null = null;
  for (const [slotIndex, product] of player.shelf.entries()) {
    if (!product) {
      continue;
    }

    let score = 0;
    for (const customer of current.currentCustomers) {
      const appeal = calculateAppeal({
        product,
        ownerId: player.id,
        slotIndex,
        customer,
        trends: current.activeTrends,
        influences: current.playedInfluences,
        ownerUpgrades: player.upgrades,
        roundBonuses: current.roundBonuses
      });
      const boostedTotal = appeal.total + 1;
      if (appeal.total < PURCHASE_APPEAL_THRESHOLD && boostedTotal >= PURCHASE_APPEAL_THRESHOLD) {
        score += 4;
      }
      if (appeal.total < TIP_APPEAL_THRESHOLD && boostedTotal >= TIP_APPEAL_THRESHOLD) {
        score += 2;
      }
    }

    if (score > 0) {
      const move = { slotIndex, score };
      if (!best || move.score > best.score) {
        best = move;
      }
    }
  }

  return best;
}

function chooseBestInfluenceMove(current: AiPlanningInput, player: PlayerState, opponent: PlayerState): AiInfluenceMove | null {
  if (player.influenceActionUsed || player.influenceHand.length === 0) {
    return null;
  }

  let best: AiInfluenceMove | null = null;

  function consider(choice: AiInfluenceMove) {
    if (!best || choice.score > best.score) {
      best = choice;
    }
  }

  player.influenceHand.forEach((card: InfluenceCard) => {
    if (card.effect.kind === "tag_modifier") {
      const score = card.effect.modifiers.reduce((total, modifier) => {
        const ownShelfBonus = countShelfTag(player, modifier.tag) * 1.4;
        const opponentShelfRisk = countShelfTag(opponent, modifier.tag) * 0.6;
        return total + modifier.value * (tagDemandScore(current, modifier.tag) + ownShelfBonus - opponentShelfRisk);
      }, 0);
      consider({ cardId: card.id, score });
    }

    if (card.effect.kind === "anti_tag") {
      collectRelevantTags(current).forEach((tag) => {
        const score = countShelfTag(opponent, tag) * 2 - countShelfTag(player, tag) * 2 + tagDemandScore(current, tag) * 0.2;
        consider({ cardId: card.id, score, targetTag: tag });
      });
    }

    if (card.effect.kind === "target_own_bonus") {
      const ownTarget = bestShelfSlot(current, player);
      if (ownTarget) {
        consider({
          cardId: card.id,
          score: card.effect.value * 2 + ownTarget.score * 0.15,
          targetOwnerId: player.id,
          targetSlotIndex: ownTarget.slotIndex
        });
      }
    }

    if (card.effect.kind === "target_opponent_penalty") {
      const opponentTarget = bestShelfSlot(current, opponent);
      if (opponentTarget) {
        consider({
          cardId: card.id,
          score: Math.abs(card.effect.value) * 2 + opponentTarget.score * 0.18,
          targetOwnerId: opponent.id,
          targetSlotIndex: opponentTarget.slotIndex
        });
      }
    }

    if (card.effect.kind === "tie_preference") {
      consider({ cardId: card.id, score: 1.2 });
    }

    if (card.effect.kind === "draw_product") {
      consider({ cardId: card.id, score: current.productDeckLength ? 2.2 : 0 });
    }

    if (card.effect.kind === "draw_influence") {
      consider({ cardId: card.id, score: current.influenceDeckLength ? 1.6 : 0 });
    }

    if (card.effect.kind === "rearrange") {
      consider({ cardId: card.id, score: player.productActionUsed ? 1.1 : 0.3 });
    }
  });

  const selected = best as AiInfluenceMove | null;
  return selected && selected.score >= 1 ? selected : null;
}

function virtualPlayerAfterProduct(player: PlayerState, move: AiProductMove | null): PlayerState {
  if (!move) {
    return player;
  }

  const product = player.productHand.find((candidate) => candidate.instanceId === move.productInstanceId);
  if (!product) {
    return player;
  }

  const shelf = [...player.shelf];
  shelf[move.slotIndex] = product;
  return {
    ...player,
    shelf,
    productHand: player.productHand.filter((candidate) => candidate.instanceId !== product.instanceId),
    productActionUsed: true
  };
}

export function planAiPlanningTurn(current: AiPlanningInput, playerId: PlayerId): AiPlanningPlan {
  const player = playerById(current.players, playerId);
  const opponent = playerById(current.players, opponentOf(playerId));
  const productMove = chooseBestProductMove(current, player);
  const virtualPlayer = virtualPlayerAfterProduct(player, productMove);
  const virtualPlayers = current.players.map((candidate) => (candidate.id === player.id ? virtualPlayer : candidate));
  const virtualInput = { ...current, players: virtualPlayers };
  const influenceMove = chooseBestInfluenceMove(virtualInput, virtualPlayer, opponent);
  const tableBonusMove = chooseBestTableBonusMove(virtualInput, virtualPlayer);
  const notes: string[] = [];
  let scoreDelta = 0;

  if (productMove) {
    const reward = rewardFor(productMove.score);
    scoreDelta += reward;
    notes.push(`${signed(reward)} за товарный ход`);
  } else if (!player.productActionUsed && player.productHand.length > 0) {
    scoreDelta -= 1;
    notes.push("-1 за слабую замену товара");
  }

  if (influenceMove) {
    const reward = rewardFor(influenceMove.score);
    scoreDelta += reward;
    notes.push(`${signed(reward)} за карту влияния`);
  } else if (!player.influenceActionUsed && player.influenceHand.length > 0) {
    scoreDelta -= 1;
    notes.push("-1 за слабое влияние");
  }

  if (tableBonusMove) {
    const reward = rewardFor(tableBonusMove.score);
    scoreDelta += reward;
    notes.push(`${signed(reward)} за рекламный столик`);
  }

  return {
    productMove,
    influenceMove,
    tableBonusMove,
    scoreDelta,
    notes
  };
}

export function planWeakAiPlanningTurn(current: AiPlanningInput, playerId: PlayerId): AiPlanningPlan {
  const player = playerById(current.players, playerId);
  const productMove = chooseWeakProductMove(current, player);
  const notes: string[] = [];
  let scoreDelta = 0;

  if (productMove) {
    scoreDelta -= 1;
    notes.push("-1 за слабый товарный ход");
  } else if (!player.productActionUsed && player.productHand.length > 0) {
    scoreDelta -= 1;
    notes.push("-1 за упущенную замену товара");
  }

  if (!player.influenceActionUsed && player.influenceHand.length > 0) {
    scoreDelta -= 1;
    notes.push("-1 за пропуск влияния");
  }

  return {
    productMove,
    influenceMove: null,
    tableBonusMove: null,
    scoreDelta,
    notes
  };
}

export function chooseAiUpgrade(player: PlayerState, upgrades: UpgradeCard[]): AiUpgradeChoice | null {
  const upgradeScores: Record<UpgradeCard["effect"], number> = {
    extra_shelf: 8,
    supplier: 7,
    ad_table: 6,
    mini_storage: 5,
    regular_customers: 5,
    bright_sign: 4,
    beautiful_window: 4,
    cozy_decor: 2
  };

  return (
    upgrades
      .filter((upgrade) => player.money >= upgrade.cost)
      .map((upgrade) => ({ upgradeId: upgrade.id, score: upgradeScores[upgrade.effect] - upgrade.cost * 0.25 }))
      .sort((a, b) => b.score - a.score)[0] ?? null
  );
}

export function chooseWeakAiUpgrade(player: PlayerState, upgrades: UpgradeCard[]): AiUpgradeChoice | null {
  const upgradeScores: Record<UpgradeCard["effect"], number> = {
    extra_shelf: 8,
    supplier: 7,
    ad_table: 6,
    mini_storage: 5,
    regular_customers: 5,
    bright_sign: 4,
    beautiful_window: 4,
    cozy_decor: 2
  };

  return (
    upgrades
      .filter((upgrade) => player.money >= upgrade.cost)
      .map((upgrade) => ({ upgradeId: upgrade.id, score: upgradeScores[upgrade.effect] - upgrade.cost * 0.25 }))
      .sort((a, b) => a.score - b.score)[0] ?? null
  );
}
