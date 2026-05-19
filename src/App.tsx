import {
  BadgeHelp,
  Bot,
  ChevronLeft,
  Check,
  Coins,
  Coffee,
  ExternalLink,
  Flag,
  Github,
  HandCoins,
  Info,
  Languages,
  Lock,
  LogOut,
  Mail,
  Map as MapIcon,
  Music,
  PackagePlus,
  Pause,
  Play,
  RefreshCw,
  ScrollText,
  ShoppingBasket,
  Settings,
  SkipForward,
  Sparkles,
  Timer,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CUSTOMER_CARDS,
  INFLUENCE_CARDS,
  PRODUCT_CARDS,
  TAGS,
  TAG_COLORS,
  TREND_CARDS,
  UPGRADE_CARDS
} from "./data/cards";
import {
  buildDeck,
  createProductInstance,
  hasUpgrade,
  productHandLimit,
  PURCHASE_APPEAL_THRESHOLD,
  resolveCustomerPurchase,
  shuffleDeck,
  trendModifierValue
} from "./game/engine";
import { createPartyGoals, normalizePartyGoal, PARTY_GOAL_REWARD, updatePartyGoalsAfterSales, type PartyGoal } from "./game/goals";
import { chooseAiUpgrade, chooseWeakAiUpgrade, planAiPlanningTurn, planAiPlanningTurnForDifficulty, planWeakAiPlanningTurn, type AiInfluenceMove, type AiPlanningPlan } from "./game/ai";
import { clampVolume, playSoundEffect, type SoundEffectId } from "./audio/soundEffects";
import { CAMPAIGN_LEVELS, campaignProgressAfterWin, createDefaultCampaignProgress, isLevelUnlocked, type CampaignLevel, type CampaignProgress } from "./game/levels";
import {
  LANGUAGE_OPTIONS,
  type Language,
  aiDifficultyLabel,
  campaignLevelDistrict,
  campaignLevelSpecies,
  campaignLevelStory,
  campaignLevelTitle,
  coinText,
  cutsceneText,
  customerName,
  customerPersonalityDescription,
  customerPersonalityLabel,
  goalTitle,
  influenceDescription,
  influenceName,
  normalizeLanguage,
  productName,
  tagText,
  trendName,
  ui,
  upgradeDescription,
  upgradeName
} from "./i18n";
import type {
  CustomerCard as CustomerCardType,
  InfluenceCard as InfluenceCardType,
  Phase,
  PlayedInfluence,
  PlayerId,
  PlayerState,
  ProductAdjustment,
  ProductInstance,
  PurchaseResult,
  Tag,
  TrendCard as TrendCardType,
  UpgradeCard as UpgradeCardType
} from "./game/types";

const assetUrl = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
const PRODUCT_ATLAS = assetUrl("product-atlas.png");
const CUSTOMER_ATLAS = assetUrl("customer-atlas-128.png");
const CUSTOMER_ATLAS_2X = assetUrl("customer-atlas-256.png");
const MARKET_BG = assetUrl("market-bg.png");
const GAME_TITLE = "Awww Fair: Hat Hustle";
const MENU_TRACK = { title: "Main Menu", src: assetUrl("music/main-menu.mp3") } as const;
const CUTSCENE_TRACK = { title: "Cutscene", src: assetUrl("music/cutscene.mp3") } as const;
const MUSIC_TRACKS = [
  { title: "Lofi Comfy", src: assetUrl("music/loficomfy.mp3") },
  { title: "Lofi Doofy", src: assetUrl("music/lofidoofy.mp3") },
  { title: "Pastel Market", src: assetUrl("music/pastel-market.mp3") },
  { title: "Stroll", src: assetUrl("music/stroll.mp3") }
] as const;
const DEFAULT_TRACK_INDEX = MUSIC_TRACKS.findIndex((track) => track.title === "Stroll");
const MUSIC_FADE_MS = 1000;
const MUSIC_VOLUME_DUCK_MS = 1000;
const DEFAULT_TURN_TIME_SECONDS = 45;
const MIN_TURN_TIME_SECONDS = 15;
const MAX_TURN_TIME_SECONDS = 120;
const SESSION_STORAGE_KEY = "trend-market-session-v1";
const SESSION_STORAGE_VERSION = 1;
const CAMPAIGN_STORAGE_KEY = "trend-market-campaign-v1";
const SOUND_ASSETS = {
  defeat: assetUrl("sounds/defeat.wav"),
  money: assetUrl("sounds/money.wav"),
  victory: assetUrl("sounds/victory.wav")
} as const;

const DEFAULT_AUDIO_SETTINGS = {
  musicEnabled: true,
  effectsEnabled: true,
  musicVolume: 0.3,
  effectsVolume: 1,
  turnTimeSeconds: DEFAULT_TURN_TIME_SECONDS,
  language: "ru" as Language
};

const CUTSCENE_FRAMES = [
  {
    image: assetUrl("cutscene/aaakh-01.png"),
    text: "В мире Ааах начинается большая ярмарка."
  },
  {
    image: assetUrl("cutscene/aaakh-02.png"),
    text: "Каждый год лучшие продавцы собираются на Великой ярмарке мира Ааах."
  },
  {
    image: assetUrl("cutscene/aaakh-03.png"),
    text: "Но в этот раз у нас есть цель - заработать на новую шляпу."
  },
  {
    image: assetUrl("cutscene/aaakh-04.png"),
    text: "Чтобы купить её, нужно стать лучшими продавцами ярмарки."
  },
  {
    image: assetUrl("cutscene/aaakh-05.png"),
    text: "Наша лавка готова. Всё только начинается."
  },
  {
    image: assetUrl("cutscene/aaakh-06.png"),
    text: "Но победа не достанется просто так."
  },
  {
    image: assetUrl("cutscene/aaakh-07.png"),
    text: "Первый клиент уже идёт!"
  },
  {
    image: assetUrl("cutscene/aaakh-08.png"),
    text: "Пора открыть лавку и начать путь к новой шляпе."
  }
] as const;

type MusicStatus = "idle" | "playing" | "paused" | "blocked";
type AiMode = "opponent" | "training";
type MenuView = "main" | "levels";
const AI_PLAYER_ID: PlayerId = "B";
const AI_TURN_DELAY_MAX_MS = 5_000;
const AI_DIFFICULTIES = [
  { label: "Картошка", value: 3 },
  { label: "Купи слона", value: 8 },
  { label: "Зазывала", value: 14 },
  { label: "Волк с Уолл-стрит", value: 20 },
  { label: "Бизнес-Енот", value: 24 }
] as const;

type AiDifficultyOption = (typeof AI_DIFFICULTIES)[number];

interface AudioSettings {
  musicEnabled: boolean;
  effectsEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
  turnTimeSeconds: number;
  language: Language;
}

interface ChoiceDraft {
  playerId: PlayerId;
  type: "product" | "influence";
  cards: Array<ProductInstance | InfluenceCardType>;
}

interface PauseState {
  active: boolean;
  pausedBy: PlayerId | null;
}

interface CampaignRun {
  level: number;
  aiDifficulty: number;
  opponentName: string;
  opponentNameEn: string;
  unlockRecorded: boolean;
}

interface GameState {
  phase: Phase;
  round: number;
  firstPlayer: PlayerId;
  activePlayer: PlayerId;
  players: PlayerState[];
  productDeck: ProductInstance[];
  influenceDeck: InfluenceCardType[];
  customerDeck: CustomerCardType[];
  trendDeck: TrendCardType[];
  upgradeDeck: UpgradeCardType[];
  activeTrends: TrendCardType[];
  currentCustomers: CustomerCardType[];
  playedInfluences: PlayedInfluence[];
  roundBonuses: ProductAdjustment[];
  saleResults: PurchaseResult[];
  saleInsights: string[];
  logs: string[];
  selectedProductId: string | null;
  selectedInfluenceId: string | null;
  selectedTag: Tag;
  upgradeOffer: UpgradeCardType[];
  upgradeQueue: PlayerId[];
  choiceDraft: ChoiceDraft | null;
  pause: PauseState;
  partyGoals: PartyGoal[];
  sound: boolean;
  aiPlayerId: PlayerId | null;
  aiMode: AiMode | null;
  aiDifficulty: number | null;
  aiScore: number;
  aiIntent: string | null;
  campaignRun: CampaignRun | null;
  turnTimeSeconds: number;
}

interface CutsceneState {
  level: CampaignLevel;
  frameIndex: number;
}

interface LobbySession {
  code: string;
  playerId: PlayerId;
  token: string;
  version: number;
  seats: Record<PlayerId, boolean>;
}

interface LobbyResponse {
  code: string;
  playerId?: PlayerId;
  token?: string;
  version: number;
  state: GameState;
  seats: Record<PlayerId, boolean>;
}

interface NetworkResponse {
  urls?: unknown;
}

const LOBBY_API = "/api/lobbies";

interface SavedSession {
  version: typeof SESSION_STORAGE_VERSION;
  state: GameState;
  lobby: LobbySession | null;
  audioSettings: AudioSettings;
}

function draw<T>(deck: T[], count: number): [T[], T[]] {
  return [deck.slice(0, count), deck.slice(count)];
}

function makeProductDeck() {
  let copy = 0;
  return shuffleDeck(buildDeck(PRODUCT_CARDS, 2).map((card) => createProductInstance(card, `${card.id}-${copy++}`)));
}

function createPlayer(id: PlayerId, productHand: ProductInstance[], influenceHand: InfluenceCardType[]): PlayerState {
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

function clampTurnTime(seconds: number) {
  return Math.max(MIN_TURN_TIME_SECONDS, Math.min(MAX_TURN_TIME_SECONDS, Math.round(seconds)));
}

function buildInitialState(sound = true, turnTimeSeconds = DEFAULT_TURN_TIME_SECONDS): GameState {
  let productDeck = makeProductDeck();
  let influenceDeck = shuffleDeck([...INFLUENCE_CARDS]);
  let customerDeck = shuffleDeck([...CUSTOMER_CARDS]);
  let trendDeck = shuffleDeck([...TREND_CARDS]);

  const [aProducts, afterAProducts] = draw(productDeck, 4);
  const [bProducts, afterBProducts] = draw(afterAProducts, 4);
  const [aInfluence, afterAInfluence] = draw(influenceDeck, 2);
  const [bInfluence, afterBInfluence] = draw(afterAInfluence, 2);
  const [trends, afterTrends] = draw(trendDeck, 3);
  const [customers, afterCustomers] = draw(customerDeck, 1);
  const firstPlayer = Math.random() > 0.5 ? "A" : "B";

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
    upgradeDeck: shuffleDeck([...UPGRADE_CARDS]),
    activeTrends: trends,
    currentCustomers: customers,
    playedInfluences: [],
    roundBonuses: [],
    saleResults: [],
    saleInsights: [],
    logs: [`Добро пожаловать в ${GAME_TITLE}.`],
    selectedProductId: null,
    selectedInfluenceId: null,
    selectedTag: "сладкое",
    upgradeOffer: [],
    upgradeQueue: [],
    choiceDraft: null,
    pause: { active: false, pausedBy: null },
    partyGoals: createPartyGoals(trends, customers),
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

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

function viewerIdFor(lobby: LobbySession | null, aiPlayerId: PlayerId | null): PlayerId {
  return lobby?.playerId ?? (aiPlayerId ? opponentOf(aiPlayerId) : "A");
}

function moneySoundPlayerIdFor(state: GameState, lobby: LobbySession | null): PlayerId {
  if (lobby) {
    return lobby.playerId;
  }

  if (state.aiPlayerId) {
    return opponentOf(state.aiPlayerId);
  }

  return state.activePlayer;
}

function displayPlayerName(playerId: PlayerId, viewerId: PlayerId, language: Language) {
  return playerId === viewerId ? ui(language, "you") : ui(language, "opponent");
}

function displayPlayerNameFor(player: PlayerState | undefined, viewerId: PlayerId, language: Language) {
  if (!player) {
    return ui(language, "opponent");
  }
  if (player.id === viewerId) {
    return ui(language, "you");
  }
  return player.name && !["Вы", "Оппонент"].includes(player.name) ? player.name : ui(language, "opponent");
}

function ownerPhrase(playerId: PlayerId, viewerId: PlayerId, language: Language) {
  if (language === "en") {
    return playerId === viewerId ? "for you" : "for the opponent";
  }
  return playerId === viewerId ? "у вас" : "у оппонента";
}

function actionPlayerName(playerId: PlayerId, viewerId: PlayerId, language: Language) {
  return displayPlayerName(playerId, viewerId, language);
}

function formatTurnTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function randomAiTurnDelayMs() {
  return Math.floor(Math.random() * (AI_TURN_DELAY_MAX_MS + 1));
}

function gameOutcome(players: PlayerState[], viewerId: PlayerId, language: Language) {
  const [a, b] = players;
  const winner =
    a.money === b.money
      ? a.sales === b.sales
        ? null
        : a.sales > b.sales
          ? a.id
          : b.id
      : a.money > b.money
        ? a.id
        : b.id;
  const decidedBySales = winner !== null && a.money === b.money && a.sales !== b.sales;
  const viewerMoney = players.find((player) => player.id === viewerId)?.money ?? 0;
  const opponentMoney = players.find((player) => player.id === opponentOf(viewerId))?.money ?? 0;
  const scoreLine =
    language === "en"
      ? `You: ${viewerMoney} coins, Opponent: ${opponentMoney} coins.`
      : `Вы — ${viewerMoney} монет, Оппонент — ${
    players.find((player) => player.id === opponentOf(viewerId))?.money ?? 0
  } монет.`;

  if (!winner) {
    return {
      title: language === "en" ? "Draw" : "Ничья",
      tone: "draw" as const,
      message: language === "en" ? `${scoreLine} Sales are tied too, so the market stays friendly.` : `${scoreLine} Продажи тоже равны, рынок остался дружеским.`,
      sound: "victory" as const
    };
  }

  const won = winner === viewerId;
  return {
    title: won ? (language === "en" ? "You won" : "Вы победили") : language === "en" ? "You lost" : "Вы проиграли",
    tone: won ? ("victory" as const) : ("defeat" as const),
    message: `${scoreLine}${decidedBySales ? (language === "en" ? " Sales decided the winner." : " Победителя решили продажи.") : ""}`,
    sound: won ? ("victory" as const) : ("defeat" as const)
  };
}

function winningPlayerId(players: PlayerState[]): PlayerId | null {
  const [a, b] = players;
  if (a.money === b.money) {
    if (a.sales === b.sales) {
      return null;
    }
    return a.sales > b.sales ? a.id : b.id;
  }
  return a.money > b.money ? a.id : b.id;
}

function formatModifiers(modifiers: { tag: Tag; value: number }[], language: Language, focused = false) {
  return modifiers
    .map((modifier) => {
      const value = trendModifierValue(modifier.value, focused);
      return `${tagText(language, modifier.tag)} ${value > 0 ? "+" : ""}${value}`;
    })
    .join(", ");
}

function formatSignedScore(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function isFocusTrendLine(label: string) {
  return label.includes("(главный тренд)");
}

function lineTag(label: string) {
  return label.split(":").pop()?.replace("(главный тренд)", "").trim() ?? "";
}

function lineSource(label: string) {
  return label.split(":")[0]?.trim() ?? label;
}

function isWinningCandidate(result: PurchaseResult, candidate: PurchaseResult["candidates"][number]) {
  return (
    result.winner?.ownerId === candidate.ownerId &&
    result.winner.slotIndex === candidate.slotIndex &&
    result.winner.product.instanceId === candidate.product.instanceId
  );
}

function describeSaleInsight(result: PurchaseResult, viewerId: PlayerId, language: Language) {
  if (language === "en") {
    if (!result.winner) {
      if (result.customer.personality?.kind === "trend_chaser") {
        return `${customerName(language, result.customer)} bought nothing: no product matched the needed trend.`;
      }
      return `${customerName(language, result.customer)} bought nothing: no product reached ${PURCHASE_APPEAL_THRESHOLD} appeal.`;
    }

    return `${customerName(language, result.customer)} chose ${productName(language, result.winner.product)}: ${displayPlayerName(
      result.winner.ownerId,
      viewerId,
      language
    )} had the best appeal.`;
  }

  if (!result.winner) {
    if (result.customer.personality?.kind === "trend_chaser") {
      return `${result.customer.name} ничего не купил: ни один товар не попал в нужный тренд.`;
    }
    return `${result.customer.name} ничего не купил: ни один товар не набрал ${PURCHASE_APPEAL_THRESHOLD} привлекательности.`;
  }

  const winnerName = displayPlayerName(result.winner.ownerId, viewerId, language);
  const lines = result.winner.appeal.breakdown;
  const focusTrend = lines.find((line) => isFocusTrendLine(line.label));
  const primaryWish = lines.find((line) => line.label.startsWith("главное желание"));
  const secondaryWish = lines.find((line) => line.label.startsWith("второе желание"));
  const personality = lines.find((line) => line.label.startsWith("характер"));
  const influence = lines.find((line) => result.winner && !line.label.includes("желание") && !line.label.includes("тренд") && Math.abs(line.value) >= 1);
  const regularTrend = lines.find((line) => !isFocusTrendLine(line.label) && result.winner && line.label.includes(":") && !line.label.includes("желание"));

  let reason = "общая привлекательность оказалась выше соперника";
  if (focusTrend) {
    reason = `${winnerName} использовал главный тренд «${lineSource(focusTrend.label)}»`;
  } else if (primaryWish) {
    reason = `совпало главное желание «${lineTag(primaryWish.label)}»`;
  } else if (secondaryWish) {
    reason = `совпало второе желание «${lineTag(secondaryWish.label)}»`;
  } else if (personality) {
    reason = `сработал характер клиента: ${lineTag(personality.label)}`;
  } else if (influence) {
    reason = `${winnerName} получил решающий бонус от «${lineSource(influence.label)}»`;
  } else if (regularTrend) {
    reason = `${winnerName} попал в тренд «${lineSource(regularTrend.label)}»`;
  }

  return `${result.customer.name} выбрал ${result.winner.product.name}: ${reason}.`;
}

function countShelfTag(player: PlayerState, tag: Tag) {
  return player.shelf.reduce((total, product) => total + (product?.tags.includes(tag) ? 1 : 0), 0);
}

function influenceImpactLines(card: InfluenceCardType, owner: PlayerState, opponent: PlayerState, selectedTag: Tag) {
  const modifiers =
    card.effect.kind === "tag_modifier"
      ? card.effect.modifiers
      : card.effect.kind === "anti_tag"
        ? [{ tag: selectedTag, value: card.effect.value }]
        : [];

  return modifiers.map((modifier) => {
    const ownCount = countShelfTag(owner, modifier.tag);
    const opponentCount = countShelfTag(opponent, modifier.tag);
    return {
      ...modifier,
      ownCount,
      opponentCount,
      ownDelta: ownCount * modifier.value,
      opponentDelta: opponentCount * modifier.value
    };
  });
}

function buildCoachAdvice(plan: AiPlanningPlan | null, player: PlayerState, language: Language): string[] {
  if (!plan) {
    return [];
  }

  const advice: string[] = [];
  if (plan.productMove && !player.productActionUsed) {
    const product = player.productHand.find((candidate) => candidate.instanceId === plan.productMove?.productInstanceId);
    if (product) {
      advice.push(
        language === "en"
          ? `Place ${productName(language, product)} in slot ${plan.productMove.slotIndex + 1}: its tags fit the current customers and trends better.`
          : `Лучше выставить ${product.name} в слот ${plan.productMove.slotIndex + 1}: его теги сильнее работают с текущими клиентами и трендами.`
      );
    }
  } else if (!player.productActionUsed && player.productHand.length > 0) {
    advice.push(language === "en" ? "Do not change the shelf blindly: the current replacement does not clearly improve sales." : "Лучше не менять полку вслепую: текущая замена не даёт явного прироста продаж.");
  }

  if (plan.influenceMove && !player.influenceActionUsed) {
    const card = player.influenceHand.find((candidate) => candidate.id === plan.influenceMove?.cardId);
    if (card) {
      advice.push(
        language === "en"
          ? `Play ${influenceName(language, card)}: this card shifts the current sale more in your favor.`
          : `Лучше сыграть ${card.name}: эта карта сильнее меняет текущую продажу в вашу пользу.`
      );
    }
  } else if (!player.influenceActionUsed && player.influenceHand.length > 0) {
    advice.push(language === "en" ? "Save the influence card: it does not give enough advantage right now." : "Лучше сохранить влияние: сейчас карта не даёт достаточно сильного преимущества.");
  }

  return advice;
}

function tagDemandForIntent(current: Pick<GameState, "currentCustomers" | "activeTrends">, tag: Tag) {
  const customerDemand = current.currentCustomers.reduce((total, customer) => {
    return total + (customer.primaryTag === tag ? 3 : 0) + (customer.secondaryTag === tag ? 2 : 0);
  }, 0);
  const trendDemand = current.activeTrends.reduce((total, trend, index) => {
    return total + trend.modifiers.reduce((sum, modifier) => sum + (modifier.tag === tag ? trendModifierValue(modifier.value, index === 0) : 0), 0);
  }, 0);
  return customerDemand + trendDemand;
}

function bestIntentTag(current: Pick<GameState, "currentCustomers" | "activeTrends">, product: ProductInstance) {
  return [...product.tags].sort((left, right) => tagDemandForIntent(current, right) - tagDemandForIntent(current, left))[0] ?? product.tags[0];
}

function focusTrendNameForTag(current: Pick<GameState, "activeTrends">, tag: Tag, language: Language) {
  const focusTrend = current.activeTrends[0];
  return focusTrend?.modifiers.some((modifier) => modifier.tag === tag) ? trendName(language, focusTrend) : null;
}

function partyGoalClassName(goal: PartyGoal, localPlayerId: PlayerId) {
  const ownerClass = goal.completedBy ? (goal.completedBy === localPlayerId ? "completed-by-you" : "completed-by-opponent") : "";
  return ["party-goal", goal.completed ? "completed" : "", ownerClass].filter(Boolean).join(" ");
}

function buildAiPlanningIntent(current: GameState, player: PlayerState, plan: AiPlanningPlan, language: Language) {
  if (plan.productMove) {
    const product = player.productHand.find((candidate) => candidate.instanceId === plan.productMove?.productInstanceId);
    if (product) {
      const tag = bestIntentTag(current, product);
      const focusName = focusTrendNameForTag(current, tag, language);
      if (language === "en") {
        return `Opponent is leaning into ${tagText(language, tag)}: placed ${productName(language, product)}${focusName ? ` for ${focusName}` : ""}.`;
      }
      return `Оппонент делает ставку на ${tag}: выставил ${product.name}${focusName ? ` под ${focusName}` : ""}.`;
    }
  }

  if (plan.influenceMove) {
    const influence = player.influenceHand.find((candidate) => candidate.id === plan.influenceMove?.cardId);
    if (influence) {
      return language === "en"
        ? `Opponent played ${influenceName(language, influence)}: trying to shift the next sale.`
        : `Оппонент сыграл ${influence.name}: пытается изменить ближайшую продажу.`;
    }
  }

  if (plan.tableBonusMove) {
    return language === "en" ? "Opponent boosted a product with the ad table." : "Оппонент усилил товар рекламным столиком.";
  }

  return language === "en" ? "Opponent is saving resources and waiting for a stronger move." : "Оппонент копит ресурсы и ждёт более сильный ход.";
}

function Sprite({
  atlas,
  cols,
  rows,
  col,
  row,
  atlas2x,
  className = ""
}: {
  atlas: string;
  cols: number;
  rows: number;
  col: number;
  row: number;
  atlas2x?: string;
  className?: string;
}) {
  const x = cols === 1 ? 0 : (col / (cols - 1)) * 100;
  const y = rows === 1 ? 0 : (row / (rows - 1)) * 100;
  const spriteAtlas = atlas2x ? `image-set(url("${atlas}") 1x, url("${atlas2x}") 2x)` : `url("${atlas}")`;
  return (
    <span
      className={`sprite ${className}`}
      style={{
        "--sprite-atlas": spriteAtlas,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${x}% ${y}%`
      } as React.CSSProperties}
    />
  );
}

function TagPill({ tag, language, matched }: { tag: Tag; language: Language; matched?: boolean }) {
  return (
    <span
      className={`tag ${matched ? "matched" : ""}`}
      style={{ "--tag-color": TAG_COLORS[tag] } as React.CSSProperties}
    >
      {tagText(language, tag)}
    </span>
  );
}

function ProductCard({
  product,
  compact = false,
  selected = false,
  recommended = false,
  disabled = false,
  ariaDisabled = false,
  onClick,
  title,
  focusTags,
  language
}: {
  product: ProductInstance;
  compact?: boolean;
  selected?: boolean;
  recommended?: boolean;
  disabled?: boolean;
  ariaDisabled?: boolean;
  onClick?: () => void;
  title?: string;
  focusTags?: Set<Tag>;
  language: Language;
}) {
  const label = productName(language, product);
  return (
    <button
      className={`card product-card ${compact ? "compact" : ""} ${selected ? "selected" : ""} ${recommended ? "coach-recommended" : ""}`}
      disabled={disabled}
      aria-disabled={ariaDisabled || disabled || undefined}
      onClick={onClick}
      title={title}
    >
      <Sprite atlas={PRODUCT_ATLAS} cols={4} rows={3} col={product.sprite.col} row={product.sprite.row} className="product-sprite" />
      <span className="product-copy card-copy">
        <strong>{label}</strong>
        <span className="tag-row">
        {product.tags.map((tag) => (
          <TagPill key={tag} tag={tag} language={language} matched={focusTags?.has(tag)} />
        ))}
        </span>
        <span className="card-meta">
        <span>{product.price} {coinText(language, product.price)}</span>
        <span>{language === "en" ? "stock" : "запас"} {product.stock}</span>
        </span>
      </span>
    </button>
  );
}

function CustomerCard({ customer, focusTags, language }: { customer: CustomerCardType; focusTags?: Set<Tag>; language: Language }) {
  const label = customerName(language, customer);
  const personalityLabel = customerPersonalityLabel(language, customer);
  const personalityDescription = customerPersonalityDescription(language, customer);
  return (
    <div
      className="card customer-card"
      title={
        language === "en"
          ? `${label}: primary ${tagText(language, customer.primaryTag)}, secondary ${tagText(language, customer.secondaryTag)}${customer.personality ? `. Personality: ${personalityDescription}` : ""}`
          : `${label}: главное ${tagText(language, customer.primaryTag)}, второе ${tagText(language, customer.secondaryTag)}${customer.personality ? `. Характер: ${personalityDescription}` : ""}`
      }
    >
      <Sprite atlas={CUSTOMER_ATLAS} atlas2x={CUSTOMER_ATLAS_2X} cols={4} rows={4} col={customer.sprite.col} row={customer.sprite.row} className="customer-sprite" />
      <div className="customer-copy card-copy">
        <strong>{label}</strong>
        {customer.personality && <small className="personality-line">{personalityLabel}</small>}
        <div className="tag-row">
        <TagPill tag={customer.primaryTag} language={language} matched />
        <TagPill tag={customer.secondaryTag} language={language} matched={focusTags?.has(customer.secondaryTag)} />
        </div>
      </div>
    </div>
  );
}

function TrendCard({ trend, focused = false, language }: { trend: TrendCardType; focused?: boolean; language: Language }) {
  const label = trendName(language, trend);
  const modifiers = formatModifiers(trend.modifiers, language, focused);
  return (
    <div className={`trend-card ${focused ? "focus-trend" : ""}`} title={`${label}: ${modifiers}`}>
      <Sparkles size={18} />
      <div className="trend-copy">
        {focused && <em>{ui(language, "focusTrend")}</em>}
        <strong>{label}</strong>
        <span>{modifiers}</span>
      </div>
    </div>
  );
}

function InfluenceCard({
  card,
  selected,
  recommended = false,
  disabled,
  onClick,
  language
}: {
  card: InfluenceCardType;
  selected: boolean;
  recommended?: boolean;
  disabled: boolean;
  onClick: () => void;
  language: Language;
}) {
  const label = influenceName(language, card);
  const description = influenceDescription(language, card);
  return (
    <button className={`card influence-card ${selected ? "selected" : ""} ${recommended ? "coach-recommended" : ""}`} disabled={disabled} onClick={onClick} title={description}>
      <ScrollText size={20} />
      <span className="influence-copy card-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
    </button>
  );
}

function UpgradeCard({
  upgrade,
  canBuy,
  onBuy,
  language
}: {
  upgrade: UpgradeCardType;
  canBuy: boolean;
  onBuy: () => void;
  language: Language;
}) {
  const label = upgradeName(language, upgrade);
  const description = upgradeDescription(language, upgrade);
  return (
    <button className="card upgrade-card" disabled={!canBuy} onClick={onBuy} title={description}>
      <PackagePlus size={22} />
      <strong>{label}</strong>
      <span>{description}</span>
      <b>{upgrade.cost} {coinText(language, upgrade.cost)}</b>
    </button>
  );
}

function drawProductsToLimit(player: PlayerState, deck: ProductInstance[]): [PlayerState, ProductInstance[]] {
  const limit = productHandLimit(player);
  const needed = Math.max(0, limit - player.productHand.length);
  const [cards, rest] = draw(deck, needed);
  return [{ ...player, productHand: [...player.productHand, ...cards] }, rest];
}

function drawInfluencesToLimit(player: PlayerState, deck: InfluenceCardType[]): [PlayerState, InfluenceCardType[]] {
  const needed = Math.max(0, 2 - player.influenceHand.length);
  const [cards, rest] = draw(deck, needed);
  return [{ ...player, influenceHand: [...player.influenceHand, ...cards] }, rest];
}

function resetPlayerForPlanning(player: PlayerState): PlayerState {
  return {
    ...player,
    planned: false,
    productActionUsed: false,
    influenceActionUsed: false,
    tableBonusUsed: false
  };
}

async function parseLobbyResponse(response: Response): Promise<LobbyResponse> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? "Стол недоступен");
  }
  return payload as LobbyResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isRestorableGameState(value: unknown): value is GameState {
  return (
    isRecord(value) &&
    typeof value.phase === "string" &&
    typeof value.round === "number" &&
    Array.isArray(value.players) &&
    value.players.length === 2 &&
    Array.isArray(value.productDeck) &&
    Array.isArray(value.influenceDeck) &&
    Array.isArray(value.customerDeck) &&
    Array.isArray(value.trendDeck)
  );
}

function normalizeSavedGameState(state: GameState): GameState {
  return {
    ...state,
    saleInsights: Array.isArray(state.saleInsights) ? state.saleInsights : [],
    pause: state.pause && typeof state.pause.active === "boolean" ? state.pause : { active: false, pausedBy: null },
    partyGoals: Array.isArray(state.partyGoals) && state.partyGoals.length ? state.partyGoals.map(normalizePartyGoal) : createPartyGoals(state.activeTrends, state.currentCustomers),
    aiIntent: typeof state.aiIntent === "string" ? state.aiIntent : null,
    aiDifficulty: typeof (state as GameState & { aiDifficulty?: unknown }).aiDifficulty === "number" ? Math.max(1, Math.min(24, Math.round(state.aiDifficulty ?? 1))) : null,
    campaignRun: normalizeSavedCampaignRun((state as GameState & { campaignRun?: unknown }).campaignRun),
    turnTimeSeconds: clampTurnTime(typeof (state as GameState & { turnTimeSeconds?: unknown }).turnTimeSeconds === "number" ? state.turnTimeSeconds : DEFAULT_TURN_TIME_SECONDS)
  };
}

function isRestorableLobby(value: unknown): value is LobbySession {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    (value.playerId === "A" || value.playerId === "B") &&
    typeof value.token === "string" &&
    typeof value.version === "number" &&
    isRecord(value.seats)
  );
}

function normalizeSavedAudioSettings(value: unknown): AudioSettings {
  if (!isRecord(value)) {
    return DEFAULT_AUDIO_SETTINGS;
  }

  return {
    musicEnabled: typeof value.musicEnabled === "boolean" ? value.musicEnabled : DEFAULT_AUDIO_SETTINGS.musicEnabled,
    effectsEnabled: typeof value.effectsEnabled === "boolean" ? value.effectsEnabled : DEFAULT_AUDIO_SETTINGS.effectsEnabled,
    musicVolume: typeof value.musicVolume === "number" ? clampVolume(value.musicVolume) : DEFAULT_AUDIO_SETTINGS.musicVolume,
    effectsVolume: typeof value.effectsVolume === "number" ? clampVolume(value.effectsVolume) : DEFAULT_AUDIO_SETTINGS.effectsVolume,
    turnTimeSeconds: typeof value.turnTimeSeconds === "number" ? clampTurnTime(value.turnTimeSeconds) : DEFAULT_AUDIO_SETTINGS.turnTimeSeconds,
    language: normalizeLanguage(value.language)
  };
}

function normalizeSavedCampaignRun(value: unknown): CampaignRun | null {
  if (!isRecord(value) || typeof value.level !== "number" || typeof value.aiDifficulty !== "number") {
    return null;
  }

  return {
    level: Math.max(1, Math.min(CAMPAIGN_LEVELS.length, Math.round(value.level))),
    aiDifficulty: Math.max(1, Math.min(24, Math.round(value.aiDifficulty))),
    opponentName: typeof value.opponentName === "string" ? value.opponentName : "Оппонент",
    opponentNameEn: typeof value.opponentNameEn === "string" ? value.opponentNameEn : "Opponent",
    unlockRecorded: typeof value.unlockRecorded === "boolean" ? value.unlockRecorded : false
  };
}

function normalizeCampaignProgress(value: unknown): CampaignProgress {
  if (!isRecord(value) || typeof value.highestUnlockedLevel !== "number" || !Array.isArray(value.completedLevels)) {
    return createDefaultCampaignProgress();
  }

  const completedLevels = value.completedLevels
    .filter((level): level is number => typeof level === "number")
    .map((level) => Math.max(1, Math.min(CAMPAIGN_LEVELS.length, Math.round(level))));

  return {
    highestUnlockedLevel: Math.max(1, Math.min(CAMPAIGN_LEVELS.length, Math.round(value.highestUnlockedLevel))),
    completedLevels: Array.from(new Set(completedLevels)).sort((left, right) => left - right)
  };
}

function loadCampaignProgress(): CampaignProgress {
  if (typeof window === "undefined") {
    return createDefaultCampaignProgress();
  }

  try {
    const raw = window.localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    return raw ? normalizeCampaignProgress(JSON.parse(raw) as unknown) : createDefaultCampaignProgress();
  } catch {
    return createDefaultCampaignProgress();
  }
}

function saveCampaignProgress(progress: CampaignProgress) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Campaign progress is optional persistence; the active game can continue.
  }
}

function clearSavedSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage can be blocked in private modes; gameplay should continue.
  }
}

function loadSavedSession(): SavedSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw) as unknown;
    if (!isRecord(payload) || payload.version !== SESSION_STORAGE_VERSION || !isRestorableGameState(payload.state)) {
      clearSavedSession();
      return null;
    }

    return {
      version: SESSION_STORAGE_VERSION,
      state: normalizeSavedGameState(payload.state),
      lobby: isRestorableLobby(payload.lobby) ? payload.lobby : null,
      audioSettings: normalizeSavedAudioSettings(payload.audioSettings)
    };
  } catch {
    clearSavedSession();
    return null;
  }
}

function saveSession(snapshot: SavedSession) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // If storage quota or permissions fail, keep the in-memory session usable.
  }
}

export default function App() {
  const [initialSession] = useState<SavedSession | null>(() => loadSavedSession());
  const [state, setState] = useState<GameState>(() => initialSession?.state ?? buildInitialState(true, initialSession?.audioSettings.turnTimeSeconds ?? DEFAULT_TURN_TIME_SECONDS));
  const [menuView, setMenuView] = useState<MenuView>("main");
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgress>(() => loadCampaignProgress());
  const [cutscene, setCutscene] = useState<CutsceneState | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showAiDifficulty, setShowAiDifficulty] = useState(false);
  const [lobby, setLobby] = useState<LobbySession | null>(() => initialSession?.lobby ?? null);
  const [joinCode, setJoinCode] = useState(() => initialSession?.lobby?.code ?? "");
  const [lobbyError, setLobbyError] = useState("");
  const [syncStatus, setSyncStatus] = useState<"local" | "online" | "syncing" | "offline">(() => (initialSession?.lobby ? "online" : "local"));
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => initialSession?.audioSettings ?? DEFAULT_AUDIO_SETTINGS);
  const [networkUrls, setNetworkUrls] = useState<string[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(DEFAULT_TRACK_INDEX);
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string>(MENU_TRACK.title);
  const [musicStatus, setMusicStatus] = useState<MusicStatus>("idle");
  const [rejectedSlot, setRejectedSlot] = useState<string | null>(null);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(() => state.turnTimeSeconds);
  const lobbyRef = useRef<LobbySession | null>(null);
  const applyingRemoteRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSettingsRef = useRef<AudioSettings>(audioSettings);
  const currentTrackIndexRef = useRef(DEFAULT_TRACK_INDEX);
  const musicModeRef = useRef<"menu" | "game" | "cutscene">("menu");
  const musicFadeTimerRef = useRef<number | null>(null);
  const musicFadeIntervalRef = useRef<number | null>(null);
  const previousShowSettingsRef = useRef(showSettings);
  const gameEndJinglePlayedRef = useRef(false);
  const autoReadyTurnRef = useRef<string | null>(null);
  const rejectTimerRef = useRef<number | null>(null);
  const skipNextSessionSaveRef = useRef(false);
  const language = audioSettings.language;

  const activePlayer = state.players.find((player) => player.id === state.activePlayer) ?? state.players[0];
  const isAiTurn = Boolean(state.aiPlayerId && state.activePlayer === state.aiPlayerId);
  const localPlayerId = viewerIdFor(lobby, state.aiPlayerId);
  const localPlayer = state.players.find((player) => player.id === localPlayerId) ?? activePlayer;
  const opponentPlayer = state.players.find((player) => player.id === opponentOf(localPlayer.id)) ?? state.players[1];
  const handPlayer = lobby || state.aiPlayerId ? localPlayer : activePlayer;
  const waitingForLobbyPlayer = Boolean(lobby && state.phase !== "game_end" && (state.phase === "menu" || !lobby.seats.A || !lobby.seats.B));
  const localPlanningTurn = state.phase === "planning" && !waitingForLobbyPlayer && !isAiTurn && (!lobby || lobby.playerId === state.activePlayer) && !state.choiceDraft;
  const canControlActivePlayer = !waitingForLobbyPlayer && !state.pause.active && !isAiTurn && (!lobby || lobby.playerId === state.activePlayer);
  const selectedInfluence = handPlayer.influenceHand.find((card) => card.id === state.selectedInfluenceId) ?? null;
  const finalResult = useMemo(() => gameOutcome(state.players, localPlayerId, language), [state.players, localPlayerId, language]);
  const isTimedLocalTurn = localPlanningTurn && !state.pause.active;
  const musicStatusText =
    language === "en"
      ? musicStatus === "playing"
        ? "playing"
        : musicStatus === "blocked"
          ? "waiting for click"
          : musicStatus === "paused"
            ? "paused"
            : "ready"
      : musicStatus === "playing"
        ? "играет"
        : musicStatus === "blocked"
          ? "ждет клика"
          : musicStatus === "paused"
            ? "пауза"
            : "готова";

  useEffect(() => {
    if (typeof fetch === "undefined") {
      return;
    }

    let disposed = false;

    async function loadNetworkUrls() {
      try {
        const response = await fetch("/api/network");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as NetworkResponse;
        const urls = Array.isArray(payload.urls) ? payload.urls.filter((url): url is string => typeof url === "string") : [];
        if (!disposed) {
          setNetworkUrls(urls);
        }
      } catch {
        // Local hotseat mode can run without the lobby server.
      }
    }

    void loadNetworkUrls();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }

    const audio = new Audio(MENU_TRACK.src);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = targetMusicVolume();
    audioRef.current = audio;

    const handleEnded = () => {
      if (musicModeRef.current === "game") {
        playMusicTrack(currentTrackIndexRef.current + 1, audioSettingsRef.current.musicEnabled, 0);
        return;
      }

      restartCurrentMusic(audio);
    };

    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      if (!audio.paused) {
        try {
          audio.pause();
        } catch {
          // Browser audio teardown can fail during tests or tab shutdown.
        }
      }
      clearMusicFade();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioSettingsRef.current = audioSettings;

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!audioSettings.musicEnabled) {
      pauseMusic(audio);
      setMusicStatus("paused");
      return;
    }

    const settingsVisibilityChanged = previousShowSettingsRef.current !== showSettings;
    previousShowSettingsRef.current = showSettings;

    if (settingsVisibilityChanged) {
      fadeMusicVolumeTo(targetMusicVolume(audioSettings), MUSIC_VOLUME_DUCK_MS, audio);
    } else {
      clearMusicFade();
      audio.volume = targetMusicVolume(audioSettings);
    }
  }, [audioSettings, state.pause.active, state.phase, showSettings]);

  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);

  useEffect(() => {
    if (state.phase === "game_end") {
      return;
    }

    if (cutscene) {
      return;
    }

    if (state.phase === "menu") {
      musicModeRef.current = "menu";
      transitionMusicTo(MENU_TRACK, audioSettingsRef.current.musicEnabled);
      return;
    }

    if (musicModeRef.current !== "game") {
      musicModeRef.current = "game";
      currentTrackIndexRef.current = DEFAULT_TRACK_INDEX;
      setCurrentTrackIndex(DEFAULT_TRACK_INDEX);
      transitionMusicTo(MUSIC_TRACKS[DEFAULT_TRACK_INDEX], audioSettingsRef.current.musicEnabled);
    }
  }, [state.phase, cutscene]);

  useEffect(() => {
    if (!cutscene) {
      return;
    }

    musicModeRef.current = "cutscene";
    transitionMusicTo(CUTSCENE_TRACK, audioSettingsRef.current.musicEnabled);
  }, [Boolean(cutscene)]);

  useEffect(() => {
    if (state.phase !== "game_end") {
      gameEndJinglePlayedRef.current = false;
      return;
    }

    stopMusic();
    if (!gameEndJinglePlayedRef.current) {
      gameEndJinglePlayedRef.current = true;
      playSoundAsset(SOUND_ASSETS[finalResult.sound], 1.35);
    }
  }, [state.phase, finalResult.sound]);

  useEffect(() => {
    if (state.phase !== "game_end" || !state.campaignRun || state.campaignRun.unlockRecorded) {
      return;
    }

    const campaignWinner = winningPlayerId(state.players);
    if (campaignWinner !== "B") {
      setCampaignProgress((current) => {
        const next = campaignProgressAfterWin(current, state.campaignRun!.level);
        saveCampaignProgress(next);
        return next;
      });
    }

    patchState((current) =>
      current.campaignRun
        ? {
            ...current,
            campaignRun: { ...current.campaignRun, unlockRecorded: true }
          }
        : current
    );
  }, [state.phase, state.campaignRun, state.players]);

  useEffect(() => {
    setTurnSecondsLeft(state.turnTimeSeconds);
    autoReadyTurnRef.current = null;
  }, [state.phase, state.activePlayer, state.round, state.turnTimeSeconds]);

  useEffect(() => {
    if (!isTimedLocalTurn) {
      return;
    }

    const timer = window.setInterval(() => {
      setTurnSecondsLeft((seconds) => Math.max(0, seconds - 1));
      playEffect("timer-tick");
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isTimedLocalTurn, state.phase, state.activePlayer, state.round]);

  useEffect(() => {
    const turnKey = `${state.round}-${state.activePlayer}-${state.phase}`;
    if (!isTimedLocalTurn || turnSecondsLeft > 0 || autoReadyTurnRef.current === turnKey) {
      return;
    }

    autoReadyTurnRef.current = turnKey;
    readyPlayer();
  }, [isTimedLocalTurn, turnSecondsLeft, state.round, state.activePlayer, state.phase]);

  useEffect(() => {
    return () => {
      if (rejectTimerRef.current !== null) {
        window.clearTimeout(rejectTimerRef.current);
      }
      clearMusicFade();
    };
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      const session = lobbyRef.current;
      if (session) {
        sendLobbyLeave(session);
        clearSavedSession();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  useEffect(() => {
    lobbyRef.current = lobby;
  }, [lobby]);

  useEffect(() => {
    if (skipNextSessionSaveRef.current && state.phase === "menu" && !lobby) {
      skipNextSessionSaveRef.current = false;
      clearSavedSession();
      return;
    }

    saveSession({
      version: SESSION_STORAGE_VERSION,
      state,
      lobby,
      audioSettings
    });
  }, [state, lobby, audioSettings]);

  function clearMusicFade() {
    if (musicFadeTimerRef.current !== null) {
      window.clearTimeout(musicFadeTimerRef.current);
      musicFadeTimerRef.current = null;
    }
    if (musicFadeIntervalRef.current !== null) {
      window.clearInterval(musicFadeIntervalRef.current);
      musicFadeIntervalRef.current = null;
    }
  }

  function fadeMusicVolumeTo(targetVolume: number, fadeMs = MUSIC_FADE_MS, audio: HTMLAudioElement | null = audioRef.current) {
    if (!audio) {
      return;
    }

    const target = clampVolume(targetVolume);
    const startVolume = audio.volume;
    clearMusicFade();

    if (fadeMs <= 0 || Math.abs(startVolume - target) < 0.005) {
      audio.volume = target;
      return;
    }

    const startedAt = Date.now();
    musicFadeIntervalRef.current = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / fadeMs);
      audio.volume = startVolume + (target - startVolume) * progress;
    }, 50);
    musicFadeTimerRef.current = window.setTimeout(() => {
      clearMusicFade();
      audio.volume = target;
    }, fadeMs);
  }

  function targetMusicVolume(settings = audioSettingsRef.current) {
    const duckGameMusic = state.pause.active && !showSettings && state.phase !== "menu" && state.phase !== "game_end";
    const settingsDuck = showSettings ? 0.5 : 1;
    return clampVolume(settings.musicVolume * settingsDuck * (duckGameMusic ? 0.1 : 1));
  }

  function pauseMusic(audio: HTMLAudioElement | null = audioRef.current) {
    clearMusicFade();
    if (!audio || audio.paused) {
      return;
    }

    try {
      audio.pause();
    } catch {
      setMusicStatus("blocked");
    }
  }

  function stopMusic(audio: HTMLAudioElement | null = audioRef.current) {
    clearMusicFade();
    if (!audio) {
      return;
    }

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = targetMusicVolume();
      setMusicStatus("paused");
    } catch {
      setMusicStatus("blocked");
    }
  }

  function requestMusicPlayback(forceEnabled = false) {
    const audio = audioRef.current;
    const settings = audioSettingsRef.current;
    if (!audio || (!settings.musicEnabled && !forceEnabled)) {
      return;
    }

    audio.volume = targetMusicVolume(settings);
    if (!audio.src) {
      audio.src = cutscene ? CUTSCENE_TRACK.src : state.phase === "menu" ? MENU_TRACK.src : MUSIC_TRACKS[currentTrackIndexRef.current].src;
    }
    if (!audio.paused) {
      setMusicStatus("playing");
      return;
    }

    let playback: Promise<void> | void;
    try {
      playback = audio.play();
    } catch {
      setMusicStatus("blocked");
      return;
    }

    if (playback && typeof playback.then === "function") {
      void playback
        .then(() => {
          setMusicStatus("playing");
        })
        .catch(() => {
          setMusicStatus("blocked");
        });
      return;
    }

    setMusicStatus("playing");
  }

  function restartCurrentMusic(audio: HTMLAudioElement | null = audioRef.current) {
    const settings = audioSettingsRef.current;
    if (!audio || !settings.musicEnabled) {
      return;
    }

    try {
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.then === "function") {
        void playback
          .then(() => {
            setMusicStatus("playing");
          })
          .catch(() => {
            setMusicStatus("blocked");
          });
        return;
      }
      setMusicStatus("playing");
    } catch {
      setMusicStatus("blocked");
    }
  }

  function switchMusicSource(track: { title: string; src: string }, shouldPlay: boolean) {
    const audio = audioRef.current;
    setCurrentTrackTitle(track.title);
    if (!audio) {
      return;
    }

    if (!audio.src.endsWith(track.src)) {
      audio.src = track.src;
      audio.currentTime = 0;
    }
    audio.loop = track.src === MENU_TRACK.src || track.src === CUTSCENE_TRACK.src;
    audio.volume = targetMusicVolume();

    if (shouldPlay) {
      requestMusicPlayback(true);
    } else {
      pauseMusic(audio);
      setMusicStatus("paused");
    }
  }

  function transitionMusicTo(track: { title: string; src: string }, shouldPlay = audioSettingsRef.current.musicEnabled, fadeMs = MUSIC_FADE_MS) {
    const audio = audioRef.current;
    setCurrentTrackTitle(track.title);
    if (!audio) {
      return;
    }

    if (audio.src.endsWith(track.src)) {
      audio.loop = track.src === MENU_TRACK.src || track.src === CUTSCENE_TRACK.src;
      if (shouldPlay && !audio.paused) {
        requestMusicPlayback(true);
      } else {
        if (!shouldPlay) {
          pauseMusic(audio);
          setMusicStatus("paused");
        }
      }
      return;
    }

    clearMusicFade();
    if (audio.paused || fadeMs <= 0) {
      switchMusicSource(track, shouldPlay);
      return;
    }

    const startVolume = audio.volume;
    const startedAt = Date.now();
    musicFadeIntervalRef.current = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / fadeMs);
      audio.volume = startVolume * (1 - progress);
    }, 50);
    musicFadeTimerRef.current = window.setTimeout(() => {
      clearMusicFade();
      switchMusicSource(track, shouldPlay);
    }, fadeMs);
  }

  function playMusicTrack(index: number, shouldPlay = audioSettingsRef.current.musicEnabled, fadeMs = MUSIC_FADE_MS) {
    const trackIndex = ((index % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
    const track = MUSIC_TRACKS[trackIndex];

    musicModeRef.current = "game";
    currentTrackIndexRef.current = trackIndex;
    setCurrentTrackIndex(trackIndex);
    transitionMusicTo(track, shouldPlay, fadeMs);
  }

  function updateAudioSettings(patch: Partial<AudioSettings>) {
    const next: AudioSettings = {
      ...audioSettingsRef.current,
      ...patch
    };
    next.musicVolume = clampVolume(next.musicVolume);
    next.effectsVolume = clampVolume(next.effectsVolume);
    next.turnTimeSeconds = clampTurnTime(next.turnTimeSeconds);
    audioSettingsRef.current = next;
    setAudioSettings(next);
  }

  function updateTurnTimeSetting(seconds: number) {
    const nextSeconds = clampTurnTime(seconds);
    updateAudioSettings({ turnTimeSeconds: nextSeconds });

    if (lobbyRef.current && lobbyRef.current.playerId !== "A") {
      return;
    }

    patchState((current) => (current.turnTimeSeconds === nextSeconds ? current : { ...current, turnTimeSeconds: nextSeconds }));
  }

  function playEffect(kind: SoundEffectId) {
    const audio = audioSettingsRef.current;
    playSoundEffect(audio.effectsEnabled, kind, audio.effectsVolume);
  }

  function playSoundAsset(src: string, boost = 1) {
    const settings = audioSettingsRef.current;
    if (!settings.effectsEnabled || typeof Audio === "undefined") {
      return;
    }

    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = clampVolume(settings.effectsVolume);

    if (typeof window !== "undefined" && audio instanceof HTMLMediaElement) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          const context = new AudioContextClass();
          const source = context.createMediaElementSource(audio);
          const gain = context.createGain();
          gain.gain.value = Math.max(0, settings.effectsVolume * boost);
          source.connect(gain);
          gain.connect(context.destination);
          audio.addEventListener("ended", () => {
            void context.close().catch(() => undefined);
          });
          audio.volume = 1;
        } catch {
          audio.volume = clampVolume(settings.effectsVolume);
        }
      }
    }

    let playback: Promise<void> | void;
    try {
      playback = audio.play();
    } catch {
      return;
    }

    if (playback && typeof playback.catch === "function") {
      void playback.catch(() => undefined);
    }
  }

  function rejectShelfAction(slotKey: string) {
    playEffect("invalid-action");
    setRejectedSlot(slotKey);

    if (rejectTimerRef.current !== null) {
      window.clearTimeout(rejectTimerRef.current);
    }
    rejectTimerRef.current = window.setTimeout(() => {
      setRejectedSlot((current) => (current === slotKey ? null : current));
      rejectTimerRef.current = null;
    }, 360);
  }

  function publishLobbyState(next: GameState, session = lobbyRef.current, updateSync = true) {
    if (!session || applyingRemoteRef.current) {
      return;
    }

    if (updateSync) {
      setSyncStatus("syncing");
    }
    void fetch(`${LOBBY_API}/${session.code}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: session.token,
        playerId: session.playerId,
        version: session.version,
        state: next
      })
    })
      .then(parseLobbyResponse)
      .then((payload) => {
        setLobby((current) =>
          current && current.code === payload.code
            ? {
                ...current,
                version: payload.version,
                seats: payload.seats
              }
            : current
        );
        if (updateSync) {
          setSyncStatus("online");
        }
      })
      .catch((error: Error) => {
        if (updateSync) {
          setLobbyError(error.message);
          setSyncStatus("offline");
        }
      });
  }

  function sendLobbyLeave(session: LobbySession) {
    const body = JSON.stringify({
      token: session.token,
      playerId: session.playerId
    });
    const url = `${LOBBY_API}/${session.code}/leave`;

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && typeof Blob !== "undefined") {
      const sent = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      if (sent) {
        return;
      }
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => undefined);
  }

  useEffect(() => {
    if (!lobby) {
      return;
    }

    let disposed = false;

    async function pullLobby() {
      const session = lobbyRef.current;
      if (!session) {
        return;
      }

      try {
        const payload = await parseLobbyResponse(await fetch(`${LOBBY_API}/${session.code}?token=${session.token}`));
        if (disposed) {
          return;
        }

        setLobby((current) =>
          current && current.code === payload.code
            ? {
                ...current,
                version: payload.version,
                seats: payload.seats
              }
            : current
        );

        if (payload.version > session.version) {
          applyingRemoteRef.current = true;
          setState(normalizeSavedGameState(payload.state));
          window.setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 0);
        }

        setSyncStatus("online");
      } catch (error) {
        if (!disposed) {
          setLobbyError(error instanceof Error ? error.message : "Нет связи со столом");
          setSyncStatus("offline");
        }
      }
    }

    void pullLobby();
    const timer = window.setInterval(pullLobby, 900);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [lobby?.code, lobby?.token]);

  function patchState(recipe: (draft: GameState) => GameState, tone?: SoundEffectId | ((current: GameState, next: GameState) => SoundEffectId | undefined)) {
    setState((current) => {
      const next = recipe(current);
      if (next !== current) {
        publishLobbyState(next);
      }
      const effect = typeof tone === "function" ? tone(current, next) : tone;
      const moneySoundPlayerId = moneySoundPlayerIdFor(current, lobbyRef.current);
      const previousMoney = current.players.find((player) => player.id === moneySoundPlayerId)?.money ?? 0;
      const nextMoney = next.players.find((player) => player.id === moneySoundPlayerId)?.money ?? previousMoney;
      if (nextMoney > previousMoney) {
        playSoundAsset(SOUND_ASSETS.money, 1.4);
      }
      if (effect && effect !== "coin-sale") {
        playEffect(effect);
      }
      return next;
    });
  }

  useEffect(() => {
    if (state.pause.active || lobby || !state.aiPlayerId || state.activePlayer !== state.aiPlayerId || !["planning", "upgrade"].includes(state.phase)) {
      return;
    }

    const timer = window.setTimeout(() => {
      runAiStep();
    }, randomAiTurnDelayMs());

    return () => window.clearTimeout(timer);
  }, [state.pause.active, lobby, state.activePlayer, state.aiPlayerId, state.phase, state.round, state.players, state.upgradeQueue, state.upgradeOffer, state.choiceDraft]);

  function startGame() {
    musicModeRef.current = "menu";
    lobbyRef.current = null;
    setLobby(null);
    setLobbyError("");
    setSyncStatus("local");
    patchState((current) => {
      const next = buildInitialState(current.sound, audioSettingsRef.current.turnTimeSeconds);
      return {
        ...next,
        phase: "planning",
        logs: audioSettingsRef.current.language === "en" ? [`Welcome to ${GAME_TITLE}.`] : next.logs
      };
    }, "customer-arrive");
  }

  function startCampaignLevel(level: CampaignLevel) {
    musicModeRef.current = "menu";
    lobbyRef.current = null;
    setLobby(null);
    setLobbyError("");
    setSyncStatus("local");
    setCutscene(null);
    setMenuView("main");
    patchState((current) => {
      const next = buildInitialState(current.sound, audioSettingsRef.current.turnTimeSeconds);
      const language = audioSettingsRef.current.language;
      const opponentName = language === "en" ? level.opponentNameEn : `${level.opponentName} (${level.opponentNameEn})`;
      const players = next.players.map((player) => {
        if (player.id !== AI_PLAYER_ID) {
          return player;
        }

        const startingMoney = level.aiDifficulty >= 22 ? 3 : level.aiDifficulty >= 19 ? 2 : level.aiDifficulty >= 15 ? 1 : 0;
        return {
          ...player,
          name: opponentName,
          money: startingMoney
        };
      });

      return {
        ...next,
        phase: "planning",
        players,
        aiPlayerId: AI_PLAYER_ID,
        aiMode: "opponent",
        aiScore: 0,
        aiIntent: language === "en" ? `${opponentName} is preparing a stall.` : `${opponentName} готовит лавку.`,
        campaignRun: {
          level: level.level,
          aiDifficulty: level.aiDifficulty,
          opponentName: level.opponentName,
          opponentNameEn: level.opponentNameEn,
          unlockRecorded: false
        },
        logs: [
          language === "en" ? `Level ${level.level}: ${campaignLevelStory(language, level)}` : `Уровень ${level.level}: ${level.story}`,
          language === "en" ? `Opponent: ${opponentName}, ${campaignLevelSpecies(language, level)}.` : `Соперник: ${opponentName}, ${level.opponentSpecies}.`,
          ...(language === "en" ? [`Welcome to ${GAME_TITLE}.`] : next.logs)
        ].slice(0, 24)
      };
    }, "customer-arrive");
  }

  function requestCampaignLevel(level: CampaignLevel) {
    if (!isLevelUnlocked(campaignProgress, level.level)) {
      playEffect("ui-click");
      return;
    }

    playEffect("ui-click");
    if (level.level === 1) {
      setCutscene({ level, frameIndex: 0 });
      return;
    }

    startCampaignLevel(level);
  }

  function advanceCutscene() {
    if (!cutscene) {
      return;
    }

    if (cutscene.frameIndex >= CUTSCENE_FRAMES.length - 1) {
      startCampaignLevel(cutscene.level);
      return;
    }

    playEffect("ui-click");
    setCutscene((current) => (current ? { ...current, frameIndex: current.frameIndex + 1 } : current));
  }

  function skipCutscene() {
    if (!cutscene) {
      return;
    }

    playEffect("ui-click");
    startCampaignLevel(cutscene.level);
  }

  function pauseGame() {
    patchState((current) => {
      if (current.phase === "menu" || current.phase === "game_end" || current.pause.active) {
        return current;
      }

      return {
        ...current,
        selectedProductId: null,
        selectedInfluenceId: null,
        pause: { active: true, pausedBy: localPlayerId }
      };
    }, "ui-click");
  }

  function resumeGame() {
    patchState((current) => {
      if (!current.pause.active) {
        return current;
      }

      return {
        ...current,
        pause: { active: false, pausedBy: null }
      };
    }, "ui-click");
  }

  function exitToMenu() {
    const session = lobbyRef.current;
    if (session) {
      sendLobbyLeave(session);
    }
    skipNextSessionSaveRef.current = true;
    clearSavedSession();
    setShowSettings(false);
    setShowRules(false);
    setShowAbout(false);
    setShowExitConfirm(false);
    setCutscene(null);
    setMenuView("main");
    setLobbyError("");
    setJoinCode("");
    setSyncStatus("local");
    setState((current) => buildInitialState(current.sound, audioSettingsRef.current.turnTimeSeconds));
    lobbyRef.current = null;
    setLobby(null);
    playEffect("ui-click");
  }

  function requestExitToMenu() {
    playEffect("ui-click");
    setShowExitConfirm(true);
  }

  function cancelExitToMenu() {
    playEffect("ui-click");
    setShowExitConfirm(false);
  }

  function startAiGame(mode: AiMode, difficulty?: AiDifficultyOption) {
    musicModeRef.current = "menu";
    lobbyRef.current = null;
    setLobby(null);
    setLobbyError("");
    setSyncStatus("local");
    setShowAiDifficulty(false);
    patchState((current) => {
      const next = buildInitialState(current.sound, audioSettingsRef.current.turnTimeSeconds);
      const language = audioSettingsRef.current.language;
      const difficultyName = difficulty ? aiDifficultyLabel(language, difficulty) : aiDifficultyLabel(language, AI_DIFFICULTIES[2]);
      const intro =
        mode === "training"
          ? language === "en"
            ? "Training mode: weak AI plays as the opponent."
            : "Режим обучения: слабый ИИ играет за оппонента."
          : language === "en"
            ? `Versus AI: difficulty ${difficultyName}.`
            : `Игра против ИИ: сложность ${difficulty?.label ?? "Зазывала"}.`;
      const aiDifficulty = mode === "opponent" ? difficulty?.value ?? 14 : null;
      const aiIntent = mode === "opponent" ? (language === "en" ? `Difficulty: ${difficultyName}` : `Сложность: ${difficulty?.label ?? "Зазывала"}`) : null;
      return {
        ...next,
        phase: "planning",
        aiPlayerId: AI_PLAYER_ID,
        aiMode: mode,
        aiDifficulty,
        aiScore: 0,
        aiIntent,
        logs: [intro, ...(language === "en" ? [`Welcome to ${GAME_TITLE}.`] : next.logs)].slice(0, 24)
      };
    }, "customer-arrive");
  }

  async function createLobby() {
    const language = audioSettingsRef.current.language;
    const next = {
      ...buildInitialState(state.sound, audioSettingsRef.current.turnTimeSeconds),
      phase: "planning" as Phase,
      logs: [
        language === "en" ? "Table created. The opponent joins with the lobby code." : "Стол создан. Оппонент входит по коду лобби.",
        ...state.logs
      ].slice(0, 24)
    };

    setLobbyError("");
    setSyncStatus("syncing");
    try {
      const payload = await parseLobbyResponse(
        await fetch(LOBBY_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: next })
        })
      );

      if (!payload.playerId || !payload.token) {
        throw new Error("Сервер не вернул место игрока");
      }

      setState(normalizeSavedGameState(payload.state));
      setLobby({
        code: payload.code,
        playerId: payload.playerId,
        token: payload.token,
        version: payload.version,
        seats: payload.seats
      });
      setSyncStatus("online");
    } catch (error) {
      setLobbyError(error instanceof Error ? error.message : "Не удалось создать стол");
      setSyncStatus("offline");
    }
  }

  async function joinLobby() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setLobbyError(language === "en" ? "Enter a lobby code" : "Введите код лобби");
      return;
    }

    setLobbyError("");
    setSyncStatus("syncing");
    try {
      const payload = await parseLobbyResponse(
        await fetch(`${LOBBY_API}/${code}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        })
      );

      if (!payload.playerId || !payload.token) {
        throw new Error(language === "en" ? "The server did not assign a player seat" : "Сервер не выдал место игрока");
      }

      setState(normalizeSavedGameState(payload.state));
      setLobby({
        code: payload.code,
        playerId: payload.playerId,
        token: payload.token,
        version: payload.version,
        seats: payload.seats
      });
      setJoinCode(payload.code);
      setSyncStatus("online");
    } catch (error) {
      setLobbyError(error instanceof Error ? error.message : language === "en" ? "Could not join the table" : "Не удалось войти за стол");
      setSyncStatus("offline");
    }
  }

  function nextRoundAfterBreak(current: GameState): GameState {
    const nextRound = current.round + 1;
    const language = audioSettingsRef.current.language;
    const nextFirstPlayer = opponentOf(current.firstPlayer);
    const customerCount = nextRound <= 2 ? 1 : 2;
    const [customers, customerDeck] = draw(current.customerDeck, customerCount);

    return {
      ...current,
      phase: "planning",
      round: nextRound,
      firstPlayer: nextFirstPlayer,
      activePlayer: nextFirstPlayer,
      players: current.players.map(resetPlayerForPlanning),
      customerDeck,
      currentCustomers: customers,
      playedInfluences: [],
      roundBonuses: [],
      selectedProductId: null,
      selectedInfluenceId: null,
      saleResults: [],
      saleInsights: [],
      upgradeOffer: [],
      upgradeQueue: [],
      logs: [language === "en" ? `Round ${nextRound}: customers approach the stalls.` : `Раунд ${nextRound}: покупатели подходят к лавкам.`, ...current.logs].slice(0, 20)
    };
  }

  function calculateRoundSales(current: GameState): { players: PlayerState[]; saleResults: PurchaseResult[]; saleInsights: string[]; logs: string[] } {
    const players = clonePlayersForAi(current.players);
    const logs: string[] = [];
    const saleInsights: string[] = [];
    const saleResults: PurchaseResult[] = [];
    const viewerId = viewerIdFor(lobbyRef.current, current.aiPlayerId);
    const language = audioSettingsRef.current.language;

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
      saleInsights.push(describeSaleInsight(result, viewerId, language));
      if (!result.winner) {
        logs.push(
          language === "en"
            ? `${customerName(language, customer)} bought nothing: appeal was below ${PURCHASE_APPEAL_THRESHOLD}.`
            : `${customer.name} ничего не купил: совпадение ниже ${PURCHASE_APPEAL_THRESHOLD}.`
        );
        return;
      }

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

      const bonus = result.winner.payout - result.winner.product.price;
      logs.push(
        language === "en"
          ? `${customerName(language, customer)} bought ${productName(language, result.winner.product)} ${ownerPhrase(owner.id, viewerId, language)} for ${
              result.winner.payout
            } ${coinText(language, result.winner.payout)}.${bonus > 0 ? ` Bonus: +${bonus}.` : ""}`
          : `${customer.name} купил ${result.winner.product.name} ${ownerPhrase(owner.id, viewerId, language)} за ${result.winner.payout} мон.${
              bonus > 0 ? ` Бонус: +${bonus}.` : ""
            }`
      );
    });

    return { players, saleResults, saleInsights, logs };
  }

  function resolveRoundSales(current: GameState): GameState {
    const { players, saleResults, saleInsights, logs } = calculateRoundSales(current);
    const goalProgress = updatePartyGoalsAfterSales(current.partyGoals, saleResults, current.playedInfluences);
    const goalRewardByPlayer = new Map<PlayerId, number>();
    for (const reward of goalProgress.rewards) {
      goalRewardByPlayer.set(reward.playerId, (goalRewardByPlayer.get(reward.playerId) ?? 0) + reward.amount);
    }
    const rewardedPlayers = players.map((player) => ({
      ...player,
      money: player.money + (goalRewardByPlayer.get(player.id) ?? 0)
    }));
    const viewerId = viewerIdFor(lobbyRef.current, current.aiPlayerId);
    const language = audioSettingsRef.current.language;
    const goalLogs = goalProgress.rewards.map(
      (reward) =>
        language === "en"
          ? `${displayPlayerName(reward.playerId, viewerId, language)} completed "${goalTitle(language, current.partyGoals.find((goal) => goal.title === reward.goalTitle) ?? { title: reward.goalTitle, kind: "sale_streak", target: 1, id: reward.goalTitle })}" and got +${reward.amount} ${coinText(language, reward.amount)}.`
          : `${displayPlayerName(reward.playerId, viewerId, language)} выполнили цель «${reward.goalTitle}» и получили +${reward.amount} мон.`
    );

    return {
      ...current,
      phase: "sale_resolution",
      activePlayer: current.firstPlayer,
      players: rewardedPlayers,
      saleResults,
      saleInsights,
      partyGoals: goalProgress.goals,
      selectedProductId: null,
      selectedInfluenceId: null,
      logs: [
        ...goalLogs.reverse(),
        ...saleInsights.slice(0, 2).reverse(),
        ...logs.reverse(),
        language === "en" ? "Sales results are ready. Check the formulas and continue." : "Итоги продаж готовы. Проверьте формулы и продолжайте.",
        ...current.logs
      ].slice(0, 24)
    };
  }

  function continueAfterSales(current: GameState): GameState {
    if (current.phase !== "sale_resolution") {
      return current;
    }
    const language = audioSettingsRef.current.language;

    let productDeck = current.productDeck;
    let influenceDeck = current.influenceDeck;
    const drawnPlayers = clonePlayersForAi(current.players).map((player) => {
      let updated = player;
      [updated, productDeck] = drawProductsToLimit(updated, productDeck);
      [updated, influenceDeck] = drawInfluencesToLimit(updated, influenceDeck);
      return updated;
    });

    const shiftedTrends = current.activeTrends.slice(1);
    const [newTrend, trendDeck] = draw(current.trendDeck, 1);
    const activeTrends = [...shiftedTrends, ...(newTrend.length ? newTrend : [])];
    const baseState = {
      ...current,
      players: drawnPlayers,
      productDeck,
      influenceDeck,
      trendDeck,
      activeTrends,
      logs: [
        language === "en"
          ? `Trend shifted: ${activeTrends.map((trend) => trendName(language, trend)).join(", ")}.`
          : `Тренд сдвинулся: ${activeTrends.map((trend) => trend.name).join(", ")}.`,
        ...current.logs
      ].slice(0, 24)
    };

    if (current.round === 8) {
      return { ...baseState, phase: "game_end" };
    }

    if ([2, 4, 6].includes(current.round)) {
      const [offer, upgradeDeck] = draw(current.upgradeDeck, 3);
      const [a, b] = drawnPlayers;
      const upgradeQueue =
        a.money === b.money
          ? [current.firstPlayer, opponentOf(current.firstPlayer)]
          : a.money < b.money
            ? (["A", "B"] as PlayerId[])
            : (["B", "A"] as PlayerId[]);

      return {
        ...baseState,
        phase: "upgrade",
        upgradeDeck,
        upgradeOffer: offer,
        upgradeQueue,
        activePlayer: upgradeQueue[0],
        logs: [
          language === "en"
            ? `Upgrade shop opened. ${actionPlayerName(upgradeQueue[0], viewerIdFor(lobbyRef.current, current.aiPlayerId), language)} chooses first.`
            : `Открылся магазин апгрейдов. Первым выбирает ${actionPlayerName(upgradeQueue[0], viewerIdFor(lobbyRef.current, current.aiPlayerId), language)}.`,
          ...baseState.logs
        ].slice(0, 24)
      };
    }

    return nextRoundAfterBreak(baseState);
  }

  function continueSalesResolution() {
    patchState((current) => continueAfterSales(current), (current, next) => {
      if (next.phase === "game_end") {
        return "game-win";
      }
      if (next.phase === "upgrade" && current.phase !== "upgrade") {
        return "trend-shift";
      }
      if (next.phase === "planning" && current.phase !== "planning") {
        return "customer-arrive";
      }
      return "ui-click";
    });
  }

  function selectProduct(productId: string) {
    patchState((current) => ({ ...current, selectedProductId: productId, selectedInfluenceId: null }), "card-select");
  }

  function placeProduct(playerId: PlayerId, slotIndex: number) {
    patchState((current) => {
      if (current.phase !== "planning" || current.activePlayer !== playerId) {
        return current;
      }

      const players = current.players.map((player) => ({ ...player, shelf: [...player.shelf], productHand: [...player.productHand] }));
      const player = players.find((candidate) => candidate.id === playerId)!;
      const product = player.productHand.find((card) => card.instanceId === current.selectedProductId);
      if (!product || player.productActionUsed) {
        return current;
      }

      const supplierBonus = hasUpgrade(player.upgrades, "supplier") ? 1 : 0;
      const placedProduct =
        supplierBonus > 0
          ? { ...product, stock: product.stock + supplierBonus, baseStock: product.baseStock + supplierBonus }
          : { ...product };

      player.shelf[slotIndex] = placedProduct;
      player.productHand = player.productHand.filter((card) => card.instanceId !== product.instanceId);
      player.productActionUsed = true;

      return {
        ...current,
        players,
        selectedProductId: null,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Product placed: ${productName(audioSettingsRef.current.language, product)} (${actionPlayerName(playerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`
            : `Товар выставлен: ${product.name} (${actionPlayerName(playerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`,
          ...current.logs
        ].slice(0, 24)
      };
    }, "card-place");
  }

  function selectInfluence(cardId: string) {
    patchState((current) => ({ ...current, selectedInfluenceId: cardId, selectedProductId: null }), "card-select");
  }

  function addPlayedInfluence(current: GameState, played: PlayedInfluence): GameState {
    return {
      ...current,
      playedInfluences: [...current.playedInfluences, played],
      logs: [
        audioSettingsRef.current.language === "en"
          ? `Influence played: ${influenceName(audioSettingsRef.current.language, { id: played.id, name: played.name })} (${actionPlayerName(played.ownerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`
          : `Сыграно влияние: ${played.name} (${actionPlayerName(played.ownerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`,
        ...current.logs
      ].slice(0, 24)
    };
  }

  function playInfluence(target?: { tag?: Tag; ownerId?: PlayerId; slotIndex?: number }) {
    patchState((current) => {
      if (current.phase !== "planning") {
        return current;
      }

      const players = current.players.map((player) => ({ ...player, influenceHand: [...player.influenceHand] }));
      const player = players.find((candidate) => candidate.id === current.activePlayer)!;
      const card = player.influenceHand.find((candidate) => candidate.id === current.selectedInfluenceId);
      if (!card || player.influenceActionUsed) {
        return current;
      }
      const language = audioSettingsRef.current.language;

      let productDeck = current.productDeck;
      let influenceDeck = current.influenceDeck;
      let choiceDraft: ChoiceDraft | null = current.choiceDraft;
      let next: GameState = {
        ...current,
        players,
        selectedInfluenceId: null
      };

      player.influenceHand = player.influenceHand.filter((candidate) => candidate.id !== card.id);
      player.influenceActionUsed = true;

      if (card.effect.kind === "tag_modifier") {
        next = addPlayedInfluence(next, { id: card.id, name: card.name, ownerId: player.id, modifiers: card.effect.modifiers });
      }

      if (card.effect.kind === "anti_tag") {
        const tag = target?.tag ?? current.selectedTag;
        next = addPlayedInfluence(next, { id: card.id, name: card.name, ownerId: player.id, modifiers: [{ tag, value: card.effect.value }] });
      }

      if (card.effect.kind === "target_own_bonus" || card.effect.kind === "target_opponent_penalty") {
        const ownerId = target?.ownerId;
        const slotIndex = target?.slotIndex;
        if (!ownerId || slotIndex === undefined) {
          return current;
        }

        const value = card.effect.value;
        next = addPlayedInfluence(next, {
          id: card.id,
          name: card.name,
          ownerId: player.id,
          productAdjustments: [
            {
              ownerId,
              slotIndex,
              value,
              label: card.name,
              preserveStock: "preserveStock" in card.effect ? card.effect.preserveStock : false
            }
          ]
        });
      }

      if (card.effect.kind === "tie_preference") {
        next = addPlayedInfluence(next, { id: card.id, name: card.name, ownerId: player.id, tieOwner: player.id });
      }

      if (card.effect.kind === "rearrange") {
        player.productActionUsed = false;
        next = {
          ...next,
          logs: [
            language === "en"
              ? `One more product replacement is available: ${actionPlayerName(player.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), language)}.`
              : `Можно ещё раз заменить товар: ${actionPlayerName(player.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), language)}.`,
            ...next.logs
          ].slice(0, 24)
        };
      }

      if (card.effect.kind === "draw_product") {
        const [cards, rest] = draw(productDeck, card.effect.draw);
        productDeck = rest;
        if (cards.length > 0) {
          choiceDraft = { playerId: player.id, type: "product", cards };
          next = {
            ...next,
            logs: [
              language === "en" ? `${influenceName(language, card)}: choose one of ${cards.length} product cards.` : `${card.name}: выбери одну из ${cards.length} карт товаров.`,
              ...next.logs
            ].slice(0, 24)
          };
        } else {
          next = {
            ...next,
            logs: [language === "en" ? `${influenceName(language, card)}: product deck is empty.` : `${card.name}: колода товаров пуста.`, ...next.logs].slice(0, 24)
          };
        }
      }

      if (card.effect.kind === "draw_influence") {
        const [cards, rest] = draw(influenceDeck, card.effect.draw);
        influenceDeck = rest;
        if (cards.length > 0) {
          choiceDraft = { playerId: player.id, type: "influence", cards };
          next = {
            ...next,
            logs: [
              language === "en" ? `${influenceName(language, card)}: choose one of ${cards.length} influence cards.` : `${card.name}: выбери одну из ${cards.length} карт влияния.`,
              ...next.logs
            ].slice(0, 24)
          };
        } else {
          next = {
            ...next,
            logs: [language === "en" ? `${influenceName(language, card)}: influence deck is empty.` : `${card.name}: колода влияния пуста.`, ...next.logs].slice(0, 24)
          };
        }
      }

      return {
        ...next,
        players,
        productDeck,
        influenceDeck,
        choiceDraft
      };
    }, "influence-play");
  }

  function keepDraftCard(index: number) {
    patchState((current) => {
      if (!current.choiceDraft) {
        return current;
      }

      const draft = current.choiceDraft;
      const keep = draft.cards[index];
      const players = current.players.map((player) => ({ ...player, productHand: [...player.productHand], influenceHand: [...player.influenceHand] }));
      const player = players.find((candidate) => candidate.id === draft.playerId)!;
      if (draft.type === "product") {
        player.productHand.push(keep as ProductInstance);
      } else {
        player.influenceHand.push(keep as InfluenceCardType);
      }

      return {
        ...current,
        players,
        choiceDraft: null,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Card kept: ${
                draft.type === "product" ? productName(audioSettingsRef.current.language, keep as ProductInstance) : influenceName(audioSettingsRef.current.language, keep as InfluenceCardType)
              } (${actionPlayerName(draft.playerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`
            : `Оставлена карта: ${keep.name} (${actionPlayerName(draft.playerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`,
          ...current.logs
        ].slice(0, 24)
      };
    }, "card-select");
  }

  function useAdTable(playerId: PlayerId, slotIndex: number) {
    patchState((current) => {
      const players = current.players.map((player) => ({ ...player }));
      const player = players.find((candidate) => candidate.id === playerId)!;
      if (current.phase !== "planning" || current.activePlayer !== playerId || player.tableBonusUsed || !hasUpgrade(player.upgrades, "ad_table")) {
        return current;
      }
      player.tableBonusUsed = true;

      return {
        ...current,
        players,
        roundBonuses: [...current.roundBonuses, { ownerId: playerId, slotIndex, value: 1, label: "Рекламный столик" }],
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Ad table boosted a product ${ownerPhrase(playerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}.`
            : `Рекламный столик усилил товар ${ownerPhrase(playerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}.`,
          ...current.logs
        ].slice(0, 24)
      };
    }, "influence-play");
  }

  function readyPlayer() {
    patchState((current) => {
      if (current.choiceDraft) {
        return current;
      }

      const players = current.players.map((player) => ({ ...player, planned: player.id === current.activePlayer ? true : player.planned }));
      const nextPlayer = players.find((player) => !player.planned);
      if (nextPlayer) {
        return {
          ...current,
          players,
          activePlayer: nextPlayer.id,
          selectedProductId: null,
          selectedInfluenceId: null,
          logs: [
            audioSettingsRef.current.language === "en"
              ? `Planning turn passes to ${actionPlayerName(nextPlayer.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}.`
              : `Ход планирования переходит: ${actionPlayerName(nextPlayer.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}.`,
            ...current.logs
          ].slice(0, 24)
        };
      }

      return resolveRoundSales({ ...current, players });
    }, (current, next) => {
      if (next.phase === "game_end") {
        return "game-win";
      }
      if (next.saleResults.length > current.saleResults.length) {
        return next.saleResults.some((result) => result.winner) ? "coin-sale" : "round-end";
      }
      if (next.activePlayer !== current.activePlayer) {
        return "ready-confirm";
      }
      return undefined;
    });
  }

  function buyUpgrade(upgradeId: string) {
    patchState((current) => {
      if (current.phase !== "upgrade") {
        return current;
      }

      const buyerId = current.upgradeQueue[0];
      const upgrade = current.upgradeOffer.find((candidate) => candidate.id === upgradeId);
      if (!upgrade) {
        return current;
      }

      const players = current.players.map((player) => ({ ...player, shelf: [...player.shelf], upgrades: [...player.upgrades] }));
      const buyer = players.find((player) => player.id === buyerId)!;
      if (buyer.money < upgrade.cost) {
        return current;
      }

      buyer.money -= upgrade.cost;
      buyer.upgrades.push(upgrade);
      if (upgrade.effect === "extra_shelf") {
        buyer.shelfSlots += 1;
        buyer.shelf.push(null);
      }

      const queue = current.upgradeQueue.slice(1);
      const next = {
        ...current,
        players,
        upgradeOffer: current.upgradeOffer.filter((candidate) => candidate.id !== upgrade.id),
        upgradeQueue: queue,
        activePlayer: queue[0] ?? current.firstPlayer,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Upgrade bought: ${upgradeName(audioSettingsRef.current.language, upgrade)} (${actionPlayerName(buyerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`
            : `Куплен апгрейд: ${upgrade.name} (${actionPlayerName(buyerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}).`,
          ...current.logs
        ].slice(0, 24)
      };

      return queue.length ? next : nextRoundAfterBreak(next);
    }, "upgrade-buy");
  }

  function skipUpgrade() {
    patchState((current) => {
      const buyerId = current.upgradeQueue[0];
      const queue = current.upgradeQueue.slice(1);
      const next = {
        ...current,
        upgradeQueue: queue,
        activePlayer: queue[0] ?? current.firstPlayer,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Upgrade buy skipped: ${actionPlayerName(buyerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}.`
            : `Покупка апгрейда пропущена: ${actionPlayerName(buyerId, viewerIdFor(lobbyRef.current, current.aiPlayerId), audioSettingsRef.current.language)}.`,
          ...current.logs
        ].slice(0, 24)
      };
      return queue.length ? next : nextRoundAfterBreak(next);
    }, "ui-click");
  }

  function clonePlayersForAi(players: PlayerState[]) {
    return players.map((player) => ({
      ...player,
      shelf: player.shelf.map((product) => (product ? { ...product } : null)),
      productHand: [...player.productHand],
      influenceHand: [...player.influenceHand],
      upgrades: [...player.upgrades]
    }));
  }

  function addAiInfluence(playedInfluences: PlayedInfluence[], played: PlayedInfluence, logs: string[], language: Language) {
    playedInfluences.push(played);
    logs.push(language === "en" ? `AI played ${influenceName(language, { id: played.id, name: played.name })}.` : `ИИ сыграл ${played.name}.`);
  }

  function applyAiProductMove(current: GameState, player: PlayerState, move: NonNullable<ReturnType<typeof planAiPlanningTurn>["productMove"]>, logs: string[], language: Language) {
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
        ? { ...product, stock: product.stock + supplierBonus, baseStock: product.baseStock + supplierBonus }
        : { ...product };

    player.shelf[move.slotIndex] = placedProduct;
    player.productHand.splice(productIndex, 1);
    player.productActionUsed = true;
    logs.push(language === "en" ? `AI placed ${productName(language, product)} in slot ${move.slotIndex + 1}.` : `ИИ выставил ${product.name} в слот ${move.slotIndex + 1}.`);
  }

  function applyAiInfluenceMove(
    current: GameState,
    player: PlayerState,
    move: AiInfluenceMove,
    playedInfluences: PlayedInfluence[],
    logs: string[],
    language: Language
  ): { productDeck: ProductInstance[]; influenceDeck: InfluenceCardType[] } {
    let productDeck = current.productDeck;
    let influenceDeck = current.influenceDeck;
    const cardIndex = player.influenceHand.findIndex((card) => card.id === move.cardId);
    const card = player.influenceHand[cardIndex];
    if (!card || player.influenceActionUsed) {
      return { productDeck, influenceDeck };
    }

    player.influenceHand.splice(cardIndex, 1);
    player.influenceActionUsed = true;

    if (card.effect.kind === "tag_modifier") {
      addAiInfluence(playedInfluences, { id: card.id, name: card.name, ownerId: player.id, modifiers: card.effect.modifiers }, logs, language);
    }

    if (card.effect.kind === "anti_tag" && move.targetTag) {
      addAiInfluence(playedInfluences, { id: card.id, name: card.name, ownerId: player.id, modifiers: [{ tag: move.targetTag, value: card.effect.value }] }, logs, language);
    }

    if ((card.effect.kind === "target_own_bonus" || card.effect.kind === "target_opponent_penalty") && move.targetOwnerId && move.targetSlotIndex !== undefined) {
      addAiInfluence(
        playedInfluences,
        {
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
        },
        logs,
        language
      );
    }

    if (card.effect.kind === "tie_preference") {
      addAiInfluence(playedInfluences, { id: card.id, name: card.name, ownerId: player.id, tieOwner: player.id }, logs, language);
    }

    if (card.effect.kind === "rearrange") {
      player.productActionUsed = false;
      logs.push(language === "en" ? "AI opened one more product replacement." : "ИИ освободил себе ещё одну замену товара.");
    }

    if (card.effect.kind === "draw_product") {
      const [cards, rest] = draw(productDeck, card.effect.draw);
      productDeck = rest;
      const kept = cards.slice(0, card.effect.keep);
      player.productHand.push(...kept);
      logs.push(
        kept.length
          ? language === "en"
            ? `AI kept ${kept.map((product) => productName(language, product)).join(", ")}.`
            : `ИИ оставил ${kept.map((product) => product.name).join(", ")}.`
          : language === "en"
            ? `${influenceName(language, card)}: product deck is empty.`
            : `${card.name}: колода товаров пуста.`
      );
    }

    if (card.effect.kind === "draw_influence") {
      const [cards, rest] = draw(influenceDeck, card.effect.draw);
      influenceDeck = rest;
      const kept = cards.slice(0, card.effect.keep);
      player.influenceHand.push(...kept);
      logs.push(
        kept.length
          ? language === "en"
            ? `AI kept ${kept.map((influence) => influenceName(language, influence)).join(", ")}.`
            : `ИИ оставил ${kept.map((influence) => influence.name).join(", ")}.`
          : language === "en"
            ? `${influenceName(language, card)}: influence deck is empty.`
            : `${card.name}: колода влияний пуста.`
      );
    }

    return { productDeck, influenceDeck };
  }

  function applyAiPlanningTurn(current: GameState, aiPlayerId: PlayerId): GameState {
    if (current.phase !== "planning" || current.activePlayer !== aiPlayerId || current.choiceDraft) {
      return current;
    }

    let productDeck = current.productDeck;
    let influenceDeck = current.influenceDeck;
    const players = clonePlayersForAi(current.players);
    const player = players.find((candidate) => candidate.id === aiPlayerId)!;
    const input = {
      players,
      currentCustomers: current.currentCustomers,
      activeTrends: current.activeTrends,
      playedInfluences: current.playedInfluences,
      roundBonuses: current.roundBonuses,
      productDeckLength: current.productDeck.length,
      influenceDeckLength: current.influenceDeck.length
    };
    const isTrainingMode = current.aiMode === "training";
    const aiDifficulty = current.campaignRun?.aiDifficulty ?? current.aiDifficulty;
    const plan = aiDifficulty
      ? planAiPlanningTurnForDifficulty(input, aiPlayerId, aiDifficulty)
      : isTrainingMode
        ? planWeakAiPlanningTurn(input, aiPlayerId)
        : planAiPlanningTurn(input, aiPlayerId);
    const language = audioSettingsRef.current.language;
    const aiIntent = buildAiPlanningIntent(current, player, plan, language);
    const logs: string[] = [];
    const playedInfluences = [...current.playedInfluences];
    const roundBonuses = [...current.roundBonuses];

    if (plan.productMove) {
      applyAiProductMove(current, player, plan.productMove, logs, language);
    }

    if (plan.influenceMove) {
      const decks = applyAiInfluenceMove(current, player, plan.influenceMove, playedInfluences, logs, language);
      productDeck = decks.productDeck;
      influenceDeck = decks.influenceDeck;
    }

    if (plan.tableBonusMove && hasUpgrade(player.upgrades, "ad_table") && !player.tableBonusUsed) {
      player.tableBonusUsed = true;
      roundBonuses.push({ ownerId: player.id, slotIndex: plan.tableBonusMove.slotIndex, value: 1, label: "Рекламный столик" });
      logs.push(language === "en" ? `Ad table boosted a product ${ownerPhrase(player.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), language)}.` : `Рекламный столик усилил товар ${ownerPhrase(player.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), language)}.`);
    }

    player.planned = true;
    logs.push(aiIntent);
    if (isTrainingMode) {
      logs.push(
        language === "en"
          ? `AI turn score: ${formatSignedScore(plan.scoreDelta)}${plan.notes.length ? ` (${plan.notes.join(", ")})` : ""}.`
          : `Оценка хода ИИ: ${formatSignedScore(plan.scoreDelta)}${plan.notes.length ? ` (${plan.notes.join(", ")})` : ""}.`
      );
    }

    const nextAiScore = current.aiScore + plan.scoreDelta;
    const baseState = {
      ...current,
      players,
      productDeck,
      influenceDeck,
      playedInfluences,
      roundBonuses,
      selectedProductId: null,
      selectedInfluenceId: null,
      aiScore: nextAiScore,
      aiIntent,
      logs: [...logs.reverse(), ...current.logs].slice(0, 24)
    };
    const nextPlayer = players.find((candidate) => !candidate.planned);

    if (nextPlayer) {
      return {
        ...baseState,
        activePlayer: nextPlayer.id,
        logs: [
          language === "en"
            ? `Planning turn passes to ${actionPlayerName(nextPlayer.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), language)}.`
            : `Ход планирования переходит: ${actionPlayerName(nextPlayer.id, viewerIdFor(lobbyRef.current, current.aiPlayerId), language)}.`,
          ...baseState.logs
        ].slice(0, 24)
      };
    }

    return resolveRoundSales(baseState);
  }

  function applyAiUpgradeTurn(current: GameState, aiPlayerId: PlayerId): GameState {
    if (current.phase !== "upgrade" || current.upgradeQueue[0] !== aiPlayerId) {
      return current;
    }

    const language = audioSettingsRef.current.language;
    const players = clonePlayersForAi(current.players);
    const buyer = players.find((player) => player.id === aiPlayerId)!;
    const isTrainingMode = current.aiMode === "training";
    const aiDifficulty = current.campaignRun?.aiDifficulty ?? current.aiDifficulty;
    const useWeakUpgradePlan = isTrainingMode || Boolean(aiDifficulty && aiDifficulty <= 10);
    const choice = useWeakUpgradePlan ? chooseWeakAiUpgrade(buyer, current.upgradeOffer) : chooseAiUpgrade(buyer, current.upgradeOffer);
    const queue = current.upgradeQueue.slice(1);
    let upgradeOffer = current.upgradeOffer;
    let aiScore = current.aiScore;
    let log = language === "en" ? `AI (${aiPlayerId}) skipped buying an upgrade.` : `ИИ (${aiPlayerId}) пропустил покупку апгрейда.`;
    let aiIntent = language === "en" ? "Opponent is saving money for an upgrade." : "Оппонент копит деньги на апгрейд.";

    if (choice) {
      const upgrade = current.upgradeOffer.find((candidate) => candidate.id === choice.upgradeId);
      if (upgrade && buyer.money >= upgrade.cost) {
        buyer.money -= upgrade.cost;
        buyer.upgrades.push(upgrade);
        if (upgrade.effect === "extra_shelf") {
          buyer.shelfSlots += 1;
          buyer.shelf.push(null);
        }

        upgradeOffer = current.upgradeOffer.filter((candidate) => candidate.id !== upgrade.id);
        const reward = Math.max(1, Math.round(choice.score));
        aiScore += reward;
        log =
          language === "en"
            ? `${isTrainingMode ? "Weak AI" : "AI"} (${aiPlayerId}) bought ${upgradeName(language, upgrade)}: score ${formatSignedScore(reward)}.`
            : `${isTrainingMode ? "Слабый ИИ" : "ИИ"} (${aiPlayerId}) купил ${upgrade.name}: баллы ${formatSignedScore(reward)}.`;
        aiIntent =
          language === "en"
            ? `Opponent bought ${upgradeName(language, upgrade)}: improving the stall.`
            : `Оппонент купил ${upgrade.name}: усиливает лавку.`;
      }
    }

    const next = {
      ...current,
      players,
      upgradeOffer,
      upgradeQueue: queue,
      activePlayer: queue[0] ?? current.firstPlayer,
      aiScore,
      aiIntent,
      logs: [aiIntent, ...(isTrainingMode ? [log] : []), ...current.logs].slice(0, 24)
    };

    return queue.length ? next : nextRoundAfterBreak(next);
  }

  function runAiStep() {
    patchState((current) => {
      if (!current.aiPlayerId || current.activePlayer !== current.aiPlayerId) {
        return current;
      }

      if (current.phase === "planning") {
        return applyAiPlanningTurn(current, current.aiPlayerId);
      }

      if (current.phase === "upgrade") {
        return applyAiUpgradeTurn(current, current.aiPlayerId);
      }

      return current;
    }, (current, next) => {
      if (next.phase === "game_end") {
        return "game-win";
      }
      if (next.saleResults.length > current.saleResults.length) {
        return next.saleResults.some((result) => result.winner) ? "coin-sale" : "round-end";
      }
      if (next.phase === "upgrade" && current.phase !== "upgrade") {
        return "trend-shift";
      }
      if (next.phase === "planning" && current.phase !== "planning") {
        return "customer-arrive";
      }
      return "ready-confirm";
    });
  }

  const canPlayInfluence = Boolean(selectedInfluence && canControlActivePlayer && !handPlayer.influenceActionUsed && !state.choiceDraft);
  const selectedOwnTarget =
    selectedInfluence?.effect.kind === "target_own_bonus" && canControlActivePlayer ? handPlayer.shelf.map((product, slotIndex) => ({ product, slotIndex })) : [];
  const selectedOpponentTarget =
    selectedInfluence?.effect.kind === "target_opponent_penalty" && canControlActivePlayer
      ? state.players.find((player) => player.id === opponentOf(handPlayer.id))?.shelf.map((product, slotIndex) => ({ product, slotIndex })) ?? []
      : [];
  const forecastSaleResults = state.phase === "planning" ? calculateRoundSales(state).saleResults : [];
  const shownSaleResults = state.phase === "planning" ? forecastSaleResults : state.saleResults;
  const salePanelTitle = state.phase === "planning" ? ui(language, "saleForecast") : state.phase === "sale_resolution" ? ui(language, "saleResults") : ui(language, "saleCalculation");
  const nextCustomer = state.customerDeck[0] ?? null;
  const nextTrend = state.trendDeck[0] ?? null;
  const showUpcomingCards = state.round < 8 && state.phase !== "game_end";
  const influenceImpact = selectedInfluence ? influenceImpactLines(selectedInfluence, handPlayer, opponentPlayer, state.selectedTag) : [];
  const canAdvanceResolution = !state.pause.active && (!lobby || lobby.playerId === state.activePlayer);
  const coachPlan = useMemo(() => {
    if (state.aiMode !== "training" || !state.aiPlayerId || state.phase !== "planning" || localPlayer.id === state.aiPlayerId) {
      return null;
    }

    return planAiPlanningTurn(
      {
        players: state.players,
        currentCustomers: state.currentCustomers,
        activeTrends: state.activeTrends,
        playedInfluences: state.playedInfluences,
        roundBonuses: state.roundBonuses,
        productDeckLength: state.productDeck.length,
        influenceDeckLength: state.influenceDeck.length
      },
      localPlayer.id
    );
  }, [
    state.aiMode,
    state.aiPlayerId,
    state.phase,
    state.players,
    state.currentCustomers,
    state.activeTrends,
    state.playedInfluences,
    state.roundBonuses,
    state.productDeck.length,
    state.influenceDeck.length,
    localPlayer.id
  ]);
  const coachAdvice = buildCoachAdvice(coachPlan, localPlayer, language);
  const coachProductId = coachPlan?.productMove?.productInstanceId ?? null;
  const coachSlotIndex = coachPlan?.productMove?.slotIndex ?? null;
  const coachInfluenceId = coachPlan?.influenceMove?.cardId ?? null;
  const tablePlayers = [opponentPlayer, localPlayer];
  const aiPlayer = state.aiPlayerId ? state.players.find((player) => player.id === state.aiPlayerId) ?? null : null;
  const completedGoalCount = state.partyGoals.filter((goal) => goal.completed).length;
  const currentCampaignLevel = state.campaignRun ? CAMPAIGN_LEVELS.find((level) => level.level === state.campaignRun?.level) ?? null : null;
  const campaignCanAdvance = Boolean(state.campaignRun && finalResult.tone !== "defeat");
  const nextCampaignLevel =
    campaignCanAdvance && state.campaignRun ? CAMPAIGN_LEVELS.find((level) => level.level === state.campaignRun!.level + 1) ?? null : null;
  const primaryCampaignEndLevel = state.campaignRun ? (campaignCanAdvance ? nextCampaignLevel ?? currentCampaignLevel : currentCampaignLevel) : null;
  const primaryEndActionLabel = state.campaignRun ? (campaignCanAdvance && nextCampaignLevel ? ui(language, "nextLevel") : ui(language, "retryLevel")) : ui(language, "playAgain");
  const cutsceneFrame = cutscene ? CUTSCENE_FRAMES[cutscene.frameIndex] : null;
  const focusTrendTags = useMemo(() => new Set(state.activeTrends[0]?.modifiers.map((modifier) => modifier.tag) ?? []), [state.activeTrends]);
  const canEditTurnTime = !lobby || lobby.playerId === "A";
  const turnTimeSettingValue = lobby ? state.turnTimeSeconds : audioSettings.turnTimeSeconds;

  return (
    <main
      className={`app-shell phase-${state.phase}`}
      style={{ backgroundImage: `linear-gradient(rgba(38, 27, 17, 0.78), rgba(18, 13, 9, 0.9)), url(${MARKET_BG})` }}
      onPointerDownCapture={() => requestMusicPlayback()}
    >
      {state.phase === "menu" && (
        <section className="menu-screen">
          {menuView === "main" ? (
            <div className="menu-box">
              <div className="menu-intro">
                <h1>{GAME_TITLE}</h1>
                <p>{ui(language, "menuSubtitle")}</p>
              </div>

              <div className="menu-sections">
                <section className="menu-section" aria-labelledby="play-mode-title">
                  <h2 id="play-mode-title">{ui(language, "chooseMode")}</h2>
                  <div className="menu-primary-grid">
                    <button className="primary-action" onClick={() => setMenuView("levels")}>
                      <MapIcon size={18} /> {ui(language, "campaignMode")}
                    </button>
                    <button className="primary-action" onClick={startGame}>
                      <Play size={18} /> {ui(language, "twoPlayers")}
                    </button>
                    <button
                      className="primary-action"
                      onClick={() => {
                        playEffect("ui-click");
                        setShowAiDifficulty(true);
                      }}
                    >
                      <Bot size={18} /> {ui(language, "versusAi")}
                    </button>
                    <button className="primary-action" onClick={() => startAiGame("training")}>
                      <Bot size={18} /> {ui(language, "aiTraining")}
                    </button>
                  </div>
                </section>

                <section className="menu-section" aria-labelledby="online-mode-title">
                  <h2 id="online-mode-title">{ui(language, "onlineGame")}</h2>
                  <div className="menu-online-row">
                    <button
                      className="primary-action"
                      onClick={() => {
                        playEffect("ui-click");
                        void createLobby();
                      }}
                    >
                      <PackagePlus size={18} /> {ui(language, "createTable")}
                    </button>
                    <div className="join-lobby">
                      <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder={ui(language, "lobbyCodePlaceholder")} maxLength={6} />
                      <button
                        onClick={() => {
                          playEffect("ui-click");
                          void joinLobby();
                        }}
                      >
                        {ui(language, "joinTable")}
                      </button>
                    </div>
                  </div>
                  {networkUrls.length > 0 && (
                    <div className="lan-addresses" aria-label={ui(language, "lanAddressLabel")}>
                      <span>{ui(language, "lanAddressLabel")}</span>
                      {networkUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} /> {url}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="menu-network-divider" aria-hidden="true" />
                </section>

                <div className="menu-footer-actions">
                  <button
                    onClick={() => {
                      playEffect("ui-click");
                      setShowRules(true);
                    }}
                  >
                    <BadgeHelp size={18} /> {ui(language, "rules")}
                  </button>
                  <button
                    onClick={() => {
                      playEffect("ui-click");
                      setShowSettings(true);
                    }}
                  >
                    <Settings size={18} /> {ui(language, "settings")}
                  </button>
                  <button
                    onClick={() => {
                      playEffect("ui-click");
                      setShowAbout(true);
                    }}
                  >
                    <Info size={18} /> {ui(language, "about")}
                  </button>
                </div>

                <div className="menu-support-actions" aria-label={ui(language, "supportProject")}>
                  <a href="https://buymeacoffee.com/zl0yxp" target="_blank" rel="noreferrer">
                    <Coffee size={18} /> Buy Me a Coffee
                  </a>
                  <a href="https://www.paypal.com/donate/?hosted_button_id=CY7A2U64JWY4W" target="_blank" rel="noreferrer">
                    <HandCoins size={18} /> PayPal
                  </a>
                </div>
              </div>

              {lobbyError && <p className="lobby-error">{lobbyError}</p>}
              <small>{ui(language, "lobbyHint")}</small>
            </div>
          ) : (
            <div className="menu-box level-map-box">
              <div className="level-map-heading">
                <button
                  onClick={() => {
                    playEffect("ui-click");
                    setMenuView("main");
                  }}
                >
                  <ChevronLeft size={18} /> {ui(language, "back")}
                </button>
                <div>
                  <h1>{ui(language, "campaignMode")}</h1>
                  <p>{ui(language, "levelMapIntro")}</p>
                </div>
              </div>

              <div className="level-road" aria-label={language === "en" ? "Level selection" : "Выбор уровня"}>
                {CAMPAIGN_LEVELS.map((level) => {
                  const unlocked = isLevelUnlocked(campaignProgress, level.level);
                  const completed = campaignProgress.completedLevels.includes(level.level);
                  return (
                    <button
                      key={level.level}
                      className={`level-node ${unlocked ? "unlocked" : "locked"} ${completed ? "completed" : ""}`}
                      aria-label={`${ui(language, "level")} ${level.level}`}
                      disabled={!unlocked}
                      onClick={() => requestCampaignLevel(level)}
                    >
                      <span className="level-node-icon">{completed ? <Check size={16} /> : unlocked ? <Flag size={16} /> : <Lock size={16} />}</span>
                      <strong>{ui(language, "level")} {level.level}</strong>
                      <span>{language === "en" ? level.opponentNameEn : level.opponentName} · {campaignLevelTitle(language, level)}</span>
                      <small>{campaignLevelDistrict(language, level)}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {cutscene && cutsceneFrame && (
        <section className="cutscene-overlay" role="dialog" aria-label={ui(language, "cutsceneLabel")}>
          <img key={cutsceneFrame.image} className="cutscene-frame" src={cutsceneFrame.image} alt="" />
          <div className="cutscene-controls">
            <div className="cutscene-progress">
              {cutscene.frameIndex + 1} / {CUTSCENE_FRAMES.length}
            </div>
            <button onClick={skipCutscene}>
              <SkipForward size={18} /> {ui(language, "skip")}
            </button>
          </div>
          <div className="cutscene-subtitles">
            <p>{cutsceneText(language, cutscene.frameIndex, cutsceneFrame.text)}</p>
            <button className="primary-action" onClick={advanceCutscene}>
              {cutscene.frameIndex >= CUTSCENE_FRAMES.length - 1 ? ui(language, "startLevel") : ui(language, "next")}
            </button>
          </div>
        </section>
      )}

      <header className="top-bar">
        <div className="top-brand">
          <h1>{GAME_TITLE}</h1>
          <span>
            {state.campaignRun
              ? ui(language, "campaignRound", { level: state.campaignRun.level, total: CAMPAIGN_LEVELS.length, round: state.round })
              : ui(language, "roundFirstTurn", { round: state.round, player: displayPlayerName(state.firstPlayer, localPlayerId, language) })}
          </span>
        </div>
        <div className="top-actions">
          <div className={`sync-pill sync-${syncStatus}`}>
            {lobby ? `${ui(language, "lobbyCode").toLowerCase()} ${lobby.code} · ${ui(language, "you").toLowerCase()} ${lobby.playerId}` : ui(language, "localTable")} · {syncStatus}
          </div>
          {aiPlayer && (
            <div className="ai-score">
              <b>
                <Bot size={16} /> {ui(language, "ai")}: {displayPlayerNameFor(aiPlayer, localPlayerId, language)}
              </b>
              <span>{state.aiMode === "training" ? ui(language, "aiScore", { score: formatSignedScore(state.aiScore) }) : state.aiIntent ?? ui(language, "aiWaiting")}</span>
              {state.aiMode === "training" && state.aiIntent && <small>{state.aiIntent}</small>}
            </div>
          )}
        </div>
        <div className="score-row">
          {state.players.map((player) => (
            <div key={player.id} className={`score score-${player.color}`}>
              <b>{displayPlayerNameFor(player, localPlayerId, language)}</b>
              <span>
                <Coins size={17} /> {player.money}
              </span>
              <small>{ui(language, "sales")} {player.sales}</small>
            </div>
          ))}
        </div>
        {state.phase !== "menu" && state.phase !== "game_end" && (
          <button className="settings-toggle top-pause" onClick={pauseGame}>
            <Pause size={18} /> {ui(language, "pause")}
          </button>
        )}
      </header>

      <section className="trend-strip">
        {state.activeTrends.map((trend, index) => (
          <TrendCard key={trend.id} trend={trend} focused={index === 0} language={language} />
        ))}
        {nextTrend && showUpcomingCards && (
          <div className="trend-card preview-card" title={`${ui(language, "soon")}: ${trendName(language, nextTrend)}: ${formatModifiers(nextTrend.modifiers, language)}`}>
            <Sparkles size={18} />
            <div className="trend-copy">
              <strong>{ui(language, "soon")}: {trendName(language, nextTrend)}</strong>
              <span>{formatModifiers(nextTrend.modifiers, language)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="customer-strip">
        {state.currentCustomers.map((customer) => (
          <CustomerCard key={customer.id} customer={customer} focusTags={focusTrendTags} language={language} />
        ))}
        {nextCustomer && showUpcomingCards && (
          <div className="next-customer">
            <span>{ui(language, "soon")}</span>
            <CustomerCard customer={nextCustomer} focusTags={focusTrendTags} language={language} />
          </div>
        )}
      </section>

      <section className="table-grid">
        {tablePlayers.map((player) => (
          <section
            key={player.id}
            className={`shop-panel shop-${player.color} ${player.id === localPlayer.id ? "seat-local" : "seat-opponent"} ${
              state.activePlayer === player.id ? "seat-active" : ""
            }`}
          >
            <div className="shop-heading">
              <h2>{player.id === localPlayer.id ? ui(language, "yourStall") : ui(language, "opponentStall")} · {displayPlayerNameFor(player, localPlayerId, language)}</h2>
              <span>{player.upgrades.length ? player.upgrades.map((upgrade) => upgradeName(language, upgrade)).join(", ") : ui(language, "noUpgrades")}</span>
            </div>
            <div className="shelf-grid" style={{ gridTemplateColumns: `repeat(${player.shelfSlots}, minmax(112px, 1fr))` }}>
              {player.shelf.map((product, slotIndex) => (
                <div
                  key={`${player.id}-${slotIndex}`}
                  className={`shelf-slot ${
                    state.phase === "planning" &&
                    (!lobby || lobby.playerId === player.id) &&
                    state.activePlayer === player.id &&
                    state.selectedProductId &&
                    !player.productActionUsed &&
                    !state.choiceDraft
                      ? ""
                      : "slot-unavailable"
                  } ${rejectedSlot === `${player.id}-${slotIndex}` ? "slot-rejecting" : ""} ${
                    state.phase === "planning" && player.id === localPlayer.id && coachSlotIndex === slotIndex && coachProductId ? "coach-recommended" : ""
                  }`}
                >
                  {product ? (
                    <>
                      <ProductCard
                        product={product}
                        language={language}
                        compact
                        focusTags={focusTrendTags}
                        ariaDisabled={
                          !(
                            state.phase === "planning" &&
                            (!lobby || lobby.playerId === player.id) &&
                            state.activePlayer === player.id &&
                            state.selectedProductId &&
                            !player.productActionUsed &&
                            !state.choiceDraft
                          )
                        }
                        onClick={() => {
                          const canPlace =
                            state.phase === "planning" &&
                            (!lobby || lobby.playerId === player.id) &&
                            state.activePlayer === player.id &&
                            state.selectedProductId &&
                            !player.productActionUsed &&
                            !state.choiceDraft;
                          if (canPlace) {
                            placeProduct(player.id, slotIndex);
                            return;
                          }
                          rejectShelfAction(`${player.id}-${slotIndex}`);
                        }}
                        title={
                          language === "en"
                            ? `${productName(language, product)}. Tags: ${product.tags.map((tag) => tagText(language, tag)).join(", ")}. Price ${product.price}. Stock ${product.stock}.`
                            : `${product.name}. Теги: ${product.tags.join(", ")}. Цена ${product.price}. Запас ${product.stock}.`
                        }
                      />
                      {state.phase === "planning" &&
                        (!lobby || lobby.playerId === player.id) &&
                        state.activePlayer === player.id &&
                        state.selectedProductId &&
                        !player.productActionUsed &&
                        !state.choiceDraft && (
                        <span className="slot-badge">{ui(language, "replace")}</span>
                      )}
                      {state.phase === "planning" &&
                        (!lobby || lobby.playerId === player.id) &&
                        state.activePlayer === player.id &&
                        hasUpgrade(player.upgrades, "ad_table") &&
                        !player.tableBonusUsed && (
                          <button className="slot-tool" onClick={() => useAdTable(player.id, slotIndex)}>
                            <Sparkles size={14} /> +1
                          </button>
                        )}
                    </>
                  ) : (
                    <button
                      className="empty-slot"
                      aria-disabled={
                        !(
                          state.phase === "planning" &&
                          (!lobby || lobby.playerId === player.id) &&
                          state.activePlayer === player.id &&
                          state.selectedProductId &&
                          !player.productActionUsed &&
                          !state.choiceDraft
                        )
                      }
                      onClick={() => {
                        const canPlace =
                          state.phase === "planning" &&
                          (!lobby || lobby.playerId === player.id) &&
                          state.activePlayer === player.id &&
                          state.selectedProductId &&
                          !player.productActionUsed &&
                          !state.choiceDraft;
                        if (canPlace) {
                          placeProduct(player.id, slotIndex);
                          return;
                        }
                        rejectShelfAction(`${player.id}-${slotIndex}`);
                      }}
                    >
                      <ShoppingBasket size={18} />
                      {(!lobby || lobby.playerId === player.id) && state.activePlayer === player.id && state.selectedProductId ? ui(language, "placeHere") : ui(language, "productSlot")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

      </section>

      <aside className="event-panel">
        <div className="sale-panel-heading">
          <h2>{salePanelTitle}</h2>
          {state.phase === "planning" && <p className="sale-note">{ui(language, "forecastNote")}</p>}
        </div>
          <div className="sale-results">
            {state.phase === "sale_resolution" && state.saleInsights.length > 0 && (
              <div className="sale-insights" aria-label={ui(language, "saleInsights")}>
                <h3>{ui(language, "saleInsights")}</h3>
                {state.saleInsights.map((insight) => (
                  <p key={insight}>{insight}</p>
                ))}
              </div>
            )}
            {shownSaleResults.length === 0 ? (
              <p>{state.phase === "planning" ? ui(language, "noForecastProducts") : ui(language, "saleFormulaAfterReady")}</p>
            ) : (
              shownSaleResults.map((result) => (
                <details key={result.customer.id} open>
                  <summary>
                    {customerName(language, result.customer)}: {result.winner ? `${productName(language, result.winner.product)} ${ownerPhrase(result.winner.ownerId, localPlayerId, language)}` : ui(language, "noPurchase")}
                  </summary>
                  {result.candidates.map((candidate) => (
                    <div key={`${candidate.ownerId}-${candidate.slotIndex}`} className={isWinningCandidate(result, candidate) ? "formula winner" : "formula"}>
                      <b>
                        {productName(language, candidate.product)} · {displayPlayerNameFor(state.players.find((player) => player.id === candidate.ownerId), localPlayerId, language)}
                      </b>
                      {candidate.appeal.breakdown.map((line) => (
                        <span key={`${line.label}-${line.value}`} className={isFocusTrendLine(line.label) ? "focus-formula-line" : undefined}>
                          {line.value > 0 ? "+" : ""}
                          {line.value} {line.label}
                        </span>
                      ))}
                      <strong>= {candidate.appeal.total}</strong>
                    </div>
                  ))}
                </details>
              ))
            )}
          </div>
          <h2>{ui(language, "log")}</h2>
          <ol className="event-log">
            {state.logs.map((log, index) => (
              <li key={`${log}-${index}`}>{log}</li>
            ))}
          </ol>
      </aside>

      <section className="hand-panel">
        {state.phase !== "menu" && (
          <div className="party-goals">
            <div className="party-goals-heading">
              <h2>{ui(language, "partyGoals")}</h2>
              <span>{completedGoalCount} / {state.partyGoals.length}</span>
            </div>
            <div className="party-goal-list">
              {state.partyGoals.map((goal) => (
                <div key={goal.id} className={partyGoalClassName(goal, localPlayerId)}>
                  <span>{goalTitle(language, goal)}</span>
                  <strong>{goal.progress} / {goal.target}{goal.completed && goal.rewardClaimed ? ` · +${goal.reward}` : ` · +${PARTY_GOAL_REWARD}`}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.phase === "planning" && (
          <>
            <div className="hand-heading">
              <div>
                <h2>
                  {canControlActivePlayer ? ui(language, "yourTurn") : ui(language, "opponentTurn")} ·{" "}
                  {displayPlayerNameFor(canControlActivePlayer ? handPlayer : activePlayer, localPlayerId, language)}
                </h2>
                <div className="action-steps">
                  <span className={handPlayer.productActionUsed ? "done" : ""}>{handPlayer.productActionUsed ? ui(language, "productChosen") : ui(language, "productToSlot")}</span>
                  <span className={handPlayer.influenceActionUsed ? "done" : ""}>{handPlayer.influenceActionUsed ? ui(language, "influencePlayed") : ui(language, "influenceOrSkip")}</span>
                  <span>{ui(language, "readyStep")}</span>
                </div>
              </div>
              {localPlanningTurn && <div className="turn-timer" aria-label={ui(language, "turnTimer")}>{ui(language, "turnTimeShort", { time: formatTurnTime(turnSecondsLeft) })}</div>}
              <button className="primary-action" onClick={readyPlayer} disabled={!canControlActivePlayer || Boolean(state.choiceDraft)}>
                <Check size={18} /> {ui(language, "ready")}
              </button>
            </div>

            {coachAdvice.length > 0 && (
              <div className="coach-panel">
                <h3>{ui(language, "coachAdvice")}</h3>
                {coachAdvice.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

            <div className="hand-columns">
              <div>
                <h3>{ui(language, "handProducts")}</h3>
                <div className="hand-row">
                  {handPlayer.productHand.map((product) => (
                    <ProductCard
                      key={product.instanceId}
                      product={product}
                      language={language}
                      focusTags={focusTrendTags}
                      selected={state.selectedProductId === product.instanceId}
                      recommended={coachProductId === product.instanceId}
                      disabled={!canControlActivePlayer}
                      onClick={() => selectProduct(product.instanceId)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <h3>{ui(language, "influence")}</h3>
                <div className="hand-row influence-row">
                  {handPlayer.influenceHand.map((card) => (
                    <InfluenceCard
                      key={card.id}
                      card={card}
                      language={language}
                      selected={state.selectedInfluenceId === card.id}
                      recommended={coachInfluenceId === card.id}
                      disabled={!canControlActivePlayer || handPlayer.influenceActionUsed}
                      onClick={() => selectInfluence(card.id)}
                    />
                  ))}
                </div>
                {selectedInfluence && (
                  <div className="influence-controls">
                    {influenceImpact.length > 0 && (
                      <div className="influence-impact">
                        {influenceImpact.map((line) => (
                          <span key={`${line.tag}-${line.value}`}>
                            {tagText(language, line.tag)} {formatSignedScore(line.value)}: {ui(language, "ownImpact")} {line.ownCount} ({formatSignedScore(line.ownDelta)}), {ui(language, "opponentImpact")} {line.opponentCount} (
                            {formatSignedScore(line.opponentDelta)})
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedInfluence.effect.kind === "anti_tag" && (
                      <select value={state.selectedTag} onChange={(event) => patchState((current) => ({ ...current, selectedTag: event.target.value as Tag }))}>
                        {TAGS.map((tag) => (
                          <option key={tag} value={tag}>
                            {tagText(language, tag)}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedInfluence.effect.kind === "target_own_bonus" &&
                      selectedOwnTarget.map(({ product, slotIndex }) => (
                        <button key={slotIndex} disabled={!product} onClick={() => playInfluence({ ownerId: handPlayer.id, slotIndex })}>
                          {ui(language, "ownSlot", { slot: slotIndex + 1 })}
                        </button>
                      ))}
                    {selectedInfluence.effect.kind === "target_opponent_penalty" &&
                      selectedOpponentTarget.map(({ product, slotIndex }) => (
                        <button key={slotIndex} disabled={!product} onClick={() => playInfluence({ ownerId: opponentOf(handPlayer.id), slotIndex })}>
                          {ui(language, "opponentSlot", { slot: slotIndex + 1 })}
                        </button>
                      ))}
                    {["tag_modifier", "anti_tag", "tie_preference", "draw_product", "draw_influence", "rearrange"].includes(selectedInfluence.effect.kind) && (
                      <button className="primary-action" disabled={!canPlayInfluence} onClick={() => playInfluence({ tag: state.selectedTag })}>
                        <HandCoins size={16} /> {ui(language, "playInfluence")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {state.phase === "sale_resolution" && (
          <div className="resolution-panel">
            <div>
              <h2>{ui(language, "saleResults")}</h2>
              <span>{ui(language, "saleResolutionText")}</span>
            </div>
            <button className="primary-action" onClick={continueSalesResolution} disabled={!canAdvanceResolution}>
              <SkipForward size={18} /> {ui(language, "continue")}
            </button>
          </div>
        )}

        {state.phase === "upgrade" && (
          <div className="upgrade-shop">
            <div>
              <h2>{ui(language, "upgradeShop")}</h2>
              <span>{ui(language, "upgradeShopText", { player: displayPlayerNameFor(state.players.find((player) => player.id === state.upgradeQueue[0]), localPlayerId, language) })}</span>
            </div>
            <div className="upgrade-row">
              {state.upgradeOffer.map((upgrade) => {
                const buyer = state.players.find((player) => player.id === state.upgradeQueue[0])!;
                return <UpgradeCard key={upgrade.id} upgrade={upgrade} language={language} canBuy={canControlActivePlayer && buyer.money >= upgrade.cost} onBuy={() => buyUpgrade(upgrade.id)} />;
              })}
            </div>
            <button onClick={skipUpgrade} disabled={!canControlActivePlayer}>
              <X size={18} /> {ui(language, "skipUpgrade")}
            </button>
          </div>
        )}

      </section>

      {state.phase === "game_end" && (
        <div className="game-end-backdrop">
          <section className={`end-panel end-panel-${finalResult.tone}`} role="dialog" aria-labelledby="game-end-title">
            <span className="end-kicker">{finalResult.tone === "victory" ? ui(language, "marketSmiles") : finalResult.tone === "defeat" ? ui(language, "newDay") : ui(language, "friendlyFinal")}</span>
            <h2 id="game-end-title">{finalResult.title}</h2>
            <p>{finalResult.message}</p>
            <div className="goal-badge">{ui(language, "partyGoals")}: {completedGoalCount} / {state.partyGoals.length}</div>
            <div className="end-actions">
              <button className="primary-action" onClick={primaryCampaignEndLevel ? () => startCampaignLevel(primaryCampaignEndLevel) : startGame}>
                {state.campaignRun && campaignCanAdvance && nextCampaignLevel ? <SkipForward size={18} /> : <RefreshCw size={18} />} {primaryEndActionLabel}
              </button>
              {state.campaignRun && (
                <button
                  onClick={() => {
                    exitToMenu();
                    setMenuView("levels");
                  }}
                >
                  <MapIcon size={18} /> {ui(language, "levelMap")}
                </button>
              )}
              <button onClick={requestExitToMenu}>
                <X size={18} /> {ui(language, "exit")}
              </button>
            </div>
          </section>
        </div>
      )}

      {waitingForLobbyPlayer && lobby && (
        <div className="modal-backdrop lobby-wait-backdrop">
          <section className="lobby-wait-modal" role="dialog" aria-label={ui(language, "lobbyWaitTitle")}>
            <h2>{ui(language, "lobbyWaitTitle")}</h2>
            <p>{ui(language, "lobbyWaitText")}</p>
            <div className="lobby-code" aria-label={ui(language, "lobbyCode")}>
              {lobby.code}
            </div>
            <button onClick={exitToMenu}>
              <LogOut size={18} /> {ui(language, "exit")}
            </button>
          </section>
        </div>
      )}

      {state.choiceDraft && (
        <div className="modal-backdrop">
          <div className="choice-modal">
            <h2>{ui(language, "keepOneCard")}</h2>
            <div className="choice-row">
              {state.choiceDraft.cards.map((card, index) =>
                state.choiceDraft?.type === "product" ? (
                  <ProductCard
                    key={(card as ProductInstance).instanceId}
                    product={card as ProductInstance}
                    language={language}
                    focusTags={focusTrendTags}
                    disabled={Boolean(lobby && lobby.playerId !== state.choiceDraft?.playerId)}
                    onClick={() => keepDraftCard(index)}
                  />
                ) : (
                  <InfluenceCard
                    key={(card as InfluenceCardType).id}
                    card={card as InfluenceCardType}
                    language={language}
                    selected={false}
                    disabled={Boolean(lobby && lobby.playerId !== state.choiceDraft?.playerId)}
                    onClick={() => keepDraftCard(index)}
                  />
                )
              )}
            </div>
          </div>
        </div>
      )}

      {state.pause.active && state.phase !== "menu" && state.phase !== "game_end" && (
        <div className="modal-backdrop pause-backdrop">
          <section className="pause-modal" role="dialog" aria-label={ui(language, "pause")}>
            <div className="pause-heading">
              <span>{ui(language, "pauseTitle")}</span>
              <h2>{ui(language, "pause")}</h2>
              <p>
                {ui(language, "pausedBy", { player: state.pause.pausedBy ? displayPlayerName(state.pause.pausedBy, localPlayerId, language) : ui(language, "player") })}
              </p>
            </div>
            <div className="pause-actions">
              <button className="primary-action" onClick={resumeGame}>
                <Play size={18} /> {ui(language, "continue")}
              </button>
              <button
                onClick={() => {
                  playEffect("ui-click");
                  setShowSettings(true);
                }}
              >
                <Settings size={18} /> {ui(language, "settings")}
              </button>
              <button onClick={requestExitToMenu}>
                <LogOut size={18} /> {ui(language, "exitToMenu")}
              </button>
            </div>
          </section>
        </div>
      )}

      {showExitConfirm && (
        <div className="modal-backdrop exit-confirm-backdrop">
          <section className="confirm-modal" role="dialog" aria-label={ui(language, "exitToMenu")}>
            <h2>{ui(language, "exitToMenu")}</h2>
            <p>{ui(language, "exitConfirmText")}</p>
            <div className="confirm-actions">
              <button className="primary-action" onClick={cancelExitToMenu}>
                {ui(language, "stay")}
              </button>
              <button onClick={exitToMenu}>
                <LogOut size={18} /> {ui(language, "exit")}
              </button>
            </div>
          </section>
        </div>
      )}

      {showAiDifficulty && (
        <div className="modal-backdrop">
          <section className="ai-difficulty-modal" role="dialog" aria-label={ui(language, "aiDifficulty")}>
            <button className="modal-close" aria-label={ui(language, "close")} onClick={() => setShowAiDifficulty(false)}>
              <X size={18} />
            </button>
            <h2>{ui(language, "aiDifficulty")}</h2>
            <div className="ai-difficulty-list">
              {AI_DIFFICULTIES.map((difficulty) => (
                <button key={difficulty.label} className="primary-action" onClick={() => startAiGame("opponent", difficulty)}>
                  <Bot size={18} /> {aiDifficultyLabel(language, difficulty)}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop settings-backdrop">
          <div className="settings-modal" role="dialog" aria-label={ui(language, "settings")}>
            <button className="modal-close" aria-label={ui(language, "closeSettings")} onClick={() => setShowSettings(false)}>
              <X size={18} />
            </button>
            <h2>{ui(language, "settings")}</h2>
            <div className="settings-list">
              <label className="setting-row">
                <span className="setting-copy">
                  <Languages size={18} />
                  <span>
                    <strong>{ui(language, "language")}</strong>
                    <small>{language === "en" ? "Interface language" : "Язык интерфейса"}</small>
                  </span>
                </span>
                <select
                  aria-label={ui(language, "language")}
                  value={language}
                  onChange={(event) => updateAudioSettings({ language: normalizeLanguage(event.target.value) })}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="setting-row">
                <span className="setting-copy">
                  <Music size={18} />
                  <span>
                    <strong>{ui(language, "backgroundMusic")}</strong>
                    <small>{ui(language, "backgroundMusicHelp")}</small>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={audioSettings.musicEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    updateAudioSettings({ musicEnabled: enabled });
                    if (enabled) {
                      requestMusicPlayback(true);
                    } else {
                      pauseMusic();
                    }
                  }}
                />
              </label>
              <label className="range-row">
                <span>
                  <Volume2 size={16} /> {ui(language, "musicVolume")}
                </span>
                <input
                  aria-label={ui(language, "musicVolume")}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings.musicVolume}
                  disabled={!audioSettings.musicEnabled}
                  onChange={(event) => updateAudioSettings({ musicVolume: Number(event.target.value) })}
                />
              </label>
              <label className="setting-row">
                <span className="setting-copy">
                  {audioSettings.effectsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  <span>
                    <strong>{ui(language, "soundEffects")}</strong>
                    <small>{ui(language, "soundEffectsHelp")}</small>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={audioSettings.effectsEnabled}
                  onChange={(event) => updateAudioSettings({ effectsEnabled: event.target.checked })}
                />
              </label>
              <label className="range-row">
                <span>
                  <Volume2 size={16} /> {ui(language, "effectsVolume")}
                </span>
                <input
                  aria-label={ui(language, "effectsVolume")}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings.effectsVolume}
                  disabled={!audioSettings.effectsEnabled}
                  onChange={(event) => updateAudioSettings({ effectsVolume: Number(event.target.value) })}
                />
              </label>
              <label className="range-row">
                <span>
                  <Timer size={16} /> {ui(language, "turnTimeSetting", { seconds: turnTimeSettingValue })}
                </span>
                <input
                  aria-label={ui(language, "turnTime")}
                  type="range"
                  min={MIN_TURN_TIME_SECONDS}
                  max={MAX_TURN_TIME_SECONDS}
                  step="5"
                  value={turnTimeSettingValue}
                  disabled={!canEditTurnTime}
                  onChange={(event) => updateTurnTimeSetting(Number(event.target.value))}
                />
                {lobby && !canEditTurnTime && <small>{ui(language, "onlineTurnTimeLocked")}</small>}
              </label>
            </div>
            <div className="track-status">
              <div>
                <p>{ui(language, "nowPlaying", { track: currentTrackTitle })}</p>
                <span>{ui(language, "status", { status: musicStatusText })}</span>
              </div>
              <button type="button" disabled={state.phase === "menu" || state.phase === "game_end"} onClick={() => playMusicTrack(currentTrackIndex + 1, audioSettings.musicEnabled)}>
                <SkipForward size={16} /> {ui(language, "nextTrack")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAbout && (
        <div className="modal-backdrop">
          <div className="about-modal" role="dialog" aria-label={ui(language, "about")}>
            <button className="modal-close" aria-label={ui(language, "close")} onClick={() => setShowAbout(false)}>
              <X size={18} />
            </button>
            <h2>{ui(language, "about")}</h2>
            <p>{ui(language, "aboutText1")}</p>
            <p>{ui(language, "aboutText2")}</p>
            <div className="about-links">
              <a href="mailto:zloydeveloper.info@gmail.com">
                <Mail size={18} /> zloydeveloper.info@gmail.com
              </a>
              <a href="https://github.com/KristopherZlo/Awww-Fair" target="_blank" rel="noreferrer">
                <Github size={18} /> KristopherZlo/Awww-Fair <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {showRules && (
        <div className="modal-backdrop">
          <div className="rules-modal">
            <button className="modal-close" onClick={() => setShowRules(false)}>
              <X size={18} />
            </button>
            <h2>{ui(language, "rules")}</h2>
            <p>{ui(language, "rulesIntro")}</p>
            {language === "en" ? (
              <ol>
                <li>Customers arrive each round. Each has a primary and secondary tag and looks for matching products.</li>
                <li>Trends do not replace customer wishes. They show which tags are stronger or weaker in the market right now.</li>
                <li>Customer wishes and trends stack. A product matching both gets both bonuses.</li>
                <li>On your turn, place or replace one product, then play one influence card or skip it.</li>
                <li>The primary customer tag gives +3 appeal. The secondary tag gives +2. Trends, influence cards, and upgrades can change the score.</li>
                <li>If a product scores below {PURCHASE_APPEAL_THRESHOLD}, the customer will not buy it. Otherwise, the customer buys the most appealing product.</li>
                <li>Party goals give extra coins. After rounds 2, 4, and 6, players can buy upgrades.</li>
                <li>After round 8, the player with more coins wins. If coins are tied, sales decide the winner.</li>
              </ol>
            ) : (
              <ol>
                <li>В каждом раунде приходят клиенты. У каждого клиента есть два тега: главный и второй. Он ищет товар с похожими тегами.</li>
                <li>Тренд не заменяет желание клиента. Клиент всё равно ищет свои теги, а тренд показывает, что сейчас сильнее или слабее на рынке.</li>
                <li>Очки за желание клиента и тренд складываются. Например: клиент хочет напиток, а тренд усиливает дешёвое. Тогда товар с тегами «напиток» и «дешёвое» получает оба бонуса.</li>
                <li>Лучший выбор — товар, где совпали и клиент, и тренд. Если такого товара нет, сравни сумму очков и избегай тегов со штрафом.</li>
                <li>В свой ход сделай до двух вещей: выставь или замени 1 товар, потом сыграй 1 карту влияния или пропусти.</li>
                <li>Главный тег клиента даёт +3 привлекательности. Второй тег даёт +2. Тренды, влияния и апгрейды могут добавить или убрать очки.</li>
                <li>Если товар набрал меньше {PURCHASE_APPEAL_THRESHOLD}, клиент его не купит. Если товаров несколько, клиент берёт самый привлекательный.</li>
                <li>Если привлекательность равна, клиент выбирает более дешёвый товар. Если снова равенство, выбирает игрока с меньшим числом монет.</li>
                <li>Когда оба игрока готовы, игра считает продажи. За проданный товар ты получаешь его цену, иногда бонусы. Запас товара уменьшается.</li>
                <li>Цели партии дают дополнительные монеты. После 2, 4 и 6 раунда можно купить апгрейды, которые помогают в следующих раундах.</li>
                <li>После 8 раунда побеждает тот, у кого больше монет. Если монет поровну, побеждает тот, у кого больше продаж.</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
