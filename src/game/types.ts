export type Tag =
  | "сладкое"
  | "напиток"
  | "дешёвое"
  | "дорогое"
  | "свежее"
  | "быстрое"
  | "детское"
  | "местное";

export type PlayerId = "A" | "B";
export type CardType = "product" | "customer" | "trend" | "influence" | "upgrade";
export type Phase = "menu" | "planning" | "sale_resolution" | "upgrade" | "game_end";

export interface SpritePosition {
  col: number;
  row: number;
}

export interface Modifier {
  tag: Tag;
  value: number;
}

export interface ProductCard {
  id: string;
  name: string;
  type: "product";
  tags: Tag[];
  price: number;
  stock: number;
  sprite: SpritePosition;
}

export interface ProductInstance extends Omit<ProductCard, "id" | "stock"> {
  instanceId: string;
  cardId: string;
  stock: number;
  baseStock: number;
}

export type CustomerPersonality =
  | {
      kind: "bargain_hunter";
      label: string;
      description: string;
    }
  | {
      kind: "trend_chaser";
      label: string;
      description: string;
      minTrendScore: number;
    }
  | {
      kind: "second_best";
      label: string;
      description: string;
      maxAppealGap: number;
    };

export interface CustomerCard {
  id: string;
  name: string;
  type: "customer";
  primaryTag: Tag;
  secondaryTag: Tag;
  sprite: SpritePosition;
  personality?: CustomerPersonality;
}

export interface TrendCard {
  id: string;
  name: string;
  type: "trend";
  modifiers: Modifier[];
}

export type InfluenceEffect =
  | { kind: "tag_modifier"; modifiers: Modifier[] }
  | { kind: "anti_tag"; value: -1 }
  | { kind: "target_own_bonus"; value: number; preserveStock?: boolean }
  | { kind: "target_opponent_penalty"; value: number }
  | { kind: "tie_preference" }
  | { kind: "draw_product"; draw: number; keep: number }
  | { kind: "draw_influence"; draw: number; keep: number }
  | { kind: "rearrange" };

export interface InfluenceCard {
  id: string;
  name: string;
  type: "influence";
  description: string;
  effect: InfluenceEffect;
}

export type UpgradeEffect =
  | "extra_shelf"
  | "beautiful_window"
  | "regular_customers"
  | "supplier"
  | "bright_sign"
  | "mini_storage"
  | "ad_table"
  | "cozy_decor";

export interface UpgradeCard {
  id: string;
  name: string;
  type: "upgrade";
  cost: number;
  description: string;
  effect: UpgradeEffect;
}

export interface ProductAdjustment {
  ownerId: PlayerId;
  slotIndex: number;
  value: number;
  label: string;
  preserveStock?: boolean;
}

export interface PlayedInfluence {
  id: string;
  name: string;
  ownerId: PlayerId;
  modifiers?: Modifier[];
  productAdjustments?: ProductAdjustment[];
  tieOwner?: PlayerId;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  money: number;
  sales: number;
  shelfSlots: number;
  shelf: Array<ProductInstance | null>;
  productHand: ProductInstance[];
  influenceHand: InfluenceCard[];
  upgrades: UpgradeCard[];
  planned: boolean;
  productActionUsed: boolean;
  influenceActionUsed: boolean;
  tableBonusUsed: boolean;
  color: "red" | "blue";
}

export interface AppealLine {
  label: string;
  value: number;
}

export interface AppealResult {
  total: number;
  breakdown: AppealLine[];
}

export interface AppealInput {
  product: ProductInstance;
  ownerId: PlayerId;
  slotIndex: number;
  customer: CustomerCard;
  trends: TrendCard[];
  influences: PlayedInfluence[];
  ownerUpgrades: UpgradeCard[];
  roundBonuses: ProductAdjustment[];
}

export interface PurchaseCandidate {
  ownerId: PlayerId;
  slotIndex: number;
  product: ProductInstance;
  appeal: AppealResult;
  trendScore?: number;
}

export interface PurchaseWinner extends PurchaseCandidate {
  payout: number;
  tip: number;
  lateRoundBonus: number;
  regularCustomerBonus: number;
  preserveStock: boolean;
}

export interface PurchaseResult {
  customer: CustomerCard;
  candidates: PurchaseCandidate[];
  eligible: PurchaseCandidate[];
  winner: PurchaseWinner | null;
}
