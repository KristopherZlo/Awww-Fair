import { UPGRADE_CARDS } from "../src/data/cards";
import { runAiVsAiBonusMatrix, runAiVsAiComebackMatrix, type AiVsAiScenarioResult } from "../src/game/aiSkillCheck";

function numberArg(index: number, fallback: number) {
  const parsed = Number(process.argv[index]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function winRate(wins: number, games: number) {
  return games ? wins / games : 0;
}

const gamesPerScenario = numberArg(2, 100);
const seed = numberArg(3, 515151);
const upgradeNameById = new Map(UPGRADE_CARDS.map((upgrade) => [upgrade.id, upgrade.name]));
const bonusMatrix = runAiVsAiBonusMatrix({ gamesPerScenario, seed });
const comebackMatrix = runAiVsAiComebackMatrix({ gamesPerScenario, seed: seed + 5000000 });

function bonusRow(scenario: AiVsAiScenarioResult) {
  return {
    firstPlayer: scenario.firstPlayer,
    bonusPlayer: scenario.bonusPlayerId,
    bonusUpgradeId: scenario.bonusUpgradeId,
    bonusUpgradeName: scenario.bonusUpgradeId ? upgradeNameById.get(scenario.bonusUpgradeId) ?? scenario.bonusUpgradeId : null,
    bonusWins: scenario.bonusPlayerWins,
    noBonusWins: scenario.noBonusPlayerWins,
    draws: scenario.draws,
    bonusWinRate: percent(winRate(scenario.bonusPlayerWins, scenario.games)),
    moneyMarginForBonus: round(scenario.averageMoneyMarginForBonusPlayer ?? 0),
    noSaleRate: percent(scenario.noSaleRate),
    tipRateOfSales: percent(scenario.tipRateOfSales)
  };
}

function comebackRow(scenario: AiVsAiScenarioResult) {
  return {
    firstPlayer: scenario.firstPlayer,
    favoredHandPlayer: scenario.favoredHandPlayerId,
    underdogPlayer: scenario.underdogPlayerId,
    favoredWins: scenario.favoredWins,
    underdogWins: scenario.underdogWins,
    draws: scenario.draws,
    comebackRate: percent(winRate(scenario.comebackWins, scenario.games)),
    moneyMarginForFavored: round(scenario.averageMoneyMarginForFavoredHandPlayer ?? 0),
    averageMoney: {
      A: round(scenario.averageMoney.A),
      B: round(scenario.averageMoney.B)
    },
    averageSales: {
      A: round(scenario.averageSales.A),
      B: round(scenario.averageSales.B)
    }
  };
}

console.log(
  JSON.stringify(
    {
      gamesPerScenario,
      seed,
      bonusSummary: {
        scenarios: bonusMatrix.summary.scenarios,
        games: bonusMatrix.summary.games,
        bonusWins: bonusMatrix.summary.bonusPlayerWins,
        noBonusWins: bonusMatrix.summary.noBonusPlayerWins,
        draws: bonusMatrix.summary.draws,
        bonusWinRate: percent(bonusMatrix.summary.bonusPlayerWinRate),
        noBonusWinRate: percent(bonusMatrix.summary.noBonusPlayerWinRate),
        drawRate: percent(bonusMatrix.summary.drawRate),
        moneyMarginForBonus: round(bonusMatrix.summary.averageMoneyMarginForBonusPlayer)
      },
      bonusRows: bonusMatrix.scenarios.map(bonusRow),
      comebackSummary: {
        scenarios: comebackMatrix.summary.scenarios,
        games: comebackMatrix.summary.games,
        favoredWins: comebackMatrix.summary.favoredWins,
        underdogWins: comebackMatrix.summary.underdogWins,
        draws: comebackMatrix.summary.draws,
        comebackRate: percent(comebackMatrix.summary.comebackRate),
        favoredWinRate: percent(comebackMatrix.summary.favoredWinRate),
        drawRate: percent(comebackMatrix.summary.drawRate),
        moneyMarginForFavored: round(comebackMatrix.summary.averageMoneyMarginForFavoredHandPlayer)
      },
      comebackRows: comebackMatrix.scenarios.map(comebackRow)
    },
    null,
    2
  )
);
