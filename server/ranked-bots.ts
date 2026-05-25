export const CALIBRATION_MATCH_COUNT = 5;

export interface RankedBotProfile {
  id: string;
  displayName: string;
  mmr: number;
}

export const RANKED_BOTS: RankedBotProfile[] = [
  { id: "00000000-0000-4000-8000-000000000001", displayName: "Liam", mmr: 1320 },
  { id: "00000000-0000-4000-8000-000000000002", displayName: "Olivia", mmr: 1380 },
  { id: "00000000-0000-4000-8000-000000000003", displayName: "Noah", mmr: 1440 },
  { id: "00000000-0000-4000-8000-000000000004", displayName: "Emma", mmr: 1500 },
  { id: "00000000-0000-4000-8000-000000000005", displayName: "Oliver", mmr: 1560 },
  { id: "00000000-0000-4000-8000-000000000006", displayName: "Ava", mmr: 1620 },
  { id: "00000000-0000-4000-8000-000000000007", displayName: "Elijah", mmr: 1680 },
  { id: "00000000-0000-4000-8000-000000000008", displayName: "Sophia", mmr: 1740 },
  { id: "00000000-0000-4000-8000-000000000009", displayName: "Mateo", mmr: 1800 },
  { id: "00000000-0000-4000-8000-000000000010", displayName: "Mia", mmr: 1860 }
];

const CALIBRATION_DIFFICULTIES = [3, 8, 12, 16, 20] as const;

export function isRankedBotId(playerId: string): boolean {
  return RANKED_BOTS.some((bot) => bot.id === playerId);
}

export function botForCalibrationGame(calibrationGames: number): { bot: RankedBotProfile; difficulty: number } {
  const index = Math.max(0, Math.min(RANKED_BOTS.length - 1, calibrationGames));
  return {
    bot: RANKED_BOTS[index],
    difficulty: CALIBRATION_DIFFICULTIES[Math.min(calibrationGames, CALIBRATION_DIFFICULTIES.length - 1)]
  };
}

export function botForFallback(playerId: string, now: number): { bot: RankedBotProfile; difficulty: number } {
  let hash = now;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) >>> 0;
  }
  const bot = RANKED_BOTS[hash % RANKED_BOTS.length];
  return { bot, difficulty: 18 + (hash % 10) };
}
