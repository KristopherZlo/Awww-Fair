import { clampVolume } from "../audio/soundEffects";
import { createPartyGoals, normalizePartyGoal } from "../game/goals";
import { CAMPAIGN_LEVELS, campaignCustomerForRules, campaignRulesForLevel, createDefaultCampaignProgress, type CampaignProgress } from "../game/levels";
import type { CustomerCard as CustomerCardType } from "../game/types";
import { normalizeLanguage } from "../i18n";
import {
  CAMPAIGN_RULE_OPTIONS,
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_TURN_TIME_SECONDS,
  STANDARD_CUSTOMER_RULES,
  clampTurnTime
} from "./gameConfig";
import type { AudioSettings, CampaignRun, GameState, LobbySession, SaleReview, SavedSession } from "./types";

const SESSION_STORAGE_KEY = "trend-market-session-v1";
const CAMPAIGN_STORAGE_KEY = "trend-market-campaign-v1";

export const SESSION_STORAGE_VERSION = 1;

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

export function normalizeSavedGameState(state: GameState): GameState {
  const campaignRun = normalizeSavedCampaignRun((state as GameState & { campaignRun?: unknown }).campaignRun);
  const activeCustomerRules = campaignRun ? campaignRulesForLevel(campaignRun.level, CAMPAIGN_RULE_OPTIONS) : STANDARD_CUSTOMER_RULES;
  const normalizeCustomer = (customer: CustomerCardType) => campaignCustomerForRules(customer, activeCustomerRules);
  const normalizeSaleResult = (result: GameState["saleResults"][number]) => {
    const customer = normalizeCustomer(result.customer);
    const stripPersonality = !customer.personality;
    const normalizeCandidate = <T extends { appeal: { total: number; breakdown: Array<{ label: string; value: number }> }; requirements?: unknown }>(candidate: T) => {
      if (!stripPersonality) {
        return candidate;
      }

      const breakdown = candidate.appeal.breakdown.filter((line) => !line.label.toLocaleLowerCase("ru-RU").startsWith("характер"));
      const { requirements: _requirements, ...rest } = candidate;
      return {
        ...rest,
        appeal: {
          ...candidate.appeal,
          breakdown,
          total: breakdown.reduce((sum, line) => sum + line.value, 0)
        }
      };
    };

    const normalized = {
      ...result,
      customer,
      candidates: result.candidates.map(normalizeCandidate),
      eligible: result.eligible.map(normalizeCandidate),
      winner: result.winner ? normalizeCandidate(result.winner) : null,
      appealThreshold: typeof result.appealThreshold === "number" ? result.appealThreshold : activeCustomerRules.purchaseAppealThreshold
    };

    if (!stripPersonality) {
      return normalized;
    }

    const { personalityChoice: _personalityChoice, ...withoutPersonalityChoice } = normalized;
    return withoutPersonalityChoice;
  };
  const normalizeSaleReview = (review: unknown): SaleReview | null => {
    if (!isRecord(review) || typeof review.round !== "number" || !Array.isArray(review.results)) {
      return null;
    }
    return {
      round: review.round,
      results: review.results.map((result) => normalizeSaleResult(result)),
      insights: Array.isArray(review.insights) ? review.insights.filter((line): line is string => typeof line === "string") : []
    };
  };

  return {
    ...state,
    currentCustomers:
      Array.isArray(state.currentCustomers)
        ? state.currentCustomers.map(normalizeCustomer)
        : state.currentCustomers,
    customerDeck:
      Array.isArray(state.customerDeck)
        ? state.customerDeck.map(normalizeCustomer)
        : state.customerDeck,
    saleResults: Array.isArray(state.saleResults) ? state.saleResults.map((result) => normalizeSaleResult(result)) : [],
    saleInsights: Array.isArray(state.saleInsights) ? state.saleInsights : [],
    lastSaleReview: normalizeSaleReview((state as GameState & { lastSaleReview?: unknown }).lastSaleReview),
    pause: state.pause && typeof state.pause.active === "boolean" ? state.pause : { active: false, pausedBy: null },
    partyGoals: Array.isArray(state.partyGoals) ? state.partyGoals.map(normalizePartyGoal) : createPartyGoals(state.activeTrends, state.currentCustomers),
    aiIntent: typeof state.aiIntent === "string" ? state.aiIntent : null,
    aiDifficulty: typeof (state as GameState & { aiDifficulty?: unknown }).aiDifficulty === "number" ? Math.max(1, Math.min(24, Math.round(state.aiDifficulty ?? 1))) : null,
    campaignRun,
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

export function normalizeCampaignProgress(value: unknown): CampaignProgress {
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

export function loadCampaignProgress(): CampaignProgress {
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

export function saveCampaignProgress(progress: CampaignProgress) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Campaign progress is optional persistence; the active game can continue.
  }
}

export function clearSavedSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage can be blocked in private modes; gameplay should continue.
  }
}

export function loadSavedSession(): SavedSession | null {
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

export function saveSession(snapshot: SavedSession) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // If storage quota or permissions fail, keep the in-memory session usable.
  }
}
