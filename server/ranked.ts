import crypto from "node:crypto";
import type { Pool, PoolConnection } from "mariadb";
import type { GameState } from "../src/app/types";
import { chooseAiUpgrade, chooseWeakAiUpgrade, planAiPlanningTurnForDifficulty, type AiInfluenceMove } from "../src/game/ai";
import { PURCHASE_APPEAL_THRESHOLD } from "../src/game/engine";
import { DEFAULT_PLAYER_RATING, applyRankedResult, buildRankedMatchLog, getRankedWinner, type RankedMatchLog } from "../src/game/rating";
import { applyRankedReplayEvent, replayRankedEvents, type RankedReplayOutcome } from "../src/game/rankedReplay";
import { buildInitialState, seededRandom } from "../src/game/session";
import { DEFAULT_INITIAL_STATE_OPTIONS, RANKED_TURN_TIME_SECONDS } from "../src/game/sessionConfig";
import type { PlayerId } from "../src/game/types";
import type { PlayerRating } from "../src/game/rating";
import {
  CALIBRATION_MATCH_COUNT,
  RANKED_BOTS,
  botForCalibrationGame,
  botForFallback,
  isRankedBotId,
  type RankedBotProfile
} from "./ranked-bots";

export type RankedMatchStatus = "active" | "settled" | "abandoned";

export interface RankedMatch {
  id: string;
  playerAId: string;
  playerBId: string;
  playerAMmrBefore: number;
  playerBMmrBefore: number;
  firstPlayerId: string;
  seed: string;
  initialState: GameState;
  status: RankedMatchStatus;
  createdAt: number;
  playerADisconnectedAt: number | null;
  playerBDisconnectedAt: number | null;
  playerAReconnectDeadline: number | null;
  playerBReconnectDeadline: number | null;
  isCalibration: boolean;
  isBotMatch: boolean;
  botDifficulty: number | null;
}

export interface RankedQueueEntry {
  playerId: string;
  mmr: number;
  joinedAt: number;
  allowHuman: boolean;
  botMatchAt: number | null;
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

export interface RankedLeaderboardQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface RankedLeaderboardPage {
  leaderboard: RankedLeaderboardEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RankedPlayerRating extends PlayerRating {
  ratingGames: number;
  calibrationGames: number;
  displayName: string;
  avatarUrl: string | null;
  isBot: boolean;
}

export interface PublicPlayerRating {
  playerId: string;
  mmr: number | null;
  rankedGames: number;
  wins: number;
  losses: number;
  lastRankedAt: string | null;
  isCalibrating: boolean;
  calibrationGamesRemaining: number;
  penalty: PublicRankedPenalty;
}

export interface RankedLeavePenalty {
  leaveCount: number;
  cooldownUntil: number | null;
  cleanGamesSinceLeave: number;
}

export interface PublicRankedPenalty {
  leaveWarnings: number;
  cleanGamesUntilForgiven: number | null;
  cooldownUntil: number | null;
  queueBlocked: boolean;
}

type RankedMatchHistoryRow = Omit<RankedMatchLog, "createdAt"> & {
  createdAt: Date | string;
};
type MariaDbRankedConnection = Pick<PoolConnection, "beginTransaction" | "commit" | "rollback" | "release"> & {
  query(sql: string, values?: unknown[]): Promise<unknown>;
};
type MariaDbRankedPool = Pick<Pool, "query"> & {
  getConnection(): Promise<MariaDbRankedConnection>;
};

const RECONNECT_WINDOW_MS = 60 * 1000;
const FALLBACK_BOT_SEARCH_MS = 30 * 1000;
const CLEAN_GAMES_FOR_FORGIVENESS = 5;

export class RankedCooldownError extends Error {
  constructor(readonly penalty: PublicRankedPenalty) {
    super("Ranked cooldown is active.");
    this.name = "RankedCooldownError";
  }
}

type RankedBotDelayFactory = (params: { isCalibration: boolean; playerId: string; now: number }) => number;
type RankedSettlementInput = { playerACoins: number; playerBCoins: number; playerASales: number; playerBSales: number };
type PendingBotEvent = { actorId: string; eventType: string; payload: unknown };

function randomDelay(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

function defaultBotDelay({ isCalibration }: { isCalibration: boolean }): number {
  return isCalibration ? randomDelay(5_000, 20_000) : randomDelay(5_000, 30_000);
}

function defaultRankedRating(playerId: string, overrides: Partial<RankedPlayerRating> = {}): RankedPlayerRating {
  const bot = RANKED_BOTS.find((candidate) => candidate.id === playerId);
  return {
    playerId,
    ...DEFAULT_PLAYER_RATING,
    mmr: bot?.mmr ?? DEFAULT_PLAYER_RATING.mmr,
    ratingGames: 0,
    calibrationGames: bot ? CALIBRATION_MATCH_COUNT : 0,
    displayName: bot?.displayName ?? playerId,
    avatarUrl: null,
    isBot: Boolean(bot),
    ...overrides
  };
}

function normalizeRankedRating(rating: PlayerRating & Partial<RankedPlayerRating>, calibrateByDefault: boolean): RankedPlayerRating {
  const bot = RANKED_BOTS.find((candidate) => candidate.id === rating.playerId);
  return defaultRankedRating(rating.playerId, {
    ...rating,
    mmr: rating.mmr ?? bot?.mmr ?? DEFAULT_PLAYER_RATING.mmr,
    rankedGames: rating.rankedGames ?? DEFAULT_PLAYER_RATING.rankedGames,
    wins: rating.wins ?? DEFAULT_PLAYER_RATING.wins,
    losses: rating.losses ?? DEFAULT_PLAYER_RATING.losses,
    lastRankedAt: rating.lastRankedAt ?? null,
    ratingGames: rating.ratingGames ?? rating.rankedGames ?? 0,
    calibrationGames: rating.calibrationGames ?? (bot || calibrateByDefault ? CALIBRATION_MATCH_COUNT : 0),
    displayName: rating.displayName ?? bot?.displayName ?? rating.playerId,
    avatarUrl: rating.avatarUrl ?? null,
    isBot: rating.isBot ?? Boolean(bot)
  });
}

function publicPenaltyFromInternal(penalty: RankedLeavePenalty, now: number): PublicRankedPenalty {
  const leaveWarnings = Math.max(0, penalty.leaveCount);
  const cooldownUntil = penalty.cooldownUntil !== null && penalty.cooldownUntil > now ? penalty.cooldownUntil : null;
  return {
    leaveWarnings,
    cleanGamesUntilForgiven: leaveWarnings > 0 ? Math.max(0, CLEAN_GAMES_FOR_FORGIVENESS - penalty.cleanGamesSinceLeave) : null,
    cooldownUntil,
    queueBlocked: cooldownUntil !== null
  };
}

function publicRatingFromInternal(rating: RankedPlayerRating, penalty: PublicRankedPenalty): PublicPlayerRating {
  const calibrationGamesRemaining = Math.max(0, CALIBRATION_MATCH_COUNT - rating.calibrationGames);
  const isCalibrating = !rating.isBot && calibrationGamesRemaining > 0;
  return {
    playerId: rating.playerId,
    mmr: isCalibrating ? null : rating.mmr,
    rankedGames: isCalibrating ? 0 : rating.rankedGames,
    wins: isCalibrating ? 0 : rating.wins,
    losses: isCalibrating ? 0 : rating.losses,
    lastRankedAt: rating.lastRankedAt,
    isCalibrating,
    calibrationGamesRemaining,
    penalty
  };
}

function normalizeLeaderboardQuery(query: RankedLeaderboardQuery = {}): Required<RankedLeaderboardQuery> {
  const page = Number.isFinite(query.page) ? Math.max(1, Math.floor(query.page ?? 1)) : 1;
  const pageSize = Number.isFinite(query.pageSize) ? Math.max(1, Math.min(100, Math.floor(query.pageSize ?? 25))) : 25;
  return { page, pageSize, search: query.search?.trim() ?? "" };
}

function withRankedMatchDefaults(match: RankedMatch): RankedMatch {
  return {
    ...match,
    playerAReconnectDeadline: match.playerAReconnectDeadline ?? null,
    playerBReconnectDeadline: match.playerBReconnectDeadline ?? null,
    isCalibration: match.isCalibration ?? false,
    isBotMatch: match.isBotMatch ?? false,
    botDifficulty: match.botDifficulty ?? null
  };
}

function withRankedQueueDefaults(entry: RankedQueueEntry): RankedQueueEntry {
  return {
    ...entry,
    allowHuman: entry.allowHuman ?? true,
    botMatchAt: entry.botMatchAt ?? null
  };
}

function withRankedLeavePenaltyDefaults(penalty: Partial<RankedLeavePenalty> = {}): RankedLeavePenalty {
  return {
    leaveCount: penalty.leaveCount ?? 0,
    cooldownUntil: penalty.cooldownUntil ?? null,
    cleanGamesSinceLeave: penalty.cleanGamesSinceLeave ?? 0
  };
}

function createRankedInitialState(seed: string): GameState {
  return {
    ...buildInitialState(true, RANKED_TURN_TIME_SECONDS, DEFAULT_INITIAL_STATE_OPTIONS, seededRandom(seed)),
    phase: "planning"
  };
}

function parseInitialState(value: unknown, seed: string): GameState {
  if (!value) {
    return createRankedInitialState(seed);
  }
  return (typeof value === "string" ? JSON.parse(value) : value) as GameState;
}

function dateValueToMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function disconnectedAtFor(match: RankedMatch, playerId: string): number | null {
  if (match.playerAId === playerId) return match.playerADisconnectedAt;
  if (match.playerBId === playerId) return match.playerBDisconnectedAt;
  return null;
}

function reconnectDeadlineFor(match: RankedMatch, playerId: string): number | null {
  if (match.playerAId === playerId) return match.playerAReconnectDeadline;
  if (match.playerBId === playerId) return match.playerBReconnectDeadline;
  return null;
}

function sameRankedOutcome(
  replay: RankedReplayOutcome,
  submitted: { playerACoins: number; playerBCoins: number; playerASales: number; playerBSales: number }
): boolean {
  return (
    replay.playerACoins === submitted.playerACoins &&
    replay.playerBCoins === submitted.playerBCoins &&
    replay.playerASales === submitted.playerASales &&
    replay.playerBSales === submitted.playerBSales
  );
}

export interface RankedStore {
  ratingForPlayer(playerId: string): Promise<RankedPlayerRating>;
  leavePenaltyForPlayer(playerId: string): Promise<RankedLeavePenalty>;
  recordLeavePenalty(playerId: string, penalty: RankedLeavePenalty): Promise<void>;
  waitingPlayers(): Promise<RankedQueueEntry[]>;
  addWaitingPlayer(entry: RankedQueueEntry): Promise<void>;
  removeWaitingPlayer(playerId: string): Promise<void>;
  createMatch(match: RankedMatch): Promise<void>;
  currentMatchForPlayer(playerId: string): Promise<RankedMatch | null>;
  matchById(matchId: string): Promise<RankedMatch | null>;
  setPlayerDisconnectedAt(matchId: string, playerId: string, disconnectedAt: number | null, reconnectDeadline?: number | null): Promise<void>;
  recordMatchEvent(event: Omit<RankedMatchEvent, "sequence">): Promise<RankedMatchEvent>;
  eventsForMatch(matchId: string): Promise<RankedMatchEvent[]>;
  recentSettledPairMatchCount(playerAId: string, playerBId: string, since: number): Promise<number>;
  matchHistoryForPlayer(playerId: string, limit: number): Promise<RankedMatchLog[]>;
  settleMatch(
    log: RankedMatchLog,
    playerA: PlayerRating & Partial<RankedPlayerRating>,
    playerB: PlayerRating & Partial<RankedPlayerRating>
  ): Promise<void>;
  leaderboard(query?: RankedLeaderboardQuery): Promise<RankedLeaderboardPage>;
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
  if (leaveCount <= 2) return 0;
  if (leaveCount === 3) return 3 * 60;
  if (leaveCount === 4) return 10 * 60;
  if (leaveCount === 5) return 15 * 60;
  return 60 * 60;
}

export class RankedService {
  constructor(
    private readonly options: {
      store: RankedStore;
      now?: () => number;
      idFactory?: () => string;
      seedFactory?: () => string;
      botDelayFactory?: RankedBotDelayFactory;
    }
  ) {}

  async joinQueue(playerId: string): Promise<{ status: "waiting" } | { status: "matched"; match: RankedMatch }> {
    const now = this.options.now?.() ?? Date.now();
    await this.ensureCanJoinQueue(playerId, now);
    const activeMatch = await this.options.store.currentMatchForPlayer(playerId);
    if (activeMatch) {
      return { status: "matched", match: activeMatch };
    }
    const rating = await this.options.store.ratingForPlayer(playerId);
    const isCalibration = !rating.isBot && rating.calibrationGames < CALIBRATION_MATCH_COUNT;
    const waitingEntry: RankedQueueEntry = {
      playerId,
      mmr: rating.mmr,
      joinedAt: now,
      allowHuman: !isCalibration,
      botMatchAt: isCalibration ? now + this.botDelay({ isCalibration: true, playerId, now }) : now + FALLBACK_BOT_SEARCH_MS + this.botDelay({ isCalibration: false, playerId, now })
    };
    const waiting = await this.options.store.waitingPlayers();
    const existing = waiting.find((entry) => entry.playerId === playerId);
    if (existing) {
      return this.statusForPlayer(playerId).then((status) => (status.status === "idle" ? { status: "waiting" } : status));
    }
    const opponent = isCalibration
      ? null
      : waiting.map(withRankedQueueDefaults).find((entry) => entry.allowHuman && this.canMatch(waitingEntry, entry, now));

    if (!opponent) {
      await this.options.store.addWaitingPlayer(waitingEntry);
      return { status: "waiting" };
    }

    const match = await this.createHumanMatch(opponent.playerId, playerId, now);
    return { status: "matched", match };
  }

  async cancelQueue(playerId: string): Promise<void> {
    await this.options.store.removeWaitingPlayer(playerId);
  }

  async statusForPlayer(playerId: string): Promise<{ status: "matched"; match: RankedMatch } | { status: "waiting" } | { status: "idle" }> {
    const match = await this.options.store.currentMatchForPlayer(playerId);
    if (match) {
      if (await this.settleExpiredDisconnect(match)) {
        return { status: "idle" };
      }
      await this.recordPendingBotEvents(match.id);
      return { status: "matched", match };
    }
    const waiting = await this.options.store.waitingPlayers();
    const ownEntry = waiting.map(withRankedQueueDefaults).find((entry) => entry.playerId === playerId);
    if (!ownEntry) {
      return { status: "idle" };
    }
    const now = this.options.now?.() ?? Date.now();
    if (ownEntry.allowHuman) {
      const opponent = waiting
        .map(withRankedQueueDefaults)
        .find((entry) => entry.playerId !== playerId && entry.allowHuman && this.canMatch(ownEntry, entry, now));
      if (opponent) {
        return { status: "matched", match: await this.createHumanMatch(opponent.playerId, playerId, now) };
      }
    }
    if (ownEntry.botMatchAt !== null && now >= ownEntry.botMatchAt) {
      return { status: "matched", match: await this.createBotMatch(playerId, now) };
    }
    return { status: "waiting" };
  }

  async disconnectFromMatch(actorId: string, matchId: string): Promise<{ status: "reconnect_window"; reconnectUntil: number }> {
    const match = await this.requireActiveMatch(actorId, matchId);
    const now = this.options.now?.() ?? Date.now();
    const reconnectUntil = reconnectDeadlineFor(match, actorId) ?? now + RECONNECT_WINDOW_MS;
    await this.options.store.setPlayerDisconnectedAt(match.id, actorId, now, reconnectUntil);
    return { status: "reconnect_window", reconnectUntil };
  }

  async abandonMatch(actorId: string, matchId: string): Promise<{ log: RankedMatchLog }> {
    const match = await this.requireActiveMatch(actorId, matchId);
    return this.settleDisconnectLoss(match, actorId);
  }

  async reconnectToMatch(actorId: string, matchId: string): Promise<{ status: "matched"; match: RankedMatch }> {
    const match = await this.requireActiveMatch(actorId, matchId);
    const disconnectedAt = disconnectedAtFor(match, actorId);
    if (disconnectedAt !== null && this.reconnectExpired(disconnectedAt, reconnectDeadlineFor(match, actorId))) {
      await this.settleDisconnectLoss(match, actorId);
      throw new Error("Reconnect window expired.");
    }
    await this.options.store.setPlayerDisconnectedAt(match.id, actorId, null);
    const refreshedMatch = await this.options.store.matchById(match.id);
    if (!refreshedMatch || refreshedMatch.status !== "active") {
      throw new Error("Active ranked match not found.");
    }
    return { status: "matched", match: refreshedMatch };
  }

  async recordEvent(
    actorId: string,
    event: { matchId: string; round: number; phase: string; eventType: string; payload: unknown }
  ): Promise<RankedMatchEvent> {
    const match = await this.options.store.matchById(event.matchId);
    if (!match || match.status !== "active" || (match.playerAId !== actorId && match.playerBId !== actorId)) {
      throw new Error("Active ranked match not found.");
    }
    await this.assertRankedEventCanReplay(match, { actorId, eventType: event.eventType, payload: event.payload });
    const recorded = await this.options.store.recordMatchEvent({ ...event, actorId, createdAt: this.options.now?.() ?? Date.now() });
    await this.recordPendingBotEvents(match.id);
    return recorded;
  }

  async eventsForPlayer(actorId: string, matchId: string, afterSequence = 0): Promise<RankedMatchEvent[]> {
    const match = await this.requireActiveMatch(actorId, matchId);
    await this.recordPendingBotEvents(match.id);
    const events = await this.options.store.eventsForMatch(match.id);
    return events.filter((event) => event.sequence > afterSequence);
  }

  async leaderboard(query: RankedLeaderboardQuery = {}): Promise<RankedLeaderboardPage> {
    return this.options.store.leaderboard(query);
  }

  async ratingForPlayer(playerId: string): Promise<RankedPlayerRating> {
    return this.options.store.ratingForPlayer(playerId);
  }

  async publicRatingForPlayer(playerId: string): Promise<PublicPlayerRating> {
    const now = this.options.now?.() ?? Date.now();
    const [rating, penalty] = await Promise.all([
      this.options.store.ratingForPlayer(playerId),
      this.options.store.leavePenaltyForPlayer(playerId)
    ]);
    return publicRatingFromInternal(rating, publicPenaltyFromInternal(penalty, now));
  }

  async matchHistoryForPlayer(playerId: string, limit = 20): Promise<RankedMatchLog[]> {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;
    return this.options.store.matchHistoryForPlayer(playerId, normalizedLimit);
  }

  async settleMatch(
    actorId: string,
    result: { matchId: string; playerACoins: number; playerBCoins: number; playerASales: number; playerBSales: number }
  ): Promise<{ log: RankedMatchLog }> {
    const match = await this.requireActiveMatch(actorId, result.matchId);
    const trustedResult = await this.verifiedReplayResult(match, result);
    return this.settleActiveMatch(match, trustedResult);
  }

  private async settleActiveMatch(
    match: RankedMatch,
    result: RankedSettlementInput,
    forcedWinnerId?: string
  ): Promise<{ log: RankedMatchLog }> {
    const playerA = await this.options.store.ratingForPlayer(match.playerAId);
    const playerB = await this.options.store.ratingForPlayer(match.playerBId);
    const now = this.options.now?.() ?? Date.now();
    const recentPairMatches = await this.options.store.recentSettledPairMatchCount(
      match.playerAId,
      match.playerBId,
      now - 60 * 60 * 1000
    );
    const winnerId =
      forcedWinnerId ??
      getRankedWinner([
        { playerId: match.playerAId, coins: result.playerACoins, sales: result.playerASales },
        { playerId: match.playerBId, coins: result.playerBCoins, sales: result.playerBSales }
      ]);
    const rankedAt = new Date(now).toISOString();
    const rankedResult = winnerId ? this.applyRankedSettlement(match, playerA, playerB, result, winnerId, rankedAt, repeatMatchMultiplier(recentPairMatches)) : null;
    if (!winnerId) {
      this.recordDrawSettlement(match, playerA, playerB, rankedAt);
    }
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
    log.playerADisplayName = playerA.displayName;
    log.playerBDisplayName = playerB.displayName;
    log.isCalibration = match.isCalibration;
    await this.options.store.settleMatch(log, playerA, playerB);
    if (!forcedWinnerId) {
      await this.recordCleanRankedCompletion(playerA);
      await this.recordCleanRankedCompletion(playerB);
    }
    return { log };
  }

  private applyRankedSettlement(
    match: RankedMatch,
    playerA: RankedPlayerRating,
    playerB: RankedPlayerRating,
    result: RankedSettlementInput,
    winnerId: string,
    rankedAt: string,
    multiplier: number
  ) {
    const winner = winnerId === match.playerAId ? playerA : playerB;
    const loser = winnerId === match.playerAId ? playerB : playerA;
    const winnerPublicBefore = { rankedGames: winner.rankedGames, wins: winner.wins, losses: winner.losses };
    const loserPublicBefore = { rankedGames: loser.rankedGames, wins: loser.wins, losses: loser.losses };
    const winnerForMmr: PlayerRating = { ...winner, rankedGames: winner.ratingGames };
    const loserForMmr: PlayerRating = { ...loser, rankedGames: loser.ratingGames };
    const rankedResult = applyRankedResult({
      winner: winnerForMmr,
      loser: loserForMmr,
      winnerCoins: winnerId === match.playerAId ? result.playerACoins : result.playerBCoins,
      loserCoins: winnerId === match.playerAId ? result.playerBCoins : result.playerACoins,
      winnerSales: winnerId === match.playerAId ? result.playerASales : result.playerBSales,
      loserSales: winnerId === match.playerAId ? result.playerBSales : result.playerASales,
      now: rankedAt,
      multiplier
    });

    this.applyInternalMmr(winner, winnerForMmr, rankedAt);
    this.applyInternalMmr(loser, loserForMmr, rankedAt);

    if (match.isCalibration && !winner.isBot) {
      winner.calibrationGames = Math.min(CALIBRATION_MATCH_COUNT, winner.calibrationGames + 1);
    } else if (!winner.isBot) {
      winner.rankedGames = winnerPublicBefore.rankedGames + 1;
      winner.wins = winnerPublicBefore.wins + 1;
      winner.losses = winnerPublicBefore.losses;
    }
    if (match.isCalibration && !loser.isBot) {
      loser.calibrationGames = Math.min(CALIBRATION_MATCH_COUNT, loser.calibrationGames + 1);
    } else if (!loser.isBot) {
      loser.rankedGames = loserPublicBefore.rankedGames + 1;
      loser.wins = loserPublicBefore.wins;
      loser.losses = loserPublicBefore.losses + 1;
    }
    return rankedResult;
  }

  private applyInternalMmr(target: RankedPlayerRating, updated: PlayerRating, rankedAt: string) {
    target.mmr = updated.mmr;
    target.ratingGames += 1;
    target.lastRankedAt = rankedAt;
  }

  private recordDrawSettlement(match: RankedMatch, playerA: RankedPlayerRating, playerB: RankedPlayerRating, rankedAt: string) {
    for (const player of [playerA, playerB]) {
      player.ratingGames += 1;
      player.lastRankedAt = rankedAt;
      if (match.isCalibration && !player.isBot) {
        player.calibrationGames = Math.min(CALIBRATION_MATCH_COUNT, player.calibrationGames + 1);
      } else if (!player.isBot) {
        player.rankedGames += 1;
      }
    }
  }

  private async verifiedReplayResult(match: RankedMatch, submitted: RankedSettlementInput): Promise<RankedSettlementInput> {
    await this.recordPendingBotEvents(match.id);
    const events = await this.options.store.eventsForMatch(match.id);
    if (events.length === 0) {
      throw new Error("Ranked replay is incomplete.");
    }
    let replayOutcome: RankedReplayOutcome;
    try {
      replayOutcome = replayRankedEvents(
        match.initialState,
        events.map((event) => ({ actorId: event.actorId, eventType: event.eventType, payload: event.payload })),
        { playerAId: match.playerAId, playerBId: match.playerBId }
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Ranked replay did not reach game end.") {
        throw new Error("Ranked replay is incomplete.");
      }
      throw error;
    }
    if (!sameRankedOutcome(replayOutcome, submitted)) {
      throw new Error("Ranked replay result mismatch.");
    }
    return replayOutcome;
  }

  private async assertRankedEventCanReplay(match: RankedMatch, event: { actorId: string; eventType: string; payload: unknown }): Promise<void> {
    const events = await this.options.store.eventsForMatch(match.id);
    try {
      [...events.map((recorded) => ({ actorId: recorded.actorId, eventType: recorded.eventType, payload: recorded.payload })), event].reduce(
        (current, replayEvent) => applyRankedReplayEvent(current, replayEvent, { playerAId: match.playerAId, playerBId: match.playerBId }),
        match.initialState
      );
    } catch {
      throw new Error("Invalid ranked event.");
    }
  }

  private botDelay(params: { isCalibration: boolean; playerId: string; now: number }): number {
    return this.options.botDelayFactory?.(params) ?? defaultBotDelay(params);
  }

  private botSeatFor(match: RankedMatch): PlayerId | null {
    if (isRankedBotId(match.playerAId)) return "A";
    if (isRankedBotId(match.playerBId)) return "B";
    return null;
  }

  private actorIdForSeat(match: RankedMatch, seat: PlayerId): string {
    return seat === "A" ? match.playerAId : match.playerBId;
  }

  private async replayStateForMatch(match: RankedMatch): Promise<GameState> {
    const events = await this.options.store.eventsForMatch(match.id);
    return events.reduce(
      (current, event) =>
        applyRankedReplayEvent(current, { actorId: event.actorId, eventType: event.eventType, payload: event.payload }, { playerAId: match.playerAId, playerBId: match.playerBId }),
      match.initialState
    );
  }

  private botPlanningEvent(match: RankedMatch, state: GameState, botSeat: PlayerId): PendingBotEvent {
    const botActorId = this.actorIdForSeat(match, botSeat);
    if (state.choiceDraft?.playerId === botSeat) {
      return { actorId: botActorId, eventType: "keep_draft_card", payload: { index: 0 } };
    }

    const plan = planAiPlanningTurnForDifficulty(
      {
        players: state.players,
        currentCustomers: state.currentCustomers,
        activeTrends: state.activeTrends,
        playedInfluences: state.playedInfluences,
        roundBonuses: state.roundBonuses,
        productDeckLength: state.productDeck.length,
        influenceDeckLength: state.influenceDeck.length,
        purchaseAppealThreshold: PURCHASE_APPEAL_THRESHOLD,
        firstPlayer: state.firstPlayer,
        round: state.round
      },
      botSeat,
      match.botDifficulty ?? 14
    );

    if (plan.productMove) {
      return {
        actorId: botActorId,
        eventType: "place_product",
        payload: { productInstanceId: plan.productMove.productInstanceId, slotIndex: plan.productMove.slotIndex }
      };
    }
    if (plan.influenceMove) {
      return { actorId: botActorId, eventType: "play_influence", payload: this.botInfluencePayload(plan.influenceMove) };
    }
    if (plan.tableBonusMove) {
      return { actorId: botActorId, eventType: "use_ad_table", payload: { slotIndex: plan.tableBonusMove.slotIndex } };
    }
    return { actorId: botActorId, eventType: "ready", payload: {} };
  }

  private botInfluencePayload(move: AiInfluenceMove): { cardId: string; target?: { tag?: unknown; ownerId?: PlayerId; slotIndex?: number } } {
    const target =
      move.targetTag || move.targetOwnerId || move.targetSlotIndex !== undefined
        ? { tag: move.targetTag, ownerId: move.targetOwnerId, slotIndex: move.targetSlotIndex }
        : undefined;
    return { cardId: move.cardId, ...(target ? { target } : {}) };
  }

  private botUpgradeEvent(match: RankedMatch, state: GameState, botSeat: PlayerId): PendingBotEvent {
    const botActorId = this.actorIdForSeat(match, botSeat);
    const buyer = state.players.find((player) => player.id === botSeat);
    const choice = buyer
      ? (match.botDifficulty ?? 14) <= 10
        ? chooseWeakAiUpgrade(buyer, state.upgradeOffer)
        : chooseAiUpgrade(buyer, state.upgradeOffer)
      : null;
    return choice
      ? { actorId: botActorId, eventType: "buy_upgrade", payload: { upgradeId: choice.upgradeId } }
      : { actorId: botActorId, eventType: "skip_upgrade", payload: {} };
  }

  private nextBotEvent(match: RankedMatch, state: GameState): PendingBotEvent | null {
    const botSeat = this.botSeatFor(match);
    if (!botSeat || state.phase === "game_end") {
      return null;
    }
    if (state.choiceDraft) {
      return state.choiceDraft.playerId === botSeat ? this.botPlanningEvent(match, state, botSeat) : null;
    }
    if (state.phase === "planning" && state.activePlayer === botSeat) {
      return this.botPlanningEvent(match, state, botSeat);
    }
    if (state.phase === "upgrade" && state.upgradeQueue[0] === botSeat) {
      return this.botUpgradeEvent(match, state, botSeat);
    }
    return null;
  }

  private async recordPendingBotEvents(matchId: string): Promise<void> {
    let match = await this.options.store.matchById(matchId);
    if (!match || match.status !== "active" || !match.isBotMatch) {
      return;
    }

    for (let guard = 0; guard < 128; guard += 1) {
      const state = await this.replayStateForMatch(match);
      const event = this.nextBotEvent(match, state);
      if (!event) {
        return;
      }
      await this.options.store.recordMatchEvent({
        matchId: match.id,
        actorId: event.actorId,
        round: state.round,
        phase: state.phase,
        eventType: event.eventType,
        payload: event.payload,
        createdAt: this.options.now?.() ?? Date.now()
      });
      match = (await this.options.store.matchById(matchId)) ?? match;
      if (match.status !== "active") {
        return;
      }
    }
    throw new Error("Ranked bot replay did not stabilize.");
  }

  private async createHumanMatch(playerAId: string, playerBId: string, now: number): Promise<RankedMatch> {
    const playerA = await this.options.store.ratingForPlayer(playerAId);
    const playerB = await this.options.store.ratingForPlayer(playerBId);
    const seed = this.options.seedFactory?.() ?? crypto.randomUUID();
    const initialState = createRankedInitialState(seed);
    const match: RankedMatch = {
      id: this.options.idFactory?.() ?? crypto.randomUUID(),
      playerAId,
      playerBId,
      playerAMmrBefore: playerA.mmr,
      playerBMmrBefore: playerB.mmr,
      firstPlayerId: initialState.firstPlayer === "A" ? playerAId : playerBId,
      seed,
      initialState,
      status: "active",
      createdAt: now,
      playerADisconnectedAt: null,
      playerBDisconnectedAt: null,
      playerAReconnectDeadline: null,
      playerBReconnectDeadline: null,
      isCalibration: false,
      isBotMatch: false,
      botDifficulty: null
    };
    await this.options.store.removeWaitingPlayer(playerAId);
    await this.options.store.removeWaitingPlayer(playerBId);
    await this.options.store.createMatch(match);
    return match;
  }

  private async createBotMatch(playerId: string, now: number): Promise<RankedMatch> {
    const player = await this.options.store.ratingForPlayer(playerId);
    const calibration = !player.isBot && player.calibrationGames < CALIBRATION_MATCH_COUNT;
    const botSelection = calibration ? botForCalibrationGame(player.calibrationGames) : botForFallback(playerId, now);
    const botRating = await this.ratingForBot(botSelection.bot);
    const seed = this.options.seedFactory?.() ?? crypto.randomUUID();
    const initialState = {
      ...createRankedInitialState(seed),
      aiPlayerId: "B" as const,
      aiMode: null,
      aiDifficulty: botSelection.difficulty,
      aiIntent: null
    };
    const match: RankedMatch = {
      id: this.options.idFactory?.() ?? crypto.randomUUID(),
      playerAId: player.playerId,
      playerBId: botRating.playerId,
      playerAMmrBefore: player.mmr,
      playerBMmrBefore: botRating.mmr,
      firstPlayerId: initialState.firstPlayer === "A" ? player.playerId : botRating.playerId,
      seed,
      initialState: this.initialStateWithNames(initialState, player, botRating),
      status: "active",
      createdAt: now,
      playerADisconnectedAt: null,
      playerBDisconnectedAt: null,
      playerAReconnectDeadline: null,
      playerBReconnectDeadline: null,
      isCalibration: calibration,
      isBotMatch: true,
      botDifficulty: botSelection.difficulty
    };
    await this.options.store.removeWaitingPlayer(playerId);
    await this.options.store.createMatch(match);
    return match;
  }

  private async ratingForBot(bot: RankedBotProfile): Promise<RankedPlayerRating> {
    const stored = await this.options.store.ratingForPlayer(bot.id);
    return { ...stored, displayName: bot.displayName, isBot: true, calibrationGames: CALIBRATION_MATCH_COUNT };
  }

  private initialStateWithNames(initialState: GameState, playerA: RankedPlayerRating, playerB: RankedPlayerRating): GameState {
    return {
      ...initialState,
      players: initialState.players.map((player) =>
        player.id === "A" ? { ...player, name: playerA.displayName } : player.id === "B" ? { ...player, name: playerB.displayName } : player
      )
    };
  }

  private async settleExpiredDisconnect(match: RankedMatch): Promise<boolean> {
    const disconnectedPlayerId =
      match.playerADisconnectedAt !== null && this.reconnectExpired(match.playerADisconnectedAt, match.playerAReconnectDeadline)
        ? match.playerAId
        : match.playerBDisconnectedAt !== null && this.reconnectExpired(match.playerBDisconnectedAt, match.playerBReconnectDeadline)
          ? match.playerBId
          : null;
    if (!disconnectedPlayerId) {
      return false;
    }
    await this.settleDisconnectLoss(match, disconnectedPlayerId);
    return true;
  }

  private async settleDisconnectLoss(match: RankedMatch, loserId: string): Promise<{ log: RankedMatchLog }> {
    const winnerId = loserId === match.playerAId ? match.playerBId : match.playerAId;
    const settlement = await this.settleActiveMatch(
      match,
      { playerACoins: 0, playerBCoins: 0, playerASales: 0, playerBSales: 0 },
      winnerId
    );
    await this.recordLeavePenalty(loserId);
    return settlement;
  }

  private reconnectExpired(disconnectedAt: number, reconnectDeadline: number | null): boolean {
    return (this.options.now?.() ?? Date.now()) >= (reconnectDeadline ?? disconnectedAt + RECONNECT_WINDOW_MS);
  }

  private async ensureCanJoinQueue(playerId: string, now: number): Promise<void> {
    const penalty = await this.options.store.leavePenaltyForPlayer(playerId);
    if (penalty.cooldownUntil !== null && penalty.cooldownUntil > now) {
      throw new RankedCooldownError(publicPenaltyFromInternal(penalty, now));
    }
  }

  private async recordLeavePenalty(playerId: string): Promise<void> {
    const now = this.options.now?.() ?? Date.now();
    const current = withRankedLeavePenaltyDefaults(await this.options.store.leavePenaltyForPlayer(playerId));
    const leaveCount = current.leaveCount + 1;
    const cooldownSeconds = leaveCooldownSeconds(leaveCount);
    await this.options.store.recordLeavePenalty(playerId, {
      leaveCount,
      cooldownUntil: cooldownSeconds > 0 ? now + cooldownSeconds * 1000 : null,
      cleanGamesSinceLeave: 0
    });
  }

  private async recordCleanRankedCompletion(player: RankedPlayerRating): Promise<void> {
    if (player.isBot) {
      return;
    }

    const now = this.options.now?.() ?? Date.now();
    const current = withRankedLeavePenaltyDefaults(await this.options.store.leavePenaltyForPlayer(player.playerId));
    if (current.leaveCount <= 0) {
      return;
    }

    const cleanGamesSinceLeave = current.cleanGamesSinceLeave + 1;
    if (cleanGamesSinceLeave < CLEAN_GAMES_FOR_FORGIVENESS) {
      await this.options.store.recordLeavePenalty(player.playerId, {
        ...current,
        cooldownUntil: current.cooldownUntil !== null && current.cooldownUntil > now ? current.cooldownUntil : null,
        cleanGamesSinceLeave
      });
      return;
    }

    const leaveCount = Math.max(0, current.leaveCount - 1);
    await this.options.store.recordLeavePenalty(player.playerId, {
      leaveCount,
      cooldownUntil: leaveCount >= 3 && current.cooldownUntil !== null && current.cooldownUntil > now ? current.cooldownUntil : null,
      cleanGamesSinceLeave: 0
    });
  }

  private async requireActiveMatch(actorId: string, matchId: string): Promise<RankedMatch> {
    const match = await this.options.store.matchById(matchId);
    if (!match || match.status !== "active" || (match.playerAId !== actorId && match.playerBId !== actorId)) {
      throw new Error("Active ranked match not found.");
    }
    return match;
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
  private readonly ratings = new Map<string, RankedPlayerRating>();
  private readonly leavePenalties = new Map<string, RankedLeavePenalty>();
  private readonly settledLogs: RankedMatchLog[] = [];

  constructor(ratings: Array<PlayerRating & Partial<RankedPlayerRating>> = [], settledLogs: RankedMatchLog[] = []) {
    RANKED_BOTS.forEach((bot) => this.ratings.set(bot.id, defaultRankedRating(bot.id)));
    ratings.forEach((rating) => this.ratings.set(rating.playerId, normalizeRankedRating(rating, true)));
    this.settledLogs.push(...settledLogs.map((log) => ({ ...log })));
  }

  async ratingForPlayer(playerId: string): Promise<RankedPlayerRating> {
    const rating = this.ratings.get(playerId);
    if (!rating) {
      const defaultRating = defaultRankedRating(playerId);
      this.ratings.set(playerId, defaultRating);
      return { ...defaultRating };
    }
    return { ...rating };
  }

  async leavePenaltyForPlayer(playerId: string): Promise<RankedLeavePenalty> {
    return withRankedLeavePenaltyDefaults(this.leavePenalties.get(playerId));
  }

  async recordLeavePenalty(playerId: string, penalty: RankedLeavePenalty): Promise<void> {
    this.leavePenalties.set(playerId, withRankedLeavePenaltyDefaults(penalty));
  }

  async waitingPlayers(): Promise<RankedQueueEntry[]> {
    return Array.from(this.waiting.values()).map(withRankedQueueDefaults);
  }

  async addWaitingPlayer(entry: RankedQueueEntry): Promise<void> {
    this.waiting.set(entry.playerId, withRankedQueueDefaults(entry));
  }

  async removeWaitingPlayer(playerId: string): Promise<void> {
    this.waiting.delete(playerId);
  }

  async createMatch(match: RankedMatch): Promise<void> {
    this.matches.set(match.id, withRankedMatchDefaults(match));
  }

  async currentMatchForPlayer(playerId: string): Promise<RankedMatch | null> {
    const match = Array.from(this.matches.values()).find((match) => match.status === "active" && (match.playerAId === playerId || match.playerBId === playerId));
    return match ? withRankedMatchDefaults({ ...match }) : null;
  }

  async matchById(matchId: string): Promise<RankedMatch | null> {
    const match = this.matches.get(matchId);
    return match ? withRankedMatchDefaults({ ...match }) : null;
  }

  async setPlayerDisconnectedAt(matchId: string, playerId: string, disconnectedAt: number | null, reconnectDeadline?: number | null): Promise<void> {
    const match = this.matches.get(matchId);
    if (!match) return;
    if (match.playerAId === playerId) {
      this.matches.set(matchId, {
        ...match,
        playerADisconnectedAt: disconnectedAt,
        ...(reconnectDeadline === undefined ? {} : { playerAReconnectDeadline: reconnectDeadline })
      });
      return;
    }
    if (match.playerBId === playerId) {
      this.matches.set(matchId, {
        ...match,
        playerBDisconnectedAt: disconnectedAt,
        ...(reconnectDeadline === undefined ? {} : { playerBReconnectDeadline: reconnectDeadline })
      });
    }
  }

  async recordMatchEvent(event: Omit<RankedMatchEvent, "sequence">): Promise<RankedMatchEvent> {
    const events = this.events.get(event.matchId) ?? [];
    const recorded = { ...event, sequence: events.length + 1 };
    events.push(recorded);
    this.events.set(event.matchId, events);
    return recorded;
  }

  async eventsForMatch(matchId: string): Promise<RankedMatchEvent[]> {
    return [...(this.events.get(matchId) ?? [])].sort((left, right) => left.sequence - right.sequence).map((event) => ({ ...event }));
  }

  async recentSettledPairMatchCount(playerAId: string, playerBId: string, since: number): Promise<number> {
    return this.settledLogs.filter((log) => {
      const samePair =
        (log.playerAId === playerAId && log.playerBId === playerBId) ||
        (log.playerAId === playerBId && log.playerBId === playerAId);
      return samePair && Date.parse(log.createdAt) >= since;
    }).length;
  }

  async matchHistoryForPlayer(playerId: string, limit: number): Promise<RankedMatchLog[]> {
    return this.settledLogs
      .filter((log) => log.playerAId === playerId || log.playerBId === playerId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, limit)
      .map((log) => ({ ...log }));
  }

  async settleMatch(log: RankedMatchLog, playerA: PlayerRating & Partial<RankedPlayerRating>, playerB: PlayerRating & Partial<RankedPlayerRating>): Promise<void> {
    this.ratings.set(playerA.playerId, normalizeRankedRating(playerA, true));
    this.ratings.set(playerB.playerId, normalizeRankedRating(playerB, true));
    this.settledLogs.push(log);
    const match = this.matches.get(log.matchId);
    if (match) {
      this.matches.set(log.matchId, { ...match, status: "settled" });
    }
  }

  async leaderboard(query: RankedLeaderboardQuery = {}): Promise<RankedLeaderboardPage> {
    const { page, pageSize, search } = normalizeLeaderboardQuery(query);
    const searchLower = search.toLowerCase();
    const filtered = Array.from(this.ratings.values())
      .filter((rating) => !rating.isBot && rating.calibrationGames >= CALIBRATION_MATCH_COUNT)
      .filter((rating) => {
        if (!searchLower) return true;
        return rating.displayName.toLowerCase().includes(searchLower) || rating.playerId.toLowerCase().includes(searchLower);
      })
      .sort((left, right) => right.mmr - left.mmr)
      .map((rating) => ({
        playerId: rating.playerId,
        displayName: rating.displayName,
        avatarUrl: rating.avatarUrl,
        mmr: rating.mmr,
        rankedGames: rating.rankedGames,
        wins: rating.wins,
        losses: rating.losses
      }));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      leaderboard: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total,
      totalPages
    };
  }
}

export class MariaDbRankedStore implements RankedStore {
  constructor(private readonly pool: MariaDbRankedPool) {}

  async ratingForPlayer(playerId: string): Promise<RankedPlayerRating> {
    await this.ensureRatingRow(playerId);
    const rows = await this.pool.query(
      `SELECT r.player_id AS playerId, r.mmr, r.ranked_games AS rankedGames, r.wins, r.losses,
        r.last_ranked_at AS lastRankedAt, r.rating_games AS ratingGames, r.calibration_games AS calibrationGames,
        u.display_name AS displayName, u.avatar_url AS avatarUrl, u.is_bot AS isBot
       FROM player_ratings r
       JOIN users u ON u.id = r.player_id
       WHERE r.player_id = ?
       LIMIT 1`,
      [playerId]
    );
    const row = rows[0];
    return normalizeRankedRating({
      playerId,
      mmr: Number(row?.mmr ?? DEFAULT_PLAYER_RATING.mmr),
      rankedGames: Number(row?.rankedGames ?? DEFAULT_PLAYER_RATING.rankedGames),
      wins: Number(row?.wins ?? DEFAULT_PLAYER_RATING.wins),
      losses: Number(row?.losses ?? DEFAULT_PLAYER_RATING.losses),
      lastRankedAt: row?.lastRankedAt instanceof Date ? row.lastRankedAt.toISOString() : null,
      ratingGames: Number(row?.ratingGames ?? row?.rankedGames ?? 0),
      calibrationGames: Number(row?.calibrationGames ?? (isRankedBotId(playerId) ? CALIBRATION_MATCH_COUNT : 0)),
      displayName: String(row?.displayName ?? playerId),
      avatarUrl: row?.avatarUrl ? String(row.avatarUrl) : null,
      isBot: Boolean(row?.isBot)
    }, false);
  }

  async leavePenaltyForPlayer(playerId: string): Promise<RankedLeavePenalty> {
    await this.ensureRatingRow(playerId);
    const rows = await this.pool.query(
      `SELECT ranked_leave_count AS leaveCount, ranked_cooldown_until AS cooldownUntil,
        ranked_clean_games_since_leave AS cleanGamesSinceLeave
       FROM player_ratings
       WHERE player_id = ?
       LIMIT 1`,
      [playerId]
    );
    return withRankedLeavePenaltyDefaults({
      leaveCount: Number(rows[0]?.leaveCount ?? 0),
      cooldownUntil: dateValueToMillis(rows[0]?.cooldownUntil),
      cleanGamesSinceLeave: Number(rows[0]?.cleanGamesSinceLeave ?? 0)
    });
  }

  async recordLeavePenalty(playerId: string, penalty: RankedLeavePenalty): Promise<void> {
    await this.ensureRatingRow(playerId);
    await this.pool.query(
      `UPDATE player_ratings
       SET ranked_leave_count = ?, ranked_cooldown_until = ?, ranked_clean_games_since_leave = ?
       WHERE player_id = ?`,
      [
        penalty.leaveCount,
        penalty.cooldownUntil === null ? null : new Date(penalty.cooldownUntil),
        penalty.cleanGamesSinceLeave,
        playerId
      ]
    );
  }

  async waitingPlayers(): Promise<RankedQueueEntry[]> {
    const rows = await this.pool.query("SELECT player_id AS playerId, mmr, joined_at AS joinedAt, allow_human AS allowHuman, bot_match_at AS botMatchAt FROM ranked_queue ORDER BY joined_at ASC");
    return rows.map((row: { playerId: string; mmr: number; joinedAt: Date; allowHuman?: unknown; botMatchAt?: unknown }) => ({
      playerId: row.playerId,
      mmr: Number(row.mmr),
      joinedAt: row.joinedAt instanceof Date ? row.joinedAt.getTime() : Date.now(),
      allowHuman: row.allowHuman === undefined ? true : Boolean(row.allowHuman),
      botMatchAt: dateValueToMillis(row.botMatchAt)
    }));
  }

  async addWaitingPlayer(entry: RankedQueueEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO ranked_queue (player_id, mmr, joined_at, allow_human, bot_match_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mmr = VALUES(mmr), joined_at = VALUES(joined_at), allow_human = VALUES(allow_human), bot_match_at = VALUES(bot_match_at)`,
      [entry.playerId, entry.mmr, new Date(entry.joinedAt), entry.allowHuman, entry.botMatchAt === null ? null : new Date(entry.botMatchAt)]
    );
  }

  async removeWaitingPlayer(playerId: string): Promise<void> {
    await this.pool.query("DELETE FROM ranked_queue WHERE player_id = ?", [playerId]);
  }

  async createMatch(match: RankedMatch): Promise<void> {
    await this.pool.query(
      `INSERT INTO ranked_matches (
        id, player_a_id, player_b_id, player_a_mmr_before, player_b_mmr_before,
        first_player_id, seed, initial_state, status, created_at,
        player_a_disconnected_at, player_b_disconnected_at, player_a_reconnect_deadline,
        player_b_reconnect_deadline, is_calibration, is_bot_match, bot_difficulty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id,
        match.playerAId,
        match.playerBId,
        match.playerAMmrBefore,
        match.playerBMmrBefore,
        match.firstPlayerId,
        match.seed,
        JSON.stringify(match.initialState),
        match.status,
        new Date(match.createdAt),
        match.playerADisconnectedAt ? new Date(match.playerADisconnectedAt) : null,
        match.playerBDisconnectedAt ? new Date(match.playerBDisconnectedAt) : null,
        match.playerAReconnectDeadline ? new Date(match.playerAReconnectDeadline) : null,
        match.playerBReconnectDeadline ? new Date(match.playerBReconnectDeadline) : null,
        match.isCalibration,
        match.isBotMatch,
        match.botDifficulty
      ]
    );
  }

  async currentMatchForPlayer(playerId: string): Promise<RankedMatch | null> {
    const rows = await this.pool.query(
      `SELECT id, player_a_id AS playerAId, player_b_id AS playerBId,
        player_a_mmr_before AS playerAMmrBefore, player_b_mmr_before AS playerBMmrBefore,
        first_player_id AS firstPlayerId, seed, initial_state AS initialState, status, created_at AS createdAt,
        player_a_disconnected_at AS playerADisconnectedAt, player_b_disconnected_at AS playerBDisconnectedAt,
        player_a_reconnect_deadline AS playerAReconnectDeadline, player_b_reconnect_deadline AS playerBReconnectDeadline,
        is_calibration AS isCalibration, is_bot_match AS isBotMatch, bot_difficulty AS botDifficulty
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
          initialState: parseInitialState(row.initialState, row.seed),
          status: row.status,
          createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Date.now(),
          playerADisconnectedAt: dateValueToMillis(row.playerADisconnectedAt),
          playerBDisconnectedAt: dateValueToMillis(row.playerBDisconnectedAt),
          playerAReconnectDeadline: dateValueToMillis(row.playerAReconnectDeadline),
          playerBReconnectDeadline: dateValueToMillis(row.playerBReconnectDeadline),
          isCalibration: Boolean(row.isCalibration),
          isBotMatch: Boolean(row.isBotMatch),
          botDifficulty: row.botDifficulty === null || row.botDifficulty === undefined ? null : Number(row.botDifficulty)
        }
      : null;
  }

  async matchById(matchId: string): Promise<RankedMatch | null> {
    const rows = await this.pool.query(
      `SELECT id, player_a_id AS playerAId, player_b_id AS playerBId,
        player_a_mmr_before AS playerAMmrBefore, player_b_mmr_before AS playerBMmrBefore,
        first_player_id AS firstPlayerId, seed, initial_state AS initialState, status, created_at AS createdAt,
        player_a_disconnected_at AS playerADisconnectedAt, player_b_disconnected_at AS playerBDisconnectedAt,
        player_a_reconnect_deadline AS playerAReconnectDeadline, player_b_reconnect_deadline AS playerBReconnectDeadline,
        is_calibration AS isCalibration, is_bot_match AS isBotMatch, bot_difficulty AS botDifficulty
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
          initialState: parseInitialState(row.initialState, row.seed),
          status: row.status,
          createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Date.now(),
          playerADisconnectedAt: dateValueToMillis(row.playerADisconnectedAt),
          playerBDisconnectedAt: dateValueToMillis(row.playerBDisconnectedAt),
          playerAReconnectDeadline: dateValueToMillis(row.playerAReconnectDeadline),
          playerBReconnectDeadline: dateValueToMillis(row.playerBReconnectDeadline),
          isCalibration: Boolean(row.isCalibration),
          isBotMatch: Boolean(row.isBotMatch),
          botDifficulty: row.botDifficulty === null || row.botDifficulty === undefined ? null : Number(row.botDifficulty)
        }
      : null;
  }

  async setPlayerDisconnectedAt(matchId: string, playerId: string, disconnectedAt: number | null, reconnectDeadline?: number | null): Promise<void> {
    const disconnectedAtDate = disconnectedAt === null ? null : new Date(disconnectedAt);
    if (reconnectDeadline === undefined) {
      await this.pool.query(
        `UPDATE ranked_matches
         SET player_a_disconnected_at = CASE WHEN player_a_id = ? THEN ? ELSE player_a_disconnected_at END,
           player_b_disconnected_at = CASE WHEN player_b_id = ? THEN ? ELSE player_b_disconnected_at END
         WHERE id = ? AND status = 'active' AND (player_a_id = ? OR player_b_id = ?)`,
        [playerId, disconnectedAtDate, playerId, disconnectedAtDate, matchId, playerId, playerId]
      );
      return;
    }
    const reconnectDeadlineDate = reconnectDeadline === null ? null : new Date(reconnectDeadline);
    await this.pool.query(
      `UPDATE ranked_matches
       SET player_a_disconnected_at = CASE WHEN player_a_id = ? THEN ? ELSE player_a_disconnected_at END,
         player_b_disconnected_at = CASE WHEN player_b_id = ? THEN ? ELSE player_b_disconnected_at END,
         player_a_reconnect_deadline = CASE WHEN player_a_id = ? THEN ? ELSE player_a_reconnect_deadline END,
         player_b_reconnect_deadline = CASE WHEN player_b_id = ? THEN ? ELSE player_b_reconnect_deadline END
       WHERE id = ? AND status = 'active' AND (player_a_id = ? OR player_b_id = ?)`,
      [
        playerId,
        disconnectedAtDate,
        playerId,
        disconnectedAtDate,
        playerId,
        reconnectDeadlineDate,
        playerId,
        reconnectDeadlineDate,
        matchId,
        playerId,
        playerId
      ]
    );
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

  async eventsForMatch(matchId: string): Promise<RankedMatchEvent[]> {
    const rows = await this.pool.query(
      `SELECT match_id AS matchId, sequence, actor_id AS actorId, round, phase,
        event_type AS eventType, payload, created_at AS createdAt
       FROM ranked_match_events
       WHERE match_id = ?
       ORDER BY sequence ASC`,
      [matchId]
    );
    return (rows as Array<{ matchId: string; sequence: unknown; actorId: string; round: unknown; phase: string; eventType: string; payload: unknown; createdAt: unknown }>).map((row) => ({
      matchId: row.matchId,
      sequence: Number(row.sequence),
      actorId: row.actorId,
      round: Number(row.round),
      phase: row.phase,
      eventType: row.eventType,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Date.parse(String(row.createdAt))
    }));
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

  async matchHistoryForPlayer(playerId: string, limit: number): Promise<RankedMatchLog[]> {
    const rows = await this.pool.query(
      `SELECT ranked_matches.id AS matchId,
        ranked_matches.player_a_id AS playerAId,
        ranked_matches.player_b_id AS playerBId,
        player_a.display_name AS playerADisplayName, player_b.display_name AS playerBDisplayName,
        ranked_matches.winner_id AS winnerId,
        ranked_matches.loser_id AS loserId,
        ranked_matches.player_a_coins AS playerACoins,
        ranked_matches.player_b_coins AS playerBCoins,
        ranked_matches.player_a_sales AS playerASales,
        ranked_matches.player_b_sales AS playerBSales,
        ranked_matches.player_a_mmr_before AS playerAMmrBefore,
        ranked_matches.player_b_mmr_before AS playerBMmrBefore,
        ranked_matches.player_a_mmr_after AS playerAMmrAfter,
        ranked_matches.player_b_mmr_after AS playerBMmrAfter,
        ranked_matches.mmr_change AS mmrChange,
        ranked_matches.first_player_id AS firstPlayerId,
        ranked_matches.is_calibration AS isCalibration,
        ranked_matches.created_at AS createdAt
       FROM ranked_matches
       JOIN users player_a ON player_a.id = ranked_matches.player_a_id
       JOIN users player_b ON player_b.id = ranked_matches.player_b_id
       WHERE ranked_matches.status = 'settled' AND (ranked_matches.player_a_id = ? OR ranked_matches.player_b_id = ?)
       ORDER BY ranked_matches.created_at DESC
       LIMIT ?`,
      [playerId, playerId, limit]
    );
    return rows.map((row: RankedMatchHistoryRow) => ({
      matchId: row.matchId,
      playerAId: row.playerAId,
      playerBId: row.playerBId,
      playerADisplayName: row.playerADisplayName,
      playerBDisplayName: row.playerBDisplayName,
      winnerId: row.winnerId ?? null,
      loserId: row.loserId ?? null,
      playerACoins: Number(row.playerACoins),
      playerBCoins: Number(row.playerBCoins),
      playerASales: Number(row.playerASales),
      playerBSales: Number(row.playerBSales),
      playerAMmrBefore: Number(row.playerAMmrBefore),
      playerBMmrBefore: Number(row.playerBMmrBefore),
      playerAMmrAfter: Number(row.playerAMmrAfter),
      playerBMmrAfter: Number(row.playerBMmrAfter),
      mmrChange: Number(row.mmrChange),
      firstPlayerId: row.firstPlayerId,
      isCalibration: Boolean(row.isCalibration),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
    }));
  }

  async settleMatch(log: RankedMatchLog, playerA: PlayerRating & Partial<RankedPlayerRating>, playerB: PlayerRating & Partial<RankedPlayerRating>): Promise<void> {
    const nextPlayerA = normalizeRankedRating(playerA, true);
    const nextPlayerB = normalizeRankedRating(playerB, true);
    await this.withTransaction(async (connection) => {
      await connection.query(
        `UPDATE player_ratings
         SET mmr = ?, ranked_games = ?, wins = ?, losses = ?, last_ranked_at = ?, rating_games = ?, calibration_games = ?
         WHERE player_id = ?`,
        [
          nextPlayerA.mmr,
          nextPlayerA.rankedGames,
          nextPlayerA.wins,
          nextPlayerA.losses,
          nextPlayerA.lastRankedAt,
          nextPlayerA.ratingGames,
          nextPlayerA.calibrationGames,
          nextPlayerA.playerId
        ]
      );
      await connection.query(
        `UPDATE player_ratings
         SET mmr = ?, ranked_games = ?, wins = ?, losses = ?, last_ranked_at = ?, rating_games = ?, calibration_games = ?
         WHERE player_id = ?`,
        [
          nextPlayerB.mmr,
          nextPlayerB.rankedGames,
          nextPlayerB.wins,
          nextPlayerB.losses,
          nextPlayerB.lastRankedAt,
          nextPlayerB.ratingGames,
          nextPlayerB.calibrationGames,
          nextPlayerB.playerId
        ]
      );
      await connection.query(
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
    });
  }

  async leaderboard(query: RankedLeaderboardQuery = {}): Promise<RankedLeaderboardPage> {
    const { page, pageSize, search } = normalizeLeaderboardQuery(query);
    const likeSearch = `%${search}%`;
    const where = search
      ? "u.is_bot = FALSE AND r.calibration_games >= ? AND (u.display_name LIKE ? OR r.player_id LIKE ?)"
      : "u.is_bot = FALSE AND r.calibration_games >= ?";
    const whereValues = search ? [CALIBRATION_MATCH_COUNT, likeSearch, likeSearch] : [CALIBRATION_MATCH_COUNT];
    const countRows = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM player_ratings r
       JOIN users u ON u.id = r.player_id
       WHERE ${where}`,
      whereValues
    );
    const rows = await this.pool.query(
      `SELECT r.player_id AS playerId, u.display_name AS displayName, u.avatar_url AS avatarUrl,
        r.mmr, r.ranked_games AS rankedGames, r.wins, r.losses
       FROM player_ratings r
       JOIN users u ON u.id = r.player_id
       WHERE ${where}
       ORDER BY r.mmr DESC, r.ranked_games DESC
       LIMIT ? OFFSET ?`,
      [...whereValues, pageSize, (page - 1) * pageSize]
    );
    const total = Number(countRows[0]?.total ?? 0);
    return {
      leaderboard: rows.map((row: RankedLeaderboardEntry) => ({
        playerId: row.playerId,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl ?? null,
        mmr: Number(row.mmr),
        rankedGames: Number(row.rankedGames),
        wins: Number(row.wins),
        losses: Number(row.losses)
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
  }

  private async ensureRatingRow(playerId: string): Promise<void> {
    const bot = RANKED_BOTS.find((candidate) => candidate.id === playerId);
    if (bot) {
      await this.pool.query(
        `INSERT INTO users (id, display_name, is_bot)
         VALUES (?, ?, TRUE)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), is_bot = TRUE`,
        [bot.id, bot.displayName]
      );
    }
    await this.pool.query(
      `INSERT INTO player_ratings (player_id, mmr, rating_games, calibration_games)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE player_id = player_id`,
      [playerId, bot?.mmr ?? DEFAULT_PLAYER_RATING.mmr, 0, bot ? CALIBRATION_MATCH_COUNT : 0]
    );
  }

  private async withTransaction<T>(work: (connection: MariaDbRankedConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.release();
    }
  }
}
