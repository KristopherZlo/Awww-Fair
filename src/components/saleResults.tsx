import { ChevronDown, ChevronRight } from "lucide-react";
import {
  displayPlayerNameFor,
  formatCandidateRequirement,
  formatPersonalityChoice,
  isFocusTrendLine,
  isWinningCandidate,
  ownerPhrase
} from "../app/presentation";
import type { PlayerId, PlayerState, PurchaseResult } from "../game/types";
import { customerName, productName, ui, type Language } from "../i18n";

interface SaleResultCardsProps {
  results: PurchaseResult[];
  namespace: string;
  contentIdPrefix: string;
  expandedKeys: Set<string>;
  players: PlayerState[];
  localPlayerId: PlayerId;
  language: Language;
  onToggle: (key: string) => void;
}

type SaleCandidate = PurchaseResult["candidates"][number];

function bestSaleCandidate(result: PurchaseResult) {
  return result.candidates.reduce<SaleCandidate | null>(
    (best, candidate) => (!best || candidate.appeal.total > best.appeal.total ? candidate : best),
    null
  );
}

function saleReasonMeta(result: PurchaseResult, candidate: SaleCandidate | null, language: Language) {
  if (!candidate) {
    return language === "en" ? "No product on the shelf" : "Нет товара на полке";
  }

  const missingAppeal = Math.max(0, result.appealThreshold - candidate.appeal.total);
  if (result.winner) {
    return `${candidate.appeal.total} / ${result.appealThreshold} appeal`;
  }

  return language === "en"
    ? `${candidate.appeal.total} / ${result.appealThreshold} appeal · needs +${missingAppeal}`
    : `${candidate.appeal.total} / ${result.appealThreshold} привлекательности · нужно +${missingAppeal}`;
}

export function SaleResultCards({
  results,
  namespace,
  contentIdPrefix,
  expandedKeys,
  players,
  localPlayerId,
  language,
  onToggle
}: SaleResultCardsProps) {
  return (
    <>
      {results.map((result, index) => {
        const key = `${namespace}-${result.customer.id}-${index}`;
        const contentId = `${contentIdPrefix}-${key}`;
        const expanded = expandedKeys.has(key);
        const summaryCandidate = result.winner ?? bestSaleCandidate(result);
        const summaryTitle = summaryCandidate
          ? `${productName(language, summaryCandidate.product)} ${ownerPhrase(summaryCandidate.ownerId, localPlayerId, language)}`
          : ui(language, "noPurchase");
        const summaryMeta = saleReasonMeta(result, summaryCandidate, language);
        return (
          <div key={key} className={`sale-result-card ${expanded ? "expanded" : ""}`}>
            <button
              type="button"
              className="sale-result-toggle"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => onToggle(key)}
            >
              {expanded ? <ChevronDown className="sale-result-chevron" size={14} aria-hidden="true" /> : <ChevronRight className="sale-result-chevron" size={14} aria-hidden="true" />}
              <span className="sale-result-summary">
                <span className="sale-result-title">{customerName(language, result.customer)}: {summaryTitle}</span>
                <span className={`sale-result-meta${result.winner ? "" : " needs-work"}`}>{summaryMeta}</span>
              </span>
            </button>
            {expanded && (
              <div id={contentId} className="sale-result-body">
                {result.candidates.map((candidate) => (
                  <div key={`${candidate.ownerId}-${candidate.slotIndex}`} className={isWinningCandidate(result, candidate) ? "formula winner" : "formula"}>
                    <b>
                      {productName(language, candidate.product)} · {displayPlayerNameFor(players.find((player) => player.id === candidate.ownerId), localPlayerId, language)}
                    </b>
                    {candidate.appeal.breakdown.map((line) => (
                      <span key={`${line.label}-${line.value}`} className={isFocusTrendLine(line.label) ? "focus-formula-line" : undefined}>
                        {line.value > 0 ? "+" : ""}
                        {line.value} {line.label}
                      </span>
                    ))}
                    {candidate.requirements?.map((requirement) => (
                      <span
                        key={`${requirement.kind}-${requirement.actual}-${requirement.required}`}
                        className={`formula-requirement ${requirement.passed ? "passed" : "failed"}`}
                      >
                        {formatCandidateRequirement(requirement, language)}
                      </span>
                    ))}
                    <strong>= {candidate.appeal.total}</strong>
                  </div>
                ))}
                {result.personalityChoice && (
                  <p className={`formula-choice-note ${result.personalityChoice.applied ? "passed" : ""}`}>
                    {formatPersonalityChoice(result.personalityChoice, language)}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
