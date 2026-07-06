import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import type { RankedMatchHistoryEntry } from "../app/rankedClient";
import { buildProfileMmrSeries, ProfileMmrChart } from "./profileMmrChart";

function match(
  matchId: string,
  createdAt: string,
  overrides: Partial<RankedMatchHistoryEntry> = {}
): RankedMatchHistoryEntry {
  return {
    matchId,
    playerAId: "player-a",
    playerBId: "player-b",
    winnerId: "player-a",
    loserId: "player-b",
    playerACoins: 10,
    playerBCoins: 6,
    playerASales: 4,
    playerBSales: 2,
    playerAMmrBefore: 1500,
    playerBMmrBefore: 1500,
    playerAMmrAfter: 1518,
    playerBMmrAfter: 1482,
    mmrChange: 18,
    firstPlayerId: "player-a",
    createdAt,
    ...overrides
  };
}

describe("buildProfileMmrSeries", () => {
  it("orders matches chronologically without mutating history and excludes calibration matches", () => {
    const history = [
      match("newer", "2026-05-03T00:00:00.000Z", {
        playerAMmrBefore: 1512,
        playerAMmrAfter: 1524
      }),
      match("calibration", "2026-05-02T00:00:00.000Z", {
        isCalibration: true,
        playerAMmrBefore: 1500,
        playerAMmrAfter: 1512
      }),
      match("older", "2026-05-01T00:00:00.000Z", {
        playerAMmrBefore: 1490,
        playerAMmrAfter: 1512
      })
    ];
    const originalOrder = history.map((entry) => entry.matchId);

    expect(buildProfileMmrSeries(history, "player-a")).toEqual([
      { key: "start-older", mmr: 1490, result: "start" },
      { key: "older", mmr: 1512, result: "win" },
      { key: "newer", mmr: 1524, result: "win" }
    ]);
    expect(history.map((entry) => entry.matchId)).toEqual(originalOrder);
  });

  it("uses the player B rating and marks losses and draws correctly", () => {
    const history = [
      match("loss", "2026-05-01T00:00:00.000Z", {
        playerBMmrBefore: 1600,
        playerBMmrAfter: 1584
      }),
      match("draw", "2026-05-02T00:00:00.000Z", {
        winnerId: null,
        loserId: null,
        playerBMmrBefore: 1584,
        playerBMmrAfter: 1584,
        mmrChange: 0
      })
    ];

    expect(buildProfileMmrSeries(history, "player-b")).toEqual([
      { key: "start-loss", mmr: 1600, result: "start" },
      { key: "loss", mmr: 1584, result: "loss" },
      { key: "draw", mmr: 1584, result: "draw" }
    ]);
  });
});

describe("ProfileMmrChart", () => {
  it("renders an accessible SVG only when non-calibration history exists", () => {
    const history = [match("match-1", "2026-05-01T00:00:00.000Z")];
    const { rerender } = render(<ProfileMmrChart history={history} playerId="player-a" isCalibrating={false} />);

    expect(screen.getByRole("img", { name: "MMR" })).toBeInTheDocument();
    expect(document.querySelectorAll(".profile-mmr-point")).toHaveLength(2);

    rerender(<ProfileMmrChart history={history} playerId="player-a" isCalibrating />);
    expect(screen.queryByRole("img", { name: "MMR" })).not.toBeInTheDocument();
  });
});
