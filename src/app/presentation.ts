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

const DEFAULT_PLAYER_NAMES = new Set(["Вы", "Оппонент", "Р’С‹", "РћРїРїРѕРЅРµРЅС‚"]);

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
  return playerId === viewerId ? "Сѓ РІР°СЃ" : "Сѓ РѕРїРїРѕРЅРµРЅС‚Р°";
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
  return label.includes("(главный тренд)") || label.includes("(РіР»Р°РІРЅС‹Р№ С‚СЂРµРЅРґ)");
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

  return `С…Р°СЂР°РєС‚РµСЂ: С‚СЂРµРЅРґРѕРІС‹Р№ Р±РѕРЅСѓСЃ ${requirement.actual} / ${requirement.required} - ${requirement.passed ? "РїРѕРґС…РѕРґРёС‚" : "РЅРµ РїРѕРґС…РѕРґРёС‚"}`;
}

export function formatPersonalityChoice(choice: PurchasePersonalityChoice, language: Language) {
  if (language === "en") {
    return choice.applied
      ? `personality: bought the second-highest product, gap ${choice.appealGap} / ${choice.maxAppealGap}`
      : `personality: kept the highest product, gap ${choice.appealGap} / ${choice.maxAppealGap}`;
  }

  return choice.applied
    ? `С…Р°СЂР°РєС‚РµСЂ: РєСѓРїР»РµРЅ С‚РѕРІР°СЂ СЃРѕ РІС‚РѕСЂС‹Рј СЂРµР·СѓР»СЊС‚Р°С‚РѕРј, СЂР°Р·РЅРёС†Р° ${choice.appealGap} / ${choice.maxAppealGap}`
    : `С…Р°СЂР°РєС‚РµСЂ: РєСѓРїР»РµРЅ Р»СѓС‡С€РёР№ С‚РѕРІР°СЂ, СЂР°Р·РЅРёС†Р° ${choice.appealGap} / ${choice.maxAppealGap}`;
}
