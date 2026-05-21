import crypto from "node:crypto";
import type { Pool } from "mariadb";
import { DEFAULT_PLAYER_RATING, applyRankedResult, buildRankedMatchLog, getRankedWinner, type RankedMatchLog } from "../src/game/rating";
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

export interface RankedMatchEvent {
  matchId: string;
  sequence: number;
  actorId: string;
  round: number;
  phase: string;
  eventType: string;
  payload: unknown;
  createdAt: number;
}

export interface RankedLeaderboardEntry {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  mmr: number;
  rankedGames: number;
  wins: number;
  losses: number;
}

export interface RankedStore {
  ratingForPlayer(playerId: string): Promise<PlayerRating>;
  waitingPlayers(): Promise<RankedQueueEntry[]>;
  addWaitingPlayer(entry: RankedQueueEntry): Promise<void>;
  removeWaitingPlayer(playerId: string): Promise<void>;
  createMatch(match: RankedMatch): Promise<void>;
  currentMatchForPlayer(playerId: string): Promise<RankedMatch | null>;
  matchById(matchId: string): Promise<RankedMatch | null>;
  recordMatchEvent(event: Omit<RankedMatchEvent, "sequence">): Promise<RankedMatchEvent>;
  recentSettledPairMatchCount(playerAId: string, playerBId: string, since: number): Promise<number>;
  settleMatch(log: RankedMatchLog, playerA: PlayerRating, playerB: PlayerRating): Promise<void>;
  leaderboard(limit: number): Promise<RankedLeaderboardEntry[]>;
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

  async recordEvent(
    actorId: string,
    event: { matchId: string; round: number; phase: string; eventType: string; payload: unknown }
  ): Promise<RankedMatchEvent> {
    const match = await this.options.store.matchById(event.matchId);
    if (!match || match.status !== "active" || (match.playerAId !== actorId && match.playerBId !== actorId)) {
      throw new Error("Active ranked match not found.");
    }
    return this.options.store.recordMatchEvent({ ...event, actorId, createdAt: this.options.now?.() ?? Date.now() });
  }

  async leaderboard(limit = 25): Promise<RankedLeaderboardEntry[]> {
    return this.options.store.leaderboard(limit);
  }

  async ratingForPlayer(playerId: string): Promise<PlayerRating> {
    return this.options.store.ratingForPlayer(playerId);
  }

  async settleMatch(
    actorId: string,
    result: { matchId: string; playerACoins: number; playerBCoins: number; playerASales: number; playerBSales: number }
  ): Promise<{ log: RankedMatchLog }> {
    const match = await this.options.store.matchById(result.matchId);
    if (!match || match.status !== "active" || (match.playerAId !== actorId && match.playerBId !== actorId)) {
      throw new Error("Active ranked match not found.");
    }
    const playerA = await this.options.store.ratingForPlayer(match.playerAId);
    const playerB = await this.options.store.ratingForPlayer(match.playerBId);
    const now = this.options.now?.() ?? Date.now();
    const recentPairMatches = await this.options.store.recentSettledPairMatchCount(
      match.playerAId,
      match.playerBId,
      now - 60 * 60 * 1000
    );
    const winnerId = getRankedWinner([
      { playerId: match.playerAId, coins: result.playerACoins, sales: result.playerASales },
      { playerId: match.playerBId, coins: result.playerBCoins, sales: result.playerBSales }
    ]);
    const rankedResult = winnerId
      ? applyRankedResult({
          winner: winnerId === match.playerAId ? playerA : playerB,
          loser: winnerId === match.playerAId ? playerB : playerA,
          winnerCoins: winnerId === match.playerAId ? result.playerACoins : result.playerBCoins,
          loserCoins: winnerId === match.playerAId ? result.playerBCoins : result.playerACoins,
          winnerSales: winnerId === match.playerAId ? result.playerASales : result.playerBSales,
          loserSales: winnerId === match.playerAId ? result.playerBSales : result.playerASales,
          now: new Date(now).toISOString(),
          multiplier: repeatMatchMultiplier(recentPairMatches)
        })
      : null;
    const log = buildRankedMatchLog({
      matchId: match.id,
      playerA,
      playerB,
      playerACoins: result.playerACoins,
      playerBCoins: result.playerBCoins,
      playerASales: result.playerASales,
      playerBSales: result.playerBSales,
      firstPlayerId: match.firstPlayerId,
      createdAt: new Date(match.createdAt).toISOString(),
      result: rankedResult
    });
    await this.options.store.settleMatch(log, playerA, playerB);
    return { log };
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
  private readonly events = new Map<string, RankedMatchEvent[]>();
  private readonly ratings = new Map<string, PlayerRating>();
  private readonly settledLogs: RankedMatchLog[] = [];

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

  async matchById(matchId: string): Promise<RankedMatch | null> {
    return this.matches.get(matchId) ?? null;
  }

  async recordMatchEvent(event: Omit<RankedMatchEvent, "sequence">): Promise<RankedMatchEvent> {
    const events = this.events.get(event.matchId) ?? [];
    const recorded = { ...event, sequence: events.length + 1 };
    events.push(recorded);
    this.events.set(event.matchId, events);
    return recorded;
  }

  async recentSettledPairMatchCount(playerAId: string, playerBId: string, since: number): Promise<number> {
    return this.settledLogs.filter((log) => {
      const samePair =
        (log.playerAId === playerAId && log.playerBId === playerBId) ||
        (log.playerAId === playerBId && log.playerBId === playerAId);
      return samePair && Date.parse(log.createdAt) >= since;
    }).length;
  }

  async settleMatch(log: RankedMatchLog, playerA: PlayerRating, playerB: PlayerRating): Promise<void> {
    this.ratings.set(playerA.playerId, { ...playerA });
    this.ratings.set(playerB.playerId, { ...playerB });
    this.settledLogs.push(log);
    const match = this.matches.get(log.matchId);
    if (match) {
      this.matches.set(log.matchId, { ...match, status: "settled" });
    }
  }

  async leaderboard(limit: number): Promise<RankedLeaderboardEntry[]> {
    return Array.from(this.ratings.values())
      .sort((left, right) => right.mmr - left.mmr)
      .slice(0, limit)
      .map((rating) => ({
        playerId: rating.playerId,
        displayName: rating.playerId,
        avatarUrl: null,
        mmr: rating.mmr,
        rankedGames: rating.rankedGames,
        wins: rating.wins,
        losses: rating.losses
      }));
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

  async matchById(matchId: string): Promise<RankedMatch | null> {
    const rows = await this.pool.query(
      `SELECT id, player_a_id AS playerAId, player_b_id AS playerBId,
        player_a_mmr_before AS playerAMmrBefore, player_b_mmr_before AS playerBMmrBefore,
        first_player_id AS firstPlayerId, seed, status, created_at AS createdAt
       FROM ranked_matches
       WHERE id = ?
       LIMIT 1`,
      [matchId]
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

  async recordMatchEvent(event: Omit<RankedMatchEvent, "sequence">): Promise<RankedMatchEvent> {
    const rows = await this.pool.query("SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM ranked_match_events WHERE match_id = ?", [event.matchId]);
    const sequence = Number(rows[0]?.nextSequence ?? 1);
    await this.pool.query(
      `INSERT INTO ranked_match_events (match_id, sequence, actor_id, round, phase, event_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.matchId, sequence, event.actorId, event.round, event.phase, event.eventType, JSON.stringify(event.payload), new Date(event.createdAt)]
    );
    return { ...event, sequence };
  }

  async recentSettledPairMatchCount(playerAId: string, playerBId: string, since: number): Promise<number> {
    const rows = await this.pool.query(
      `SELECT COUNT(*) AS matchCount
       FROM ranked_matches
       WHERE status = 'settled'
         AND created_at >= ?
         AND ((player_a_id = ? AND player_b_id = ?) OR (player_a_id = ? AND player_b_id = ?))`,
      [new Date(since), playerAId, playerBId, playerBId, playerAId]
    );
    return Number(rows[0]?.matchCount ?? 0);
  }

  async settleMatch(log: RankedMatchLog, playerA: PlayerRating, playerB: PlayerRating): Promise<void> {
    await this.pool.query(
      `UPDATE player_ratings
       SET mmr = ?, ranked_games = ?, wins = ?, losses = ?, last_ranked_at = ?
       WHERE player_id = ?`,
      [playerA.mmr, playerA.rankedGames, playerA.wins, playerA.losses, playerA.lastRankedAt, playerA.playerId]
    );
    await this.pool.query(
      `UPDATE player_ratings
       SET mmr = ?, ranked_games = ?, wins = ?, losses = ?, last_ranked_at = ?
       WHERE player_id = ?`,
      [playerB.mmr, playerB.rankedGames, playerB.wins, playerB.losses, playerB.lastRankedAt, playerB.playerId]
    );
    await this.pool.query(
      `UPDATE ranked_matches
       SET winner_id = ?, loser_id = ?, player_a_coins = ?, player_b_coins = ?,
         player_a_sales = ?, player_b_sales = ?, player_a_mmr_after = ?,
         player_b_mmr_after = ?, mmr_change = ?, status = 'settled', settled_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        log.winnerId,
        log.loserId,
        log.playerACoins,
        log.playerBCoins,
        log.playerASales,
        log.playerBSales,
        log.playerAMmrAfter,
        log.playerBMmrAfter,
        log.mmrChange,
        log.matchId
      ]
    );
  }

  async leaderboard(limit: number): Promise<RankedLeaderboardEntry[]> {
    const rows = await this.pool.query(
      `SELECT r.player_id AS playerId, u.display_name AS displayName, u.avatar_url AS avatarUrl,
        r.mmr, r.ranked_games AS rankedGames, r.wins, r.losses
       FROM player_ratings r
       JOIN users u ON u.id = r.player_id
       ORDER BY r.mmr DESC, r.ranked_games DESC
       LIMIT ?`,
      [limit]
    );
    return rows.map((row: RankedLeaderboardEntry) => ({
      playerId: row.playerId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? null,
      mmr: Number(row.mmr),
      rankedGames: Number(row.rankedGames),
      wins: Number(row.wins),
      losses: Number(row.losses)
    }));
  }
}
