import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelRankedQueue,
  disconnectRankedMatch,
  joinRankedQueue,
  loadLeaderboard,
  loadMatchHistory,
  loadMyRating,
  loadRankedEvents,
  loadRankedStatus,
  reconnectRankedMatch,
  recordRankedEvent,
  settleRankedMatch
} from "./rankedClient";

function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ranked client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads paginated leaderboard entries with search", async () => {
    const fetchMock = stubFetch({
      leaderboard: [{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }],
      page: 2,
      pageSize: 10,
      total: 12,
      totalPages: 2
    });

    await expect(loadLeaderboard({ page: 2, pageSize: 10, search: "A" })).resolves.toEqual({
      leaderboard: [{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }],
      page: 2,
      pageSize: 10,
      total: 12,
      totalPages: 2
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/leaderboard?page=2&pageSize=10&search=A");
  });

  it("explains when the ranked API proxy is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));

    await expect(loadLeaderboard()).rejects.toThrow(/API server unavailable.*npm run dev:lan/i);
  });

  it("joins ranked queue", async () => {
    const fetchMock = stubFetch({ status: "waiting" });

    await expect(joinRankedQueue()).resolves.toEqual({ status: "waiting" });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/queue", { method: "POST" });
  });

  it("loads ranked queue status", async () => {
    const fetchMock = stubFetch({ status: "matched", match: { id: "m1" } });

    await expect(loadRankedStatus()).resolves.toEqual({ status: "matched", match: { id: "m1" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/status");
  });

  it("cancels ranked queue", async () => {
    const fetchMock = stubFetch({ status: "idle" });

    await expect(cancelRankedQueue()).resolves.toEqual({ status: "idle" });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/queue", { method: "DELETE" });
  });

  it("loads the current player rating", async () => {
    stubFetch({
      rating: {
        playerId: "a",
        mmr: null,
        rankedGames: 0,
        wins: 0,
        losses: 0,
        lastRankedAt: null,
        isCalibrating: true,
        calibrationGamesRemaining: 3,
        penalty: {
          leaveWarnings: 2,
          cleanGamesUntilForgiven: 4,
          cooldownUntil: null,
          queueBlocked: false
        }
      }
    });

    await expect(loadMyRating()).resolves.toEqual({
      playerId: "a",
      mmr: null,
      rankedGames: 0,
      wins: 0,
      losses: 0,
      lastRankedAt: null,
      isCalibrating: true,
      calibrationGamesRemaining: 3,
      penalty: {
        leaveWarnings: 2,
        cleanGamesUntilForgiven: 4,
        cooldownUntil: null,
        queueBlocked: false
      }
    });
  });

  it("exposes ranked cooldown penalty details on queue errors", async () => {
    const penalty = {
      leaveWarnings: 3,
      cleanGamesUntilForgiven: 5,
      cooldownUntil: 181_000,
      queueBlocked: true
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: "Ranked cooldown is active.",
            penalty
          },
          { status: 429 }
        )
      )
    );

    await expect(joinRankedQueue()).rejects.toMatchObject({
      message: "Ranked cooldown is active.",
      penalty
    });
  });

  it("loads the current player match history", async () => {
    stubFetch({ history: [{ matchId: "m1", winnerId: "a", loserId: "b", playerAId: "a", playerBId: "b", mmrChange: 18 }] });

    await expect(loadMatchHistory()).resolves.toEqual([{ matchId: "m1", winnerId: "a", loserId: "b", playerAId: "a", playerBId: "b", mmrChange: 18 }]);
  });

  it("records ranked match events", async () => {
    const input = { matchId: "m1", round: 2, phase: "sell", eventType: "ready", payload: { seat: "A" } };
    const fetchMock = stubFetch({ event: { sequence: 4, ...input } });

    await expect(recordRankedEvent(input)).resolves.toEqual({ event: { sequence: 4, ...input } });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/events", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  });

  it("loads ranked match events after a sequence", async () => {
    const fetchMock = stubFetch({ events: [{ matchId: "m1", sequence: 4, actorId: "b", eventType: "ready", payload: {} }] });

    await expect(loadRankedEvents("m1", 3)).resolves.toEqual([{ matchId: "m1", sequence: 4, actorId: "b", eventType: "ready", payload: {} }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/events?matchId=m1&after=3");
  });

  it("settles a ranked match", async () => {
    const input = { matchId: "m1", playerACoins: 18, playerBCoins: 11, playerASales: 5, playerBSales: 3 };
    const fetchMock = stubFetch({ log: { matchId: "m1", winnerId: "a", mmrChange: 18 } });

    await expect(settleRankedMatch(input)).resolves.toEqual({ log: { matchId: "m1", winnerId: "a", mmrChange: 18 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/settle", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  });

  it("marks ranked match disconnects", async () => {
    const fetchMock = stubFetch({ status: "reconnect_window", reconnectUntil: 123 });

    await expect(disconnectRankedMatch("m1")).resolves.toEqual({ status: "reconnect_window", reconnectUntil: 123 });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/disconnect", {
      body: JSON.stringify({ matchId: "m1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  });

  it("reconnects ranked matches", async () => {
    const fetchMock = stubFetch({ status: "matched", match: { id: "m1" } });

    await expect(reconnectRankedMatch("m1")).resolves.toEqual({ status: "matched", match: { id: "m1" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/ranked/reconnect", {
      body: JSON.stringify({ matchId: "m1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  });
});
