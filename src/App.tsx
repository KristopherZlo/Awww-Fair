import {
  BadgeHelp,
  Bot,
  ChevronLeft,
  ChevronRight,
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
  LogIn,
  LogOut,
  Mail,
  Map as MapIcon,
  Music,
  PackagePlus,
  Pause,
  Play,
  RefreshCw,
  ScrollText,
  Search,
  ShoppingBasket,
  Settings,
  SkipForward,
  Sparkles,
  Timer,
  Trophy,
  User,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { appAssetUrl } from "./assetUrl";
import { preloadImage } from "./assetPreloader";
import {
  CAMPAIGN_RULE_OPTIONS,
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_INITIAL_STATE_OPTIONS,
  DEFAULT_TURN_TIME_SECONDS,
  MAX_TURN_TIME_SECONDS,
  MIN_TURN_TIME_SECONDS,
  clampTurnTime
} from "./app/gameConfig";
import { localHintMove, localHintValue } from "./app/localHints";
import { LOBBY_API, lobbyAuthHeaders, parseLobbyResponse } from "./app/lobbyClient";
import { devLogin, loadCurrentUser, logout, type AuthUser } from "./app/authClient";
import {
  abandonRankedMatch,
  cancelRankedQueue,
  disconnectRankedMatch,
  joinRankedQueue,
  loadLeaderboard,
  loadRankedEvents,
  loadMatchHistory,
  loadMyRating,
  loadRankedStatus,
  reconnectRankedMatch,
  settleRankedMatch,
  type LeaderboardEntry,
  type PlayerRating,
  type RankedMatch,
  type RankedMatchEvent,
  type RankedMatchHistoryEntry,
  type RankedQueueStatus,
  recordRankedEvent
} from "./app/rankedClient";
import {
  displayPlayerName,
  displayPlayerNameFor,
  formatLogForViewer,
  formatModifiers,
  formatSignedScore,
  isFocusTrendLine,
  ownerLogToken,
  playerLogToken
} from "./app/presentation";
import {
  SESSION_STORAGE_VERSION,
  clearSavedSession,
  loadCampaignProgress,
  loadSavedSession,
  normalizeSavedGameState,
  saveCampaignProgress,
  saveSession
} from "./app/persistence";
import { useLocalHintMarkers } from "./app/useLocalHintMarkers";
import type {
  AiMode,
  AudioSettings,
  ChoiceDraft,
  CutsceneState,
  GameState,
  InitialStateOptions,
  LobbySession,
  MenuView,
  MusicStatus,
  SavedSession
} from "./app/types";
import { TAGS } from "./data/cards";
import { CustomerCard, InfluenceCard, ProductCard, TagPill, TrendCard, UpgradeCard } from "./components/cards";
import { SaleResultCards } from "./components/saleResults";
import {
  hasUpgrade,
  productHandLimit,
  PURCHASE_APPEAL_THRESHOLD,
  resolveCustomerPurchase,
  trendModifierValue
} from "./game/engine";
import { PARTY_GOAL_REWARD, updatePartyGoalsAfterSales, type PartyGoal } from "./game/goals";
import { applyRankedReplayEvent } from "./game/rankedReplay";
import { buildInitialState, draw, GAME_TITLE } from "./game/session";
import { drawCompatibleTrends } from "./game/trends";
import {
  chooseAiInfluenceChoice,
  chooseAiProductChoice,
  chooseAiUpgrade,
  chooseWeakAiUpgrade,
  planAiPlanningTurn,
  planAiPlanningTurnForDifficulty,
  planWeakAiPlanningTurn,
  type AiInfluenceMove,
  type AiPlanningPlan
} from "./game/ai";
import { clampVolume, playSoundEffect, primeSoundEffects, type SoundEffectId } from "./audio/soundEffects";
import {
  CAMPAIGN_LEVELS,
  campaignProgressAfterWin,
  campaignRulesForLevel,
  isLevelUnlocked,
  type CampaignCustomerPersonalityMode,
  type CampaignLevel,
  type CampaignProgress
} from "./game/levels";
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

const assetUrl = appAssetUrl;
const MARKET_BG = assetUrl("market-bg.webp");
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
const SOUND_ASSETS = {
  defeat: assetUrl("sounds/defeat.wav"),
  matchFound: assetUrl("sounds/matchfound.mp3"),
  money: assetUrl("sounds/money.wav"),
  victory: assetUrl("sounds/victory.wav")
} as const;
const LOBBY_POLL_MS = 900;
const RANKED_POLL_MS = 900;
const LOBBY_SILENT_RETRY_DELAYS_MS = [1000, 2000, 5000] as const;
const LOBBY_VISIBLE_RETRY_DELAYS_MS = [5000, 10000, 20000] as const;
const TURN_CUE_MS = 1200;
const MATCH_FOUND_FALLBACK_MS = 3200;
const UPGRADE_CHOICE_SECONDS = 20;
type MainMenuTab = "play" | "profile" | "rating" | "dlc";
type PlayModeTab = "ranked" | "story" | "hotseat" | "training" | "custom";
type RankedSession = {
  matchId: string;
  playerAId: string;
  playerBId: string;
  localPlayerId: PlayerId;
  lastEventSequence: number;
  settled: boolean;
};
const MATCH_FOUND_LICENSE =
  "Piano Notification 5b by FoolBoyMedia -- https://freesound.org/s/352654/ -- License: Attribution NonCommercial 4.0 used as match-found sound";

function rankedHistoryResultLabel(match: RankedMatchHistoryEntry, playerId: string): string {
  if (!match.winnerId) return "Ничья";
  return match.winnerId === playerId ? "Победа" : "Поражение";
}

function rankedHistoryMmrChange(match: RankedMatchHistoryEntry, playerId: string): number {
  if (!match.winnerId) return 0;
  return match.winnerId === playerId ? match.mmrChange : -match.mmrChange;
}

function signedMmrChange(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}

function rankedStatusText(status: RankedQueueStatus["status"]): string {
  if (status === "matched") return "Матч найден.";
  if (status === "waiting") return "Вы в очереди рейтинга.";
  return "";
}

function formatRankedQueueTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

const CUTSCENE_FRAMES = [
  {
    image: assetUrl("cutscene/aaakh-01.webp"),
    text: "В мире Ааах начинается большая ярмарка."
  },
  {
    image: assetUrl("cutscene/aaakh-02.webp"),
    text: "Каждый год лучшие продавцы собираются на Великой ярмарке мира Ааах."
  },
  {
    image: assetUrl("cutscene/aaakh-03.webp"),
    text: "Но в этот раз у нас есть цель - заработать на новую шляпу."
  },
  {
    image: assetUrl("cutscene/aaakh-04.webp"),
    text: "Чтобы купить её, нужно стать лучшими продавцами ярмарки."
  },
  {
    image: assetUrl("cutscene/aaakh-05.webp"),
    text: "Наша лавка готова. Всё только начинается."
  },
  {
    image: assetUrl("cutscene/aaakh-06.webp"),
    text: "Но победа не достанется просто так."
  },
  {
    image: assetUrl("cutscene/aaakh-07.webp"),
    text: "Первый клиент уже идёт!"
  },
  {
    image: assetUrl("cutscene/aaakh-08.webp"),
    text: "Пора открыть лавку и начать путь к новой шляпе."
  }
] as const;

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

function campaignInitialStateOptions(level: number): InitialStateOptions {
  const rules = campaignRulesForLevel(level, CAMPAIGN_RULE_OPTIONS);
  return {
    trendCount: rules.trendCount,
    partyGoalCount: rules.partyGoalCount,
    influenceHandSize: rules.influenceHandSize,
    customerPersonalityMode: rules.customerPersonalityMode
  };
}

function influenceHandSizeForState(state: GameState) {
  return state.campaignRun ? campaignInitialStateOptions(state.campaignRun.level).influenceHandSize : DEFAULT_INITIAL_STATE_OPTIONS.influenceHandSize;
}

function purchaseAppealThresholdForState(state: Pick<GameState, "campaignRun">) {
  return state.campaignRun ? campaignRulesForLevel(state.campaignRun.level, CAMPAIGN_RULE_OPTIONS).purchaseAppealThreshold : PURCHASE_APPEAL_THRESHOLD;
}

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "A" ? "B" : "A";
}

function viewerIdFor(lobby: LobbySession | null, aiPlayerId: PlayerId | null): PlayerId {
  return lobby?.playerId ?? (aiPlayerId ? opponentOf(aiPlayerId) : "A");
}

function rankedSeatFor(match: Pick<RankedMatch, "playerAId" | "playerBId">, userId: string | undefined): PlayerId {
  return match.playerBId === userId ? "B" : "A";
}

function localRankedDisconnectedAt(match: Pick<RankedMatch, "playerAId" | "playerBId" | "playerADisconnectedAt" | "playerBDisconnectedAt">, userId: string | undefined): number | null {
  return rankedSeatFor(match, userId) === "A" ? match.playerADisconnectedAt : match.playerBDisconnectedAt;
}

function rankedSequenceOf(event: unknown): number | null {
  const sequence = Number((event as { sequence?: unknown } | null)?.sequence);
  return Number.isFinite(sequence) ? sequence : null;
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

function lobbyRetryDelayMs(failureCount: number) {
  if (failureCount <= LOBBY_SILENT_RETRY_DELAYS_MS.length) {
    return LOBBY_SILENT_RETRY_DELAYS_MS[failureCount - 1];
  }

  const visibleIndex = Math.min(failureCount - LOBBY_SILENT_RETRY_DELAYS_MS.length - 1, LOBBY_VISIBLE_RETRY_DELAYS_MS.length - 1);
  return LOBBY_VISIBLE_RETRY_DELAYS_MS[visibleIndex];
}

function shouldShowLobbyReconnectNotice(failureCount: number) {
  return failureCount > LOBBY_SILENT_RETRY_DELAYS_MS.length;
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

function lineTag(label: string) {
  return label.split(":").pop()?.replace("(главный тренд)", "").trim() ?? "";
}

function lineSource(label: string) {
  return label.split(":")[0]?.trim() ?? label;
}

function describeSaleInsight(result: PurchaseResult, viewerId: PlayerId, language: Language) {
  if (language === "en") {
    if (!result.winner) {
      if (result.customer.personality?.kind === "trend_chaser") {
        return `${customerName(language, result.customer)} bought nothing: no product matched the needed trend.`;
      }
      return `${customerName(language, result.customer)} bought nothing: no product reached ${result.appealThreshold} appeal.`;
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
    return `${result.customer.name} ничего не купил: ни один товар не набрал ${result.appealThreshold} привлекательности.`;
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

function drawProductsToLimit(player: PlayerState, deck: ProductInstance[]): [PlayerState, ProductInstance[]] {
  const limit = productHandLimit(player);
  const needed = Math.max(0, limit - player.productHand.length);
  const [cards, rest] = draw(deck, needed);
  return [{ ...player, productHand: [...player.productHand, ...cards] }, rest];
}

function drawInfluencesToLimit(player: PlayerState, deck: InfluenceCardType[], limit = DEFAULT_INITIAL_STATE_OPTIONS.influenceHandSize): [PlayerState, InfluenceCardType[]] {
  const needed = Math.max(0, limit - player.influenceHand.length);
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

function GoogleGIcon() {
  return (
    <span className="oauth-brand-icon oauth-google-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="#4285F4" d="M22.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.26h5.94c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.58c2.09-1.93 3.29-4.78 3.29-8.11z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.58-2.77c-.99.66-2.26 1.06-3.7 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.86C3.96 20.55 7.68 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1A6.61 6.61 0 0 1 5.5 12c0-.73.12-1.44.34-2.1V7.04H2.15A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.15 4.96l3.69-2.86z" />
        <path fill="#EA4335" d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.68 1 3.96 3.45 2.15 7.04L5.84 9.9C6.71 7.3 9.14 5.37 12 5.37z" />
      </svg>
    </span>
  );
}

function DiscordIcon() {
  return (
    <span className="oauth-brand-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path
          fill="currentColor"
          d="M19.73 5.09A18.1 18.1 0 0 0 15.19 3.7c-.2.35-.42.82-.58 1.2a16.8 16.8 0 0 0-5.04 0c-.16-.38-.39-.85-.59-1.2a18.05 18.05 0 0 0-4.54 1.39C1.56 9.36.78 13.52 1.17 17.62a18.2 18.2 0 0 0 5.57 2.81c.45-.61.85-1.26 1.19-1.96-.65-.24-1.27-.54-1.85-.89.16-.12.31-.24.46-.37a13 13 0 0 0 10.92 0c.15.13.3.25.46.37-.59.35-1.21.65-1.86.89.34.7.74 1.35 1.19 1.96a18.16 18.16 0 0 0 5.58-2.81c.46-4.75-.78-8.88-3.1-12.53zM8.68 15.1c-1.08 0-1.96-.99-1.96-2.2s.86-2.2 1.96-2.2c1.1 0 1.98.99 1.96 2.2 0 1.21-.87 2.2-1.96 2.2zm6.64 0c-1.08 0-1.96-.99-1.96-2.2s.86-2.2 1.96-2.2c1.1 0 1.98.99 1.96 2.2 0 1.21-.86 2.2-1.96 2.2z"
        />
      </svg>
    </span>
  );
}

export default function App() {
  const [initialSession] = useState<SavedSession | null>(() => loadSavedSession());
  const [state, setState] = useState<GameState>(() => initialSession?.state ?? buildInitialState(true, initialSession?.audioSettings.turnTimeSeconds ?? DEFAULT_TURN_TIME_SECONDS));
  const [menuView, setMenuView] = useState<MenuView>("main");
  const [menuTab, setMenuTab] = useState<MainMenuTab>("play");
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgress>(() => loadCampaignProgress());
  const [cutscene, setCutscene] = useState<CutsceneState | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLicenses, setShowLicenses] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showAiDifficulty, setShowAiDifficulty] = useState(false);
  const [lobby, setLobby] = useState<LobbySession | null>(() => initialSession?.lobby ?? null);
  const [joinCode, setJoinCode] = useState(() => initialSession?.lobby?.code ?? "");
  const [lobbyError, setLobbyError] = useState("");
  const [syncStatus, setSyncStatus] = useState<"local" | "online" | "syncing" | "offline">(() => (initialSession?.lobby ? "online" : "local"));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [playModeTab, setPlayModeTab] = useState<PlayModeTab>("ranked");
  const [authError, setAuthError] = useState("");
  const [devLoginName, setDevLoginName] = useState("player");
  const [profileRating, setProfileRating] = useState<PlayerRating | null>(null);
  const [matchHistory, setMatchHistory] = useState<RankedMatchHistoryEntry[]>([]);
  const [matchHistoryError, setMatchHistoryError] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardTotalPages, setLeaderboardTotalPages] = useState(1);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [rankedQueueState, setRankedQueueState] = useState<RankedQueueStatus["status"]>("idle");
  const [rankedQueueStartedAt, setRankedQueueStartedAt] = useState<number | null>(null);
  const [rankedQueueSeconds, setRankedQueueSeconds] = useState(0);
  const [rankedCooldownSeconds, setRankedCooldownSeconds] = useState(0);
  const [rankedStatus, setRankedStatus] = useState("");
  const [rankedSession, setRankedSession] = useState<RankedSession | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => initialSession?.audioSettings ?? DEFAULT_AUDIO_SETTINGS);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(DEFAULT_TRACK_INDEX);
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string>(MENU_TRACK.title);
  const [musicStatus, setMusicStatus] = useState<MusicStatus>("idle");
  const [rejectedSlot, setRejectedSlot] = useState<string | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(() => state.turnTimeSeconds);
  const [armedTurnTimerKey, setArmedTurnTimerKey] = useState(() => `${state.round}-${state.activePlayer}-${state.phase}-${state.upgradeQueue[0] ?? ""}`);
  const [expandedSaleResultKeys, setExpandedSaleResultKeys] = useState<Set<string>>(() => new Set());
  const [lastSaleReviewOpen, setLastSaleReviewOpen] = useState(false);
  const [turnCue, setTurnCue] = useState<{ key: string; label: string; expiresAt: number } | null>(null);
  const localHintMarkersEnabled = useLocalHintMarkers();
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
  const autoSkipUpgradeRef = useRef<string | null>(null);
  const rejectTimerRef = useRef<number | null>(null);
  const turnCueTimerRef = useRef<number | null>(null);
  const lastTurnCueKeyRef = useRef<string | null>(null);
  const skipNextSessionSaveRef = useRef(false);
  const stateRef = useRef<GameState>(state);
  const language = audioSettings.language;
  const salePanelId = useId();
  const rankedSessionRef = useRef<RankedSession | null>(null);
  const pendingRankedActionKeysRef = useRef<Set<string>>(new Set());
  const pendingRankedMatchIdRef = useRef<string | null>(null);
  const matchFoundTimerRef = useRef<number | null>(null);

  function setRankedQueue(status: RankedQueueStatus["status"]) {
    setRankedQueueState(status);
    if (status === "waiting") {
      setRankedQueueStartedAt((current) => current ?? Date.now());
      return;
    }
    setRankedQueueStartedAt(null);
    setRankedQueueSeconds(0);
  }

  useEffect(() => {
    return () => {
      if (matchFoundTimerRef.current !== null) {
        window.clearTimeout(matchFoundTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    loadCurrentUser()
      .then((user) => {
        if (!disposed) {
          setCurrentUser(user);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setRankedQueue("idle");
      setRankedStatus("");
      return;
    }
    let disposed = false;
    loadRankedStatus()
      .then((result) => {
        if (!disposed) {
          if (result.status === "matched") {
            if (localRankedDisconnectedAt(result.match, currentUser.id) !== null) {
              void reconnectRankedMatch(result.match.id)
                .then((reconnected) => {
                  if (!disposed) {
                    startRankedMatch(reconnected.match);
                  }
                })
                .catch((error) => {
                  if (!disposed) {
                    setRankedQueue("idle");
                    setRankedStatus(error instanceof Error ? error.message : "Р РµР№С‚РёРЅРі РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ.");
                  }
                });
            } else {
              startRankedMatch(result.match);
            }
          } else {
            setRankedQueue(result.status);
            setRankedStatus("");
          }
        }
      })
      .catch(() => {
        if (!disposed) {
          setRankedQueue("idle");
        }
      });
    return () => {
      disposed = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const cooldownUntil = profileRating?.penalty?.cooldownUntil;
    if (!cooldownUntil) {
      setRankedCooldownSeconds(0);
      return;
    }

    const updateCooldown = () => {
      setRankedCooldownSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    };

    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, [profileRating?.penalty?.cooldownUntil]);

  useEffect(() => {
    if (rankedQueueState !== "waiting" || rankedQueueStartedAt === null) {
      return;
    }

    const updateElapsed = () => {
      setRankedQueueSeconds(Math.max(0, Math.floor((Date.now() - rankedQueueStartedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [rankedQueueState, rankedQueueStartedAt]);

  useEffect(() => {
    if (!currentUser || rankedQueueState !== "waiting") {
      return;
    }
    let disposed = false;
    let timer: number | null = null;

    async function pollRankedStatus() {
      try {
        const result = await loadRankedStatus();
        if (disposed) {
          return;
        }
        if (result.status === "matched") {
          prepareRankedMatch(result.match);
          return;
        }
        setRankedQueue(result.status);
      } catch (error) {
        if (!disposed) {
          setRankedStatus(error instanceof Error ? error.message : "Р РµР№С‚РёРЅРі РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ.");
        }
      }
      if (!disposed) {
        timer = window.setTimeout(() => void pollRankedStatus(), RANKED_POLL_MS);
      }
    }

    timer = window.setTimeout(() => void pollRankedStatus(), RANKED_POLL_MS);
    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [currentUser?.id, rankedQueueState]);

  useEffect(() => {
    rankedSessionRef.current = rankedSession;
  }, [rankedSession]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const session = rankedSession;
    if (!session || state.phase === "game_end") {
      return;
    }
    const activeSession = session;

    let disposed = false;
    let timer: number | null = null;

    async function pullRankedEvents() {
      try {
        const events = await loadRankedEvents(activeSession.matchId, activeSession.lastEventSequence);
        if (disposed) {
          return;
        }

        const maxSequence = events.reduce((max, event) => Math.max(max, event.sequence), activeSession.lastEventSequence);
        const replayEvents = activeSession.lastEventSequence === 0 ? events : events.filter((event) => event.actorId !== currentUser?.id);
        if (replayEvents.length > 0) {
          applyRemoteRankedEvents(activeSession, replayEvents);
        }
        if (maxSequence > activeSession.lastEventSequence) {
          advanceRankedSequence(activeSession.matchId, maxSequence);
        }
      } catch (error) {
        if (!disposed) {
          setRankedStatus(error instanceof Error ? error.message : "Р РµР№С‚РёРЅРі РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ.");
        }
      }

      if (!disposed) {
        timer = window.setTimeout(() => void pullRankedEvents(), RANKED_POLL_MS);
      }
    }

    void pullRankedEvents();
    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [rankedSession?.matchId, rankedSession?.lastEventSequence, state.phase, currentUser?.id]);

  useEffect(() => {
    const session = rankedSession;
    if (!session || session.settled || state.phase !== "game_end") {
      return;
    }

    const playerA = state.players.find((player) => player.id === "A");
    const playerB = state.players.find((player) => player.id === "B");
    if (!playerA || !playerB) {
      return;
    }

    setRankedSession((current) => (current?.matchId === session.matchId ? { ...current, settled: true } : current));
    void settleRankedMatch({
      matchId: session.matchId,
      playerACoins: playerA.money,
      playerBCoins: playerB.money,
      playerASales: playerA.sales,
      playerBSales: playerB.sales
    })
      .then(() => {
        setRankedStatus("Р РµР·СѓР»СЊС‚Р°С‚ СЂРµР№С‚РёРЅРіР° Р·Р°РїРёСЃР°РЅ.");
        if (currentUser) {
          void loadMyRating().then(setProfileRating).catch(() => undefined);
          void loadMatchHistory().then(setMatchHistory).catch(() => undefined);
        }
      })
      .catch((error) => {
        setRankedStatus(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїРёСЃР°С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚ СЂРµР№С‚РёРЅРіР°.");
      });
  }, [rankedSession?.matchId, rankedSession?.settled, state.phase, state.players, currentUser?.id]);

  useEffect(() => {
    if (menuTab !== "rating") {
      return;
    }
    let disposed = false;
    loadLeaderboard({ page: leaderboardPage, pageSize: 10, search: leaderboardSearch })
      .then((result) => {
        if (!disposed) {
          setLeaderboard(result.leaderboard);
          setLeaderboardTotal(result.total);
          setLeaderboardTotalPages(result.totalPages);
          setLeaderboardError("");
        }
      })
      .catch((error) => {
        if (!disposed) {
          setLeaderboardError(error instanceof Error ? error.message : "Рейтинг временно недоступен.");
        }
      });
    return () => {
      disposed = true;
    };
  }, [leaderboardPage, leaderboardSearch, menuTab]);

  useEffect(() => {
    if (!currentUser) {
      setProfileRating(null);
      setMatchHistory([]);
      setMatchHistoryError("");
      return;
    }
    let disposed = false;
    setProfileRating(null);
    setMatchHistory([]);
    setMatchHistoryError("");
    loadMyRating()
      .then((rating) => {
        if (!disposed) {
          setProfileRating(rating);
        }
      })
      .catch(() => undefined);
    loadMatchHistory()
      .then((history) => {
        if (!disposed) {
          setMatchHistory(history);
        }
      })
      .catch((error) => {
        if (!disposed) {
          setMatchHistoryError(error instanceof Error ? error.message : "История рейтинга временно недоступна.");
        }
      });
    return () => {
      disposed = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (state.phase === "menu" && playModeTab === "story" && campaignProgress.highestUnlockedLevel === 1) {
      preloadImage(CUTSCENE_FRAMES[0]?.image);
    }
  }, [campaignProgress.highestUnlockedLevel, playModeTab, state.phase]);

  useEffect(() => {
    if (!cutscene) {
      return;
    }

    preloadImage(CUTSCENE_FRAMES[cutscene.frameIndex + 1]?.image);
  }, [cutscene?.frameIndex]);

  const activePlayer = state.players.find((player) => player.id === state.activePlayer) ?? state.players[0];
  const isAiTurn = Boolean(state.aiPlayerId && state.activePlayer === state.aiPlayerId);
  const localPlayerId = rankedSession?.localPlayerId ?? viewerIdFor(lobby, state.aiPlayerId);
  const localPlayer = state.players.find((player) => player.id === localPlayerId) ?? activePlayer;
  const opponentPlayer = state.players.find((player) => player.id === opponentOf(localPlayer.id)) ?? state.players[1];
  const handPlayer = rankedSession || lobby || state.aiPlayerId ? localPlayer : activePlayer;
  const canControlSeat = (playerId: PlayerId) => (rankedSession ? localPlayerId === playerId : !lobby || lobby.playerId === playerId);
  const waitingForLobbyPlayer = Boolean(lobby && state.phase !== "game_end" && (!lobby.seats.A || !lobby.seats.B));
  const planningTurnActive = state.phase === "planning" && !waitingForLobbyPlayer && !state.pause.active && !state.choiceDraft;
  const canControlActivePlayer = !waitingForLobbyPlayer && !state.pause.active && !isAiTurn && canControlSeat(state.activePlayer);
  const localPlanningTurn = planningTurnActive && canControlActivePlayer;
  const opponentPlanningTurn = planningTurnActive && !localPlanningTurn;
  const upgradeTurnActive = state.phase === "upgrade" && !waitingForLobbyPlayer && !state.pause.active && state.upgradeQueue.length > 0;
  const localUpgradeTurn = upgradeTurnActive && canControlActivePlayer;
  const showTurnTimer = planningTurnActive || upgradeTurnActive;
  const canResolveChoiceDraft = Boolean(state.choiceDraft && canControlSeat(state.choiceDraft.playerId));
  const selectedInfluence = handPlayer.influenceHand.find((card) => card.id === state.selectedInfluenceId) ?? null;
  const finalResult = useMemo(() => gameOutcome(state.players, localPlayerId, language), [state.players, localPlayerId, language]);
  const isTimedLocalTurn = localPlanningTurn && !state.pause.active;
  const isHotseatGame = !rankedSession && !lobby && !state.aiPlayerId;
  const activeTurnLabel = isHotseatGame
    ? ui(language, "hotseatTurn", { player: state.activePlayer })
    : canControlActivePlayer
      ? ui(language, "yourTurn")
      : `${ui(language, "opponentTurn")} · ${displayPlayerNameFor(activePlayer, localPlayerId, language)}`;
  const turnCueLabel = isHotseatGame ? ui(language, "hotseatTurn", { player: state.activePlayer }) : ui(language, "yourTurn");
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
    setArmedTurnTimerKey(`${state.round}-${state.activePlayer}-${state.phase}-${state.upgradeQueue[0] ?? ""}`);
    setTurnSecondsLeft(state.phase === "upgrade" ? UPGRADE_CHOICE_SECONDS : state.turnTimeSeconds);
    autoReadyTurnRef.current = null;
    autoSkipUpgradeRef.current = null;
  }, [state.phase, state.activePlayer, state.upgradeQueue[0], state.round, state.turnTimeSeconds]);

  useEffect(() => {
    if (!showTurnTimer) {
      return;
    }

    const timer = window.setInterval(() => {
      setTurnSecondsLeft((seconds) => Math.max(0, seconds - 1));
      if (isTimedLocalTurn) {
        playEffect("timer-tick");
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [showTurnTimer, isTimedLocalTurn, state.phase, state.activePlayer, state.upgradeQueue[0], state.round]);

  useEffect(() => {
    const shouldCue =
      state.phase === "planning" &&
      !waitingForLobbyPlayer &&
      !state.pause.active &&
      !isAiTurn &&
      canControlActivePlayer;
    const cueKey = `${rankedSession?.matchId ?? lobby?.code ?? "local"}-${state.round}-${state.activePlayer}-${state.phase}`;

    if (!shouldCue || lastTurnCueKeyRef.current === cueKey) {
      return;
    }

    lastTurnCueKeyRef.current = cueKey;
    setTurnCue({ key: cueKey, label: turnCueLabel, expiresAt: Date.now() + TURN_CUE_MS });
    playEffect("turn-start");
  }, [state.phase, state.activePlayer, state.round, state.pause.active, waitingForLobbyPlayer, isAiTurn, lobby?.code, rankedSession?.matchId, canControlActivePlayer, turnCueLabel]);

  useEffect(() => {
    if (!turnCue) {
      return;
    }

    if (turnCueTimerRef.current !== null) {
      window.clearTimeout(turnCueTimerRef.current);
    }

    const remainingMs = Math.max(0, turnCue.expiresAt - Date.now());
    turnCueTimerRef.current = window.setTimeout(() => {
      setTurnCue((current) => (current?.key === turnCue.key ? null : current));
      turnCueTimerRef.current = null;
    }, remainingMs);

    return () => {
      if (turnCueTimerRef.current !== null) {
        window.clearTimeout(turnCueTimerRef.current);
        turnCueTimerRef.current = null;
      }
    };
  }, [turnCue?.key, turnCue?.expiresAt]);

  useEffect(() => {
    const turnKey = `${state.round}-${state.activePlayer}-${state.phase}-${state.upgradeQueue[0] ?? ""}`;
    if (armedTurnTimerKey !== turnKey || !isTimedLocalTurn || turnSecondsLeft > 0 || autoReadyTurnRef.current === turnKey) {
      return;
    }

    autoReadyTurnRef.current = turnKey;
    readyPlayer();
  }, [armedTurnTimerKey, isTimedLocalTurn, turnSecondsLeft, state.round, state.activePlayer, state.phase, state.upgradeQueue]);

  useEffect(() => {
    const turnKey = `${state.round}-${state.activePlayer}-${state.phase}-${state.upgradeQueue[0] ?? ""}`;
    if (armedTurnTimerKey !== turnKey || !localUpgradeTurn || turnSecondsLeft > 0 || autoSkipUpgradeRef.current === turnKey) {
      return;
    }

    autoSkipUpgradeRef.current = turnKey;
    skipUpgrade();
  }, [armedTurnTimerKey, localUpgradeTurn, turnSecondsLeft, state.round, state.activePlayer, state.phase, state.upgradeQueue]);

  useEffect(() => {
    if (state.phase !== "sale_resolution" || state.pause.active || !canControlSeat(state.activePlayer)) {
      return;
    }

    continueSalesResolution();
  }, [state.phase, state.pause.active, state.activePlayer, lobby?.playerId, rankedSession?.localPlayerId]);

  useEffect(() => {
    return () => {
      if (rejectTimerRef.current !== null) {
        window.clearTimeout(rejectTimerRef.current);
      }
      if (turnCueTimerRef.current !== null) {
        window.clearTimeout(turnCueTimerRef.current);
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
      const activeRankedSession = rankedSessionRef.current;
      if (activeRankedSession) {
        sendRankedDisconnect(activeRankedSession, true);
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
    try {
      playSoundEffect(audio.effectsEnabled, kind, audio.effectsVolume);
    } catch {
      // Audio is cosmetic; gameplay and state transitions must continue.
    }
  }

  function playSoundAsset(src: string, boost = 1, fallback?: SoundEffectId) {
    const settings = audioSettingsRef.current;
    if (!settings.effectsEnabled || typeof Audio === "undefined") {
      if (fallback) {
        playEffect(fallback);
      }
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
      if (fallback) {
        playEffect(fallback);
      }
      return;
    }

    if (playback && typeof playback.catch === "function") {
      void playback.catch(() => {
        if (fallback) {
          playEffect(fallback);
        }
      });
    }
  }

  function shelfStateChanged(current: GameState, next: GameState) {
    return next.players.some((nextPlayer) => {
      const currentPlayer = current.players.find((player) => player.id === nextPlayer.id);
      if (!currentPlayer) {
        return false;
      }

      return nextPlayer.shelf.some((nextProduct, slotIndex) => {
        const currentProduct = currentPlayer.shelf[slotIndex];
        return nextProduct?.instanceId !== currentProduct?.instanceId || nextProduct?.stock !== currentProduct?.stock;
      });
    });
  }

  function resolvedSalesReview(current: GameState, next: GameState) {
    return next.lastSaleReview && next.lastSaleReview !== current.lastSaleReview && next.lastSaleReview.round === current.round ? next.lastSaleReview : null;
  }

  function soundEffectForStateTransition(current: GameState, next: GameState): SoundEffectId | undefined {
    if (next === current) {
      return undefined;
    }
    if (next.phase === "game_end" && current.phase !== "game_end") {
      return "game-win";
    }
    const saleReview = resolvedSalesReview(current, next);
    if (saleReview || next.saleResults.length > current.saleResults.length) {
      const results = saleReview?.results ?? next.saleResults;
      return results.some((result) => result.winner) ? "coin-sale" : "round-end";
    }
    if (next.playedInfluences.length > current.playedInfluences.length) {
      return "influence-play";
    }
    if (next.phase === "upgrade" && current.phase !== "upgrade") {
      return "trend-shift";
    }
    if (next.phase === "planning" && current.phase !== "planning") {
      return "customer-arrive";
    }
    if (shelfStateChanged(current, next)) {
      return "card-place";
    }
    if (next.activePlayer !== current.activePlayer) {
      return "ready-confirm";
    }
    return undefined;
  }

  function playStateTransitionSounds(current: GameState, next: GameState, effect = soundEffectForStateTransition(current, next)) {
    if (next === current) {
      return;
    }

    const moneySoundPlayerId = moneySoundPlayerIdFor(current, lobbyRef.current);
    const previousMoney = current.players.find((player) => player.id === moneySoundPlayerId)?.money ?? 0;
    const nextMoney = next.players.find((player) => player.id === moneySoundPlayerId)?.money ?? previousMoney;
    if (nextMoney > previousMoney) {
      playSoundAsset(SOUND_ASSETS.money, 1.4, "coin-sale");
    }
    if (effect && effect !== "coin-sale") {
      playEffect(effect);
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
      headers: lobbyAuthHeaders(session, { "Content-Type": "application/json" }),
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

    void fetch(url, {
      method: "POST",
      headers: lobbyAuthHeaders(session, { "Content-Type": "application/json" }),
      body,
      keepalive: true
    }).catch(() => undefined);
  }

  function sendRankedDisconnect(session: RankedSession, keepalive = false) {
    if (keepalive) {
      void fetch("/api/ranked/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: session.matchId }),
        keepalive: true
      }).catch(() => undefined);
      return;
    }

    void disconnectRankedMatch(session.matchId).catch(() => undefined);
  }

  function sendRankedAbandon(session: RankedSession) {
    void abandonRankedMatch(session.matchId).catch(() => undefined);
  }

  useEffect(() => {
    if (!lobby) {
      return;
    }

    let disposed = false;
    let pollTimer: number | null = null;
    let failureCount = 0;

    const schedulePoll = (delayMs: number) => {
      if (disposed) {
        return;
      }

      pollTimer = window.setTimeout(() => {
        pollTimer = null;
        void pullLobby();
      }, delayMs);
    };

    async function pullLobby() {
      const session = lobbyRef.current;
      if (!session) {
        return;
      }

      try {
        const payload = await parseLobbyResponse(
          await fetch(`${LOBBY_API}/${session.code}`, {
            headers: lobbyAuthHeaders(session)
          })
        );
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
          const remoteState = normalizeSavedGameState(payload.state);
          applyingRemoteRef.current = true;
          setState((current) => {
            playStateTransitionSounds(current, remoteState);
            return remoteState;
          });
          window.setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 0);
        }

        failureCount = 0;
        setLobbyError("");
        setSyncStatus("online");
        schedulePoll(LOBBY_POLL_MS);
      } catch {
        if (!disposed) {
          failureCount += 1;
          if (shouldShowLobbyReconnectNotice(failureCount)) {
            setLobbyError(ui(language, "lobbyConnectionLost"));
            setSyncStatus("offline");
          }
          schedulePoll(lobbyRetryDelayMs(failureCount));
        }
      }
    }

    void pullLobby();
    return () => {
      disposed = true;
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [language, lobby?.code, lobby?.token]);

  function patchState(recipe: (draft: GameState) => GameState, tone?: SoundEffectId | ((current: GameState, next: GameState) => SoundEffectId | undefined)) {
    setState((current) => {
      const next = recipe(current);
      if (next !== current) {
        publishLobbyState(next);
      }
      const effect = typeof tone === "function" ? tone(current, next) : tone;
      playStateTransitionSounds(current, next, effect);
      stateRef.current = next;
      return next;
    });
  }

  function advanceRankedSequence(matchId: string, sequence: number) {
    setRankedSession((current) =>
      current?.matchId === matchId && sequence > current.lastEventSequence ? { ...current, lastEventSequence: sequence } : current
    );
  }

  function applyRemoteRankedEvents(session: RankedSession, events: RankedMatchEvent[]) {
    const orderedEvents = [...events].sort((left, right) => left.sequence - right.sequence);
    const current = stateRef.current;
    let next: GameState;
    try {
      next = orderedEvents.reduce(
        (updated, event) =>
          applyRankedReplayEvent(updated, { actorId: event.actorId, eventType: event.eventType, payload: event.payload }, { playerAId: session.playerAId, playerBId: session.playerBId }),
        current
      );
    } catch (error) {
      setRankedStatus(error instanceof Error ? error.message : "Не удалось синхронизировать рейтинговый матч.");
      return;
    }
    playStateTransitionSounds(current, next);
    stateRef.current = next;
    setState(next);
  }

  async function submitDevLogin() {
    setAuthError("");
    try {
      setCurrentUser(await devLogin({ displayName: devLoginName }));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Не удалось войти.");
    }
  }

  function playSoundAssetUntilDone(src: string, boost = 1, fallback?: SoundEffectId): Promise<void> {
    const settings = audioSettingsRef.current;
    if (!settings.effectsEnabled || typeof Audio === "undefined") {
      if (fallback) {
        playEffect(fallback);
      }
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = clampVolume(settings.effectsVolume);
      let settled = false;
      let context: AudioContext | null = null;
      const cleanup = () => {
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", finish);
        if (matchFoundTimerRef.current !== null) {
          window.clearTimeout(matchFoundTimerRef.current);
          matchFoundTimerRef.current = null;
        }
        if (context) {
          void context.close().catch(() => undefined);
        }
      };
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      audio.addEventListener("ended", finish);
      audio.addEventListener("error", finish);

      if (typeof window !== "undefined" && audio instanceof HTMLMediaElement) {
        const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
        if (AudioContextClass) {
          try {
            context = new AudioContextClass();
            const source = context.createMediaElementSource(audio);
            const gain = context.createGain();
            gain.gain.value = Math.max(0, settings.effectsVolume * boost);
            source.connect(gain);
            gain.connect(context.destination);
            audio.volume = 1;
          } catch {
            context = null;
            audio.volume = clampVolume(settings.effectsVolume);
          }
        }
      }

      matchFoundTimerRef.current = window.setTimeout(finish, MATCH_FOUND_FALLBACK_MS);
      try {
        const playback = audio.play();
        if (playback && typeof playback.catch === "function") {
          void playback.catch(() => {
            if (fallback) {
              playEffect(fallback);
            }
            finish();
          });
        }
      } catch {
        if (fallback) {
          playEffect(fallback);
        }
        finish();
      }
    });
  }

  async function signOut() {
    await logout().catch(() => undefined);
    setCurrentUser(null);
    setRankedQueue("idle");
    setRankedStatus("");
    rankedSessionRef.current = null;
    pendingRankedMatchIdRef.current = null;
    pendingRankedActionKeysRef.current.clear();
    setRankedSession(null);
  }

  async function joinRanked() {
    if (rankedQueueState === "waiting") {
      await cancelRanked();
      return;
    }
    if (rankedQueueState === "matched") {
      return;
    }
    if (!currentUser) {
      setMenuTab("profile");
      setAuthError("Для рейтинга нужен аккаунт.");
      return;
    }

    setRankedStatus("");
    try {
      const result = await joinRankedQueue();
      if (result.status === "matched") {
        prepareRankedMatch(result.match);
      } else {
        setRankedQueue(result.status);
        setRankedStatus("");
      }
    } catch (error) {
      setRankedStatus(error instanceof Error ? error.message : "Рейтинг временно недоступен.");
      void loadMyRating().then(setProfileRating).catch(() => undefined);
    }
  }

  async function cancelRanked() {
    setRankedStatus("");
    try {
      await cancelRankedQueue();
      setRankedQueue("idle");
      setRankedStatus("");
      pendingRankedMatchIdRef.current = null;
    } catch (error) {
      setRankedStatus(error instanceof Error ? error.message : "Рейтинг временно недоступен.");
    }
  }

  function recordRankedActionAt(current: GameState, eventType: string, payload: unknown = {}) {
    const session = rankedSessionRef.current;
    if (!session) {
      return;
    }
    const actionKey = JSON.stringify([session.matchId, current.round, current.phase, current.activePlayer, eventType, payload]);
    if (pendingRankedActionKeysRef.current.has(actionKey)) {
      return;
    }
    pendingRankedActionKeysRef.current.add(actionKey);
    void recordRankedEvent({
      matchId: session.matchId,
      round: current.round,
      phase: current.phase,
      eventType,
      payload
    })
      .then(({ event }) => {
        const sequence = rankedSequenceOf(event);
        if (sequence !== null) {
          advanceRankedSequence(session.matchId, sequence);
        }
      })
      .catch((error) => {
        setRankedStatus(error instanceof Error ? error.message : "Не удалось записать ход рейтинга.");
      })
      .finally(() => {
        pendingRankedActionKeysRef.current.delete(actionKey);
      });
  }

  function recordRankedAction(eventType: string, payload: unknown = {}) {
    recordRankedActionAt(state, eventType, payload);
  }

  function prepareRankedMatch(match: RankedMatch) {
    if (pendingRankedMatchIdRef.current === match.id || rankedSessionRef.current?.matchId === match.id) {
      return;
    }
    pendingRankedMatchIdRef.current = match.id;
    setRankedQueue("matched");
    setRankedStatus("");
    void playSoundAssetUntilDone(SOUND_ASSETS.matchFound, 1.35, "ready-confirm").then(() => {
      if (pendingRankedMatchIdRef.current !== match.id) {
        return;
      }
      pendingRankedMatchIdRef.current = null;
      startRankedMatch(match);
    });
  }

  function startRankedMatch(match: RankedMatch) {
    const session: RankedSession = {
      matchId: match.id,
      playerAId: match.playerAId,
      playerBId: match.playerBId,
      localPlayerId: rankedSeatFor(match, currentUser?.id),
      lastEventSequence: 0,
      settled: false
    };
    musicModeRef.current = "menu";
    lobbyRef.current = null;
    setLobby(null);
    setLobbyError("");
    setSyncStatus("online");
    setRankedQueue("matched");
    setRankedStatus("");
    pendingRankedActionKeysRef.current.clear();
    rankedSessionRef.current = session;
    setRankedSession(session);
    patchState((current) => {
      const language = audioSettingsRef.current.language;
      return {
        ...match.initialState,
        phase: "planning",
        sound: current.sound,
        logs: [
          language === "en" ? "Ranked match started." : "Рейтинговый матч начался.",
          ...match.initialState.logs
        ].slice(0, 24)
      };
    }, "customer-arrive");
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
    rankedSessionRef.current = null;
    pendingRankedActionKeysRef.current.clear();
    setRankedSession(null);
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

  function restartGame() {
    if (!lobbyRef.current) {
      startGame();
      return;
    }

    musicModeRef.current = "menu";
    setLobbyError("");
    setSyncStatus("syncing");
    patchState((current) => {
      const next = buildInitialState(current.sound, current.turnTimeSeconds);
      const language = audioSettingsRef.current.language;
      return {
        ...next,
        phase: "planning",
        logs: language === "en" ? [`New online game started in lobby ${lobbyRef.current?.code}.`] : next.logs
      };
    }, "customer-arrive");
  }

  function startCampaignLevel(level: CampaignLevel) {
    musicModeRef.current = "menu";
    lobbyRef.current = null;
    setLobby(null);
    rankedSessionRef.current = null;
    pendingRankedActionKeysRef.current.clear();
    setRankedSession(null);
    setLobbyError("");
    setSyncStatus("local");
    setCutscene(null);
    setMenuView("main");
    patchState((current) => {
      const next = buildInitialState(current.sound, audioSettingsRef.current.turnTimeSeconds, campaignInitialStateOptions(level.level));
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
    const activeRankedSession = rankedSessionRef.current;
    if (activeRankedSession) {
      sendRankedAbandon(activeRankedSession);
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
    setRankedStatus("");
    setJoinCode("");
    setSyncStatus("local");
    setState((current) => buildInitialState(current.sound, audioSettingsRef.current.turnTimeSeconds));
    lobbyRef.current = null;
    rankedSessionRef.current = null;
    pendingRankedActionKeysRef.current.clear();
    setLobby(null);
    setRankedSession(null);
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
    rankedSessionRef.current = null;
    pendingRankedActionKeysRef.current.clear();
    setRankedSession(null);
    setLobbyError("");
    setRankedStatus("");
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
      phase: "planning" as const,
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
    let productDeck = current.productDeck;
    let influenceDeck = current.influenceDeck;
    const influenceHandSize = influenceHandSizeForState(current);
    const players = current.players.map(resetPlayerForPlanning).map((player) => {
      let updated = player;
      [updated, productDeck] = drawProductsToLimit(updated, productDeck);
      [updated, influenceDeck] = drawInfluencesToLimit(updated, influenceDeck, influenceHandSize);
      return updated;
    });

    return {
      ...current,
      phase: "planning",
      round: nextRound,
      firstPlayer: nextFirstPlayer,
      activePlayer: nextFirstPlayer,
      players,
      productDeck,
      influenceDeck,
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
    const purchaseAppealThreshold = purchaseAppealThresholdForState(current);

    current.currentCustomers.forEach((customer, customerIndex) => {
      const result = resolveCustomerPurchase({
        customer,
        players,
        trends: current.activeTrends,
        influences: current.playedInfluences,
        roundBonuses: current.roundBonuses,
        firstPlayer: current.firstPlayer,
        customerIndex,
        round: current.round,
        rules: { appealThreshold: purchaseAppealThreshold }
      });

      saleResults.push(result);
      saleInsights.push(describeSaleInsight(result, viewerId, language));
      if (!result.winner) {
        logs.push(
          language === "en"
            ? `${customerName(language, customer)} bought nothing: appeal was below ${purchaseAppealThreshold}.`
            : `${customer.name} ничего не купил: совпадение ниже ${purchaseAppealThreshold}.`
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
          ? `${customerName(language, customer)} bought ${productName(language, result.winner.product)} ${ownerLogToken(owner.id)} for ${
              result.winner.payout
            } ${coinText(language, result.winner.payout)}.${bonus > 0 ? ` Bonus: +${bonus}.` : ""}`
          : `${customer.name} купил ${result.winner.product.name} ${ownerLogToken(owner.id)} за ${result.winner.payout} мон.${
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
    const language = audioSettingsRef.current.language;
    const goalLogs = goalProgress.rewards.map(
      (reward) =>
        language === "en"
          ? `${playerLogToken(reward.playerId)} completed "${goalTitle(language, current.partyGoals.find((goal) => goal.title === reward.goalTitle) ?? { title: reward.goalTitle, kind: "sale_streak", target: 1, id: reward.goalTitle })}" and got +${reward.amount} ${coinText(language, reward.amount)}.`
          : `${playerLogToken(reward.playerId)} выполнили цель «${reward.goalTitle}» и получили +${reward.amount} мон.`
    );

    return {
      ...current,
      phase: "sale_resolution",
      activePlayer: current.firstPlayer,
      players: rewardedPlayers,
      saleResults,
      saleInsights,
      lastSaleReview: { round: current.round, results: saleResults, insights: saleInsights },
      partyGoals: goalProgress.goals,
      selectedProductId: null,
      selectedInfluenceId: null,
      logs: [
        ...goalLogs.reverse(),
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
    const influenceHandSize = influenceHandSizeForState(current);
    const drawnPlayers = clonePlayersForAi(current.players).map((player) => {
      let updated = player;
      [updated, productDeck] = drawProductsToLimit(updated, productDeck);
      [updated, influenceDeck] = drawInfluencesToLimit(updated, influenceDeck, influenceHandSize);
      return updated;
    });

    const shouldShiftTrends = current.activeTrends.length > 0;
    const shiftedTrends = shouldShiftTrends ? current.activeTrends.slice(1) : [];
    const [newTrend, trendDeck]: [TrendCardType[], TrendCardType[]] = shouldShiftTrends ? drawCompatibleTrends(current.trendDeck, 1, shiftedTrends) : [[], current.trendDeck];
    const activeTrends = [...shiftedTrends, ...(newTrend.length ? newTrend : [])];
    const trendLogs = shouldShiftTrends
      ? [
          language === "en"
            ? `Trend shifted: ${activeTrends.map((trend) => trendName(language, trend)).join(", ")}.`
            : `Тренд сдвинулся: ${activeTrends.map((trend) => trend.name).join(", ")}.`
        ]
      : [];
    const baseState = {
      ...current,
      players: drawnPlayers,
      productDeck,
      influenceDeck,
      trendDeck,
      activeTrends,
      logs: [
        ...trendLogs,
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
            ? `Upgrade shop opened. ${playerLogToken(upgradeQueue[0])} chooses first.`
            : `Открылся магазин апгрейдов. Первым выбирает ${playerLogToken(upgradeQueue[0])}.`,
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
      recordRankedActionAt(current, "place_product", { productInstanceId: product.instanceId, slotIndex });

      return {
        ...current,
        players,
        selectedProductId: null,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Product placed: ${productName(audioSettingsRef.current.language, product)} (${playerLogToken(playerId)}).`
            : `Товар выставлен: ${product.name} (${playerLogToken(playerId)}).`,
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
          ? `Influence played: ${influenceName(audioSettingsRef.current.language, { id: played.id, name: played.name })} (${playerLogToken(played.ownerId)}).`
          : `Сыграно влияние: ${played.name} (${playerLogToken(played.ownerId)}).`,
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
              ? `One more product replacement is available: ${playerLogToken(player.id)}.`
              : `Можно ещё раз заменить товар: ${playerLogToken(player.id)}.`,
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

      recordRankedActionAt(current, "play_influence", { cardId: card.id, target });
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
      if (lobbyRef.current && lobbyRef.current.playerId !== draft.playerId) {
        return current;
      }

      const keep = draft.cards[index];
      const players = current.players.map((player) => ({ ...player, productHand: [...player.productHand], influenceHand: [...player.influenceHand] }));
      const player = players.find((candidate) => candidate.id === draft.playerId)!;
      if (draft.type === "product") {
        player.productHand.push(keep as ProductInstance);
      } else {
        player.influenceHand.push(keep as InfluenceCardType);
      }
      recordRankedActionAt(current, "keep_draft_card", { index });

      return {
        ...current,
        players,
        choiceDraft: null,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Card kept: ${
                draft.type === "product" ? productName(audioSettingsRef.current.language, keep as ProductInstance) : influenceName(audioSettingsRef.current.language, keep as InfluenceCardType)
              } (${playerLogToken(draft.playerId)}).`
            : `Оставлена карта: ${keep.name} (${playerLogToken(draft.playerId)}).`,
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
      recordRankedActionAt(current, "use_ad_table", { slotIndex });

      return {
        ...current,
        players,
        roundBonuses: [...current.roundBonuses, { ownerId: playerId, slotIndex, value: 1, label: "Рекламный столик" }],
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Ad table boosted a product ${ownerLogToken(playerId)}.`
            : `Рекламный столик усилил товар ${ownerLogToken(playerId)}.`,
          ...current.logs
        ].slice(0, 24)
      };
    }, "influence-play");
  }

  function readyPlayer() {
    if (rankedSession && state.phase === "planning" && !state.choiceDraft) {
      recordRankedAction("ready", {});
    }
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
              ? `Planning turn passes to ${playerLogToken(nextPlayer.id)}.`
              : `Ход планирования переходит: ${playerLogToken(nextPlayer.id)}.`,
            ...current.logs
          ].slice(0, 24)
        };
      }

      return continueAfterSales(resolveRoundSales({ ...current, players }));
    }, (current, next) => {
      if (next.phase === "game_end") {
        return "game-win";
      }
      const saleReview = resolvedSalesReview(current, next);
      if (saleReview || next.saleResults.length > current.saleResults.length) {
        const results = saleReview?.results ?? next.saleResults;
        return results.some((result) => result.winner) ? "coin-sale" : "round-end";
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
      recordRankedActionAt(current, "buy_upgrade", { upgradeId });

      const queue = current.upgradeQueue.slice(1);
      const next = {
        ...current,
        players,
        upgradeOffer: current.upgradeOffer.filter((candidate) => candidate.id !== upgrade.id),
        upgradeQueue: queue,
        activePlayer: queue[0] ?? current.firstPlayer,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Upgrade bought: ${upgradeName(audioSettingsRef.current.language, upgrade)} (${playerLogToken(buyerId)}).`
            : `Куплен апгрейд: ${upgrade.name} (${playerLogToken(buyerId)}).`,
          ...current.logs
        ].slice(0, 24)
      };

      return queue.length ? next : nextRoundAfterBreak(next);
    }, "upgrade-buy");
  }

  function skipUpgrade() {
    patchState((current) => {
      if (current.phase !== "upgrade" || current.upgradeQueue.length === 0) {
        return current;
      }
      const buyerId = current.upgradeQueue[0];
      const queue = current.upgradeQueue.slice(1);
      recordRankedActionAt(current, "skip_upgrade", {});
      const next = {
        ...current,
        upgradeQueue: queue,
        activePlayer: queue[0] ?? current.firstPlayer,
        logs: [
          audioSettingsRef.current.language === "en"
            ? `Upgrade buy skipped: ${playerLogToken(buyerId)}.`
            : `Покупка апгрейда пропущена: ${playerLogToken(buyerId)}.`,
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
      influenceDeckLength: current.influenceDeck.length,
      purchaseAppealThreshold: purchaseAppealThresholdForState(current),
      firstPlayer: current.firstPlayer,
      round: current.round
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
      logs.push(language === "en" ? `Ad table boosted a product ${ownerLogToken(player.id)}.` : `Рекламный столик усилил товар ${ownerLogToken(player.id)}.`);
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
            ? `Planning turn passes to ${playerLogToken(nextPlayer.id)}.`
            : `Ход планирования переходит: ${playerLogToken(nextPlayer.id)}.`,
          ...baseState.logs
        ].slice(0, 24)
      };
    }

    return continueAfterSales(resolveRoundSales(baseState));
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
      const saleReview = resolvedSalesReview(current, next);
      if (saleReview || next.saleResults.length > current.saleResults.length) {
        const results = saleReview?.results ?? next.saleResults;
        return results.some((result) => result.winner) ? "coin-sale" : "round-end";
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
  const currentPurchaseAppealThreshold = purchaseAppealThresholdForState(state);
  const currentCustomerPersonalityMode = state.campaignRun ? campaignInitialStateOptions(state.campaignRun.level).customerPersonalityMode : DEFAULT_INITIAL_STATE_OPTIONS.customerPersonalityMode;
  const showCustomerPersonalityRules = currentCustomerPersonalityMode !== "off";
  const shownSaleInsights =
    state.phase === "sale_resolution" && state.saleResults.length > 0
      ? state.saleResults.map((result) => describeSaleInsight(result, localPlayerId, language))
      : state.saleInsights;
  const salePanelTitle = state.phase === "planning" ? ui(language, "saleForecast") : state.phase === "sale_resolution" ? ui(language, "saleResults") : ui(language, "saleCalculation");
  const nextCustomer = state.customerDeck[0] ?? null;
  const nextTrendPool = state.activeTrends.length > 0 ? state.activeTrends.slice(1) : state.activeTrends;
  const [previewNextTrends] = drawCompatibleTrends(state.trendDeck, 1, nextTrendPool);
  const nextTrend = previewNextTrends[0] ?? null;
  const showUpcomingCards = state.round < 8 && state.phase !== "game_end";
  const showUpcomingTrends = showUpcomingCards && (!state.campaignRun || state.activeTrends.length > 0);
  const influenceImpact = selectedInfluence ? influenceImpactLines(selectedInfluence, handPlayer, opponentPlayer, state.selectedTag) : [];
  const canAdvanceResolution = !state.pause.active && canControlSeat(state.activePlayer);
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
        influenceDeckLength: state.influenceDeck.length,
        purchaseAppealThreshold: currentPurchaseAppealThreshold,
        firstPlayer: state.firstPlayer,
        round: state.round
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
    currentPurchaseAppealThreshold,
    state.firstPlayer,
    state.round,
    localPlayer.id
  ]);
  const correctMovePlanningPlan = useMemo(() => {
    if (!localHintMarkersEnabled || state.phase !== "planning" || state.choiceDraft || !canControlActivePlayer) {
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
        influenceDeckLength: state.influenceDeck.length,
        purchaseAppealThreshold: currentPurchaseAppealThreshold,
        firstPlayer: state.firstPlayer,
        round: state.round
      },
      handPlayer.id
    );
  }, [
    state.phase,
    state.choiceDraft,
    canControlActivePlayer,
    state.players,
    state.currentCustomers,
    state.activeTrends,
    state.playedInfluences,
    state.roundBonuses,
    state.productDeck.length,
    state.influenceDeck.length,
    currentPurchaseAppealThreshold,
    state.firstPlayer,
    state.round,
    handPlayer.id,
    localHintMarkersEnabled
  ]);
  const correctMoveUpgradeId = useMemo(() => {
    if (!localHintMarkersEnabled || state.phase !== "upgrade" || !canControlActivePlayer) {
      return null;
    }

    const buyer = state.players.find((player) => player.id === state.upgradeQueue[0]);
    return buyer ? chooseAiUpgrade(buyer, state.upgradeOffer)?.upgradeId ?? null : null;
  }, [state.phase, canControlActivePlayer, state.players, state.upgradeQueue, state.upgradeOffer, localHintMarkersEnabled]);
  const correctMoveChoiceCardId = useMemo(() => {
    if (!localHintMarkersEnabled || !state.choiceDraft || !canResolveChoiceDraft) {
      return null;
    }

    const draftPlayer = state.players.find((player) => player.id === state.choiceDraft?.playerId);
    const opponent = draftPlayer ? state.players.find((player) => player.id === opponentOf(draftPlayer.id)) : null;
    if (!draftPlayer || !opponent) {
      return null;
    }

    const input = {
      players: state.players,
      currentCustomers: state.currentCustomers,
      activeTrends: state.activeTrends,
      playedInfluences: state.playedInfluences,
      roundBonuses: state.roundBonuses,
      productDeckLength: state.productDeck.length,
      influenceDeckLength: state.influenceDeck.length,
      purchaseAppealThreshold: currentPurchaseAppealThreshold,
      firstPlayer: state.firstPlayer,
      round: state.round
    };

    if (state.choiceDraft.type === "product") {
      const products = state.choiceDraft.cards.filter((card): card is ProductInstance => card.type === "product");
      return chooseAiProductChoice(input, draftPlayer, products)?.cardId ?? null;
    }

    const influences = state.choiceDraft.cards.filter((card): card is InfluenceCardType => card.type === "influence");
    return chooseAiInfluenceChoice(input, draftPlayer, opponent, influences)?.cardId ?? null;
  }, [
    state.choiceDraft,
    canResolveChoiceDraft,
    state.players,
    state.currentCustomers,
    state.activeTrends,
    state.playedInfluences,
    state.roundBonuses,
    state.productDeck.length,
    state.influenceDeck.length,
    currentPurchaseAppealThreshold,
    state.firstPlayer,
    state.round,
    localHintMarkersEnabled
  ]);
  const coachAdvice = buildCoachAdvice(coachPlan, localPlayer, language);
  const coachProductId = coachPlan?.productMove?.productInstanceId ?? null;
  const coachSlotIndex = coachPlan?.productMove?.slotIndex ?? null;
  const coachInfluenceId = coachPlan?.influenceMove?.cardId ?? null;
  const correctMoveProductId = correctMovePlanningPlan?.productMove?.productInstanceId ?? null;
  const correctMoveSlotIndex = correctMovePlanningPlan?.productMove?.slotIndex ?? null;
  const correctMoveInfluenceMove = correctMovePlanningPlan?.influenceMove ?? null;
  const correctMoveInfluenceId = correctMoveInfluenceMove?.cardId ?? null;
  const correctMoveTableSlotIndex = correctMovePlanningPlan?.tableBonusMove?.slotIndex ?? null;
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
  const influenceEnabled =
    state.playedInfluences.length > 0 ||
    state.players.some((player) => player.influenceHand.length > 0) ||
    (!state.campaignRun && state.influenceDeck.length > 0) ||
    Boolean(state.campaignRun && influenceHandSizeForState(state) > 0);
  const showPlanningTimer = state.phase === "planning" && !waitingForLobbyPlayer && !state.choiceDraft;
  const showUpgradeTimer = state.phase === "upgrade" && showTurnTimer;
  const planningTimerText = ui(language, opponentPlanningTurn ? "opponentTurnTimeShort" : "turnTimeShort", { time: formatTurnTime(turnSecondsLeft) });
  const upgradeTimerText = ui(language, localUpgradeTurn ? "upgradeTimeShort" : "opponentTurnTimeShort", { time: formatTurnTime(turnSecondsLeft) });
  const rankedQueueTime = formatRankedQueueTime(rankedQueueSeconds);
  const rankedPenalty = profileRating?.penalty;
  const rankedQueueBlocked = Boolean(rankedPenalty?.queueBlocked && rankedCooldownSeconds > 0);
  const rankedCooldownTime = formatRankedQueueTime(rankedCooldownSeconds);
  const rankedWarningText =
    rankedPenalty && rankedPenalty.leaveWarnings > 0
      ? "Вы покинули рейтинговый матч. Повторные выходы приведут к временной блокировке ranked."
      : "";
  const rankedMmrText = currentUser ? (profileRating ? profileRating.mmr ?? "?" : "...") : "-";
  const rankedGamesText = profileRating ? (profileRating.isCalibrating ? "?" : String(profileRating.rankedGames)) : currentUser ? "..." : "0";
  const rankedRecordText = profileRating ? (profileRating.isCalibrating ? "?-?" : `${profileRating.wins}-${profileRating.losses}`) : currentUser ? "...-..." : "0-0";
  const rankedWinRateText =
    profileRating && !profileRating.isCalibrating && profileRating.rankedGames > 0 ? `${Math.round((profileRating.wins / profileRating.rankedGames) * 100)}%` : "-";
  const menuUserMmrText = currentUser ? (profileRating ? `${profileRating.mmr ?? "?"} MMR` : "MMR ...") : "Войти";
  const rankedActionLabel = rankedQueueBlocked ? "Доступно через" : rankedQueueState === "waiting" ? "Отмена" : rankedQueueState === "matched" ? "Матч найден" : "Играть";
  const rankedButtonTime = rankedQueueBlocked ? rankedCooldownTime : rankedQueueState === "waiting" ? rankedQueueTime : "";
  const leaderboardStartIndex = (leaderboardPage - 1) * 10;
  const playTabs: Array<{ id: PlayModeTab; label: string }> = [
    { id: "ranked", label: "Рейтинг 1vs1" },
    { id: "story", label: ui(language, "campaignMode") },
    { id: "hotseat", label: ui(language, "twoPlayers") },
    { id: "training", label: ui(language, "aiTraining") },
    { id: "custom", label: ui(language, "onlineGame") }
  ];

  function toggleSaleResultKey(key: string) {
    setExpandedSaleResultKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function renderSaleResultCards(results: PurchaseResult[], namespace: string) {
    return (
      <SaleResultCards
        results={results}
        namespace={namespace}
        contentIdPrefix={salePanelId}
        expandedKeys={expandedSaleResultKeys}
        players={state.players}
        localPlayerId={localPlayerId}
        language={language}
        onToggle={toggleSaleResultKey}
      />
    );
  }

  function renderCampaignLevelRoad(className = "level-road") {
    return (
      <div className={className} aria-label={language === "en" ? "Level selection" : "Выбор уровня"}>
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
              <strong>
                {ui(language, "level")} {level.level}
              </strong>
              <span>
                {language === "en" ? level.opponentNameEn : level.opponentName} · {campaignLevelTitle(language, level)}
              </span>
              <small>{campaignLevelDistrict(language, level)}</small>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <main
      className={`app-shell phase-${state.phase}`}
      style={{ backgroundImage: `linear-gradient(rgba(38, 27, 17, 0.78), rgba(18, 13, 9, 0.9)), url(${MARKET_BG})` }}
      onPointerDownCapture={() => {
        primeSoundEffects();
        requestMusicPlayback();
      }}
    >
      {state.phase === "menu" && (
        <section className="menu-screen">
          {menuView === "main" ? (
            <div className="menu-box menu-shell">
              <header className="menu-header">
                <div className="menu-brand">
                  <h1>{GAME_TITLE}</h1>
                  <p>{ui(language, "menuSubtitle")}</p>
                </div>
                <button className="menu-account" type="button" onClick={() => setMenuTab("profile")}>
                  <span className="menu-account-avatar">{currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : <User size={20} />}</span>
                  <span>
                    <strong>{currentUser?.displayName ?? "Гость"}</strong>
                    <small>{menuUserMmrText}</small>
                  </span>
                </button>
              </header>

              <div className="menu-tabs" role="tablist" aria-label="Главное меню">
                <button type="button" role="tab" aria-selected={menuTab === "play"} className={menuTab === "play" ? "active" : ""} onClick={() => setMenuTab("play")}>
                  <Play size={16} /> Играть
                </button>
                <button type="button" role="tab" aria-selected={menuTab === "profile"} className={menuTab === "profile" ? "active" : ""} onClick={() => setMenuTab("profile")}>
                  <User size={16} /> Профиль
                </button>
                <button type="button" role="tab" aria-selected={menuTab === "rating"} className={menuTab === "rating" ? "active" : ""} onClick={() => setMenuTab("rating")}>
                  <Trophy size={16} /> Лидерборд
                </button>
                <button type="button" role="tab" aria-selected={menuTab === "dlc"} className={menuTab === "dlc" ? "active" : ""} onClick={() => setMenuTab("dlc")}>
                  <ShoppingBasket size={16} /> DLC
                </button>
              </div>

              {menuTab === "play" && (
                <>
                  <div className="play-tabs" role="tablist" aria-label={language === "en" ? "Play modes" : "Режимы игры"}>
                    {playTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={playModeTab === tab.id}
                        className={playModeTab === tab.id ? "active" : ""}
                        onClick={() => setPlayModeTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="play-layout">
                    {playModeTab === "ranked" && (
                      <section className={`ranked-match-card${rankedQueueState === "waiting" ? " is-searching" : ""}`} aria-labelledby="ranked-title">
                        <div className="ranked-card-top">
                          <div>
                            <h2 id="ranked-title">Рейтинг 1vs1</h2>
                            <p>Матч против живого соперника с записью результата в MMR.</p>
                          </div>
                          <div className="ranked-mmr-card">
                            <span>MMR</span>
                            <strong>{rankedMmrText}</strong>
                          </div>
                        </div>

                        <div className="ranked-stats">
                          <div>
                            <span>Матчи</span>
                            <strong>{rankedGamesText}</strong>
                          </div>
                          <div>
                            <span>Счет</span>
                            <strong>{rankedRecordText}</strong>
                          </div>
                          <div>
                            <span>Победы</span>
                            <strong>{rankedWinRateText}</strong>
                          </div>
                        </div>

                        <div className="play-start-action">
                          {!currentUser && <p className="menu-note">Для рейтинга нужен вход в аккаунт.</p>}
                          {rankedWarningText && <p className="menu-note ranked-warning">{rankedWarningText}</p>}
                          {rankedStatus && <p className="menu-note">{rankedStatus}</p>}
                          <button className="ranked-action ranked-play-button play-start-button" disabled={rankedQueueState === "matched" || rankedQueueBlocked} onClick={() => void joinRanked()}>
                            <span className="ranked-button-label">
                              {rankedQueueBlocked ? <Lock size={18} /> : rankedQueueState === "waiting" ? <X size={18} /> : <Play size={18} />} {rankedActionLabel}
                            </span>
                            {rankedButtonTime && <span className="ranked-button-time">{rankedButtonTime}</span>}
                          </button>
                        </div>
                      </section>
                    )}

                    {playModeTab === "story" && (
                      <section className="menu-panel play-mode-card story-mode-card" aria-labelledby="story-mode-title">
                        <div className="play-mode-copy">
                          <h2 id="story-mode-title">{ui(language, "campaignMode")}</h2>
                          <p>Проходите уровни ярмарки, открывайте новых соперников и постепенно собирайте полный набор правил.</p>
                          <span>Открыто уровней: {campaignProgress.highestUnlockedLevel} / {CAMPAIGN_LEVELS.length}</span>
                        </div>
                        {renderCampaignLevelRoad("level-road play-level-road")}
                      </section>
                    )}

                    {playModeTab === "hotseat" && (
                      <section className="menu-panel play-mode-card" aria-labelledby="hotseat-mode-title">
                        <div className="play-mode-copy">
                          <h2 id="hotseat-mode-title">{ui(language, "twoPlayers")}</h2>
                          <p>Локальная партия на одном устройстве: игроки ходят по очереди и видят общий стол.</p>
                        </div>
                        <div className="play-start-action">
                          <button className="primary-action play-start-button" onClick={startGame}>
                            <Play size={18} /> Играть
                          </button>
                        </div>
                      </section>
                    )}

                    {playModeTab === "training" && (
                      <section className="menu-panel play-mode-card" aria-labelledby="training-mode-title">
                        <div className="play-mode-copy">
                          <h2 id="training-mode-title">{ui(language, "aiTraining")}</h2>
                          <p>Партия против слабого ИИ с подсказками тренера и скрытой проверкой правильных ходов.</p>
                        </div>
                        <div className="play-start-action">
                          <button className="primary-action play-start-button" onClick={() => startAiGame("training")}>
                            <Bot size={18} /> Играть
                          </button>
                        </div>
                      </section>
                    )}

                    {playModeTab === "custom" && (
                      <section className="menu-panel play-mode-card" aria-labelledby="custom-mode-title">
                        <div className="play-mode-copy">
                          <h2 id="custom-mode-title">{ui(language, "onlineGame")}</h2>
                          <p>Для новой онлайн-партии создайте стол. Код появится после создания, и его можно будет отправить второму игроку.</p>
                          <div className="custom-table-actions">
                            <div className="custom-table-create">
                              <h3>Создать новый стол</h3>
                              <p>Код не нужен: стол создаётся сразу, а второй игрок подключится по выданному коду.</p>
                              <button
                                className="primary-action play-start-button"
                                onClick={() => {
                                  playEffect("ui-click");
                                  void createLobby();
                                }}
                              >
                                <PackagePlus size={18} /> Создать стол
                              </button>
                            </div>
                            <div className="custom-table-join">
                              <h3>Войти по коду</h3>
                              <div className="join-lobby">
                                <label className="field-label">
                                  <span>{ui(language, "lobbyCodePlaceholder")}</span>
                                  <input
                                    className="menu-field"
                                    value={joinCode}
                                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                                    placeholder="ABCD12"
                                    maxLength={6}
                                  />
                                </label>
                                <button
                                  onClick={() => {
                                    playEffect("ui-click");
                                    void joinLobby();
                                  }}
                                >
                                  <LogIn size={16} /> {ui(language, "joinTable")}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                </>
              )}

              {menuTab === "profile" && (
                <section className="menu-panel profile-panel">
                  {currentUser ? (
                    <>
                      <div className="profile-card">
                        <div className="profile-avatar">{currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : <User size={24} />}</div>
                        <div>
                          <strong>{currentUser.displayName}</strong>
                          <span>MMR: {profileRating ? profileRating.mmr ?? "?" : "..."}</span>
                        </div>
                        <button onClick={() => void signOut()}>
                          <LogOut size={16} /> Выйти
                        </button>
                      </div>
                      <p className="menu-note">Рейтинговые матчи и будущие DLC доступны этому аккаунту.</p>
                      <div className="match-history">
                        <h3>История MMR</h3>
                        {matchHistoryError && <p className="lobby-error">{matchHistoryError}</p>}
                        <div className="match-history-list">
                          {matchHistory.map((match) => {
                            const change = rankedHistoryMmrChange(match, currentUser.id);
                            const opponentId = match.playerAId === currentUser.id ? match.playerBId : match.playerAId;
                            const opponentName =
                              match.playerAId === currentUser.id
                                ? match.playerBDisplayName ?? opponentId
                                : match.playerADisplayName ?? opponentId;
                            return (
                              <div className="match-history-row" key={match.matchId}>
                                <strong>{rankedHistoryResultLabel(match, currentUser.id)}</strong>
                                <span>vs {opponentName}</span>
                                <span>
                                  {match.playerACoins}:{match.playerBCoins} монет
                                </span>
                                <span>{signedMmrChange(change)} MMR</span>
                              </div>
                            );
                          })}
                        </div>
                        {!matchHistory.length && !matchHistoryError && <p className="menu-note">История рейтинга пока пуста.</p>}
                      </div>
                    </>
                  ) : (
                    <>
                      <h2>Войдите в аккаунт</h2>
                      <p>Без входа нельзя играть в рейтинг и покупать будущие DLC.</p>
                      <div className="oauth-actions">
                        <a href="/api/auth/google/start">
                          <GoogleGIcon /> Google
                        </a>
                        <a href="/api/auth/discord/start">
                          <DiscordIcon /> Discord
                        </a>
                      </div>
                      <div className="dev-login-row">
                        <label className="field-label">
                          <span>Имя для тестового входа</span>
                          <input className="menu-field" value={devLoginName} onChange={(event) => setDevLoginName(event.target.value)} />
                        </label>
                        <button onClick={() => void submitDevLogin()}>Тестовый вход</button>
                      </div>
                      {authError && <p className="lobby-error">{authError}</p>}
                    </>
                  )}
                </section>
              )}

              {menuTab === "rating" && (
                <section className="menu-panel leaderboard-panel" aria-labelledby="leaderboard-title">
                  <div className="leaderboard-heading">
                    <h2 id="leaderboard-title">Лидерборд</h2>
                    <span>{leaderboardTotal} игроков</span>
                  </div>
                  {leaderboardError && <p className="lobby-error">{leaderboardError}</p>}
                  <div className={`leaderboard-list${!leaderboard.length && !leaderboardError ? " is-empty" : ""}`}>
                    {leaderboard.length > 0 && (
                      <table className="leaderboard-table" aria-label="Лидерборд игроков">
                        <thead>
                          <tr>
                            <th scope="col">#</th>
                            <th scope="col">Игрок</th>
                            <th scope="col">MMR</th>
                            <th scope="col">Счет</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.map((entry, index) => (
                            <tr key={entry.playerId}>
                              <td>{leaderboardStartIndex + index + 1}</td>
                              <td>
                                <strong>{entry.displayName}</strong>
                              </td>
                              <td>{entry.mmr} MMR</td>
                              <td>{entry.wins}-{entry.losses}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {!leaderboard.length && !leaderboardError && <p className="menu-note menu-empty-state leaderboard-empty-state">Лидерборд пока пуст.</p>}
                  </div>
                  <div className="leaderboard-controls">
                    <div className="leaderboard-pagination">
                      <button type="button" aria-label="Предыдущая страница" disabled={leaderboardPage <= 1} onClick={() => setLeaderboardPage((page) => Math.max(1, page - 1))}>
                        <ChevronLeft size={16} /> Назад
                      </button>
                      <span>{leaderboardPage} / {leaderboardTotalPages}</span>
                      <button type="button" disabled={leaderboardPage >= leaderboardTotalPages} onClick={() => setLeaderboardPage((page) => Math.min(leaderboardTotalPages, page + 1))}>
                        Далее <ChevronRight size={16} />
                      </button>
                    </div>
                    <label className="field-label leaderboard-search">
                      <input
                        className="menu-field"
                        aria-label="Поиск"
                        value={leaderboardSearch}
                        onChange={(event) => {
                          setLeaderboardSearch(event.target.value);
                          setLeaderboardPage(1);
                        }}
                        placeholder="Player"
                      />
                      <Search className="leaderboard-search-icon" size={15} aria-hidden="true" />
                    </label>
                  </div>
                </section>
              )}

              {menuTab === "dlc" && (
                <section className="menu-panel menu-empty-panel">
                  <div className="menu-empty-state">
                    <h2>DLC</h2>
                    <p>В разработке. Позже здесь появятся DLC-наборы для покупки.</p>
                    {!currentUser && <p className="menu-note">Для покупки будущих DLC понадобится вход в аккаунт.</p>}
                  </div>
                </section>
              )}

              <div className="menu-utility-actions" aria-label="Дополнительно">
                <div className="menu-utility-buttons">
                  <button
                    title={ui(language, "rules")}
                    onClick={() => {
                      playEffect("ui-click");
                      setShowRules(true);
                    }}
                  >
                    <BadgeHelp size={17} /> {ui(language, "rules")}
                  </button>
                  <button
                    title={ui(language, "settings")}
                    onClick={() => {
                      playEffect("ui-click");
                      setShowSettings(true);
                    }}
                  >
                    <Settings size={17} /> {ui(language, "settings")}
                  </button>
                  <button
                    title={ui(language, "about")}
                    onClick={() => {
                      playEffect("ui-click");
                      setShowAbout(true);
                    }}
                  >
                    <Info size={17} /> {ui(language, "about")}
                  </button>
                  <button
                    title="Лицензии"
                    onClick={() => {
                      playEffect("ui-click");
                      setShowLicenses(true);
                    }}
                  >
                    <ScrollText size={17} /> Лицензии
                  </button>
                </div>
                <div className="menu-support-links" aria-label={ui(language, "supportProject")}>
                  <a href="https://buymeacoffee.com/zl0yxp" target="_blank" rel="noreferrer">
                    <Coffee size={17} /> Buy Me a Coffee
                  </a>
                  <a href="https://www.paypal.com/donate/?hosted_button_id=CY7A2U64JWY4W" target="_blank" rel="noreferrer">
                    <HandCoins size={17} /> PayPal
                  </a>
                </div>
              </div>

              {lobbyError && <p className="lobby-error">{lobbyError}</p>}
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

              {renderCampaignLevelRoad()}
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

      {turnCue && (
        <div
          className="turn-cue-backdrop"
          aria-live="assertive"
          aria-atomic="true"
          onAnimationEnd={(event) => {
            if (event.currentTarget !== event.target) {
              return;
            }
            const cueKey = turnCue.key;
            if (turnCueTimerRef.current !== null) {
              window.clearTimeout(turnCueTimerRef.current);
              turnCueTimerRef.current = null;
            }
            setTurnCue((current) => (current?.key === cueKey ? null : current));
          }}
        >
          <div className="turn-cue">{turnCue.label}</div>
        </div>
      )}

      {lobby && state.phase !== "menu" && lobbyError && (
        <div className="connection-notice" role="status" aria-live="polite">
          {lobbyError}
        </div>
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
          {rankedSession && rankedStatus && <div className="sync-pill sync-offline">{rankedStatus}</div>}
          {aiPlayer && !rankedSession && (
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
        {nextTrend && showUpcomingTrends && (
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
                    canControlSeat(player.id) &&
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
                        correctMove={state.selectedProductId === correctMoveProductId && player.id === handPlayer.id && correctMoveSlotIndex === slotIndex}
                        ariaDisabled={
                          !(
                            state.phase === "planning" &&
                            canControlSeat(player.id) &&
                            state.activePlayer === player.id &&
                            state.selectedProductId &&
                            !player.productActionUsed &&
                            !state.choiceDraft
                          )
                        }
                        onClick={() => {
                          const canPlace =
                            state.phase === "planning" &&
                            canControlSeat(player.id) &&
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
                        canControlSeat(player.id) &&
                        state.activePlayer === player.id &&
                        state.selectedProductId &&
                        !player.productActionUsed &&
                        !state.choiceDraft && (
                        <span className="slot-badge">{ui(language, "replace")}</span>
                      )}
                      {state.phase === "planning" &&
                        canControlSeat(player.id) &&
                        state.activePlayer === player.id &&
                        hasUpgrade(player.upgrades, "ad_table") &&
                        !player.tableBonusUsed && (
                          <button
                            className="slot-tool"
                            data-correct-owner-id={localHintValue(player.id)}
                            data-correct-slot-index={localHintValue(slotIndex)}
                            data-correct-move={localHintMove(player.id === handPlayer.id && correctMoveTableSlotIndex === slotIndex)}
                            onClick={() => useAdTable(player.id, slotIndex)}
                          >
                            <Sparkles size={14} /> +1
                          </button>
                        )}
                    </>
                  ) : (
                    <button
                      className="empty-slot"
                      data-correct-owner-id={localHintValue(player.id)}
                      data-correct-slot-index={localHintValue(slotIndex)}
                      data-correct-move={localHintMove(state.selectedProductId === correctMoveProductId && player.id === handPlayer.id && correctMoveSlotIndex === slotIndex)}
                      aria-disabled={
                        !(
                          state.phase === "planning" &&
                          canControlSeat(player.id) &&
                          state.activePlayer === player.id &&
                          state.selectedProductId &&
                          !player.productActionUsed &&
                          !state.choiceDraft
                        )
                      }
                      onClick={() => {
                        const canPlace =
                          state.phase === "planning" &&
                          canControlSeat(player.id) &&
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
                      {canControlSeat(player.id) && state.activePlayer === player.id && state.selectedProductId ? ui(language, "placeHere") : ui(language, "productSlot")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

      </section>

      <aside className={`event-panel ${state.phase === "planning" ? "forecast-mode" : ""} ${logCollapsed ? "log-collapsed" : ""}`}>
        <div className="sale-panel-heading">
          <h2>{salePanelTitle}</h2>
          {state.phase === "planning" && <p className="sale-note">{ui(language, "forecastNote")}</p>}
        </div>
          <div className="sale-results">
            {state.phase === "sale_resolution" && shownSaleInsights.length > 0 && (
              <div className="sale-insights" aria-label={ui(language, "saleInsights")}>
                <h3>{ui(language, "saleInsights")}</h3>
                {shownSaleInsights.map((insight) => (
                  <p key={insight}>{insight}</p>
                ))}
              </div>
            )}
            {shownSaleResults.length === 0 ? (
              <p>{state.phase === "planning" ? ui(language, "noForecastProducts") : ui(language, "saleFormulaAfterReady")}</p>
            ) : (
              renderSaleResultCards(shownSaleResults, `${state.phase}-${state.round}`)
            )}
            {state.phase === "planning" && state.lastSaleReview && (
              <div className="last-sale-review">
                <button type="button" className="last-sale-review-toggle" aria-expanded={lastSaleReviewOpen} onClick={() => setLastSaleReviewOpen((current) => !current)}>
                  {ui(language, "previousSales")}
                </button>
                {lastSaleReviewOpen && (
                  <div className="last-sale-review-body">
                    {state.lastSaleReview.insights.length > 0 && (
                      <div className="sale-insights" aria-label={ui(language, "saleInsights")}>
                        <h3>{ui(language, "saleInsights")}</h3>
                        {state.lastSaleReview.insights.map((insight) => (
                          <p key={insight}>{insight}</p>
                        ))}
                      </div>
                    )}
                    {renderSaleResultCards(state.lastSaleReview.results, `last-${state.lastSaleReview.round}`)}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="log-heading">
            <h2>{ui(language, "log")}</h2>
            <button type="button" className="log-toggle" aria-expanded={!logCollapsed} onClick={() => setLogCollapsed((current) => !current)}>
              <ScrollText size={14} /> {ui(language, logCollapsed ? "showLog" : "collapseLog")}
            </button>
          </div>
          {!logCollapsed && (
            <ol className="event-log">
              {state.logs.map((log, index) => (
                <li key={`${log}-${index}`}>{formatLogForViewer(log, localPlayerId, language)}</li>
              ))}
            </ol>
          )}
      </aside>

      <section className="hand-panel">
        {state.phase !== "menu" && state.partyGoals.length > 0 && (
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
                  {activeTurnLabel}
                </h2>
                <div className="action-steps">
                  <span className={handPlayer.productActionUsed ? "done" : ""}>{handPlayer.productActionUsed ? ui(language, "productChosen") : ui(language, "productToSlot")}</span>
                  {influenceEnabled && <span className={handPlayer.influenceActionUsed ? "done" : ""}>{handPlayer.influenceActionUsed ? ui(language, "influencePlayed") : ui(language, "influenceOrSkip")}</span>}
                  <span>{ui(language, "readyStep")}</span>
                </div>
              </div>
              {showPlanningTimer && <div className="turn-timer" aria-label={ui(language, "turnTimer")}>{planningTimerText}</div>}
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
                      correctMove={!handPlayer.productActionUsed && correctMoveProductId === product.instanceId}
                      disabled={!canControlActivePlayer}
                      onClick={() => selectProduct(product.instanceId)}
                    />
                  ))}
                </div>
              </div>
              {influenceEnabled && <div>
                <h3>{ui(language, "influence")}</h3>
                <div className="hand-row influence-row">
                  {handPlayer.influenceHand.map((card) => (
                    <InfluenceCard
                      key={card.id}
                      card={card}
                      language={language}
                      selected={state.selectedInfluenceId === card.id}
                      recommended={coachInfluenceId === card.id}
                      correctMove={!handPlayer.influenceActionUsed && correctMoveInfluenceId === card.id}
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
                      <select
                        value={state.selectedTag}
                        data-correct-move={localHintMove(selectedInfluence.id === correctMoveInfluenceId && correctMoveInfluenceMove?.targetTag === state.selectedTag)}
                        onChange={(event) => patchState((current) => ({ ...current, selectedTag: event.target.value as Tag }))}
                      >
                        {TAGS.map((tag) => (
                          <option key={tag} value={tag}>
                            {tagText(language, tag)}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedInfluence.effect.kind === "target_own_bonus" &&
                      selectedOwnTarget.map(({ product, slotIndex }) => (
                        <button
                          key={slotIndex}
                          disabled={!product}
                          data-correct-owner-id={localHintValue(handPlayer.id)}
                          data-correct-slot-index={localHintValue(slotIndex)}
                          data-correct-move={localHintMove(
                            selectedInfluence.id === correctMoveInfluenceId && correctMoveInfluenceMove?.targetOwnerId === handPlayer.id && correctMoveInfluenceMove.targetSlotIndex === slotIndex
                          )}
                          onClick={() => playInfluence({ ownerId: handPlayer.id, slotIndex })}
                        >
                          {ui(language, "ownSlot", { slot: slotIndex + 1 })}
                        </button>
                      ))}
                    {selectedInfluence.effect.kind === "target_opponent_penalty" &&
                      selectedOpponentTarget.map(({ product, slotIndex }) => (
                        <button
                          key={slotIndex}
                          disabled={!product}
                          data-correct-owner-id={localHintValue(opponentOf(handPlayer.id))}
                          data-correct-slot-index={localHintValue(slotIndex)}
                          data-correct-move={localHintMove(
                            selectedInfluence.id === correctMoveInfluenceId &&
                              correctMoveInfluenceMove?.targetOwnerId === opponentOf(handPlayer.id) &&
                              correctMoveInfluenceMove.targetSlotIndex === slotIndex
                          )}
                          onClick={() => playInfluence({ ownerId: opponentOf(handPlayer.id), slotIndex })}
                        >
                          {ui(language, "opponentSlot", { slot: slotIndex + 1 })}
                        </button>
                      ))}
                    {["tag_modifier", "anti_tag", "tie_preference", "draw_product", "draw_influence", "rearrange"].includes(selectedInfluence.effect.kind) && (
                      <button
                        className="primary-action"
                        disabled={!canPlayInfluence}
                        data-correct-move={localHintMove(
                          selectedInfluence.id === correctMoveInfluenceId && (!correctMoveInfluenceMove?.targetTag || correctMoveInfluenceMove.targetTag === state.selectedTag)
                        )}
                        onClick={() => playInfluence({ tag: state.selectedTag })}
                      >
                        <HandCoins size={16} /> {ui(language, "playInfluence")}
                      </button>
                    )}
                  </div>
                )}
              </div>}
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
              {showUpgradeTimer && <div className="turn-timer" aria-label={ui(language, "turnTimer")}>{upgradeTimerText}</div>}
            </div>
            <div className="upgrade-row">
              {state.upgradeOffer.map((upgrade) => {
                const buyer = state.players.find((player) => player.id === state.upgradeQueue[0])!;
                return (
                  <UpgradeCard
                    key={upgrade.id}
                    upgrade={upgrade}
                    language={language}
                    canBuy={canControlActivePlayer && buyer.money >= upgrade.cost}
                    correctMove={correctMoveUpgradeId === upgrade.id}
                    onBuy={() => buyUpgrade(upgrade.id)}
                  />
                );
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
            {state.partyGoals.length > 0 && <div className="goal-badge">{ui(language, "partyGoals")}: {completedGoalCount} / {state.partyGoals.length}</div>}
            <div className="end-actions">
              <button className="primary-action" onClick={primaryCampaignEndLevel ? () => startCampaignLevel(primaryCampaignEndLevel) : restartGame}>
                {state.campaignRun && campaignCanAdvance && nextCampaignLevel ? <SkipForward size={18} /> : <RefreshCw size={18} />} {primaryEndActionLabel}
              </button>
              {state.campaignRun && (
                <button
                  onClick={() => {
                    exitToMenu();
                    setMenuView("main");
                    setMenuTab("play");
                    setPlayModeTab("story");
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

      {canResolveChoiceDraft && state.choiceDraft && (
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
                    correctMove={correctMoveChoiceCardId === (card as ProductInstance).instanceId}
                    disabled={false}
                    onClick={() => keepDraftCard(index)}
                  />
                ) : (
                  <InfluenceCard
                    key={(card as InfluenceCardType).id}
                    card={card as InfluenceCardType}
                    language={language}
                    selected={false}
                    correctMove={correctMoveChoiceCardId === (card as InfluenceCardType).id}
                    disabled={false}
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

      {showLicenses && (
        <div className="modal-backdrop">
          <div className="about-modal license-modal" role="dialog" aria-label="Лицензии">
            <button className="modal-close" aria-label={ui(language, "close")} onClick={() => setShowLicenses(false)}>
              <X size={18} />
            </button>
            <h2>Лицензии</h2>
            <p>{MATCH_FOUND_LICENSE}</p>
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
                <li>Goal: after 8 rounds, have more coins than your opponent. If coins are tied, the player with more sales wins.</li>
                <li>Round: rounds 1-2 have 1 customer. From round 3, 2 customers arrive. Players prepare shelves first, then sales resolve for each customer from left to right.</li>
                <li>Turn: place or replace 1 product on your shelf, then play 1 influence card or skip. When both players are ready, the sale begins.</li>
                <li>Customer wishes: each customer has a primary tag and a secondary tag. Products try to match those tags.</li>
                <li>Appeal scoring: the primary tag gives +3 appeal, the secondary tag gives +2. Trends, influence cards, and upgrades can add or subtract appeal.</li>
                <li>Trends do not replace customer wishes. They show which tags are stronger or weaker on the market right now, and their modifiers stack with wishes.</li>
                <li>The focus trend is stronger than a normal trend: each of its modifiers is 1 point stronger. A +1 becomes +2, and a -1 becomes -2.</li>
                <li>Influence cards and upgrades are resolved as written on the card. They can change appeal, draw products, preserve stock, or change tie preference.</li>
                <li>A customer buys only a product that reaches at least {currentPurchaseAppealThreshold} appeal. If no product reaches that number, the customer buys nothing.</li>
                <li>If several products qualify, the customer chooses the highest appeal. Ties are broken by tie preference, lower price, fewer owner coins, first player, then the leftmost shelf slot.</li>
                {showCustomerPersonalityRules && (
                  <li>Customer personalities: discount lovers give +1 appeal to budget products or price 2 and below; trend chasers buy only products with enough trend bonus; close-score customers may buy the second-highest product if it trails the best by the allowed gap.</li>
                )}
                <li>Sale payout: when your product is bought, you gain its price in coins. At 9+ appeal you get +1 tip. In round 8 you get +1 final-round bonus. Regular Customers adds +1 on the first customer.</li>
                <li>Stock: a sold product loses 1 stock. If its stock reaches 0, it leaves the shelf unless an effect preserved the stock.</li>
                <li>Party goals give +2 coins once when completed. After rounds 2, 4, and 6, the upgrade shop opens; the player with fewer coins chooses first.</li>
                <li>Story mode can temporarily hide trends, goals, influence cards, upgrades, or personalities and can lower the purchase threshold. The rules shown on a level match the mechanics currently unlocked.</li>
              </ol>
            ) : (
              <ol>
                <li>Цель игры: после 8 раундов иметь больше монет, чем соперник. Если монет поровну, побеждает игрок с большим числом продаж.</li>
                <li>Раунд: в 1-2 раундах приходит 1 клиент. С 3-го раунда приходят 2 клиента. Сначала игроки готовят прилавки, затем продажи считаются по клиентам слева направо.</li>
                <li>В свой ход выставь или замени 1 товар на полке, затем сыграй 1 карту влияния или пропусти. Когда оба игрока готовы, начинается продажа.</li>
                <li>Желания клиента: у каждого клиента есть главный тег и второй тег. Товар старается совпасть с этими тегами.</li>
                <li>Подсчёт привлекательности: главный тег клиента даёт +3, второй тег даёт +2. Тренды, влияния и апгрейды могут добавить или убрать очки.</li>
                <li>Тренды не заменяют желания клиента. Они показывают, какие теги сейчас сильнее или слабее на рынке, и складываются с желаниями клиента.</li>
                <li>Главный тренд сильнее обычного: каждый его модификатор меняется на 1 очко сильнее. +1 становится +2, а -1 становится -2.</li>
                <li>Карты влияния и апгрейды выполняются так, как написано на карте. Они могут менять привлекательность, добирать товары, сохранять запас или менять выбор при равенстве.</li>
                <li>Клиент покупает только товар, который набрал минимум {currentPurchaseAppealThreshold} привлекательности. Если таких товаров нет, клиент ничего не покупает.</li>
                <li>Если несколько товаров подходят, клиент выбирает товар с самой высокой привлекательностью. При равенстве решают преимущество в ничьей, меньшая цена, меньше монет у владельца, первый игрок, затем левая полка.</li>
                {showCustomerPersonalityRules && (
                  <li>Характеры клиентов: Любит скидки даёт +1 дешёвым товарам или товарам ценой 2 и ниже; Охотится за трендом требует нужный трендовый бонус; Почти равный выбор может купить товар со вторым результатом, если он отстаёт от лучшего на разрешённую разницу.</li>
                )}
                <li>При продаже ты получаешь цену товара в монетах. За 9+ привлекательности добавляется +1 чаевых. В 8-м раунде добавляется +1 финального бонуса. Апгрейд Постоянные клиенты даёт +1 на первом клиенте.</li>
                <li>Запас: проданный товар теряет 1 запас. Если запас стал 0, товар уходит с полки, кроме случаев, когда эффект сохранил запас.</li>
                <li>Цели партии дают +2 монеты один раз за выполненную цель. После 2, 4 и 6 раунда открывается магазин апгрейдов; первым выбирает игрок с меньшим числом монет.</li>
                <li>В режиме истории часть механик может быть временно отключена: тренды, цели, влияния, апгрейды или характеры. Порог покупки тоже может быть ниже. Правила уровня соответствуют тем механикам, которые уже открыты.</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
