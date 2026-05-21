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
  mmr: number;
  rankedGames: number;
  wins: number;
  losses: number;
  lastRankedAt: string | null;
}

export interface RankedMatchHistoryEntry {
  matchId: string;
  playerAId: string;
  playerBId: string;
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
  createdAt: string;
}

export type RankedQueueJoinResult = { status: "waiting" } | { status: "matched"; match: unknown };
export type RankedQueueStatus = { status: "idle" } | RankedQueueJoinResult;

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

async function parseRankedResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Ranked request failed.");
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

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  const payload = await parseRankedResponse<{ leaderboard: LeaderboardEntry[] }>(await fetch("/api/ranked/leaderboard"));
  return payload.leaderboard;
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

export async function settleRankedMatch(input: RankedSettleInput): Promise<{ log: RankedMatchHistoryEntry }> {
  return postRankedJson("/api/ranked/settle", input);
}

export async function disconnectRankedMatch(matchId: string): Promise<{ status: "reconnect_window"; reconnectUntil: number }> {
  return postRankedJson("/api/ranked/disconnect", { matchId });
}

export async function reconnectRankedMatch(matchId: string): Promise<{ status: "matched"; match: unknown }> {
  return postRankedJson("/api/ranked/reconnect", { matchId });
}
