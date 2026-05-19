import { CUSTOMER_CARDS, INFLUENCE_CARDS, PRODUCT_CARDS, TAGS, TREND_CARDS, UPGRADE_CARDS } from "../data/cards";
import {
  chooseAiUpgrade,
  chooseWeakAiUpgrade,
  planAiPlanningTurn,
  planAiPlanningTurnForDifficulty,
  type AiInfluenceMove,
  type AiPlanningInput,
  type AiPlanningPlan,
  type AiUpgradeChoice
} from "./ai";
import { buildDeck, createProductInstance, hasUpgrade, productHandLimit, resolveCustomerPurchase, shuffleDeck, trendModifierValue } from "./engine";
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
type SkillLevel = "strong" | "random" | number;

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

export interface AiVsAiScenarioOptions {
  games?: number;
  seed?: number;
  firstPlayer?: PlayerId | "random";
  bonusPlayerId?: PlayerId | null;
  bonusUpgradeId?: string | null;
  startingUpgradeIdsByPlayer?: Partial<Record<PlayerId, string>>;
  startingMoneyByPlayer?: Partial<Record<PlayerId, number>>;
  favoredHandPlayerId?: PlayerId | null;
  skillByPlayer?: Partial<Record<PlayerId, SkillLevel>>;
  forcedTrendIds?: string[];
}

export interface AiVsAiScenarioResult {
  games: number;
  seed: number;
  firstPlayer: PlayerId | "random";
  bonusPlayerId: PlayerId | null;
  noBonusPlayerId: PlayerId | null;
  bonusUpgradeId: string | null;
  startingUpgradeIdsByPlayer: Partial<Record<PlayerId, string>>;
  startingMoneyByPlayer: Partial<Record<PlayerId, number>>;
  favoredHandPlayerId: PlayerId | null;
  underdogPlayerId: PlayerId | null;
  aWins: number;
  bWins: number;
  draws: number;
  bonusPlayerWins: number;
  noBonusPlayerWins: number;
  favoredWins: number;
  underdogWins: number;
  comebackWins: number;
  averageMoney: Record<PlayerId, number>;
  averageSales: Record<PlayerId, number>;
  averageMoneyMarginForBonusPlayer: number | null;
  averageMoneyMarginForFavoredHandPlayer: number | null;
  customers: number;
  sales: number;
  noSaleRate: number;
  tipRateOfSales: number;
  productRows: Array<{ id: string; name: string; sales: number }>;
  tagRows: Array<{ id: Tag; sales: number }>;
}

export interface AiVsAiMatrixOptions {
  gamesPerScenario?: number;
  seed?: number;
}

export interface AiVsAiBonusMatrixResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiScenarioResult[];
  summary: {
    scenarios: number;
    games: number;
    bonusPlayerWins: number;
    noBonusPlayerWins: number;
    draws: number;
    bonusPlayerWinRate: number;
    noBonusPlayerWinRate: number;
    drawRate: number;
    averageMoneyMarginForBonusPlayer: number;
  };
}

export interface AiVsAiComebackMatrixResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiScenarioResult[];
  summary: {
    scenarios: number;
    games: number;
    favoredWins: number;
    underdogWins: number;
    draws: number;
    comebackRate: number;
    favoredWinRate: number;
    drawRate: number;
    averageMoneyMarginForFavoredHandPlayer: number;
  };
}

export interface AiVsAiSymmetryCheckResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiScenarioResult[];
  summary: {
    games: number;
    aWins: number;
    bWins: number;
    firstPlayerWins: number;
    secondPlayerWins: number;
    draws: number;
    firstPlayerWinRate: number;
    secondPlayerWinRate: number;
    drawRate: number;
    maxPlayerWinRateGap: number;
    averageMoneyMarginForFirstPlayer: number;
  };
}

export interface AiVsAiUpgradeDuelScenarioResult extends AiVsAiScenarioResult {
  aUpgradeId: string;
  bUpgradeId: string;
  aUpgradeWins: number;
  bUpgradeWins: number;
}

export interface AiVsAiUpgradeDuelMatrixResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiUpgradeDuelScenarioResult[];
  summary: {
    scenarios: number;
    games: number;
    mostDominantUpgradeId: string | null;
    mostDominantUpgradeWinRate: number;
  };
}

export interface AiVsAiEconomyComebackScenarioResult extends AiVsAiScenarioResult {
  moneyLeaderId: PlayerId;
  startingMoneyLead: number;
  moneyLeaderWins: number;
  handFavoredWins: number;
}

export interface AiVsAiEconomyComebackMatrixResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiEconomyComebackScenarioResult[];
  summary: {
    games: number;
    moneyLeaderWins: number;
    handFavoredWins: number;
    draws: number;
  };
}

export interface AiVsAiSkillGapScenarioResult extends AiVsAiScenarioResult {
  strongPlayerId: PlayerId;
  weakerPlayerId: PlayerId;
  weakerDifficulty: number;
  strongWins: number;
  weakerWins: number;
}

export interface AiVsAiSkillGapMatrixResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiSkillGapScenarioResult[];
  summary: {
    games: number;
    strongWins: number;
    weakerWins: number;
    draws: number;
  };
}

export interface AiVsAiTrendScenarioResult extends AiVsAiScenarioResult {
  focusTrendId: string;
}

export interface AiVsAiTrendMatrixResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiTrendScenarioResult[];
  summary: {
    games: number;
    coveredTagIds: Tag[];
    productSpread: number;
  };
}

export type AiVsAiNoviceHandicapKind = "none" | "starting_upgrade" | "starting_money" | "favored_hand";

export interface AiVsAiNoviceHandicapScenarioResult extends AiVsAiScenarioResult {
  novicePlayerId: PlayerId;
  strongPlayerId: PlayerId;
  noviceDifficulty: number;
  handicapKind: AiVsAiNoviceHandicapKind;
  noviceWins: number;
  strongWins: number;
}

export interface AiVsAiNoviceHandicapMatrixResult {
  gamesPerScenario: number;
  seed: number;
  scenarios: AiVsAiNoviceHandicapScenarioResult[];
  summary: {
    games: number;
    noviceWins: number;
    strongWins: number;
    draws: number;
  };
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

interface HeadToHeadMetrics {
  games: number;
  customers: number;
  sales: number;
  noSales: number;
  tips: number;
  aWins: number;
  bWins: number;
  draws: number;
  money: Record<PlayerId, number>;
  playerSales: Record<PlayerId, number>;
  productSales: Map<string, number>;
  tagSales: Map<Tag, number>;
}

interface InitialStateOptions {
  firstPlayer?: PlayerId | "random";
  startingUpgradeByPlayer?: Partial<Record<PlayerId, UpgradeCard>>;
  startingMoneyByPlayer?: Partial<Record<PlayerId, number>>;
  favoredHandPlayerId?: PlayerId | null;
  forcedTrendIds?: string[];
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

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : fallback;
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

function applyStartingUpgrade(player: PlayerState, upgrade: UpgradeCard): PlayerState {
  const upgraded = { ...player, upgrades: [upgrade] };
  if (upgrade.effect === "extra_shelf") {
    return {
      ...upgraded,
      shelfSlots: upgraded.shelfSlots + 1,
      shelf: [...upgraded.shelf, null]
    };
  }
  return upgraded;
}

function upgradeById(upgradeId: string): UpgradeCard {
  const upgrade = UPGRADE_CARDS.find((candidate) => candidate.id === upgradeId);
  if (!upgrade) {
    throw new Error(`Unknown upgrade ${upgradeId}`);
  }
  return upgrade;
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

function demandForTag(currentCustomers: CustomerCard[], activeTrends: TrendCard[], tag: Tag) {
  const customerDemand = currentCustomers.reduce((total, customer) => {
    return total + (customer.primaryTag === tag ? 3 : 0) + (customer.secondaryTag === tag ? 2 : 0);
  }, 0);
  const trendDemand = activeTrends.reduce((total, trend, index) => {
    return total + trend.modifiers.reduce((sum, modifier) => sum + (modifier.tag === tag ? trendModifierValue(modifier.value, index === 0) : 0), 0);
  }, 0);
  return customerDemand + trendDemand;
}

function initialProductValue(product: ProductInstance, currentCustomers: CustomerCard[], activeTrends: TrendCard[]) {
  const tagDemand = product.tags.reduce((total, tag) => total + demandForTag(currentCustomers, activeTrends, tag), 0);
  return tagDemand + product.price * 0.4 + product.stock * 0.35;
}

function initialInfluenceValue(card: InfluenceCard, currentCustomers: CustomerCard[], activeTrends: TrendCard[]) {
  if (card.effect.kind === "tag_modifier") {
    return card.effect.modifiers.reduce((total, modifier) => total + modifier.value * (demandForTag(currentCustomers, activeTrends, modifier.tag) + 1), 0);
  }
  if (card.effect.kind === "anti_tag") {
    return 2.5;
  }
  if (card.effect.kind === "target_own_bonus") {
    return card.effect.value * 2.5 + (card.effect.preserveStock ? 1 : 0);
  }
  if (card.effect.kind === "target_opponent_penalty") {
    return Math.abs(card.effect.value) * 2.5;
  }
  if (card.effect.kind === "tie_preference") {
    return 1.5;
  }
  if (card.effect.kind === "draw_product") {
    return 2 + card.effect.keep;
  }
  if (card.effect.kind === "draw_influence") {
    return 1.5 + card.effect.keep;
  }
  return 1.2;
}

function dealBiasedCards<T>(
  deck: T[],
  aCount: number,
  bCount: number,
  favoredPlayerId: PlayerId,
  scoreCard: (card: T) => number
): [T[], T[], T[]] {
  const ranked = deck
    .map((card, index) => ({ card, index, score: scoreCard(card) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = new Set<number>();
  const bestCount = favoredPlayerId === "A" ? aCount : bCount;
  const worstCount = favoredPlayerId === "A" ? bCount : aCount;
  const best = ranked.slice(0, bestCount);
  best.forEach((entry) => selected.add(entry.index));
  const worst = ranked
    .filter((entry) => !selected.has(entry.index))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, worstCount);
  worst.forEach((entry) => selected.add(entry.index));
  const rest = deck.filter((_, index) => !selected.has(index));

  return favoredPlayerId === "A" ? [best.map((entry) => entry.card), worst.map((entry) => entry.card), rest] : [worst.map((entry) => entry.card), best.map((entry) => entry.card), rest];
}

function drawActiveTrends(deck: TrendCard[], forcedTrendIds: string[] = []): [TrendCard[], TrendCard[]] {
  const forced = forcedTrendIds
    .map((trendId) => TREND_CARDS.find((trend) => trend.id === trendId))
    .filter((trend): trend is TrendCard => Boolean(trend))
    .slice(0, 3);
  if (forced.length === 0) {
    return draw(deck, 3);
  }

  const forcedIds = new Set(forced.map((trend) => trend.id));
  const remainingDeck = deck.filter((trend) => !forcedIds.has(trend.id));
  const [fill, rest] = draw(remainingDeck, 3 - forced.length);
  return [[...forced, ...fill], rest];
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

function planningPlanForSkill(skill: SkillLevel, input: AiPlanningInput, playerId: PlayerId): AiPlanningPlan {
  if (skill === "strong") {
    return planAiPlanningTurn(input, playerId);
  }
  if (skill === "random") {
    return planRandomPlanningTurn(input, playerId);
  }
  return planAiPlanningTurnForDifficulty(input, playerId, skill);
}

function upgradeChoiceForSkill(skill: SkillLevel, player: PlayerState, upgrades: UpgradeCard[]): AiUpgradeChoice | null {
  if (skill === "random") {
    return chooseRandomUpgrade(player, upgrades);
  }
  if (typeof skill === "number" && skill <= 6) {
    return chooseWeakAiUpgrade(player, upgrades);
  }
  return chooseAiUpgrade(player, upgrades);
}

function buildInitialState(options: InitialStateOptions = {}): SimState {
  let productDeck = makeProductDeck();
  let influenceDeck = shuffleDeck([...INFLUENCE_CARDS]);
  let customerDeck = shuffleDeck([...CUSTOMER_CARDS]);
  let trendDeck = shuffleDeck([...TREND_CARDS]);
  const [activeTrends, afterTrends] = drawActiveTrends(trendDeck, options.forcedTrendIds);
  const [currentCustomers, afterCustomers] = draw(customerDeck, 1);
  const firstPlayer = options.firstPlayer && options.firstPlayer !== "random" ? options.firstPlayer : Math.random() > 0.5 ? "A" : "B";
  let playerA = createPlayer("A", [], []);
  let playerB = createPlayer("B", [], []);
  playerA = { ...playerA, money: options.startingMoneyByPlayer?.A ?? 0 };
  playerB = { ...playerB, money: options.startingMoneyByPlayer?.B ?? 0 };

  if (options.startingUpgradeByPlayer?.A) {
    playerA = applyStartingUpgrade(playerA, options.startingUpgradeByPlayer.A);
  }
  if (options.startingUpgradeByPlayer?.B) {
    playerB = applyStartingUpgrade(playerB, options.startingUpgradeByPlayer.B);
  }
  const startingUpgradeIds = new Set(Object.values(options.startingUpgradeByPlayer ?? {}).map((upgrade) => upgrade.id));
  const upgradeDeck = shuffleDeck([...UPGRADE_CARDS]).filter((upgrade) => !startingUpgradeIds.has(upgrade.id));

  const aProductLimit = productHandLimit(playerA);
  const bProductLimit = productHandLimit(playerB);
  let aProducts: ProductInstance[];
  let bProducts: ProductInstance[];
  if (options.favoredHandPlayerId) {
    [aProducts, bProducts, productDeck] = dealBiasedCards(productDeck, aProductLimit, bProductLimit, options.favoredHandPlayerId, (product) =>
      initialProductValue(product, currentCustomers, activeTrends)
    );
  } else {
    const [drawnAProducts, afterAProducts] = draw(productDeck, aProductLimit);
    const [drawnBProducts, afterBProducts] = draw(afterAProducts, bProductLimit);
    aProducts = drawnAProducts;
    bProducts = drawnBProducts;
    productDeck = afterBProducts;
  }

  let aInfluences: InfluenceCard[];
  let bInfluences: InfluenceCard[];
  if (options.favoredHandPlayerId) {
    [aInfluences, bInfluences, influenceDeck] = dealBiasedCards(influenceDeck, 2, 2, options.favoredHandPlayerId, (influence) =>
      initialInfluenceValue(influence, currentCustomers, activeTrends)
    );
  } else {
    const [drawnAInfluences, afterAInfluences] = draw(influenceDeck, 2);
    const [drawnBInfluences, afterBInfluences] = draw(afterAInfluences, 2);
    aInfluences = drawnAInfluences;
    bInfluences = drawnBInfluences;
    influenceDeck = afterBInfluences;
  }

  customerDeck = afterCustomers;
  trendDeck = afterTrends;
  playerA = { ...playerA, productHand: aProducts, influenceHand: aInfluences };
  playerB = { ...playerB, productHand: bProducts, influenceHand: bInfluences };

  return {
    phase: "planning",
    round: 1,
    firstPlayer,
    activePlayer: firstPlayer,
    players: [playerA, playerB],
    productDeck,
    influenceDeck,
    customerDeck,
    trendDeck,
    upgradeDeck,
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
  const plan = planningPlanForSkill(skillByPlayer[player.id], input, player.id);
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
  const choice = upgradeChoiceForSkill(skillByPlayer[buyerId], buyer, current.upgradeOffer);
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

function createHeadToHeadMetrics(): HeadToHeadMetrics {
  return {
    games: 0,
    customers: 0,
    sales: 0,
    noSales: 0,
    tips: 0,
    aWins: 0,
    bWins: 0,
    draws: 0,
    money: { A: 0, B: 0 },
    playerSales: { A: 0, B: 0 },
    productSales: new Map(),
    tagSales: new Map()
  };
}

function recordHeadToHeadSales(state: SimState, metrics: HeadToHeadMetrics) {
  for (const result of state.saleResults) {
    metrics.customers += 1;
    if (!result.winner) {
      metrics.noSales += 1;
      continue;
    }
    metrics.sales += 1;
    metrics.tips += result.winner.tip > 0 ? 1 : 0;
    metrics.productSales.set(result.winner.product.cardId, (metrics.productSales.get(result.winner.product.cardId) ?? 0) + 1);
    result.winner.product.tags.forEach((tag) => metrics.tagSales.set(tag, (metrics.tagSales.get(tag) ?? 0) + 1));
  }
}

function winnerForState(state: SimState): PlayerId | null {
  const [a, b] = state.players;
  if (a.money !== b.money) {
    return a.money > b.money ? "A" : "B";
  }
  if (a.sales !== b.sales) {
    return a.sales > b.sales ? "A" : "B";
  }
  return null;
}

function recordHeadToHeadGame(state: SimState, metrics: HeadToHeadMetrics) {
  const [a, b] = state.players;
  const winner = winnerForState(state);
  metrics.games += 1;
  metrics.money.A += a.money;
  metrics.money.B += b.money;
  metrics.playerSales.A += a.sales;
  metrics.playerSales.B += b.sales;

  if (winner === "A") {
    metrics.aWins += 1;
  } else if (winner === "B") {
    metrics.bWins += 1;
  } else {
    metrics.draws += 1;
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

function startingUpgradesForScenario(options: AiVsAiScenarioOptions): Partial<Record<PlayerId, UpgradeCard>> {
  const bonusPlayerId = options.bonusPlayerId ?? null;
  const bonusUpgradeId = options.bonusUpgradeId ?? null;
  const upgrades: Partial<Record<PlayerId, UpgradeCard>> = {};
  if (options.startingUpgradeIdsByPlayer?.A) {
    upgrades.A = upgradeById(options.startingUpgradeIdsByPlayer.A);
  }
  if (options.startingUpgradeIdsByPlayer?.B) {
    upgrades.B = upgradeById(options.startingUpgradeIdsByPlayer.B);
  }
  if (!bonusPlayerId && !bonusUpgradeId) {
    return upgrades;
  }
  if (!bonusPlayerId || !bonusUpgradeId) {
    throw new Error("bonusPlayerId and bonusUpgradeId must be provided together");
  }
  upgrades[bonusPlayerId] = upgradeById(bonusUpgradeId);
  return upgrades;
}

function runHeadToHeadGame(seed: number, options: AiVsAiScenarioOptions, metrics: HeadToHeadMetrics) {
  const previousRandom = Math.random;
  Math.random = mulberry32(seed);
  const skillByPlayer: Record<PlayerId, SkillLevel> = {
    A: options.skillByPlayer?.A ?? "strong",
    B: options.skillByPlayer?.B ?? "strong"
  };

  try {
    let state = buildInitialState({
      firstPlayer: options.firstPlayer ?? "random",
      startingUpgradeByPlayer: startingUpgradesForScenario(options),
      startingMoneyByPlayer: options.startingMoneyByPlayer,
      favoredHandPlayerId: options.favoredHandPlayerId ?? null,
      forcedTrendIds: options.forcedTrendIds
    });
    while (state.phase !== "game_end") {
      if (state.phase === "planning") {
        state = applyAiPlanningTurn(state, skillByPlayer, {
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
        });
      } else if (state.phase === "sale_resolution") {
        recordHeadToHeadSales(state, metrics);
        state = continueAfterSales(state);
      } else if (state.phase === "upgrade") {
        state = applyUpgradeTurn(state, skillByPlayer, {
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
        });
      }
    }
    recordHeadToHeadGame(state, metrics);
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

function winCountForPlayer(metrics: HeadToHeadMetrics, playerId: PlayerId) {
  return playerId === "A" ? metrics.aWins : metrics.bWins;
}

function averageForPlayer(total: Record<PlayerId, number>, games: number): Record<PlayerId, number> {
  return {
    A: games ? total.A / games : 0,
    B: games ? total.B / games : 0
  };
}

function averageMoneyMargin(metrics: HeadToHeadMetrics, playerId: PlayerId | null) {
  if (!playerId || metrics.games === 0) {
    return null;
  }
  const opponentId = opponentOf(playerId);
  return (metrics.money[playerId] - metrics.money[opponentId]) / metrics.games;
}

function startingUpgradeIdsForResult(options: AiVsAiScenarioOptions): Partial<Record<PlayerId, string>> {
  const ids: Partial<Record<PlayerId, string>> = { ...(options.startingUpgradeIdsByPlayer ?? {}) };
  if (options.bonusPlayerId && options.bonusUpgradeId) {
    ids[options.bonusPlayerId] = options.bonusUpgradeId;
  }
  return ids;
}

function productRowsFrom(metrics: HeadToHeadMetrics) {
  return PRODUCT_CARDS.map((product) => ({
    id: product.id,
    name: product.name,
    sales: metrics.productSales.get(product.id) ?? 0
  })).sort((left, right) => right.sales - left.sales);
}

function tagRowsFrom(metrics: HeadToHeadMetrics) {
  return TAGS.map((tag) => ({
    id: tag,
    sales: metrics.tagSales.get(tag) ?? 0
  })).sort((left, right) => right.sales - left.sales);
}

export function runAiVsAiScenario(options: AiVsAiScenarioOptions = {}): AiVsAiScenarioResult {
  const games = positiveInteger(options.games, 100);
  const seed = positiveInteger(options.seed, 770077);
  const firstPlayer = options.firstPlayer ?? "random";
  const bonusPlayerId = options.bonusPlayerId ?? null;
  const noBonusPlayerId = bonusPlayerId ? opponentOf(bonusPlayerId) : null;
  const bonusUpgradeId = options.bonusUpgradeId ?? null;
  const startingUpgradeIdsByPlayer = startingUpgradeIdsForResult(options);
  const startingMoneyByPlayer = { ...(options.startingMoneyByPlayer ?? {}) };
  const favoredHandPlayerId = options.favoredHandPlayerId ?? null;
  const underdogPlayerId = favoredHandPlayerId ? opponentOf(favoredHandPlayerId) : null;
  const metrics = createHeadToHeadMetrics();

  for (let index = 0; index < games; index += 1) {
    runHeadToHeadGame(seed + index * 7919, { ...options, games, seed, firstPlayer }, metrics);
  }

  const bonusPlayerWins = bonusPlayerId ? winCountForPlayer(metrics, bonusPlayerId) : 0;
  const noBonusPlayerWins = noBonusPlayerId ? winCountForPlayer(metrics, noBonusPlayerId) : 0;
  const favoredWins = favoredHandPlayerId ? winCountForPlayer(metrics, favoredHandPlayerId) : 0;
  const underdogWins = underdogPlayerId ? winCountForPlayer(metrics, underdogPlayerId) : 0;

  return {
    games: metrics.games,
    seed,
    firstPlayer,
    bonusPlayerId,
    noBonusPlayerId,
    bonusUpgradeId,
    startingUpgradeIdsByPlayer,
    startingMoneyByPlayer,
    favoredHandPlayerId,
    underdogPlayerId,
    aWins: metrics.aWins,
    bWins: metrics.bWins,
    draws: metrics.draws,
    bonusPlayerWins,
    noBonusPlayerWins,
    favoredWins,
    underdogWins,
    comebackWins: underdogWins,
    averageMoney: averageForPlayer(metrics.money, metrics.games),
    averageSales: averageForPlayer(metrics.playerSales, metrics.games),
    averageMoneyMarginForBonusPlayer: averageMoneyMargin(metrics, bonusPlayerId),
    averageMoneyMarginForFavoredHandPlayer: averageMoneyMargin(metrics, favoredHandPlayerId),
    customers: metrics.customers,
    sales: metrics.sales,
    noSaleRate: metrics.customers ? metrics.noSales / metrics.customers : 0,
    tipRateOfSales: metrics.sales ? metrics.tips / metrics.sales : 0,
    productRows: productRowsFrom(metrics),
    tagRows: tagRowsFrom(metrics)
  };
}

function summarizeBonusScenarios(scenarios: AiVsAiScenarioResult[]): AiVsAiBonusMatrixResult["summary"] {
  const games = scenarios.reduce((total, scenario) => total + scenario.games, 0);
  const bonusPlayerWins = scenarios.reduce((total, scenario) => total + scenario.bonusPlayerWins, 0);
  const noBonusPlayerWins = scenarios.reduce((total, scenario) => total + scenario.noBonusPlayerWins, 0);
  const draws = scenarios.reduce((total, scenario) => total + scenario.draws, 0);
  const marginSum = scenarios.reduce((total, scenario) => total + (scenario.averageMoneyMarginForBonusPlayer ?? 0) * scenario.games, 0);
  return {
    scenarios: scenarios.length,
    games,
    bonusPlayerWins,
    noBonusPlayerWins,
    draws,
    bonusPlayerWinRate: games ? bonusPlayerWins / games : 0,
    noBonusPlayerWinRate: games ? noBonusPlayerWins / games : 0,
    drawRate: games ? draws / games : 0,
    averageMoneyMarginForBonusPlayer: games ? marginSum / games : 0
  };
}

function summarizeComebackScenarios(scenarios: AiVsAiScenarioResult[]): AiVsAiComebackMatrixResult["summary"] {
  const games = scenarios.reduce((total, scenario) => total + scenario.games, 0);
  const favoredWins = scenarios.reduce((total, scenario) => total + scenario.favoredWins, 0);
  const underdogWins = scenarios.reduce((total, scenario) => total + scenario.underdogWins, 0);
  const draws = scenarios.reduce((total, scenario) => total + scenario.draws, 0);
  const marginSum = scenarios.reduce((total, scenario) => total + (scenario.averageMoneyMarginForFavoredHandPlayer ?? 0) * scenario.games, 0);
  return {
    scenarios: scenarios.length,
    games,
    favoredWins,
    underdogWins,
    draws,
    comebackRate: games ? underdogWins / games : 0,
    favoredWinRate: games ? favoredWins / games : 0,
    drawRate: games ? draws / games : 0,
    averageMoneyMarginForFavoredHandPlayer: games ? marginSum / games : 0
  };
}

export function runAiVsAiBonusMatrix(options: AiVsAiMatrixOptions = {}): AiVsAiBonusMatrixResult {
  const gamesPerScenario = positiveInteger(options.gamesPerScenario, 100);
  const seed = positiveInteger(options.seed, 880088);
  const scenarios: AiVsAiScenarioResult[] = [];
  let scenarioIndex = 0;

  for (const firstPlayer of ["A", "B"] as PlayerId[]) {
    for (const bonusPlayerId of ["A", "B"] as PlayerId[]) {
      for (const upgrade of UPGRADE_CARDS) {
        scenarios.push(
          runAiVsAiScenario({
            games: gamesPerScenario,
            seed: seed + scenarioIndex * 100003,
            firstPlayer,
            bonusPlayerId,
            bonusUpgradeId: upgrade.id
          })
        );
        scenarioIndex += 1;
      }
    }
  }

  return {
    gamesPerScenario,
    seed,
    scenarios,
    summary: summarizeBonusScenarios(scenarios)
  };
}

export function runAiVsAiComebackMatrix(options: AiVsAiMatrixOptions = {}): AiVsAiComebackMatrixResult {
  const gamesPerScenario = positiveInteger(options.gamesPerScenario, 100);
  const seed = positiveInteger(options.seed, 990099);
  const scenarios: AiVsAiScenarioResult[] = [];
  let scenarioIndex = 0;

  for (const firstPlayer of ["A", "B"] as PlayerId[]) {
    for (const favoredHandPlayerId of ["A", "B"] as PlayerId[]) {
      scenarios.push(
        runAiVsAiScenario({
          games: gamesPerScenario,
          seed: seed + scenarioIndex * 100003,
          firstPlayer,
          favoredHandPlayerId
        })
      );
      scenarioIndex += 1;
    }
  }

  return {
    gamesPerScenario,
    seed,
    scenarios,
    summary: summarizeComebackScenarios(scenarios)
  };
}

function winsForScenario(result: AiVsAiScenarioResult, playerId: PlayerId) {
  return playerId === "A" ? result.aWins : result.bWins;
}

function moneyMarginForScenario(result: AiVsAiScenarioResult, playerId: PlayerId) {
  const opponentId = opponentOf(playerId);
  return result.averageMoney[playerId] - result.averageMoney[opponentId];
}

export function runAiVsAiSymmetryCheck(options: AiVsAiMatrixOptions = {}): AiVsAiSymmetryCheckResult {
  const gamesPerScenario = positiveInteger(options.gamesPerScenario, 100);
  const seed = positiveInteger(options.seed, 120120);
  const scenarios = (["A", "B"] as PlayerId[]).map((firstPlayer, index) =>
    runAiVsAiScenario({
      games: gamesPerScenario,
      seed: seed + index * 100003,
      firstPlayer
    })
  );
  const games = scenarios.reduce((total, scenario) => total + scenario.games, 0);
  const aWins = scenarios.reduce((total, scenario) => total + scenario.aWins, 0);
  const bWins = scenarios.reduce((total, scenario) => total + scenario.bWins, 0);
  const draws = scenarios.reduce((total, scenario) => total + scenario.draws, 0);
  const firstPlayerWins = scenarios.reduce((total, scenario) => {
    const firstPlayer = scenario.firstPlayer === "random" ? "A" : scenario.firstPlayer;
    return total + winsForScenario(scenario, firstPlayer);
  }, 0);
  const secondPlayerWins = scenarios.reduce((total, scenario) => {
    const firstPlayer = scenario.firstPlayer === "random" ? "A" : scenario.firstPlayer;
    return total + winsForScenario(scenario, opponentOf(firstPlayer));
  }, 0);
  const firstPlayerMoneyMargin = scenarios.reduce((total, scenario) => {
    const firstPlayer = scenario.firstPlayer === "random" ? "A" : scenario.firstPlayer;
    return total + moneyMarginForScenario(scenario, firstPlayer) * scenario.games;
  }, 0);
  const aWinRate = games ? aWins / games : 0;
  const bWinRate = games ? bWins / games : 0;

  return {
    gamesPerScenario,
    seed,
    scenarios,
    summary: {
      games,
      aWins,
      bWins,
      firstPlayerWins,
      secondPlayerWins,
      draws,
      firstPlayerWinRate: games ? firstPlayerWins / games : 0,
      secondPlayerWinRate: games ? secondPlayerWins / games : 0,
      drawRate: games ? draws / games : 0,
      maxPlayerWinRateGap: Math.abs(aWinRate - bWinRate),
      averageMoneyMarginForFirstPlayer: games ? firstPlayerMoneyMargin / games : 0
    }
  };
}

export function runAiVsAiUpgradeDuelMatrix(options: AiVsAiMatrixOptions = {}): AiVsAiUpgradeDuelMatrixResult {
  const gamesPerScenario = positiveInteger(options.gamesPerScenario, 100);
  const seed = positiveInteger(options.seed, 130130);
  const scenarios: AiVsAiUpgradeDuelScenarioResult[] = [];
  let scenarioIndex = 0;

  for (const firstPlayer of ["A", "B"] as PlayerId[]) {
    for (const aUpgrade of UPGRADE_CARDS) {
      for (const bUpgrade of UPGRADE_CARDS) {
        const scenario = runAiVsAiScenario({
          games: gamesPerScenario,
          seed: seed + scenarioIndex * 100003,
          firstPlayer,
          startingUpgradeIdsByPlayer: { A: aUpgrade.id, B: bUpgrade.id }
        });
        scenarios.push({
          ...scenario,
          aUpgradeId: aUpgrade.id,
          bUpgradeId: bUpgrade.id,
          aUpgradeWins: scenario.aWins,
          bUpgradeWins: scenario.bWins
        });
        scenarioIndex += 1;
      }
    }
  }

  const winsByUpgrade = new Map<string, { wins: number; games: number }>();
  for (const scenario of scenarios) {
    const aRow = winsByUpgrade.get(scenario.aUpgradeId) ?? { wins: 0, games: 0 };
    aRow.wins += scenario.aWins;
    aRow.games += scenario.games;
    winsByUpgrade.set(scenario.aUpgradeId, aRow);

    const bRow = winsByUpgrade.get(scenario.bUpgradeId) ?? { wins: 0, games: 0 };
    bRow.wins += scenario.bWins;
    bRow.games += scenario.games;
    winsByUpgrade.set(scenario.bUpgradeId, bRow);
  }
  const dominant = [...winsByUpgrade.entries()]
    .map(([upgradeId, row]) => ({ upgradeId, winRate: row.games ? row.wins / row.games : 0 }))
    .sort((left, right) => right.winRate - left.winRate)[0];

  return {
    gamesPerScenario,
    seed,
    scenarios,
    summary: {
      scenarios: scenarios.length,
      games: scenarios.reduce((total, scenario) => total + scenario.games, 0),
      mostDominantUpgradeId: dominant?.upgradeId ?? null,
      mostDominantUpgradeWinRate: dominant?.winRate ?? 0
    }
  };
}

export function runAiVsAiEconomyComebackMatrix({
  gamesPerScenario,
  seed,
  startingMoneyLead = 3
}: AiVsAiMatrixOptions & { startingMoneyLead?: number } = {}): AiVsAiEconomyComebackMatrixResult {
  const games = positiveInteger(gamesPerScenario, 100);
  const baseSeed = positiveInteger(seed, 140140);
  const lead = positiveInteger(startingMoneyLead, 3);
  const scenarios: AiVsAiEconomyComebackScenarioResult[] = [];
  let scenarioIndex = 0;

  for (const firstPlayer of ["A", "B"] as PlayerId[]) {
    for (const moneyLeaderId of ["A", "B"] as PlayerId[]) {
      const favoredHandPlayerId = opponentOf(moneyLeaderId);
      const scenario = runAiVsAiScenario({
        games,
        seed: baseSeed + scenarioIndex * 100003,
        firstPlayer,
        startingMoneyByPlayer: { [moneyLeaderId]: lead },
        favoredHandPlayerId
      });
      scenarios.push({
        ...scenario,
        moneyLeaderId,
        startingMoneyLead: lead,
        moneyLeaderWins: winsForScenario(scenario, moneyLeaderId),
        handFavoredWins: winsForScenario(scenario, favoredHandPlayerId)
      });
      scenarioIndex += 1;
    }
  }

  return {
    gamesPerScenario: games,
    seed: baseSeed,
    scenarios,
    summary: {
      games: scenarios.reduce((total, scenario) => total + scenario.games, 0),
      moneyLeaderWins: scenarios.reduce((total, scenario) => total + scenario.moneyLeaderWins, 0),
      handFavoredWins: scenarios.reduce((total, scenario) => total + scenario.handFavoredWins, 0),
      draws: scenarios.reduce((total, scenario) => total + scenario.draws, 0)
    }
  };
}

export function runAiVsAiSkillGapMatrix({
  gamesPerScenario,
  seed,
  weakerDifficulties = [6, 12, 18]
}: AiVsAiMatrixOptions & { weakerDifficulties?: number[] } = {}): AiVsAiSkillGapMatrixResult {
  const games = positiveInteger(gamesPerScenario, 100);
  const baseSeed = positiveInteger(seed, 150150);
  const scenarios: AiVsAiSkillGapScenarioResult[] = [];
  let scenarioIndex = 0;

  for (const firstPlayer of ["A", "B"] as PlayerId[]) {
    for (const strongPlayerId of ["A", "B"] as PlayerId[]) {
      const weakerPlayerId = opponentOf(strongPlayerId);
      for (const weakerDifficulty of weakerDifficulties) {
        const scenario = runAiVsAiScenario({
          games,
          seed: baseSeed + scenarioIndex * 100003,
          firstPlayer,
          favoredHandPlayerId: weakerPlayerId,
          skillByPlayer: {
            [strongPlayerId]: "strong",
            [weakerPlayerId]: weakerDifficulty
          }
        });
        scenarios.push({
          ...scenario,
          strongPlayerId,
          weakerPlayerId,
          weakerDifficulty,
          strongWins: winsForScenario(scenario, strongPlayerId),
          weakerWins: winsForScenario(scenario, weakerPlayerId)
        });
        scenarioIndex += 1;
      }
    }
  }

  return {
    gamesPerScenario: games,
    seed: baseSeed,
    scenarios,
    summary: {
      games: scenarios.reduce((total, scenario) => total + scenario.games, 0),
      strongWins: scenarios.reduce((total, scenario) => total + scenario.strongWins, 0),
      weakerWins: scenarios.reduce((total, scenario) => total + scenario.weakerWins, 0),
      draws: scenarios.reduce((total, scenario) => total + scenario.draws, 0)
    }
  };
}

export function runAiVsAiTrendMatrix(options: AiVsAiMatrixOptions = {}): AiVsAiTrendMatrixResult {
  const gamesPerScenario = positiveInteger(options.gamesPerScenario, 100);
  const seed = positiveInteger(options.seed, 160160);
  const scenarios: AiVsAiTrendScenarioResult[] = [];
  let scenarioIndex = 0;

  for (const firstPlayer of ["A", "B"] as PlayerId[]) {
    for (const trend of TREND_CARDS) {
      const scenario = runAiVsAiScenario({
        games: gamesPerScenario,
        seed: seed + scenarioIndex * 100003,
        firstPlayer,
        forcedTrendIds: [trend.id]
      });
      scenarios.push({
        ...scenario,
        focusTrendId: trend.id
      });
      scenarioIndex += 1;
    }
  }

  const tagSales = new Map<Tag, number>();
  const productSales = new Map<string, number>();
  for (const scenario of scenarios) {
    scenario.tagRows.forEach((row) => tagSales.set(row.id, (tagSales.get(row.id) ?? 0) + row.sales));
    scenario.productRows.forEach((row) => productSales.set(row.id, (productSales.get(row.id) ?? 0) + row.sales));
  }
  const nonZeroProductSales = [...productSales.values()].filter(Boolean);

  return {
    gamesPerScenario,
    seed,
    scenarios,
    summary: {
      games: scenarios.reduce((total, scenario) => total + scenario.games, 0),
      coveredTagIds: TAGS.filter((tag) => (tagSales.get(tag) ?? 0) > 0),
      productSpread: nonZeroProductSales.length ? Math.max(...nonZeroProductSales) / Math.min(...nonZeroProductSales) : 0
    }
  };
}

function noviceScenarioOptions(handicapKind: AiVsAiNoviceHandicapKind, novicePlayerId: PlayerId): Pick<
  AiVsAiScenarioOptions,
  "favoredHandPlayerId" | "startingMoneyByPlayer" | "startingUpgradeIdsByPlayer"
> {
  if (handicapKind === "starting_upgrade") {
    return { startingUpgradeIdsByPlayer: { [novicePlayerId]: "beautiful_window" } };
  }
  if (handicapKind === "starting_money") {
    return { startingMoneyByPlayer: { [novicePlayerId]: 3 } };
  }
  if (handicapKind === "favored_hand") {
    return { favoredHandPlayerId: novicePlayerId };
  }
  return {};
}

export function runAiVsAiNoviceHandicapMatrix({
  gamesPerScenario,
  seed,
  noviceDifficulty = 6
}: AiVsAiMatrixOptions & { noviceDifficulty?: number } = {}): AiVsAiNoviceHandicapMatrixResult {
  const games = positiveInteger(gamesPerScenario, 100);
  const baseSeed = positiveInteger(seed, 170170);
  const difficulty = positiveInteger(noviceDifficulty, 6);
  const handicapKinds: AiVsAiNoviceHandicapKind[] = ["none", "starting_upgrade", "starting_money", "favored_hand"];
  const scenarios: AiVsAiNoviceHandicapScenarioResult[] = [];
  let scenarioIndex = 0;

  for (const firstPlayer of ["A", "B"] as PlayerId[]) {
    for (const novicePlayerId of ["A", "B"] as PlayerId[]) {
      const strongPlayerId = opponentOf(novicePlayerId);
      for (const handicapKind of handicapKinds) {
        const scenario = runAiVsAiScenario({
          games,
          seed: baseSeed + scenarioIndex * 100003,
          firstPlayer,
          ...noviceScenarioOptions(handicapKind, novicePlayerId),
          skillByPlayer: {
            [novicePlayerId]: difficulty,
            [strongPlayerId]: "strong"
          }
        });
        scenarios.push({
          ...scenario,
          novicePlayerId,
          strongPlayerId,
          noviceDifficulty: difficulty,
          handicapKind,
          noviceWins: winsForScenario(scenario, novicePlayerId),
          strongWins: winsForScenario(scenario, strongPlayerId)
        });
        scenarioIndex += 1;
      }
    }
  }

  return {
    gamesPerScenario: games,
    seed: baseSeed,
    scenarios,
    summary: {
      games: scenarios.reduce((total, scenario) => total + scenario.games, 0),
      noviceWins: scenarios.reduce((total, scenario) => total + scenario.noviceWins, 0),
      strongWins: scenarios.reduce((total, scenario) => total + scenario.strongWins, 0),
      draws: scenarios.reduce((total, scenario) => total + scenario.draws, 0)
    }
  };
}
