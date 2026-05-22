import type { GameState } from "./types";
import { apiErrorMessage } from "./apiErrors";

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  mmr: number;
  rankedGames: number;
  wins: number;
  losses: number;
}

export interface PlayerRating {
  playerId: string;
  mmr: number | null;
  rankedGames: number;
  wins: number;
  losses: number;
  lastRankedAt: string | null;
  isCalibrating: boolean;
  calibrationGamesRemaining: number;
  penalty: RankedPenalty;
}

export interface RankedPenalty {
  leaveWarnings: number;
  cleanGamesUntilForgiven: number | null;
  cooldownUntil: number | null;
  queueBlocked: boolean;
}

export interface LeaderboardResult {
  leaderboard: LeaderboardEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LeaderboardQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface RankedMatchHistoryEntry {
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

export interface RankedMatch {
  id: string;
  playerAId: string;
  playerBId: string;
  playerAMmrBefore: number;
  playerBMmrBefore: number;
  firstPlayerId: string;
  seed: string;
  initialState: GameState;
  status: "active" | "settled" | "abandoned";
  createdAt: number;
  playerADisconnectedAt: number | null;
  playerBDisconnectedAt: number | null;
  isCalibration: boolean;
  isBotMatch: boolean;
  botDifficulty: number | null;
}

export type RankedQueueJoinResult = { status: "waiting" } | { status: "matched"; match: RankedMatch };
export type RankedQueueStatus = { status: "idle" } | RankedQueueJoinResult;
export type RankedClientError = Error & { penalty?: RankedPenalty };

export interface RankedEventInput {
  matchId: string;
  round: number;
  phase: string;
  eventType: string;
  payload?: unknown;
}

export interface RankedSettleInput {
  matchId: string;
  playerACoins: number;
  playerBCoins: number;
  playerASales: number;
  playerBSales: number;
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

async function parseRankedResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; penalty?: RankedPenalty }) | null;
  if (!response.ok) {
    const error = new Error(apiErrorMessage(response, payload?.error ?? "Ranked request failed.")) as RankedClientError;
    if (payload?.penalty) {
      error.penalty = payload.penalty;
    }
    throw error;
  }
  return payload as T;
}

async function postRankedJson<T>(path: string, body: unknown): Promise<T> {
  return parseRankedResponse<T>(
    await fetch(path, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    })
  );
}

export async function loadLeaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardResult> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  const suffix = params.toString();
  return parseRankedResponse<LeaderboardResult>(await fetch(`/api/ranked/leaderboard${suffix ? `?${suffix}` : ""}`));
}

export async function loadMyRating(): Promise<PlayerRating> {
  const payload = await parseRankedResponse<{ rating: PlayerRating }>(await fetch("/api/ranked/rating"));
  return payload.rating;
}

export async function loadMatchHistory(): Promise<RankedMatchHistoryEntry[]> {
  const payload = await parseRankedResponse<{ history: RankedMatchHistoryEntry[] }>(await fetch("/api/ranked/history"));
  return payload.history;
}

export async function joinRankedQueue(): Promise<RankedQueueJoinResult> {
  return parseRankedResponse(await fetch("/api/ranked/queue", { method: "POST" }));
}

export async function loadRankedStatus(): Promise<RankedQueueStatus> {
  return parseRankedResponse(await fetch("/api/ranked/status"));
}

export async function cancelRankedQueue(): Promise<{ status: "idle" }> {
  return parseRankedResponse(await fetch("/api/ranked/queue", { method: "DELETE" }));
}

export async function recordRankedEvent(input: RankedEventInput): Promise<{ event: unknown }> {
  return postRankedJson("/api/ranked/events", input);
}

export async function loadRankedEvents(matchId: string, afterSequence = 0): Promise<RankedMatchEvent[]> {
  const query = new URLSearchParams({ matchId, after: String(afterSequence) });
  const payload = await parseRankedResponse<{ events: RankedMatchEvent[] }>(await fetch(`/api/ranked/events?${query}`));
  return payload.events;
}

export async function settleRankedMatch(input: RankedSettleInput): Promise<{ log: RankedMatchHistoryEntry }> {
  return postRankedJson("/api/ranked/settle", input);
}

export async function disconnectRankedMatch(matchId: string): Promise<{ status: "reconnect_window"; reconnectUntil: number }> {
  return postRankedJson("/api/ranked/disconnect", { matchId });
}

export async function abandonRankedMatch(matchId: string): Promise<{ log: RankedMatchHistoryEntry }> {
  return postRankedJson("/api/ranked/abandon", { matchId });
}

export async function reconnectRankedMatch(matchId: string): Promise<{ status: "matched"; match: RankedMatch }> {
  return postRankedJson("/api/ranked/reconnect", { matchId });
}
