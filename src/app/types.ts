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
} from "../game/types";
import type { PartyGoal } from "../game/goals";
import type { Language } from "../i18n";
import type { CampaignCustomerPersonalityMode, CampaignLevel } from "../game/levels";

export interface InitialStateOptions {
  influenceHandSize: number;
  trendCount: number;
  partyGoalCount: number;
  customerPersonalityMode: CampaignCustomerPersonalityMode;
}

export type MusicStatus = "idle" | "playing" | "paused" | "blocked";
export type AiMode = "opponent" | "training";
export type MenuView = "main" | "levels";

export interface AudioSettings {
  musicEnabled: boolean;
  effectsEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
  turnTimeSeconds: number;
  language: Language;
}

export interface ChoiceDraft {
  playerId: PlayerId;
  type: "product" | "influence";
  cards: Array<ProductInstance | InfluenceCardType>;
}

export interface PauseState {
  active: boolean;
  pausedBy: PlayerId | null;
}

export interface CampaignRun {
  level: number;
  aiDifficulty: number;
  opponentName: string;
  opponentNameEn: string;
  unlockRecorded: boolean;
}

export interface SaleReview {
  round: number;
  results: PurchaseResult[];
  insights: string[];
}

export interface GameState {
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
  lastSaleReview: SaleReview | null;
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

export interface CutsceneState {
  level: CampaignLevel;
  frameIndex: number;
}

export interface LobbySession {
  code: string;
  playerId: PlayerId;
  token: string;
  version: number;
  seats: Record<PlayerId, boolean>;
}

export interface LobbyResponse<TState = GameState> {
  code: string;
  playerId?: PlayerId;
  token?: string;
  version: number;
  state: TState;
  seats: Record<PlayerId, boolean>;
}

export interface SavedSession {
  version: number;
  state: GameState;
  lobby: LobbySession | null;
  audioSettings: AudioSettings;
}
