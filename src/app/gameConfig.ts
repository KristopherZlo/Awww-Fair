import { PURCHASE_APPEAL_THRESHOLD } from "../game/engine";
import type { CampaignLevelRules } from "../game/levels";
import type { AudioSettings, InitialStateOptions } from "./types";

export const DEFAULT_TURN_TIME_SECONDS = 45;
export const MIN_TURN_TIME_SECONDS = 15;
export const MAX_TURN_TIME_SECONDS = 120;

export function clampTurnTime(seconds: number) {
  return Math.max(MIN_TURN_TIME_SECONDS, Math.min(MAX_TURN_TIME_SECONDS, Math.round(seconds)));
}

export const DEFAULT_INITIAL_STATE_OPTIONS: InitialStateOptions = {
  influenceHandSize: 2,
  trendCount: 3,
  partyGoalCount: 3,
  customerPersonalityMode: "off"
};

export const CUSTOMER_PERSONALITIES_ENABLED = import.meta.env.VITE_ENABLE_CUSTOMER_PERSONALITIES === "true";
export const CAMPAIGN_RULE_OPTIONS = { customerPersonalitiesEnabled: CUSTOMER_PERSONALITIES_ENABLED } as const;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicEnabled: true,
  effectsEnabled: true,
  musicVolume: 0.3,
  effectsVolume: 1,
  turnTimeSeconds: DEFAULT_TURN_TIME_SECONDS,
  language: "ru"
};

export const STANDARD_CUSTOMER_RULES: CampaignLevelRules = {
  trendCount: DEFAULT_INITIAL_STATE_OPTIONS.trendCount,
  partyGoalCount: DEFAULT_INITIAL_STATE_OPTIONS.partyGoalCount,
  influenceHandSize: DEFAULT_INITIAL_STATE_OPTIONS.influenceHandSize,
  purchaseAppealThreshold: PURCHASE_APPEAL_THRESHOLD,
  customerPersonalityMode: DEFAULT_INITIAL_STATE_OPTIONS.customerPersonalityMode
};
