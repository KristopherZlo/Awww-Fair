import { describe, expect, it } from "vitest";
import { DEFAULT_INITIAL_STATE_OPTIONS, DEFAULT_TURN_TIME_SECONDS, MAX_TURN_TIME_SECONDS, MIN_TURN_TIME_SECONDS, clampTurnTime } from "./sessionConfig";
import { buildInitialState, seededRandom } from "./session";

describe("game session helpers", () => {
  it("builds identical initial states from the same seed", () => {
    const left = buildInitialState(
      true,
      DEFAULT_TURN_TIME_SECONDS,
      DEFAULT_INITIAL_STATE_OPTIONS,
      seededRandom("ranked-seed")
    );
    const right = buildInitialState(
      true,
      DEFAULT_TURN_TIME_SECONDS,
      DEFAULT_INITIAL_STATE_OPTIONS,
      seededRandom("ranked-seed")
    );

    expect(left).toEqual(right);
    expect(left.phase).toBe("menu");
    expect(left.round).toBe(1);
    expect(left.players.map((player) => player.id)).toEqual(["A", "B"]);
  });

  it("keeps invalid turn-time input on the server default", () => {
    expect(clampTurnTime(Number.NaN)).toBe(DEFAULT_TURN_TIME_SECONDS);
    expect(clampTurnTime(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TURN_TIME_SECONDS);
    expect(clampTurnTime(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_TURN_TIME_SECONDS);
    expect(clampTurnTime(MIN_TURN_TIME_SECONDS - 1)).toBe(MIN_TURN_TIME_SECONDS);
    expect(clampTurnTime(MAX_TURN_TIME_SECONDS + 1)).toBe(MAX_TURN_TIME_SECONDS);
  });
});
