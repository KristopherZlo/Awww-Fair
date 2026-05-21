import { trendModifierValue } from "../game/engine";
import type {
  PlayerId,
  PlayerState,
  PurchaseCandidateRequirement,
  PurchasePersonalityChoice,
  PurchaseResult,
  Tag
} from "../game/types";
import { tagText, ui, type Language } from "../i18n";

const DEFAULT_PLAYER_NAMES = new Set(["Вы", "Оппонент"]);

export function displayPlayerName(playerId: PlayerId, viewerId: PlayerId, language: Language) {
  return playerId === viewerId ? ui(language, "you") : ui(language, "opponent");
}

export function displayPlayerNameFor(player: PlayerState | undefined, viewerId: PlayerId, language: Language) {
  if (!player) {
    return ui(language, "opponent");
  }
  if (player.id === viewerId) {
    return ui(language, "you");
  }
  return player.name && !DEFAULT_PLAYER_NAMES.has(player.name) ? player.name : ui(language, "opponent");
}

export function playerLogToken(playerId: PlayerId) {
  return `{{player:${playerId}}}`;
}

export function ownerLogToken(playerId: PlayerId) {
  return `{{owner:${playerId}}}`;
}

export function ownerPhrase(playerId: PlayerId, viewerId: PlayerId, language: Language) {
  if (language === "en") {
    return playerId === viewerId ? "for you" : "for the opponent";
  }
  return playerId === viewerId ? "у вас" : "у оппонента";
}

export function formatLogForViewer(log: string, viewerId: PlayerId, language: Language) {
  return log
    .replace(/\{\{player:([AB])\}\}/g, (_match, playerId: string) => displayPlayerName(playerId as PlayerId, viewerId, language))
    .replace(/\{\{owner:([AB])\}\}/g, (_match, playerId: string) => ownerPhrase(playerId as PlayerId, viewerId, language));
}

export function formatModifiers(modifiers: { tag: Tag; value: number }[], language: Language, focused = false) {
  return modifiers
    .map((modifier) => {
      const value = trendModifierValue(modifier.value, focused);
      return `${tagText(language, modifier.tag)} ${value > 0 ? "+" : ""}${value}`;
    })
    .join(", ");
}

export function formatSignedScore(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

export function isFocusTrendLine(label: string) {
  return label.includes("(главный тренд)");
}

export function isWinningCandidate(result: PurchaseResult, candidate: PurchaseResult["candidates"][number]) {
  return (
    result.winner?.ownerId === candidate.ownerId &&
    result.winner.slotIndex === candidate.slotIndex &&
    result.winner.product.instanceId === candidate.product.instanceId
  );
}

export function formatCandidateRequirement(requirement: PurchaseCandidateRequirement, language: Language) {
  if (language === "en") {
    return `personality: trend bonus ${requirement.actual} / ${requirement.required} - ${requirement.passed ? "matches" : "does not match"}`;
  }

  return `характер: трендовый бонус ${requirement.actual} / ${requirement.required} - ${requirement.passed ? "подходит" : "не подходит"}`;
}

export function formatPersonalityChoice(choice: PurchasePersonalityChoice, language: Language) {
  if (language === "en") {
    return choice.applied
      ? `personality: bought the second-highest product, gap ${choice.appealGap} / ${choice.maxAppealGap}`
      : `personality: kept the highest product, gap ${choice.appealGap} / ${choice.maxAppealGap}`;
  }

  return choice.applied
    ? `характер: куплен товар со вторым результатом, разница ${choice.appealGap} / ${choice.maxAppealGap}`
    : `характер: куплен лучший товар, разница ${choice.appealGap} / ${choice.maxAppealGap}`;
}
