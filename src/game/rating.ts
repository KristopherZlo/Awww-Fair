export interface PlayerRating {
  playerId: string;
  mmr: number;
  rankedGames: number;
  wins: number;
  losses: number;
  lastRankedAt: string | null;
}

export interface RankedPlayerResult {
  playerId: string;
  coins: number;
  sales: number;
}

export interface RankedResult {
  winnerId: string;
  loserId: string;
  winnerChange: number;
  loserChange: number;
  winnerNewMmr: number;
  loserNewMmr: number;
  winnerMmrBefore: number;
  loserMmrBefore: number;
}

export interface RankedMatchLog {
  matchId: string;
  playerAId: string;
  playerBId: string;
  playerADisplayName?: string;
  playerBDisplayName?: string;
  winnerId: string | null;
  loserId: string | null;
  playerACoins: number;
  playerBCoins: number;
  playerASales: number;
  playerBSales: number;
  playerAMmrBefore: number;
  playerBMmrBefore: number;
  playerAMmrAfter: number;
  playerBMmrAfter: number;
  mmrChange: number;
  firstPlayerId: string;
  isCalibration?: boolean;
  createdAt: string;
}

export const DEFAULT_PLAYER_RATING: Omit<PlayerRating, "playerId"> = {
  mmr: 1500,
  rankedGames: 0,
  wins: 0,
  losses: 0,
  lastRankedAt: null
};

export function getRankedWinner(players: [RankedPlayerResult, RankedPlayerResult] | RankedPlayerResult[]): string | null {
  const [a, b] = players;
  if (a.coins !== b.coins) {
    return a.coins > b.coins ? a.playerId : b.playerId;
  }
  if (a.sales !== b.sales) {
    return a.sales > b.sales ? a.playerId : b.playerId;
  }
  return null;
}

export function expectedScore(playerMmr: number, opponentMmr: number): number {
  return 1 / (1 + Math.pow(10, (opponentMmr - playerMmr) / 400));
}

export function getKFactor(rankedGames: number): number {
  if (rankedGames < 10) return 48;
  if (rankedGames < 30) return 32;
  if (rankedGames < 100) return 24;
  return 16;
}

export function getCoinMarginFactor(winnerCoins: number, loserCoins: number): number {
  const coinDiff = Math.max(0, winnerCoins - loserCoins);
  return 1 + Math.min(coinDiff, 10) * 0.015;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getSalesFactor(winnerSales: number, loserSales: number): number {
  return 1 + clamp(winnerSales - loserSales, -3, 3) * 0.01;
}

export function calculateMmrChange(params: {
  winnerMmr: number;
  loserMmr: number;
  winnerRankedGames: number;
  winnerCoins: number;
  loserCoins: number;
  winnerSales: number;
  loserSales: number;
  multiplier?: number;
}): number {
  const baseChange = getKFactor(params.winnerRankedGames) * (1 - expectedScore(params.winnerMmr, params.loserMmr));
  const finalChange =
    baseChange *
    getCoinMarginFactor(params.winnerCoins, params.loserCoins) *
    getSalesFactor(params.winnerSales, params.loserSales) *
    (params.multiplier ?? 1);
  return Math.max(1, Math.round(finalChange));
}

export function applyRankedResult(params: {
  winner: PlayerRating;
  loser: PlayerRating;
  winnerCoins: number;
  loserCoins: number;
  winnerSales: number;
  loserSales: number;
  now?: string;
  multiplier?: number;
}): RankedResult {
  const winnerMmrBefore = params.winner.mmr;
  const loserMmrBefore = params.loser.mmr;
  const change = calculateMmrChange({
    winnerMmr: winnerMmrBefore,
    loserMmr: loserMmrBefore,
    winnerRankedGames: params.winner.rankedGames,
    winnerCoins: params.winnerCoins,
    loserCoins: params.loserCoins,
    winnerSales: params.winnerSales,
    loserSales: params.loserSales,
    multiplier: params.multiplier
  });
  const rankedAt = params.now ?? new Date().toISOString();

  params.winner.mmr += change;
  params.loser.mmr -= change;
  params.winner.rankedGames += 1;
  params.loser.rankedGames += 1;
  params.winner.wins += 1;
  params.loser.losses += 1;
  params.winner.lastRankedAt = rankedAt;
  params.loser.lastRankedAt = rankedAt;

  return {
    winnerId: params.winner.playerId,
    loserId: params.loser.playerId,
    winnerChange: change,
    loserChange: -change,
    winnerNewMmr: params.winner.mmr,
    loserNewMmr: params.loser.mmr,
    winnerMmrBefore,
    loserMmrBefore
  };
}

export function buildRankedMatchLog(params: {
  matchId: string;
  playerA: PlayerRating;
  playerB: PlayerRating;
  playerACoins: number;
  playerBCoins: number;
  playerASales: number;
  playerBSales: number;
  firstPlayerId: string;
  createdAt: string;
  result: RankedResult | null;
}): RankedMatchLog {
  const aWon = params.result?.winnerId === params.playerA.playerId;
  return {
    matchId: params.matchId,
    playerAId: params.playerA.playerId,
    playerBId: params.playerB.playerId,
    winnerId: params.result?.winnerId ?? null,
    loserId: params.result?.loserId ?? null,
    playerACoins: params.playerACoins,
    playerBCoins: params.playerBCoins,
    playerASales: params.playerASales,
    playerBSales: params.playerBSales,
    playerAMmrBefore: aWon ? params.result?.winnerMmrBefore ?? params.playerA.mmr : params.result?.loserMmrBefore ?? params.playerA.mmr,
    playerBMmrBefore: aWon ? params.result?.loserMmrBefore ?? params.playerB.mmr : params.result?.winnerMmrBefore ?? params.playerB.mmr,
    playerAMmrAfter: params.playerA.mmr,
    playerBMmrAfter: params.playerB.mmr,
    mmrChange: params.result?.winnerChange ?? 0,
    firstPlayerId: params.firstPlayerId,
    createdAt: params.createdAt
  };
}
