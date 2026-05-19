import { CUSTOMER_CARDS, INFLUENCE_CARDS, PRODUCT_CARDS, TREND_CARDS, UPGRADE_CARDS } from "../data/cards";
import { chooseAiUpgrade, planAiPlanningTurn, type AiInfluenceMove, type AiPlanningInput, type AiPlanningPlan, type AiUpgradeChoice } from "./ai";
import { buildDeck, createProductInstance, hasUpgrade, productHandLimit, resolveCustomerPurchase, shuffleDeck } from "./engine";
import { createPartyGoals, updatePartyGoalsAfterSales } from "./goals";
import type {
  CustomerCard,
  InfluenceCard,
  PlayedInfluence,
  PlayerId,
  PlayerState,
  ProductAdjustment,
  ProductInstance,
  PurchaseResult,
  Tag,
  TrendCard,
  UpgradeCard
} from "./types";

type SimPhase = "planning" | "sale_resolution" | "upgrade" | "game_end";
type SkillLevel = "strong" | "random";

interface SimState {
  phase: SimPhase;
  round: number;
  firstPlayer: PlayerId;
  activePlayer: PlayerId;
  players: PlayerState[];
  productDeck: ProductInstance[];
  influenceDeck: InfluenceCard[];
  customerDeck: CustomerCard[];
  trendDeck: TrendCard[];
  upgradeDeck: UpgradeCard[];
  activeTrends: TrendCard[];
  currentCustomers: CustomerCard[];
  playedInfluences: PlayedInfluence[];
  roundBonuses: ProductAdjustment[];
  saleResults: PurchaseResult[];
  upgradeOffer: UpgradeCard[];
  upgradeQueue: PlayerId[];
  partyGoals: ReturnType<typeof createPartyGoals>;
}

export interface AiSkillCheckOptions {
  games?: number;
  seed?: number;
}

export interface AiSkillCheckResult {
  games: number;
  strongWins: number;
  baselineWins: number;
  draws: number;
  strongWinRate: number;
  baselineWinRate: number;
  customers: number;
  sales: number;
  noSaleRate: number;
  tipRateOfSales: number;
  goalsPerGame: number;
  productSpread: number;
  productRows: Array<{ id: string; name: string; sales: number }>;
  upgradeRows: Array<{ id: string; name: string; picks: number }>;
  influenceRows: Array<{ id: string; name: string; plays: number }>;
}

interface Metrics {
  games: number;
  customers: number;
  sales: number;
  noSales: number;
  tips: number;
  goalsCompleted: number;
  strongWins: number;
  baselineWins: number;
  draws: number;
  productSales: Map<string, number>;
  upgradePicks: Map<string, number>;
  influencePlays: Map<string, number>;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function draw<T>(deck: T[], count: number): [T[], T[]] {
  return [deck.slice(0, count), deck.slice(count)];
}

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

function randomItem<T>(items: T[]): T | null {
  if (!items.length) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function makeProductDeck() {
  let copy = 0;
  return shuffleDeck(buildDeck(PRODUCT_CARDS, 2).map((card) => createProductInstance(card, `${card.id}-${copy++}`)));
}

function createPlayer(id: PlayerId, productHand: ProductInstance[], influenceHand: InfluenceCard[]): PlayerState {
  return {
    id,
    name: id,
    money: 0,
    sales: 0,
    shelfSlots: 3,
    shelf: [null, null, null],
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

function clonePlayers(players: PlayerState[]) {
  return players.map((player) => ({
    ...player,
    shelf: player.shelf.map((product) => (product ? { ...product } : null)),
    productHand: player.productHand.map((product) => ({ ...product })),
    influenceHand: [...player.influenceHand],
    upgrades: [...player.upgrades]
  }));
}

function resetPlayerForPlanning(player: PlayerState): PlayerState {
  return { ...player, planned: false, productActionUsed: false, influenceActionUsed: false, tableBonusUsed: false };
}

function drawProductsToLimit(player: PlayerState, deck: ProductInstance[]): [PlayerState, ProductInstance[]] {
  const [cards, rest] = draw(deck, Math.max(0, productHandLimit(player) - player.productHand.length));
  return [{ ...player, productHand: [...player.productHand, ...cards] }, rest];
}

function drawInfluencesToLimit(player: PlayerState, deck: InfluenceCard[]): [PlayerState, InfluenceCard[]] {
  const [cards, rest] = draw(deck, Math.max(0, 2 - player.influenceHand.length));
  return [{ ...player, influenceHand: [...player.influenceHand, ...cards] }, rest];
}

function playerById(players: PlayerState[], id: PlayerId): PlayerState {
  const player = players.find((candidate) => candidate.id === id);
  if (!player) {
    throw new Error(`Unknown player ${id}`);
  }
  return player;
}

function randomProductMove(player: PlayerState) {
  if (player.productActionUsed || player.productHand.length === 0) {
    return null;
  }
  const product = randomItem(player.productHand);
  if (!product) {
    return null;
  }
  return {
    productInstanceId: product.instanceId,
    slotIndex: Math.floor(Math.random() * player.shelf.length),
    score: 0
  };
}

function collectRandomTargetTags(current: AiPlanningInput): Tag[] {
  const tags = new Set<Tag>();
  current.currentCustomers.forEach((customer) => {
    tags.add(customer.primaryTag);
    tags.add(customer.secondaryTag);
  });
  current.activeTrends.forEach((trend) => trend.modifiers.forEach((modifier) => tags.add(modifier.tag)));
  current.players.forEach((player) => {
    [...player.shelf, ...player.productHand].forEach((product) => product?.tags.forEach((tag) => tags.add(tag)));
  });
  return [...tags];
}

function randomInfluenceMoves(current: AiPlanningInput, player: PlayerState): AiInfluenceMove[] {
  if (player.influenceActionUsed || player.influenceHand.length === 0) {
    return [];
  }

  const moves: AiInfluenceMove[] = [];
  const opponent = playerById(current.players, opponentOf(player.id));
  const targetTags = collectRandomTargetTags(current);
  const ownSlots = player.shelf.flatMap((product, slotIndex) => (product ? [slotIndex] : []));
  const opponentSlots = opponent.shelf.flatMap((product, slotIndex) => (product ? [slotIndex] : []));

  for (const card of player.influenceHand) {
    if (card.effect.kind === "tag_modifier") {
      moves.push({ cardId: card.id, score: 0 });
    }
    if (card.effect.kind === "anti_tag") {
      targetTags.forEach((targetTag) => moves.push({ cardId: card.id, targetTag, score: 0 }));
    }
    if (card.effect.kind === "target_own_bonus") {
      ownSlots.forEach((targetSlotIndex) => moves.push({ cardId: card.id, targetOwnerId: player.id, targetSlotIndex, score: 0 }));
    }
    if (card.effect.kind === "target_opponent_penalty") {
      opponentSlots.forEach((targetSlotIndex) => moves.push({ cardId: card.id, targetOwnerId: opponent.id, targetSlotIndex, score: 0 }));
    }
    if (card.effect.kind === "tie_preference") {
      moves.push({ cardId: card.id, score: 0 });
    }
    if (card.effect.kind === "draw_product" && current.productDeckLength > 0) {
      moves.push({ cardId: card.id, score: 0 });
    }
    if (card.effect.kind === "draw_influence" && current.influenceDeckLength > 0) {
      moves.push({ cardId: card.id, score: 0 });
    }
    if (card.effect.kind === "rearrange") {
      moves.push({ cardId: card.id, score: 0 });
    }
  }

  return moves;
}

function randomTableBonusMove(player: PlayerState) {
  if (!hasUpgrade(player.upgrades, "ad_table") || player.tableBonusUsed || Math.random() < 0.35) {
    return null;
  }
  const ownSlots = player.shelf.flatMap((product, slotIndex) => (product ? [slotIndex] : []));
  const slotIndex = randomItem(ownSlots);
  return slotIndex === null ? null : { slotIndex, score: 0 };
}

function planRandomPlanningTurn(current: AiPlanningInput, playerId: PlayerId): AiPlanningPlan {
  const player = playerById(current.players, playerId);
  const productMove = randomProductMove(player);
  const influenceMove = Math.random() < 0.55 ? randomItem(randomInfluenceMoves(current, player)) : null;

  return {
    productMove,
    influenceMove,
    tableBonusMove: randomTableBonusMove(player),
    scoreDelta: 0,
    notes: []
  };
}

function chooseRandomUpgrade(player: PlayerState, upgrades: UpgradeCard[]): AiUpgradeChoice | null {
  const affordable = upgrades.filter((upgrade) => player.money >= upgrade.cost);
  const choice = randomItem([null, ...affordable]);
  return choice ? { upgradeId: choice.id, score: 0 } : null;
}

function buildInitialState(): SimState {
  let productDeck = makeProductDeck();
  let influenceDeck = shuffleDeck([...INFLUENCE_CARDS]);
  let customerDeck = shuffleDeck([...CUSTOMER_CARDS]);
  let trendDeck = shuffleDeck([...TREND_CARDS]);
  const [aProducts, afterAProducts] = draw(productDeck, 4);
  const [bProducts, afterBProducts] = draw(afterAProducts, 4);
  const [aInfluences, afterAInfluences] = draw(influenceDeck, 2);
  const [bInfluences, afterBInfluences] = draw(afterAInfluences, 2);
  const [activeTrends, afterTrends] = draw(trendDeck, 3);
  const [currentCustomers, afterCustomers] = draw(customerDeck, 1);
  const firstPlayer = Math.random() > 0.5 ? "A" : "B";
  productDeck = afterBProducts;
  influenceDeck = afterBInfluences;
  customerDeck = afterCustomers;
  trendDeck = afterTrends;

  return {
    phase: "planning",
    round: 1,
    firstPlayer,
    activePlayer: firstPlayer,
    players: [createPlayer("A", aProducts, aInfluences), createPlayer("B", bProducts, bInfluences)],
    productDeck,
    influenceDeck,
    customerDeck,
    trendDeck,
    upgradeDeck: shuffleDeck([...UPGRADE_CARDS]),
    activeTrends,
    currentCustomers,
    playedInfluences: [],
    roundBonuses: [],
    saleResults: [],
    upgradeOffer: [],
    upgradeQueue: [],
    partyGoals: createPartyGoals(activeTrends, currentCustomers)
  };
}

function applyProductMove(player: PlayerState, productInstanceId: string, slotIndex: number) {
  const productIndex = player.productHand.findIndex((product) => product.instanceId === productInstanceId);
  const product = player.productHand[productIndex];
  if (!product || player.productActionUsed) {
    return;
  }

  const supplierBonus = hasUpgrade(player.upgrades, "supplier") ? 1 : 0;
  player.shelf[slotIndex] =
    supplierBonus > 0
      ? { ...product, stock: product.stock + supplierBonus, baseStock: product.baseStock + supplierBonus }
      : { ...product };
  player.productHand.splice(productIndex, 1);
  player.productActionUsed = true;
}

function applyInfluenceMove(
  current: SimState,
  player: PlayerState,
  move: AiInfluenceMove,
  playedInfluences: PlayedInfluence[],
  metrics: Metrics
): { productDeck: ProductInstance[]; influenceDeck: InfluenceCard[] } {
  let productDeck = current.productDeck;
  let influenceDeck = current.influenceDeck;
  const cardIndex = player.influenceHand.findIndex((card) => card.id === move.cardId);
  const card = player.influenceHand[cardIndex];
  if (!card || player.influenceActionUsed) {
    return { productDeck, influenceDeck };
  }

  player.influenceHand.splice(cardIndex, 1);
  player.influenceActionUsed = true;
  metrics.influencePlays.set(card.id, (metrics.influencePlays.get(card.id) ?? 0) + 1);

  if (card.effect.kind === "tag_modifier") {
    playedInfluences.push({ id: card.id, name: card.name, ownerId: player.id, modifiers: card.effect.modifiers });
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
  if (card.effect.kind === "draw_product") {
    const [cards, rest] = draw(productDeck, card.effect.draw);
    productDeck = rest;
    player.productHand.push(...cards.slice(0, card.effect.keep));
  }
  if (card.effect.kind === "draw_influence") {
    const [cards, rest] = draw(influenceDeck, card.effect.draw);
    influenceDeck = rest;
    player.influenceHand.push(...cards.slice(0, card.effect.keep));
  }

  return { productDeck, influenceDeck };
}

function applyAiPlanningTurn(current: SimState, skillByPlayer: Record<PlayerId, SkillLevel>, metrics: Metrics): SimState {
  let productDeck = current.productDeck;
  let influenceDeck = current.influenceDeck;
  const players = clonePlayers(current.players);
  const player = players.find((candidate) => candidate.id === current.activePlayer)!;
  const input = {
    players,
    currentCustomers: current.currentCustomers,
    activeTrends: current.activeTrends,
    playedInfluences: current.playedInfluences,
    roundBonuses: current.roundBonuses,
    productDeckLength: current.productDeck.length,
    influenceDeckLength: current.influenceDeck.length
  };
  const plan = skillByPlayer[player.id] === "strong" ? planAiPlanningTurn(input, player.id) : planRandomPlanningTurn(input, player.id);
  const playedInfluences = [...current.playedInfluences];
  const roundBonuses = [...current.roundBonuses];

  if (plan.productMove) {
    applyProductMove(player, plan.productMove.productInstanceId, plan.productMove.slotIndex);
  }
  if (plan.influenceMove) {
    const decks = applyInfluenceMove(current, player, plan.influenceMove, playedInfluences, metrics);
    productDeck = decks.productDeck;
    influenceDeck = decks.influenceDeck;
  }
  if (plan.tableBonusMove && hasUpgrade(player.upgrades, "ad_table") && !player.tableBonusUsed) {
    player.tableBonusUsed = true;
    roundBonuses.push({ ownerId: player.id, slotIndex: plan.tableBonusMove.slotIndex, value: 1, label: "Рекламный столик" });
  }

  player.planned = true;
  const nextPlayer = players.find((candidate) => !candidate.planned);
  const next = { ...current, players, productDeck, influenceDeck, playedInfluences, roundBonuses };
  return nextPlayer ? { ...next, activePlayer: nextPlayer.id } : resolveRoundSales(next);
}

function resolveRoundSales(current: SimState): SimState {
  const players = clonePlayers(current.players);
  const saleResults: PurchaseResult[] = [];

  current.currentCustomers.forEach((customer, customerIndex) => {
    const result = resolveCustomerPurchase({
      customer,
      players,
      trends: current.activeTrends,
      influences: current.playedInfluences,
      roundBonuses: current.roundBonuses,
      firstPlayer: current.firstPlayer,
      customerIndex,
      round: current.round
    });
    saleResults.push(result);

    if (!result.winner) {
      return;
    }

    const owner = players.find((candidate) => candidate.id === result.winner!.ownerId)!;
    const soldProduct = owner.shelf[result.winner.slotIndex];
    owner.money += result.winner.payout;
    owner.sales += 1;
    if (soldProduct && !result.winner.preserveStock) {
      soldProduct.stock -= 1;
      if (soldProduct.stock <= 0) {
        owner.shelf[result.winner.slotIndex] = null;
      }
    }
  });

  const goalProgress = updatePartyGoalsAfterSales(current.partyGoals, saleResults, current.playedInfluences);
  for (const reward of goalProgress.rewards) {
    const player = players.find((candidate) => candidate.id === reward.playerId)!;
    player.money += reward.amount;
  }

  return { ...current, phase: "sale_resolution", activePlayer: current.firstPlayer, players, saleResults, partyGoals: goalProgress.goals };
}

function nextRoundAfterBreak(current: SimState): SimState {
  const nextRound = current.round + 1;
  const nextFirstPlayer = opponentOf(current.firstPlayer);
  const [currentCustomers, customerDeck] = draw(current.customerDeck, nextRound <= 2 ? 1 : 2);
  return {
    ...current,
    phase: "planning",
    round: nextRound,
    firstPlayer: nextFirstPlayer,
    activePlayer: nextFirstPlayer,
    players: current.players.map(resetPlayerForPlanning),
    customerDeck,
    currentCustomers,
    playedInfluences: [],
    roundBonuses: [],
    saleResults: [],
    upgradeOffer: [],
    upgradeQueue: []
  };
}

function continueAfterSales(current: SimState): SimState {
  let productDeck = current.productDeck;
  let influenceDeck = current.influenceDeck;
  const players = clonePlayers(current.players).map((player) => {
    let updated = player;
    [updated, productDeck] = drawProductsToLimit(updated, productDeck);
    [updated, influenceDeck] = drawInfluencesToLimit(updated, influenceDeck);
    return updated;
  });
  const [newTrend, trendDeck] = draw(current.trendDeck, 1);
  const base = { ...current, players, productDeck, influenceDeck, trendDeck, activeTrends: [...current.activeTrends.slice(1), ...newTrend] };

  if (current.round === 8) {
    return { ...base, phase: "game_end" };
  }

  if ([2, 4, 6].includes(current.round)) {
    const [upgradeOffer, upgradeDeck] = draw(current.upgradeDeck, 3);
    const [a, b] = players;
    const upgradeQueue =
      a.money === b.money ? [current.firstPlayer, opponentOf(current.firstPlayer)] : a.money < b.money ? (["A", "B"] as PlayerId[]) : (["B", "A"] as PlayerId[]);
    return { ...base, phase: "upgrade", upgradeDeck, upgradeOffer, upgradeQueue, activePlayer: upgradeQueue[0] };
  }

  return nextRoundAfterBreak(base);
}

function applyUpgradeTurn(current: SimState, skillByPlayer: Record<PlayerId, SkillLevel>, metrics: Metrics): SimState {
  const buyerId = current.upgradeQueue[0];
  const players = clonePlayers(current.players);
  const buyer = players.find((player) => player.id === buyerId)!;
  const choice = skillByPlayer[buyerId] === "strong" ? chooseAiUpgrade(buyer, current.upgradeOffer) : chooseRandomUpgrade(buyer, current.upgradeOffer);
  const queue = current.upgradeQueue.slice(1);
  let upgradeOffer = current.upgradeOffer;

  if (choice) {
    const upgrade = current.upgradeOffer.find((candidate) => candidate.id === choice.upgradeId);
    if (upgrade && buyer.money >= upgrade.cost) {
      buyer.money -= upgrade.cost;
      buyer.upgrades.push(upgrade);
      if (upgrade.effect === "extra_shelf") {
        buyer.shelfSlots += 1;
        buyer.shelf.push(null);
      }
      metrics.upgradePicks.set(upgrade.id, (metrics.upgradePicks.get(upgrade.id) ?? 0) + 1);
      upgradeOffer = current.upgradeOffer.filter((candidate) => candidate.id !== upgrade.id);
    }
  }

  const next = { ...current, players, upgradeOffer, upgradeQueue: queue, activePlayer: queue[0] ?? current.firstPlayer };
  return queue.length ? next : nextRoundAfterBreak(next);
}

function recordSales(state: SimState, metrics: Metrics) {
  for (const result of state.saleResults) {
    metrics.customers += 1;
    if (!result.winner) {
      metrics.noSales += 1;
      continue;
    }
    metrics.sales += 1;
    metrics.tips += result.winner.tip > 0 ? 1 : 0;
    metrics.productSales.set(result.winner.product.cardId, (metrics.productSales.get(result.winner.product.cardId) ?? 0) + 1);
  }
}

function recordGame(state: SimState, metrics: Metrics, strongPlayerId: PlayerId) {
  metrics.games += 1;
  metrics.goalsCompleted += state.partyGoals.filter((goal) => goal.completed).length;
  const [a, b] = state.players;
  let winner: PlayerId | null = null;
  if (a.money !== b.money) {
    winner = a.money > b.money ? "A" : "B";
  } else if (a.sales !== b.sales) {
    winner = a.sales > b.sales ? "A" : "B";
  }

  if (!winner) {
    metrics.draws += 1;
  } else if (winner === strongPlayerId) {
    metrics.strongWins += 1;
  } else {
    metrics.baselineWins += 1;
  }
}

function runGame(seed: number, strongPlayerId: PlayerId, metrics: Metrics) {
  const previousRandom = Math.random;
  Math.random = mulberry32(seed);
  const skillByPlayer: Record<PlayerId, SkillLevel> = {
    A: strongPlayerId === "A" ? "strong" : "random",
    B: strongPlayerId === "B" ? "strong" : "random"
  };

  try {
    let state = buildInitialState();
    while (state.phase !== "game_end") {
      if (state.phase === "planning") {
        state = applyAiPlanningTurn(state, skillByPlayer, metrics);
      } else if (state.phase === "sale_resolution") {
        recordSales(state, metrics);
        state = continueAfterSales(state);
      } else if (state.phase === "upgrade") {
        state = applyUpgradeTurn(state, skillByPlayer, metrics);
      }
    }
    recordGame(state, metrics, strongPlayerId);
  } finally {
    Math.random = previousRandom;
  }
}

export function runAiSkillCheck({ games = 240, seed = 90210 }: AiSkillCheckOptions = {}): AiSkillCheckResult {
  const metrics: Metrics = {
    games: 0,
    customers: 0,
    sales: 0,
    noSales: 0,
    tips: 0,
    goalsCompleted: 0,
    strongWins: 0,
    baselineWins: 0,
    draws: 0,
    productSales: new Map(),
    upgradePicks: new Map(),
    influencePlays: new Map()
  };

  for (let index = 0; index < games; index += 1) {
    runGame(seed + index * 7919, index % 2 === 0 ? "A" : "B", metrics);
  }

  const productRows = PRODUCT_CARDS.map((product) => ({
    id: product.id,
    name: product.name,
    sales: metrics.productSales.get(product.id) ?? 0
  })).sort((left, right) => right.sales - left.sales);
  const upgradeRows = UPGRADE_CARDS.map((upgrade) => ({
    id: upgrade.id,
    name: upgrade.name,
    picks: metrics.upgradePicks.get(upgrade.id) ?? 0
  })).sort((left, right) => right.picks - left.picks);
  const influenceRows = INFLUENCE_CARDS.map((influence) => ({
    id: influence.id,
    name: influence.name,
    plays: metrics.influencePlays.get(influence.id) ?? 0
  })).sort((left, right) => right.plays - left.plays);
  const nonZeroSales = productRows.map((row) => row.sales).filter(Boolean);
  const productSpread = nonZeroSales.length ? Math.max(...nonZeroSales) / Math.min(...nonZeroSales) : 0;

  return {
    games: metrics.games,
    strongWins: metrics.strongWins,
    baselineWins: metrics.baselineWins,
    draws: metrics.draws,
    strongWinRate: metrics.strongWins / metrics.games,
    baselineWinRate: metrics.baselineWins / metrics.games,
    customers: metrics.customers,
    sales: metrics.sales,
    noSaleRate: metrics.customers ? metrics.noSales / metrics.customers : 0,
    tipRateOfSales: metrics.sales ? metrics.tips / metrics.sales : 0,
    goalsPerGame: metrics.games ? metrics.goalsCompleted / metrics.games : 0,
    productSpread,
    productRows,
    upgradeRows,
    influenceRows
  };
}
