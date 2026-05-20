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
import { calculateAppeal, hasUpgrade, PURCHASE_APPEAL_THRESHOLD, resolveCustomerPurchase, TIP_APPEAL_THRESHOLD, trendModifierValue } from "./engine";

export interface AiPlanningInput {
  players: PlayerState[];
  currentCustomers: CustomerCard[];
  activeTrends: TrendCard[];
  playedInfluences: PlayedInfluence[];
  roundBonuses: ProductAdjustment[];
  productDeckLength: number;
  influenceDeckLength: number;
  purchaseAppealThreshold?: number;
  firstPlayer?: PlayerId;
  round?: number;
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

export interface AiChoiceCard {
  cardId: string;
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

function cloneProduct(product: ProductInstance): ProductInstance {
  return {
    ...product,
    tags: [...product.tags],
    sprite: { ...product.sprite }
  };
}

function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map((player) => ({
    ...player,
    shelf: player.shelf.map((product) => (product ? cloneProduct(product) : null)),
    productHand: player.productHand.map(cloneProduct),
    influenceHand: [...player.influenceHand],
    upgrades: [...player.upgrades]
  }));
}

function cloneRoundBonuses(roundBonuses: ProductAdjustment[]): ProductAdjustment[] {
  return roundBonuses.map((bonus) => ({ ...bonus }));
}

function clonePlayedInfluences(playedInfluences: PlayedInfluence[]): PlayedInfluence[] {
  return playedInfluences.map((influence) => ({
    ...influence,
    modifiers: influence.modifiers?.map((modifier) => ({ ...modifier })),
    productAdjustments: influence.productAdjustments?.map((adjustment) => ({ ...adjustment }))
  }));
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

function productMoveOptions(player: PlayerState): Array<AiProductMove | null> {
  if (player.productActionUsed || player.productHand.length === 0) {
    return [null];
  }

  const moves: AiProductMove[] = [];
  for (const product of player.productHand) {
    for (let slotIndex = 0; slotIndex < player.shelf.length; slotIndex += 1) {
      moves.push({ productInstanceId: product.instanceId, slotIndex, score: 0 });
    }
  }

  return [null, ...moves];
}

function applyProductMove(players: PlayerState[], playerId: PlayerId, move: AiProductMove | null) {
  if (!move) {
    return;
  }

  const player = playerById(players, playerId);
  if (player.productActionUsed) {
    return;
  }

  const productIndex = player.productHand.findIndex((product) => product.instanceId === move.productInstanceId);
  const product = player.productHand[productIndex];
  if (!product) {
    return;
  }

  const supplierBonus = hasUpgrade(player.upgrades, "supplier") ? 1 : 0;
  const placedProduct =
    supplierBonus > 0
      ? { ...cloneProduct(product), stock: product.stock + supplierBonus, baseStock: product.baseStock + supplierBonus }
      : cloneProduct(product);

  player.shelf[move.slotIndex] = placedProduct;
  player.productHand.splice(productIndex, 1);
  player.productActionUsed = true;
}

function chooseWeakProductMove(current: AiPlanningInput, player: PlayerState): AiProductMove | null {
  if (player.productActionUsed || player.productHand.length === 0) {
    return null;
  }

  let worst: AiProductMove | null = null;
  const emptySlots = player.shelf.flatMap((product, slotIndex) => (product ? [] : [slotIndex]));
  const candidateSlots = emptySlots.length ? emptySlots : player.shelf.map((_, slotIndex) => slotIndex);

  for (const product of player.productHand) {
    for (const slotIndex of candidateSlots) {
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

  const appealThreshold = current.purchaseAppealThreshold ?? PURCHASE_APPEAL_THRESHOLD;
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
      if (appeal.total < appealThreshold && boostedTotal >= appealThreshold) {
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

function influenceMoveOptions(current: AiPlanningInput, player: PlayerState, opponent: PlayerState, cards: InfluenceCard[]) {
  const options: AiInfluenceMove[] = [];
  const consider = (choice: AiInfluenceMove) => options.push(choice);

  cards.forEach((card: InfluenceCard) => {
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

  return options;
}

function bestInfluenceMove(options: AiInfluenceMove[]) {
  return options.reduce<AiInfluenceMove | null>((best, option) => (!best || option.score > best.score ? option : best), null);
}

function exactInfluenceMoveOptions(current: AiPlanningInput, player: PlayerState, opponent: PlayerState, cards = player.influenceHand): Array<AiInfluenceMove | null> {
  if (player.influenceActionUsed || cards.length === 0) {
    return [null];
  }

  const moves: AiInfluenceMove[] = [];
  const relevantTags = collectRelevantTags(current);

  for (const card of cards) {
    if (card.effect.kind === "tag_modifier" || card.effect.kind === "tie_preference" || card.effect.kind === "draw_product" || card.effect.kind === "draw_influence" || card.effect.kind === "rearrange") {
      moves.push({ cardId: card.id, score: 0 });
    }

    if (card.effect.kind === "anti_tag") {
      for (const tag of relevantTags) {
        moves.push({ cardId: card.id, score: 0, targetTag: tag });
      }
    }

    if (card.effect.kind === "target_own_bonus") {
      player.shelf.forEach((product, slotIndex) => {
        if (product) {
          moves.push({ cardId: card.id, score: 0, targetOwnerId: player.id, targetSlotIndex: slotIndex });
        }
      });
    }

    if (card.effect.kind === "target_opponent_penalty") {
      opponent.shelf.forEach((product, slotIndex) => {
        if (product) {
          moves.push({ cardId: card.id, score: 0, targetOwnerId: opponent.id, targetSlotIndex: slotIndex });
        }
      });
    }
  }

  return [null, ...moves];
}

function applyInfluenceMove(
  players: PlayerState[],
  playedInfluences: PlayedInfluence[],
  current: AiPlanningInput,
  playerId: PlayerId,
  move: AiInfluenceMove | null
) {
  if (!move) {
    return;
  }

  const player = playerById(players, playerId);
  if (player.influenceActionUsed) {
    return;
  }

  const cardIndex = player.influenceHand.findIndex((card) => card.id === move.cardId);
  const card = player.influenceHand[cardIndex];
  if (!card) {
    return;
  }

  player.influenceHand.splice(cardIndex, 1);
  player.influenceActionUsed = true;

  if (card.effect.kind === "tag_modifier") {
    playedInfluences.push({ id: card.id, name: card.name, ownerId: player.id, modifiers: card.effect.modifiers.map((modifier) => ({ ...modifier })) });
  }

  if (card.effect.kind === "anti_tag" && move.targetTag) {
    playedInfluences.push({ id: card.id, name: card.name, ownerId: player.id, modifiers: [{ tag: move.targetTag, value: card.effect.value }] });
  }

  if ((card.effect.kind === "target_own_bonus" || card.effect.kind === "target_opponent_penalty") && move.targetOwnerId && move.targetSlotIndex !== undefined) {
    playedInfluences.push({
      id: card.id,
      name: card.name,
      ownerId: player.id,
      productAdjustments: [
        {
          ownerId: move.targetOwnerId,
          slotIndex: move.targetSlotIndex,
          value: card.effect.value,
          label: card.name,
          preserveStock: "preserveStock" in card.effect ? card.effect.preserveStock : false
        }
      ]
    });
  }

  if (card.effect.kind === "tie_preference") {
    playedInfluences.push({ id: card.id, name: card.name, ownerId: player.id, tieOwner: player.id });
  }

  if (card.effect.kind === "rearrange") {
    player.productActionUsed = false;
  }
}

function chooseBestInfluenceMove(current: AiPlanningInput, player: PlayerState, opponent: PlayerState): AiInfluenceMove | null {
  if (player.influenceActionUsed || player.influenceHand.length === 0) {
    return null;
  }

  const selected = bestInfluenceMove(influenceMoveOptions(current, player, opponent, player.influenceHand));
  return selected && selected.score >= 1 ? selected : null;
}

function tableBonusMoveOptions(player: PlayerState): Array<AiTableBonusMove | null> {
  if (!hasUpgrade(player.upgrades, "ad_table") || player.tableBonusUsed) {
    return [null];
  }

  return [
    null,
    ...player.shelf.flatMap((product, slotIndex) => (product ? [{ slotIndex, score: 0 }] : []))
  ];
}

function applyTableBonusMove(roundBonuses: ProductAdjustment[], player: PlayerState, move: AiTableBonusMove | null) {
  if (!move || !hasUpgrade(player.upgrades, "ad_table") || player.tableBonusUsed) {
    return;
  }

  player.tableBonusUsed = true;
  roundBonuses.push({ ownerId: player.id, slotIndex: move.slotIndex, value: 1, label: "Рекламный столик" });
}

function roundBonusesWithTableMove(roundBonuses: ProductAdjustment[], player: PlayerState, move: AiTableBonusMove | null) {
  if (!move || !hasUpgrade(player.upgrades, "ad_table") || player.tableBonusUsed) {
    return roundBonuses;
  }

  return [...roundBonuses, { ownerId: player.id, slotIndex: move.slotIndex, value: 1, label: "Рекламный столик" }];
}

function resolveSalesPlayers(current: AiPlanningInput, players: PlayerState[], playedInfluences: PlayedInfluence[], roundBonuses: ProductAdjustment[]) {
  const salePlayers = clonePlayers(players);
  const firstPlayer = current.firstPlayer ?? current.players[0]?.id ?? "A";
  const round = current.round ?? 1;
  const appealThreshold = current.purchaseAppealThreshold ?? PURCHASE_APPEAL_THRESHOLD;

  current.currentCustomers.forEach((customer, customerIndex) => {
    const result = resolveCustomerPurchase({
      customer,
      players: salePlayers,
      trends: current.activeTrends,
      influences: playedInfluences,
      roundBonuses,
      firstPlayer,
      customerIndex,
      round,
      rules: { appealThreshold }
    });

    if (!result.winner) {
      return;
    }

    const owner = playerById(salePlayers, result.winner.ownerId);
    owner.money += result.winner.payout;
    owner.sales += 1;

    if (!result.winner.preserveStock) {
      const product = owner.shelf[result.winner.slotIndex];
      if (product && product.instanceId === result.winner.product.instanceId) {
        product.stock -= 1;
        if (product.stock <= 0) {
          owner.shelf[result.winner.slotIndex] = null;
        }
      }
    }
  });

  return salePlayers;
}

function inventoryValue(current: AiPlanningInput, player: PlayerState) {
  const shelfValue = player.shelf.reduce((total, product) => {
    if (!product) {
      return total;
    }
    return total + productLearningValue(current, product) * (1 + Math.max(0, Math.min(product.stock, 3)) * 0.15);
  }, 0);
  const handValue = player.productHand.reduce((total, product) => total + productLearningValue(current, product) * 0.35, 0);
  return shelfValue + handValue;
}

function evaluatePlayers(current: AiPlanningInput, players: PlayerState[], playerId: PlayerId) {
  const player = playerById(players, playerId);
  const opponent = playerById(players, opponentOf(playerId));
  return (player.money - opponent.money) * 10000 + (player.sales - opponent.sales) * 1000 + (inventoryValue(current, player) - inventoryValue(current, opponent));
}

interface ExactPlanCandidate {
  productMove: AiProductMove | null;
  influenceMove: AiInfluenceMove | null;
  tableBonusMove: AiTableBonusMove | null;
  score: number;
  actionCount: number;
}

function candidateActionCount(candidate: Pick<ExactPlanCandidate, "productMove" | "influenceMove" | "tableBonusMove">) {
  return (candidate.productMove ? 1 : 0) + (candidate.influenceMove ? 1 : 0) + (candidate.tableBonusMove ? 1 : 0);
}

function isBetterCandidate(candidate: ExactPlanCandidate, best: ExactPlanCandidate | null) {
  if (!best) {
    return true;
  }

  const scoreDelta = candidate.score - best.score;
  if (Math.abs(scoreDelta) > 0.0001) {
    return scoreDelta > 0;
  }

  return candidate.actionCount < best.actionCount;
}

function evaluateExactPlan(
  current: AiPlanningInput,
  playerId: PlayerId,
  productMove: AiProductMove | null,
  influenceMove: AiInfluenceMove | null,
  tableBonusMove: AiTableBonusMove | null
): ExactPlanCandidate {
  const players = clonePlayers(current.players);
  const playedInfluences = clonePlayedInfluences(current.playedInfluences);
  const roundBonuses = cloneRoundBonuses(current.roundBonuses);

  applyProductMove(players, playerId, productMove);
  applyInfluenceMove(players, playedInfluences, current, playerId, influenceMove);
  applyTableBonusMove(roundBonuses, playerById(players, playerId), tableBonusMove);

  const salePlayers = resolveSalesPlayers(current, players, playedInfluences, roundBonuses);
  return {
    productMove,
    influenceMove,
    tableBonusMove,
    score: evaluatePlayers(current, salePlayers, playerId),
    actionCount: candidateActionCount({ productMove, influenceMove, tableBonusMove })
  };
}

function evaluatePreparedPlan(
  current: AiPlanningInput,
  playerId: PlayerId,
  players: PlayerState[],
  playedInfluences: PlayedInfluence[],
  roundBonuses: ProductAdjustment[],
  productMove: AiProductMove | null,
  influenceMove: AiInfluenceMove | null,
  tableBonusMove: AiTableBonusMove | null
): ExactPlanCandidate {
  const salePlayers = resolveSalesPlayers(current, players, playedInfluences, roundBonuses);
  return {
    productMove,
    influenceMove,
    tableBonusMove,
    score: evaluatePlayers(current, salePlayers, playerId),
    actionCount: candidateActionCount({ productMove, influenceMove, tableBonusMove })
  };
}

function exactPlanningTurn(current: AiPlanningInput, playerId: PlayerId): { best: ExactPlanCandidate; baseline: ExactPlanCandidate } {
  const baseline = evaluatePreparedPlan(current, playerId, current.players, current.playedInfluences, current.roundBonuses, null, null, null);
  let best: ExactPlanCandidate = baseline;
  const player = playerById(current.players, playerId);

  for (const productMove of productMoveOptions(player)) {
    const productPlayers = clonePlayers(current.players);
    applyProductMove(productPlayers, playerId, productMove);
    const productPlayer = playerById(productPlayers, playerId);
    const productOpponent = playerById(productPlayers, opponentOf(playerId));
    const productInput = { ...current, players: productPlayers };

    for (const influenceMove of exactInfluenceMoveOptions(productInput, productPlayer, productOpponent)) {
      const influencePlayers = clonePlayers(productPlayers);
      const influencePlayed = clonePlayedInfluences(current.playedInfluences);
      applyInfluenceMove(influencePlayers, influencePlayed, productInput, playerId, influenceMove);
      const influencePlayer = playerById(influencePlayers, playerId);

      for (const tableBonusMove of tableBonusMoveOptions(influencePlayer)) {
        const candidate = evaluatePreparedPlan(
          current,
          playerId,
          influencePlayers,
          influencePlayed,
          roundBonusesWithTableMove(current.roundBonuses, influencePlayer, tableBonusMove),
          productMove,
          influenceMove,
          tableBonusMove
        );
        if (isBetterCandidate(candidate, best)) {
          best = candidate;
        }
      }
    }
  }

  return { best, baseline };
}

export function chooseAiProductChoice(current: AiPlanningInput, player: PlayerState, products: ProductInstance[]): AiChoiceCard | null {
  return products.reduce<AiChoiceCard | null>((best, product) => {
    const players = clonePlayers(current.players);
    const draftPlayer = playerById(players, player.id);
    draftPlayer.productHand.push(cloneProduct(product));
    const { best: plan } = exactPlanningTurn({ ...current, players }, player.id);
    const choice = { cardId: product.instanceId, score: plan.score + productLearningValue(current, product) * 0.001 };
    return !best || choice.score > best.score ? choice : best;
  }, null);
}

export function chooseAiInfluenceChoice(current: AiPlanningInput, player: PlayerState, opponent: PlayerState, cards: InfluenceCard[]): AiChoiceCard | null {
  const move = bestInfluenceMove(influenceMoveOptions(current, player, opponent, cards));
  if (move) {
    return { cardId: move.cardId, score: move.score };
  }

  return cards[0] ? { cardId: cards[0].id, score: 0 } : null;
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
  const { best, baseline } = exactPlanningTurn(current, playerId);
  const scoreImprovement = best.score - baseline.score;
  const moveScore = scoreImprovement / 10000;
  const productMove = best.productMove ? { ...best.productMove, score: moveScore } : null;
  const influenceMove = best.influenceMove ? { ...best.influenceMove, score: moveScore } : null;
  const tableBonusMove = best.tableBonusMove ? { ...best.tableBonusMove, score: moveScore } : null;
  const notes: string[] = [];
  let scoreDelta = 0;

  if (productMove) {
    const reward = rewardFor(moveScore);
    scoreDelta += reward;
    notes.push(`${signed(reward)} за товарный ход`);
  } else if (!player.productActionUsed && player.productHand.length > 0) {
    scoreDelta -= 1;
    notes.push("-1 за слабую замену товара");
  }

  if (influenceMove) {
    const reward = rewardFor(moveScore);
    scoreDelta += reward;
    notes.push(`${signed(reward)} за карту влияния`);
  } else if (!player.influenceActionUsed && player.influenceHand.length > 0) {
    scoreDelta -= 1;
    notes.push("-1 за слабое влияние");
  }

  if (tableBonusMove) {
    const reward = rewardFor(moveScore);
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

export function planAiPlanningTurnForDifficulty(current: AiPlanningInput, playerId: PlayerId, difficulty: number): AiPlanningPlan {
  const level = Math.max(1, Math.min(24, Math.round(difficulty)));

  if (level <= 6) {
    return planWeakAiPlanningTurn(current, playerId);
  }

  const strongPlan = planAiPlanningTurn(current, playerId);

  if (level <= 12) {
    return {
      ...strongPlan,
      influenceMove: null,
      tableBonusMove: null,
      scoreDelta: Math.max(0, Math.round(strongPlan.scoreDelta * 0.55)),
      notes: ["частичный план уровня ярмарки"]
    };
  }

  if (level <= 18) {
    return strongPlan;
  }

  return {
    ...strongPlan,
    scoreDelta: strongPlan.scoreDelta + 1,
    notes: [...strongPlan.notes, "+1 за опыт финального соперника"]
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
    beautiful_window: 4
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
    beautiful_window: 4
  };

  return (
    upgrades
      .filter((upgrade) => player.money >= upgrade.cost)
      .map((upgrade) => ({ upgradeId: upgrade.id, score: upgradeScores[upgrade.effect] - upgrade.cost * 0.25 }))
      .sort((a, b) => a.score - b.score)[0] ?? null
  );
}
