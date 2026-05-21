import crypto from "node:crypto";
import type { Pool } from "mariadb";
import { DEFAULT_PLAYER_RATING } from "../src/game/rating";
import type { PlayerRating } from "../src/game/rating";

export type RankedMatchStatus = "active" | "settled" | "abandoned";

export interface RankedMatch {
  id: string;
  playerAId: string;
  playerBId: string;
  playerAMmrBefore: number;
  playerBMmrBefore: number;
  firstPlayerId: string;
  seed: string;
  status: RankedMatchStatus;
  createdAt: number;
}

export interface RankedQueueEntry {
  playerId: string;
  mmr: number;
  joinedAt: number;
}

export interface RankedStore {
  ratingForPlayer(playerId: string): Promise<PlayerRating>;
  waitingPlayers(): Promise<RankedQueueEntry[]>;
  addWaitingPlayer(entry: RankedQueueEntry): Promise<void>;
  removeWaitingPlayer(playerId: string): Promise<void>;
  createMatch(match: RankedMatch): Promise<void>;
  currentMatchForPlayer(playerId: string): Promise<RankedMatch | null>;
}

export function getAllowedMmrRange(waitSeconds: number): number {
  if (waitSeconds < 15) return 100;
  if (waitSeconds < 30) return 200;
  if (waitSeconds < 60) return 300;
  return 500;
}

export function repeatMatchMultiplier(recentPairMatchCount: number): number {
  return recentPairMatchCount > 3 ? 0.5 : 1;
}

export function leaveCooldownSeconds(leaveCount: number): number {
  if (leaveCount <= 1) return 0;
  if (leaveCount === 2) return 5 * 60;
  if (leaveCount === 3) return 30 * 60;
  return 60 * 60;
}

export class RankedService {
  constructor(
    private readonly options: {
      store: RankedStore;
      now?: () => number;
      idFactory?: () => string;
      seedFactory?: () => string;
    }
  ) {}

  async joinQueue(playerId: string): Promise<{ status: "waiting" } | { status: "matched"; match: RankedMatch }> {
    const now = this.options.now?.() ?? Date.now();
    const rating = await this.options.store.ratingForPlayer(playerId);
    const waiting = await this.options.store.waitingPlayers();
    const opponent = waiting.find((entry) => this.canMatch({ playerId, mmr: rating.mmr, joinedAt: now }, entry, now));

    if (!opponent) {
      await this.options.store.addWaitingPlayer({ playerId, mmr: rating.mmr, joinedAt: now });
      return { status: "waiting" };
    }

    const opponentRating = await this.options.store.ratingForPlayer(opponent.playerId);
    const match: RankedMatch = {
      id: this.options.idFactory?.() ?? crypto.randomUUID(),
      playerAId: opponent.playerId,
      playerBId: playerId,
      playerAMmrBefore: opponentRating.mmr,
      playerBMmrBefore: rating.mmr,
      firstPlayerId: Math.random() > 0.5 ? opponent.playerId : playerId,
      seed: this.options.seedFactory?.() ?? crypto.randomUUID(),
      status: "active",
      createdAt: now
    };
    await this.options.store.removeWaitingPlayer(opponent.playerId);
    await this.options.store.removeWaitingPlayer(playerId);
    await this.options.store.createMatch(match);
    return { status: "matched", match };
  }

  async cancelQueue(playerId: string): Promise<void> {
    await this.options.store.removeWaitingPlayer(playerId);
  }

  async statusForPlayer(playerId: string): Promise<{ status: "matched"; match: RankedMatch } | { status: "waiting" } | { status: "idle" }> {
    const match = await this.options.store.currentMatchForPlayer(playerId);
    if (match) {
      return { status: "matched", match };
    }
    const waiting = await this.options.store.waitingPlayers();
    return waiting.some((entry) => entry.playerId === playerId) ? { status: "waiting" } : { status: "idle" };
  }

  private canMatch(player: RankedQueueEntry, opponent: RankedQueueEntry, now: number) {
    const playerRange = getAllowedMmrRange((now - player.joinedAt) / 1000);
    const opponentRange = getAllowedMmrRange((now - opponent.joinedAt) / 1000);
    const mmrDiff = Math.abs(player.mmr - opponent.mmr);
    return mmrDiff <= Math.min(playerRange, opponentRange);
  }
}

export class MemoryRankedStore implements RankedStore {
  private readonly waiting = new Map<string, RankedQueueEntry>();
  private readonly matches = new Map<string, RankedMatch>();
  private readonly ratings = new Map<string, PlayerRating>();

  constructor(ratings: PlayerRating[] = []) {
    ratings.forEach((rating) => this.ratings.set(rating.playerId, { ...rating }));
  }

  async ratingForPlayer(playerId: string): Promise<PlayerRating> {
    const rating = this.ratings.get(playerId);
    if (!rating) {
      throw new Error("Player rating not found.");
    }
    return { ...rating };
  }

  async waitingPlayers(): Promise<RankedQueueEntry[]> {
    return Array.from(this.waiting.values());
  }

  async addWaitingPlayer(entry: RankedQueueEntry): Promise<void> {
    this.waiting.set(entry.playerId, entry);
  }

  async removeWaitingPlayer(playerId: string): Promise<void> {
    this.waiting.delete(playerId);
  }

  async createMatch(match: RankedMatch): Promise<void> {
    this.matches.set(match.id, match);
  }

  async currentMatchForPlayer(playerId: string): Promise<RankedMatch | null> {
    return Array.from(this.matches.values()).find((match) => match.status === "active" && (match.playerAId === playerId || match.playerBId === playerId)) ?? null;
  }
}

export class MariaDbRankedStore implements RankedStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async ratingForPlayer(playerId: string): Promise<PlayerRating> {
    await this.pool.query("INSERT INTO player_ratings (player_id) VALUES (?) ON DUPLICATE KEY UPDATE player_id = player_id", [playerId]);
    const rows = await this.pool.query(
      `SELECT player_id AS playerId, mmr, ranked_games AS rankedGames, wins, losses, last_ranked_at AS lastRankedAt
       FROM player_ratings
       WHERE player_id = ?
       LIMIT 1`,
      [playerId]
    );
    const row = rows[0];
    return {
      playerId,
      mmr: Number(row?.mmr ?? DEFAULT_PLAYER_RATING.mmr),
      rankedGames: Number(row?.rankedGames ?? DEFAULT_PLAYER_RATING.rankedGames),
      wins: Number(row?.wins ?? DEFAULT_PLAYER_RATING.wins),
      losses: Number(row?.losses ?? DEFAULT_PLAYER_RATING.losses),
      lastRankedAt: row?.lastRankedAt instanceof Date ? row.lastRankedAt.toISOString() : null
    };
  }

  async waitingPlayers(): Promise<RankedQueueEntry[]> {
    const rows = await this.pool.query("SELECT player_id AS playerId, mmr, joined_at AS joinedAt FROM ranked_queue ORDER BY joined_at ASC");
    return rows.map((row: { playerId: string; mmr: number; joinedAt: Date }) => ({
      playerId: row.playerId,
      mmr: Number(row.mmr),
      joinedAt: row.joinedAt instanceof Date ? row.joinedAt.getTime() : Date.now()
    }));
  }

  async addWaitingPlayer(entry: RankedQueueEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO ranked_queue (player_id, mmr, joined_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE mmr = VALUES(mmr), joined_at = VALUES(joined_at)`,
      [entry.playerId, entry.mmr, new Date(entry.joinedAt)]
    );
  }

  async removeWaitingPlayer(playerId: string): Promise<void> {
    await this.pool.query("DELETE FROM ranked_queue WHERE player_id = ?", [playerId]);
  }

  async createMatch(match: RankedMatch): Promise<void> {
    await this.pool.query(
      `INSERT INTO ranked_matches (
        id, player_a_id, player_b_id, player_a_mmr_before, player_b_mmr_before,
        first_player_id, seed, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id,
        match.playerAId,
        match.playerBId,
        match.playerAMmrBefore,
        match.playerBMmrBefore,
        match.firstPlayerId,
        match.seed,
        match.status,
        new Date(match.createdAt)
      ]
    );
  }

  async currentMatchForPlayer(playerId: string): Promise<RankedMatch | null> {
    const rows = await this.pool.query(
      `SELECT id, player_a_id AS playerAId, player_b_id AS playerBId,
        player_a_mmr_before AS playerAMmrBefore, player_b_mmr_before AS playerBMmrBefore,
        first_player_id AS firstPlayerId, seed, status, created_at AS createdAt
       FROM ranked_matches
       WHERE status = 'active' AND (player_a_id = ? OR player_b_id = ?)
       ORDER BY created_at DESC
       LIMIT 1`,
      [playerId, playerId]
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          playerAId: row.playerAId,
          playerBId: row.playerBId,
          playerAMmrBefore: Number(row.playerAMmrBefore),
          playerBMmrBefore: Number(row.playerBMmrBefore),
          firstPlayerId: row.firstPlayerId,
          seed: row.seed,
          status: row.status,
          createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Date.now()
        }
      : null;
  }
}
