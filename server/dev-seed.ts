import type { RankedMatchLog, PlayerRating } from "../src/game/rating";
import { CALIBRATION_MATCH_COUNT } from "./ranked-bots";
import type { RankedPlayerRating } from "./ranked";

export const DEV_PLAYER_USER_ID = "dev-player";

export function isSeededDevPlayerName(displayName: string): boolean {
  return displayName.trim().toLowerCase() === "player";
}

interface DevSeedUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

export const DEV_SEED_USERS: DevSeedUser[] = [
  { id: DEV_PLAYER_USER_ID, displayName: "player", avatarUrl: null, email: null },
  { id: "seed-mira", displayName: "Mira", avatarUrl: null, email: null },
  { id: "seed-nova", displayName: "Nova", avatarUrl: null, email: null },
  { id: "seed-riley", displayName: "Riley", avatarUrl: null, email: null },
  { id: "seed-kai", displayName: "Kai", avatarUrl: null, email: null }
];

export const DEV_SEED_RATINGS: Array<PlayerRating & Partial<RankedPlayerRating>> = [
  {
    playerId: DEV_PLAYER_USER_ID,
    displayName: "player",
    avatarUrl: null,
    isBot: false,
    mmr: 1548,
    rankedGames: 5,
    ratingGames: 5,
    calibrationGames: CALIBRATION_MATCH_COUNT,
    wins: 3,
    losses: 2,
    lastRankedAt: "2026-05-20T12:00:00.000Z"
  },
  {
    playerId: "seed-mira",
    displayName: "Mira",
    avatarUrl: null,
    isBot: false,
    mmr: 1630,
    rankedGames: 10,
    ratingGames: 10,
    calibrationGames: CALIBRATION_MATCH_COUNT,
    wins: 7,
    losses: 3,
    lastRankedAt: "2026-05-19T12:00:00.000Z"
  },
  {
    playerId: "seed-nova",
    displayName: "Nova",
    avatarUrl: null,
    isBot: false,
    mmr: 1586,
    rankedGames: 8,
    ratingGames: 8,
    calibrationGames: CALIBRATION_MATCH_COUNT,
    wins: 5,
    losses: 3,
    lastRankedAt: "2026-05-18T12:00:00.000Z"
  },
  {
    playerId: "seed-riley",
    displayName: "Riley",
    avatarUrl: null,
    isBot: false,
    mmr: 1492,
    rankedGames: 6,
    ratingGames: 6,
    calibrationGames: CALIBRATION_MATCH_COUNT,
    wins: 2,
    losses: 4,
    lastRankedAt: "2026-05-17T12:00:00.000Z"
  },
  {
    playerId: "seed-kai",
    displayName: "Kai",
    avatarUrl: null,
    isBot: false,
    mmr: 1410,
    rankedGames: 4,
    ratingGames: 4,
    calibrationGames: CALIBRATION_MATCH_COUNT,
    wins: 1,
    losses: 3,
    lastRankedAt: "2026-05-16T12:00:00.000Z"
  }
];

export const DEV_SEED_MATCH_LOGS: RankedMatchLog[] = [
  {
    matchId: "seed-player-match-1",
    playerAId: DEV_PLAYER_USER_ID,
    playerBId: "seed-riley",
    playerADisplayName: "player",
    playerBDisplayName: "Riley",
    winnerId: DEV_PLAYER_USER_ID,
    loserId: "seed-riley",
    playerACoins: 18,
    playerBCoins: 13,
    playerASales: 5,
    playerBSales: 3,
    playerAMmrBefore: 1500,
    playerBMmrBefore: 1512,
    playerAMmrAfter: 1524,
    playerBMmrAfter: 1488,
    mmrChange: 24,
    firstPlayerId: DEV_PLAYER_USER_ID,
    isCalibration: false,
    createdAt: "2026-05-18T12:00:00.000Z"
  },
  {
    matchId: "seed-player-match-2",
    playerAId: "seed-mira",
    playerBId: DEV_PLAYER_USER_ID,
    playerADisplayName: "Mira",
    playerBDisplayName: "player",
    winnerId: "seed-mira",
    loserId: DEV_PLAYER_USER_ID,
    playerACoins: 21,
    playerBCoins: 16,
    playerASales: 6,
    playerBSales: 4,
    playerAMmrBefore: 1604,
    playerBMmrBefore: 1524,
    playerAMmrAfter: 1630,
    playerBMmrAfter: 1500,
    mmrChange: 26,
    firstPlayerId: "seed-mira",
    isCalibration: false,
    createdAt: "2026-05-19T12:00:00.000Z"
  },
  {
    matchId: "seed-player-match-3",
    playerAId: DEV_PLAYER_USER_ID,
    playerBId: "seed-nova",
    playerADisplayName: "player",
    playerBDisplayName: "Nova",
    winnerId: DEV_PLAYER_USER_ID,
    loserId: "seed-nova",
    playerACoins: 24,
    playerBCoins: 18,
    playerASales: 7,
    playerBSales: 5,
    playerAMmrBefore: 1500,
    playerBMmrBefore: 1608,
    playerAMmrAfter: 1548,
    playerBMmrAfter: 1586,
    mmrChange: 48,
    firstPlayerId: DEV_PLAYER_USER_ID,
    isCalibration: false,
    createdAt: "2026-05-20T12:00:00.000Z"
  }
];

function sqlString(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

function sqlDateString(value: string | null): string {
  return sqlString(value ? value.replace("T", " ").replace(/Z$/, "") : null);
}

export function createDevSeedMigrationStatements(): string[] {
  return [
    ...DEV_SEED_USERS.map(
      (user) => `INSERT INTO users (id, display_name, avatar_url, email, is_bot)
       VALUES (${sqlString(user.id)}, ${sqlString(user.displayName)}, ${sqlString(user.avatarUrl)}, ${sqlString(user.email)}, FALSE)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), avatar_url = VALUES(avatar_url), email = VALUES(email), is_bot = FALSE`
    ),
    ...DEV_SEED_RATINGS.map(
      (rating) => `INSERT INTO player_ratings (player_id, mmr, ranked_games, rating_games, calibration_games, wins, losses, last_ranked_at)
       VALUES (${sqlString(rating.playerId)}, ${rating.mmr}, ${rating.rankedGames}, ${rating.ratingGames ?? rating.rankedGames}, ${rating.calibrationGames ?? CALIBRATION_MATCH_COUNT}, ${rating.wins}, ${rating.losses}, ${sqlDateString(rating.lastRankedAt)})
       ON DUPLICATE KEY UPDATE mmr = VALUES(mmr), ranked_games = VALUES(ranked_games), rating_games = VALUES(rating_games), calibration_games = VALUES(calibration_games), wins = VALUES(wins), losses = VALUES(losses), last_ranked_at = VALUES(last_ranked_at)`
    ),
    ...DEV_SEED_MATCH_LOGS.map(
      (match) => `INSERT INTO ranked_matches (
        id, player_a_id, player_b_id, winner_id, loser_id,
        player_a_coins, player_b_coins, player_a_sales, player_b_sales,
        player_a_mmr_before, player_b_mmr_before, player_a_mmr_after, player_b_mmr_after,
        mmr_change, first_player_id, seed, initial_state, status, created_at,
        is_calibration, is_bot_match, settled_at
      ) VALUES (
        ${sqlString(match.matchId)}, ${sqlString(match.playerAId)}, ${sqlString(match.playerBId)}, ${sqlString(match.winnerId)}, ${sqlString(match.loserId)},
        ${match.playerACoins}, ${match.playerBCoins}, ${match.playerASales}, ${match.playerBSales},
        ${match.playerAMmrBefore}, ${match.playerBMmrBefore}, ${match.playerAMmrAfter}, ${match.playerBMmrAfter},
        ${match.mmrChange}, ${sqlString(match.firstPlayerId)}, ${sqlString(`${match.matchId}-seed`)}, '{}', 'settled', ${sqlDateString(match.createdAt)},
        FALSE, FALSE, ${sqlDateString(match.createdAt)}
      )
       ON DUPLICATE KEY UPDATE winner_id = VALUES(winner_id), loser_id = VALUES(loser_id), player_a_coins = VALUES(player_a_coins), player_b_coins = VALUES(player_b_coins), player_a_sales = VALUES(player_a_sales), player_b_sales = VALUES(player_b_sales), player_a_mmr_after = VALUES(player_a_mmr_after), player_b_mmr_after = VALUES(player_b_mmr_after), mmr_change = VALUES(mmr_change), status = 'settled', settled_at = VALUES(settled_at)`
    )
  ];
}
