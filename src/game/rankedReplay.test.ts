import { describe, expect, it } from "vitest";
import type { GameState } from "../app/types";
import { buildInitialState, seededRandom } from "./session";
import { DEFAULT_INITIAL_STATE_OPTIONS, DEFAULT_TURN_TIME_SECONDS } from "./sessionConfig";
import {
  applyRankedReplayEvent,
  rankedOutcomeFromState,
  replayRankedEvents,
  type RankedReplayEvent,
  type RankedReplayPlayerMap
} from "./rankedReplay";

const playerMap: RankedReplayPlayerMap = { playerAId: "user-a", playerBId: "user-b" };

function rankedInitialState() {
  return {
    ...buildInitialState(true, DEFAULT_TURN_TIME_SECONDS, DEFAULT_INITIAL_STATE_OPTIONS, seededRandom("ranked-replay")),
    phase: "planning" as const
  };
}

function actorForSeat(seat: "A" | "B") {
  return seat === "A" ? playerMap.playerAId : playerMap.playerBId;
}

function buildNoActionGameEvents(): RankedReplayEvent[] {
  const events: RankedReplayEvent[] = [];
  let state: GameState = rankedInitialState();

  while (state.phase !== "game_end") {
    const actorSeat = state.phase === "upgrade" ? state.upgradeQueue[0] : state.activePlayer;
    const event: RankedReplayEvent = {
      actorId: actorForSeat(actorSeat),
      eventType: state.phase === "upgrade" ? "skip_upgrade" : "ready",
      payload: {}
    };
    events.push(event);
    state = applyRankedReplayEvent(state, event, playerMap);
  }

  return events;
}

describe("ranked replay", () => {
  it("replays a complete no-action ranked game to a draw", () => {
    const outcome = replayRankedEvents(rankedInitialState(), buildNoActionGameEvents(), playerMap);

    expect(outcome).toEqual({ playerACoins: 0, playerBCoins: 0, playerASales: 0, playerBSales: 0 });
  });

  it("applies a deterministic product placement action", () => {
    const initial = rankedInitialState();
    const activePlayer = initial.players.find((player) => player.id === initial.activePlayer)!;
    const product = activePlayer.productHand[0];
    const next = applyRankedReplayEvent(
      initial,
      { actorId: actorForSeat(activePlayer.id), eventType: "place_product", payload: { productInstanceId: product.instanceId, slotIndex: 0 } },
      playerMap
    );

    expect(next.players.find((player) => player.id === activePlayer.id)?.shelf[0]?.instanceId).toBe(product.instanceId);
    expect(rankedOutcomeFromState(next)).toEqual({ playerACoins: 0, playerBCoins: 0, playerASales: 0, playerBSales: 0 });
  });
});
