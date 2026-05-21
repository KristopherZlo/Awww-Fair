import {
  DEFAULT_INITIAL_STATE_OPTIONS,
  DEFAULT_TURN_TIME_SECONDS,
  clampTurnTime
} from "../app/gameConfig";
import type { GameState, InitialStateOptions } from "../app/types";
import {
  CUSTOMER_CARDS,
  INFLUENCE_CARDS,
  PRODUCT_CARDS,
  TREND_CARDS,
  UPGRADE_CARDS
} from "../data/cards";
import { buildDeck, createProductInstance, PURCHASE_APPEAL_THRESHOLD, shuffleDeck } from "./engine";
import { createPartyGoals } from "./goals";
import { campaignCustomerForRules } from "./levels";
import { drawCompatibleTrends } from "./trends";
import type { InfluenceCard, PlayerId, PlayerState, ProductInstance } from "./types";

export const GAME_TITLE = "Awww Fair: Hat Hustle";

export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function draw<T>(deck: T[], count: number): [T[], T[]] {
  return [deck.slice(0, count), deck.slice(count)];
}

function makeProductDeck(random: () => number) {
  let copy = 0;
  return shuffleDeck(
    buildDeck(PRODUCT_CARDS, 2).map((card) => createProductInstance(card, `${card.id}-${copy++}`)),
    random
  );
}

function createPlayer(id: PlayerId, productHand: ProductInstance[], influenceHand: InfluenceCard[]): PlayerState {
  return {
    id,
    name: id === "A" ? "Вы" : "Оппонент",
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

export function buildInitialState(
  sound = true,
  turnTimeSeconds = DEFAULT_TURN_TIME_SECONDS,
  options: InitialStateOptions = DEFAULT_INITIAL_STATE_OPTIONS,
  random: () => number = Math.random
): GameState {
  let productDeck = makeProductDeck(random);
  let influenceDeck = shuffleDeck([...INFLUENCE_CARDS], random);
  let customerDeck = shuffleDeck(
    CUSTOMER_CARDS.map((customer) =>
      campaignCustomerForRules(customer, {
        trendCount: options.trendCount,
        partyGoalCount: options.partyGoalCount,
        influenceHandSize: options.influenceHandSize,
        purchaseAppealThreshold: PURCHASE_APPEAL_THRESHOLD,
        customerPersonalityMode: options.customerPersonalityMode
      })
    ),
    random
  );
  let trendDeck = shuffleDeck([...TREND_CARDS], random);

  const [aProducts, afterAProducts] = draw(productDeck, 4);
  const [bProducts, afterBProducts] = draw(afterAProducts, 4);
  const [aInfluence, afterAInfluence] = draw(influenceDeck, options.influenceHandSize);
  const [bInfluence, afterBInfluence] = draw(afterAInfluence, options.influenceHandSize);
  const [trends, afterTrends] = drawCompatibleTrends(trendDeck, options.trendCount);
  const [customers, afterCustomers] = draw(customerDeck, 1);
  const firstPlayer = random() > 0.5 ? "A" : "B";

  productDeck = afterBProducts;
  influenceDeck = afterBInfluence;
  trendDeck = afterTrends;
  customerDeck = afterCustomers;

  return {
    phase: "menu",
    round: 1,
    firstPlayer,
    activePlayer: firstPlayer,
    players: [createPlayer("A", aProducts, aInfluence), createPlayer("B", bProducts, bInfluence)],
    productDeck,
    influenceDeck,
    customerDeck,
    trendDeck,
    upgradeDeck: shuffleDeck([...UPGRADE_CARDS], random),
    activeTrends: trends,
    currentCustomers: customers,
    playedInfluences: [],
    roundBonuses: [],
    saleResults: [],
    saleInsights: [],
    lastSaleReview: null,
    logs: [`Добро пожаловать в ${GAME_TITLE}.`],
    selectedProductId: null,
    selectedInfluenceId: null,
    selectedTag: "сладкое",
    upgradeOffer: [],
    upgradeQueue: [],
    choiceDraft: null,
    pause: { active: false, pausedBy: null },
    partyGoals: options.partyGoalCount > 0 ? createPartyGoals(trends, customers, random, options.partyGoalCount) : [],
    sound,
    aiPlayerId: null,
    aiMode: null,
    aiDifficulty: null,
    aiScore: 0,
    aiIntent: null,
    campaignRun: null,
    turnTimeSeconds: clampTurnTime(turnTimeSeconds)
  };
}
