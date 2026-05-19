import { TREND_CARDS, UPGRADE_CARDS } from "../src/data/cards";
import {
  runAiVsAiBonusMatrix,
  runAiVsAiComebackMatrix,
  runAiVsAiEconomyComebackMatrix,
  runAiVsAiNoviceHandicapMatrix,
  runAiVsAiScenario,
  runAiVsAiSkillGapMatrix,
  runAiVsAiSymmetryCheck,
  runAiVsAiTrendMatrix,
  runAiVsAiUpgradeDuelMatrix,
  type AiVsAiNoviceHandicapScenarioResult,
  type AiVsAiSkillGapScenarioResult
} from "../src/game/aiSkillCheck";
import type { PlayerId } from "../src/game/types";

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

function groupBy<T, K extends string | number>(items: T[], keyOf: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

const gamesPerScenario = numberArg(2, 100);
const seed = numberArg(3, 515151);
const upgradeNameById = new Map(UPGRADE_CARDS.map((upgrade) => [upgrade.id, upgrade.name]));
const trendNameById = new Map(TREND_CARDS.map((trend) => [trend.id, trend.name]));

const symmetry = runAiVsAiSymmetryCheck({ gamesPerScenario, seed });
const bonus = runAiVsAiBonusMatrix({ gamesPerScenario, seed: seed + 1_000_000 });
const comeback = runAiVsAiComebackMatrix({ gamesPerScenario, seed: seed + 2_000_000 });
const upgradeDuel = runAiVsAiUpgradeDuelMatrix({ gamesPerScenario, seed: seed + 3_000_000 });
const economyComeback = runAiVsAiEconomyComebackMatrix({ gamesPerScenario, seed: seed + 4_000_000, startingMoneyLead: 3 });
const skillGap = runAiVsAiSkillGapMatrix({ gamesPerScenario, seed: seed + 5_000_000, weakerDifficulties: [6, 12, 18] });
const trendMatrix = runAiVsAiTrendMatrix({ gamesPerScenario, seed: seed + 6_000_000 });
const noviceHandicap = runAiVsAiNoviceHandicapMatrix({ gamesPerScenario, seed: seed + 7_000_000, noviceDifficulty: 6 });
const saleHealth = runAiVsAiScenario({ games: gamesPerScenario * 2, seed: seed + 8_000_000, firstPlayer: "random" });

function upgradeDuelRows() {
  const rows = new Map<string, { wins: number; games: number }>();
  for (const scenario of upgradeDuel.scenarios) {
    const a = rows.get(scenario.aUpgradeId) ?? { wins: 0, games: 0 };
    a.wins += scenario.aWins;
    a.games += scenario.games;
    rows.set(scenario.aUpgradeId, a);

    const b = rows.get(scenario.bUpgradeId) ?? { wins: 0, games: 0 };
    b.wins += scenario.bWins;
    b.games += scenario.games;
    rows.set(scenario.bUpgradeId, b);
  }

  return [...rows.entries()]
    .map(([upgradeId, row]) => ({
      upgradeId,
      name: upgradeNameById.get(upgradeId) ?? upgradeId,
      winRate: percent(winRate(row.wins, row.games)),
      wins: row.wins,
      games: row.games
    }))
    .sort((left, right) => Number.parseFloat(right.winRate) - Number.parseFloat(left.winRate));
}

function skillGapRows() {
  return [...groupBy(skillGap.scenarios, (scenario) => scenario.weakerDifficulty).entries()].map(([difficulty, scenarios]) => {
    const rows = scenarios as AiVsAiSkillGapScenarioResult[];
    const games = rows.reduce((total, row) => total + row.games, 0);
    const strongWins = rows.reduce((total, row) => total + row.strongWins, 0);
    const weakerWins = rows.reduce((total, row) => total + row.weakerWins, 0);
    const draws = rows.reduce((total, row) => total + row.draws, 0);
    return {
      weakerDifficulty: difficulty,
      games,
      strongWins,
      weakerWins,
      draws,
      strongWinRate: percent(winRate(strongWins, games)),
      weakerWinRate: percent(winRate(weakerWins, games))
    };
  });
}

function noviceHandicapRows() {
  return [...groupBy(noviceHandicap.scenarios, (scenario) => scenario.handicapKind).entries()].map(([handicapKind, scenarios]) => {
    const rows = scenarios as AiVsAiNoviceHandicapScenarioResult[];
    const games = rows.reduce((total, row) => total + row.games, 0);
    const noviceWins = rows.reduce((total, row) => total + row.noviceWins, 0);
    const strongWins = rows.reduce((total, row) => total + row.strongWins, 0);
    const draws = rows.reduce((total, row) => total + row.draws, 0);
    return {
      handicapKind,
      games,
      noviceWins,
      strongWins,
      draws,
      noviceWinRate: percent(winRate(noviceWins, games)),
      strongWinRate: percent(winRate(strongWins, games))
    };
  });
}

function playerWinRate(playerId: PlayerId) {
  return percent(winRate(playerId === "A" ? symmetry.summary.aWins : symmetry.summary.bWins, symmetry.summary.games));
}

const totalBalanceGames =
  symmetry.summary.games +
  bonus.summary.games +
  comeback.summary.games +
  upgradeDuel.summary.games +
  economyComeback.summary.games +
  skillGap.summary.games +
  trendMatrix.summary.games +
  noviceHandicap.summary.games +
  saleHealth.games;

console.log(
  JSON.stringify(
    {
      gamesPerScenario,
      seed,
      totalBalanceGames,
      symmetry: {
        games: symmetry.summary.games,
        aWinRate: playerWinRate("A"),
        bWinRate: playerWinRate("B"),
        firstPlayerWinRate: percent(symmetry.summary.firstPlayerWinRate),
        secondPlayerWinRate: percent(symmetry.summary.secondPlayerWinRate),
        drawRate: percent(symmetry.summary.drawRate),
        moneyMarginForFirstPlayer: round(symmetry.summary.averageMoneyMarginForFirstPlayer)
      },
      oneBonusVsZero: {
        scenarios: bonus.summary.scenarios,
        games: bonus.summary.games,
        bonusWinRate: percent(bonus.summary.bonusPlayerWinRate),
        noBonusWinRate: percent(bonus.summary.noBonusPlayerWinRate),
        drawRate: percent(bonus.summary.drawRate),
        moneyMarginForBonus: round(bonus.summary.averageMoneyMarginForBonusPlayer)
      },
      badHandComeback: {
        scenarios: comeback.summary.scenarios,
        games: comeback.summary.games,
        favoredWinRate: percent(comeback.summary.favoredWinRate),
        comebackRate: percent(comeback.summary.comebackRate),
        drawRate: percent(comeback.summary.drawRate),
        moneyMarginForFavored: round(comeback.summary.averageMoneyMarginForFavoredHandPlayer)
      },
      upgradeDuel: {
        scenarios: upgradeDuel.summary.scenarios,
        games: upgradeDuel.summary.games,
        mostDominantUpgradeId: upgradeDuel.summary.mostDominantUpgradeId,
        mostDominantUpgradeName: upgradeDuel.summary.mostDominantUpgradeId
          ? upgradeNameById.get(upgradeDuel.summary.mostDominantUpgradeId) ?? upgradeDuel.summary.mostDominantUpgradeId
          : null,
        mostDominantUpgradeWinRate: percent(upgradeDuel.summary.mostDominantUpgradeWinRate),
        upgradeRows: upgradeDuelRows()
      },
      economyComeback: {
        scenarios: economyComeback.scenarios.length,
        games: economyComeback.summary.games,
        moneyLeaderWinRate: percent(winRate(economyComeback.summary.moneyLeaderWins, economyComeback.summary.games)),
        handFavoredWinRate: percent(winRate(economyComeback.summary.handFavoredWins, economyComeback.summary.games)),
        drawRate: percent(winRate(economyComeback.summary.draws, economyComeback.summary.games))
      },
      skillGapWithBadStrongHand: {
        games: skillGap.summary.games,
        strongWinRate: percent(winRate(skillGap.summary.strongWins, skillGap.summary.games)),
        weakerWinRate: percent(winRate(skillGap.summary.weakerWins, skillGap.summary.games)),
        drawRate: percent(winRate(skillGap.summary.draws, skillGap.summary.games)),
        byDifficulty: skillGapRows()
      },
      trendCoverage: {
        scenarios: trendMatrix.scenarios.length,
        games: trendMatrix.summary.games,
        coveredTagIds: trendMatrix.summary.coveredTagIds,
        productSpread: round(trendMatrix.summary.productSpread),
        trendIds: TREND_CARDS.map((trend) => ({
          id: trend.id,
          name: trendNameById.get(trend.id) ?? trend.id
        }))
      },
      saleHealth: {
        games: saleHealth.games,
        sales: saleHealth.sales,
        noSaleRate: percent(saleHealth.noSaleRate),
        tipRateOfSales: percent(saleHealth.tipRateOfSales),
        averageMoney: {
          A: round(saleHealth.averageMoney.A),
          B: round(saleHealth.averageMoney.B)
        },
        productSpread: round(saleHealth.productRows.map((row) => row.sales).filter(Boolean).reduce((max, value) => Math.max(max, value), 0) /
          Math.max(1, Math.min(...saleHealth.productRows.map((row) => row.sales).filter(Boolean))))
      },
      noviceHandicap: {
        games: noviceHandicap.summary.games,
        noviceWinRate: percent(winRate(noviceHandicap.summary.noviceWins, noviceHandicap.summary.games)),
        strongWinRate: percent(winRate(noviceHandicap.summary.strongWins, noviceHandicap.summary.games)),
        drawRate: percent(winRate(noviceHandicap.summary.draws, noviceHandicap.summary.games)),
        byHandicap: noviceHandicapRows()
      }
    },
    null,
    2
  )
);
