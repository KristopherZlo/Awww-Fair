import type { GameState } from "../app/types";
import { DEFAULT_INITIAL_STATE_OPTIONS } from "./sessionConfig";
import { PURCHASE_APPEAL_THRESHOLD, hasUpgrade, productHandLimit, resolveCustomerPurchase } from "./engine";
import { updatePartyGoalsAfterSales } from "./goals";
import { draw } from "./session";
import { drawCompatibleTrends } from "./trends";
import type { InfluenceCard, PlayerId, PlayerState, ProductInstance, Tag } from "./types";

export interface RankedReplayEvent {
  actorId: string;
  eventType: string;
  payload: unknown;
}

export interface RankedReplayPlayerMap {
  playerAId: string;
  playerBId: string;
}

export interface RankedReplayOutcome {
  playerACoins: number;
  playerBCoins: number;
  playerASales: number;
  playerBSales: number;
}

function actorSeat(actorId: string, playerMap: RankedReplayPlayerMap): PlayerId {
  if (actorId === playerMap.playerAId) return "A";
  if (actorId === playerMap.playerBId) return "B";
  throw new Error("Unknown ranked replay actor.");
}

function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map((player) => ({ ...player, shelf: player.shelf.map((product) => (product ? { ...product } : null)), productHand: player.productHand.map((product) => ({ ...product })), influenceHand: [...player.influenceHand], upgrades: [...player.upgrades] }));
}

function resetPlayerForPlanning(player: PlayerState): PlayerState {
  return { ...player, planned: false, productActionUsed: false, influenceActionUsed: false, tableBonusUsed: false };
}

function drawProductsToLimit(player: PlayerState, deck: ProductInstance[]): [PlayerState, ProductInstance[]] {
  const needed = Math.max(0, productHandLimit(player) - player.productHand.length);
  const [cards, rest] = draw(deck, needed);
  return [{ ...player, productHand: [...player.productHand, ...cards] }, rest];
}

function drawInfluencesToLimit(player: PlayerState, deck: InfluenceCard[]): [PlayerState, InfluenceCard[]] {
  const needed = Math.max(0, DEFAULT_INITIAL_STATE_OPTIONS.influenceHandSize - player.influenceHand.length);
  const [cards, rest] = draw(deck, needed);
  return [{ ...player, influenceHand: [...player.influenceHand, ...cards] }, rest];
}

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

function nextRoundAfterBreak(current: GameState): GameState {
  const nextRound = current.round + 1;
  const nextFirstPlayer = opponentOf(current.firstPlayer);
  const customerCount = nextRound <= 2 ? 1 : 2;
  const [customers, customerDeck] = draw(current.customerDeck, customerCount);
  let productDeck = current.productDeck;
  let influenceDeck = current.influenceDeck;
  const players = current.players.map(resetPlayerForPlanning).map((player) => {
    let updated = player;
    [updated, productDeck] = drawProductsToLimit(updated, productDeck);
    [updated, influenceDeck] = drawInfluencesToLimit(updated, influenceDeck);
    return updated;
  });

  return { ...current, phase: "planning", round: nextRound, firstPlayer: nextFirstPlayer, activePlayer: nextFirstPlayer, players, productDeck, influenceDeck, customerDeck, currentCustomers: customers, playedInfluences: [], roundBonuses: [], selectedProductId: null, selectedInfluenceId: null, saleResults: [], saleInsights: [], upgradeOffer: [], upgradeQueue: [] };
}

function resolveRoundSales(current: GameState): GameState {
  const players = clonePlayers(current.players);
  const saleResults = current.currentCustomers.map((customer, customerIndex) => {
    const result = resolveCustomerPurchase({
      customer,
      players,
      trends: current.activeTrends,
      influences: current.playedInfluences,
      roundBonuses: current.roundBonuses,
      firstPlayer: current.firstPlayer,
      customerIndex,
      round: current.round,
      rules: { appealThreshold: PURCHASE_APPEAL_THRESHOLD }
    });
    if (result.winner) {
      const owner = players.find((player) => player.id === result.winner?.ownerId)!;
      const soldProduct = owner.shelf[result.winner.slotIndex];
      owner.money += result.winner.payout;
      owner.sales += 1;
      if (soldProduct && !result.winner.preserveStock) {
        soldProduct.stock -= 1;
        if (soldProduct.stock <= 0) {
          owner.shelf[result.winner.slotIndex] = null;
        }
      }
    }
    return result;
  });
  const { goals, rewards: goalRewards } = updatePartyGoalsAfterSales(current.partyGoals, saleResults, current.playedInfluences);
  const rewards = new Map<PlayerId, number>();
  goalRewards.forEach((reward) => rewards.set(reward.playerId, (rewards.get(reward.playerId) ?? 0) + reward.amount));

  return {
    ...current,
    phase: "sale_resolution",
    activePlayer: current.firstPlayer,
    players: players.map((player) => ({ ...player, money: player.money + (rewards.get(player.id) ?? 0) })),
    saleResults,
    saleInsights: [],
    lastSaleReview: { round: current.round, results: saleResults, insights: [] },
    partyGoals: goals,
    selectedProductId: null,
    selectedInfluenceId: null
  };
}

function continueAfterSales(current: GameState): GameState {
  let productDeck = current.productDeck;
  let influenceDeck = current.influenceDeck;
  const drawnPlayers = clonePlayers(current.players).map((player) => {
    let updated = player;
    [updated, productDeck] = drawProductsToLimit(updated, productDeck);
    [updated, influenceDeck] = drawInfluencesToLimit(updated, influenceDeck);
    return updated;
  });
  const shiftedTrends = current.activeTrends.length > 0 ? current.activeTrends.slice(1) : [];
  const [newTrend, trendDeck] = current.activeTrends.length > 0 ? drawCompatibleTrends(current.trendDeck, 1, shiftedTrends) : [[], current.trendDeck];
  const baseState = { ...current, players: drawnPlayers, productDeck, influenceDeck, trendDeck, activeTrends: [...shiftedTrends, ...newTrend] };

  if (current.round === 8) {
    return { ...baseState, phase: "game_end" };
  }

  if ([2, 4, 6].includes(current.round)) {
    const [offer, upgradeDeck] = draw(current.upgradeDeck, 3);
    const [a, b] = drawnPlayers;
    const upgradeQueue = a.money === b.money ? [current.firstPlayer, opponentOf(current.firstPlayer)] : a.money < b.money ? (["A", "B"] as PlayerId[]) : (["B", "A"] as PlayerId[]);
    return { ...baseState, phase: "upgrade", upgradeDeck, upgradeOffer: offer, upgradeQueue, activePlayer: upgradeQueue[0] };
  }

  return nextRoundAfterBreak(baseState);
}

function applyPlaceProduct(current: GameState, actor: PlayerId, payload: unknown): GameState {
  if (current.phase !== "planning" || current.activePlayer !== actor) {
    throw new Error("Invalid ranked product action.");
  }
  const { productInstanceId, slotIndex } = payload as { productInstanceId?: unknown; slotIndex?: unknown };
  if (typeof productInstanceId !== "string" || typeof slotIndex !== "number" || !Number.isInteger(slotIndex)) {
    throw new Error("Invalid ranked product payload.");
  }
  const players = clonePlayers(current.players);
  const player = players.find((candidate) => candidate.id === actor)!;
  const productIndex = player.productHand.findIndex((product) => product.instanceId === productInstanceId);
  const product = player.productHand[productIndex];
  if (!product || player.productActionUsed || slotIndex < 0 || slotIndex >= player.shelfSlots) {
    throw new Error("Invalid ranked product placement.");
  }
  const supplierBonus = hasUpgrade(player.upgrades, "supplier") ? 1 : 0;
  player.shelf[slotIndex] = supplierBonus > 0 ? { ...product, stock: product.stock + supplierBonus, baseStock: product.baseStock + supplierBonus } : { ...product };
  player.productHand.splice(productIndex, 1);
  player.productActionUsed = true;
  return { ...current, players, selectedProductId: null };
}

function applyReady(current: GameState, actor: PlayerId): GameState {
  if (current.phase !== "planning" || current.activePlayer !== actor || current.choiceDraft) {
    throw new Error("Invalid ranked ready action.");
  }
  const players = current.players.map((player) => ({ ...player, planned: player.id === actor ? true : player.planned }));
  const nextPlayer = players.find((player) => !player.planned);
  if (nextPlayer) {
    return { ...current, players, activePlayer: nextPlayer.id, selectedProductId: null, selectedInfluenceId: null };
  }
  return continueAfterSales(resolveRoundSales({ ...current, players }));
}

function replayTarget(payload: unknown): { tag?: Tag; ownerId?: PlayerId; slotIndex?: number } {
  const raw = (payload as { target?: { tag?: Tag; ownerId?: PlayerId; slotIndex?: number } }).target ?? {};
  return {
    tag: raw.tag,
    ownerId: raw.ownerId === "A" || raw.ownerId === "B" ? raw.ownerId : undefined,
    slotIndex: typeof raw.slotIndex === "number" && Number.isInteger(raw.slotIndex) ? raw.slotIndex : undefined
  };
}

function applyPlayInfluence(current: GameState, actor: PlayerId, payload: unknown): GameState {
  if (current.phase !== "planning" || current.activePlayer !== actor) {
    throw new Error("Invalid ranked influence action.");
  }
  const { cardId } = payload as { cardId?: unknown };
  if (typeof cardId !== "string") {
    throw new Error("Invalid ranked influence payload.");
  }
  const players = clonePlayers(current.players);
  const player = players.find((candidate) => candidate.id === actor)!;
  const cardIndex = player.influenceHand.findIndex((candidate) => candidate.id === cardId);
  const card = player.influenceHand[cardIndex];
  if (!card || player.influenceActionUsed) {
    throw new Error("Invalid ranked influence card.");
  }
  const target = replayTarget(payload);
  let productDeck = current.productDeck;
  let influenceDeck = current.influenceDeck;
  let choiceDraft = current.choiceDraft;
  let playedInfluences = current.playedInfluences;

  player.influenceHand.splice(cardIndex, 1);
  player.influenceActionUsed = true;

  if (card.effect.kind === "tag_modifier") {
    playedInfluences = [...playedInfluences, { id: card.id, name: card.name, ownerId: actor, modifiers: card.effect.modifiers }];
  }
  if (card.effect.kind === "anti_tag") {
    playedInfluences = [...playedInfluences, { id: card.id, name: card.name, ownerId: actor, modifiers: [{ tag: target.tag ?? current.selectedTag, value: card.effect.value }] }];
  }
  if (card.effect.kind === "target_own_bonus" || card.effect.kind === "target_opponent_penalty") {
    if (!target.ownerId || target.slotIndex === undefined) throw new Error("Invalid ranked influence target.");
    playedInfluences = [
      ...playedInfluences,
      {
        id: card.id,
        name: card.name,
        ownerId: actor,
        productAdjustments: [{ ownerId: target.ownerId, slotIndex: target.slotIndex, value: card.effect.value, label: card.name, preserveStock: "preserveStock" in card.effect ? card.effect.preserveStock : false }]
      }
    ];
  }
  if (card.effect.kind === "tie_preference") {
    playedInfluences = [...playedInfluences, { id: card.id, name: card.name, ownerId: actor, tieOwner: actor }];
  }
  if (card.effect.kind === "rearrange") {
    player.productActionUsed = false;
  }
  if (card.effect.kind === "draw_product") {
    const [cards, rest] = draw(productDeck, card.effect.draw);
    productDeck = rest;
    choiceDraft = cards.length ? { playerId: actor, type: "product", cards } : choiceDraft;
  }
  if (card.effect.kind === "draw_influence") {
    const [cards, rest] = draw(influenceDeck, card.effect.draw);
    influenceDeck = rest;
    choiceDraft = cards.length ? { playerId: actor, type: "influence", cards } : choiceDraft;
  }

  return { ...current, players, playedInfluences, productDeck, influenceDeck, choiceDraft, selectedInfluenceId: null };
}

function applyKeepDraftCard(current: GameState, actor: PlayerId, payload: unknown): GameState {
  const { index } = payload as { index?: unknown };
  if (!current.choiceDraft || current.choiceDraft.playerId !== actor || typeof index !== "number" || !Number.isInteger(index)) {
    throw new Error("Invalid ranked draft action.");
  }
  const keep = current.choiceDraft.cards[index];
  if (!keep) {
    throw new Error("Invalid ranked draft index.");
  }
  const players = clonePlayers(current.players);
  const player = players.find((candidate) => candidate.id === actor)!;
  if (current.choiceDraft.type === "product") {
    player.productHand.push(keep as ProductInstance);
  } else {
    player.influenceHand.push(keep as InfluenceCard);
  }
  return { ...current, players, choiceDraft: null };
}

function applyAdTable(current: GameState, actor: PlayerId, payload: unknown): GameState {
  const { slotIndex } = payload as { slotIndex?: unknown };
  if (current.phase !== "planning" || current.activePlayer !== actor || typeof slotIndex !== "number" || !Number.isInteger(slotIndex)) {
    throw new Error("Invalid ranked ad table action.");
  }
  const players = clonePlayers(current.players);
  const player = players.find((candidate) => candidate.id === actor)!;
  if (player.tableBonusUsed || !hasUpgrade(player.upgrades, "ad_table")) {
    throw new Error("Invalid ranked ad table use.");
  }
  player.tableBonusUsed = true;
  return { ...current, players, roundBonuses: [...current.roundBonuses, { ownerId: actor, slotIndex, value: 1, label: "Рекламный столик" }] };
}

function applyBuyUpgrade(current: GameState, actor: PlayerId, payload: unknown): GameState {
  const { upgradeId } = payload as { upgradeId?: unknown };
  if (current.phase !== "upgrade" || current.upgradeQueue[0] !== actor || typeof upgradeId !== "string") {
    throw new Error("Invalid ranked upgrade buy.");
  }
  const upgrade = current.upgradeOffer.find((candidate) => candidate.id === upgradeId);
  const players = clonePlayers(current.players);
  const buyer = players.find((player) => player.id === actor)!;
  if (!upgrade || buyer.money < upgrade.cost) {
    throw new Error("Invalid ranked upgrade purchase.");
  }
  buyer.money -= upgrade.cost;
  buyer.upgrades.push(upgrade);
  if (upgrade.effect === "extra_shelf") {
    buyer.shelfSlots += 1;
    buyer.shelf.push(null);
  }
  const queue = current.upgradeQueue.slice(1);
  const next = { ...current, players, upgradeOffer: current.upgradeOffer.filter((candidate) => candidate.id !== upgrade.id), upgradeQueue: queue, activePlayer: queue[0] ?? current.firstPlayer };
  return queue.length ? next : nextRoundAfterBreak(next);
}

function applySkipUpgrade(current: GameState, actor: PlayerId): GameState {
  if (current.phase !== "upgrade" || current.upgradeQueue[0] !== actor) {
    throw new Error("Invalid ranked upgrade skip.");
  }
  const queue = current.upgradeQueue.slice(1);
  const next = { ...current, upgradeQueue: queue, activePlayer: queue[0] ?? current.firstPlayer };
  return queue.length ? next : nextRoundAfterBreak(next);
}

export function applyRankedReplayEvent(current: GameState, event: RankedReplayEvent, playerMap: RankedReplayPlayerMap): GameState {
  const actor = actorSeat(event.actorId, playerMap);
  if (event.eventType === "place_product") {
    return applyPlaceProduct(current, actor, event.payload);
  }
  if (event.eventType === "ready") {
    return applyReady(current, actor);
  }
  if (event.eventType === "play_influence") {
    return applyPlayInfluence(current, actor, event.payload);
  }
  if (event.eventType === "keep_draft_card") {
    return applyKeepDraftCard(current, actor, event.payload);
  }
  if (event.eventType === "use_ad_table") {
    return applyAdTable(current, actor, event.payload);
  }
  if (event.eventType === "buy_upgrade") {
    return applyBuyUpgrade(current, actor, event.payload);
  }
  if (event.eventType === "skip_upgrade") {
    return applySkipUpgrade(current, actor);
  }
  throw new Error(`Unsupported ranked replay event: ${event.eventType}`);
}

export function rankedOutcomeFromState(state: GameState): RankedReplayOutcome {
  const playerA = state.players.find((player) => player.id === "A")!;
  const playerB = state.players.find((player) => player.id === "B")!;
  return { playerACoins: playerA.money, playerBCoins: playerB.money, playerASales: playerA.sales, playerBSales: playerB.sales };
}

export function replayRankedEvents(initialState: GameState, events: RankedReplayEvent[], playerMap: RankedReplayPlayerMap): RankedReplayOutcome {
  const finalState = events.reduce((current, event) => applyRankedReplayEvent(current, event, playerMap), initialState);
  if (finalState.phase !== "game_end") {
    throw new Error("Ranked replay did not reach game end.");
  }
  return rankedOutcomeFromState(finalState);
}
