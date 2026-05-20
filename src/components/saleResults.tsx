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
        return (
          <div key={key} className={`sale-result-card ${expanded ? "expanded" : ""}`}>
            <button
              type="button"
              className="sale-result-toggle"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => onToggle(key)}
            >
              <span>
                {customerName(language, result.customer)}:{" "}
                {result.winner
                  ? `${productName(language, result.winner.product)} ${ownerPhrase(result.winner.ownerId, localPlayerId, language)}`
                  : ui(language, "noPurchase")}
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
