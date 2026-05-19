import { runAiSkillCheck } from "../src/game/aiSkillCheck";

function numberArg(index: number, fallback: number) {
  const parsed = Number(process.argv[index]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

const games = numberArg(2, 1000);
const seed = numberArg(3, 90210);
const result = runAiSkillCheck({ games, seed });

console.log(
  JSON.stringify(
    {
      games: result.games,
      seed,
      strongWins: result.strongWins,
      randomWins: result.baselineWins,
      draws: result.draws,
      strongWinRate: percent(result.strongWinRate),
      randomWinRate: percent(result.baselineWinRate),
      noSaleRate: percent(result.noSaleRate),
      tipRateOfSales: percent(result.tipRateOfSales),
      goalsPerGame: Number(result.goalsPerGame.toFixed(2)),
      productSpread: Number(result.productSpread.toFixed(2))
    },
    null,
    2
  )
);
