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

async function parseRankedResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Ranked request failed.");
  }
  return payload as T;
}

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  const payload = await parseRankedResponse<{ leaderboard: LeaderboardEntry[] }>(await fetch("/api/ranked/leaderboard"));
  return payload.leaderboard;
}

export async function loadMyRating(): Promise<PlayerRating> {
  const payload = await parseRankedResponse<{ rating: PlayerRating }>(await fetch("/api/ranked/rating"));
  return payload.rating;
}

export async function joinRankedQueue(): Promise<{ status: "waiting" } | { status: "matched"; match: unknown }> {
  return parseRankedResponse(await fetch("/api/ranked/queue", { method: "POST" }));
}
