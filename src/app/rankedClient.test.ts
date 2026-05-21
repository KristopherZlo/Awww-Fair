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

  it("loads leaderboard entries", async () => {
    stubFetch({ leaderboard: [{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }] });

    await expect(loadLeaderboard()).resolves.toEqual([{ playerId: "a", displayName: "A", avatarUrl: null, mmr: 1500, rankedGames: 1, wins: 1, losses: 0 }]);
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
    stubFetch({ rating: { playerId: "a", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null } });

    await expect(loadMyRating()).resolves.toEqual({ playerId: "a", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null });
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
