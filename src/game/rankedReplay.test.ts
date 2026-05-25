import { describe, expect, it } from "vitest";
import type { GameState } from "../app/types";
import { INFLUENCE_CARDS, UPGRADE_CARDS } from "../data/cards";
import { buildInitialState, seededRandom } from "./session";
import { DEFAULT_INITIAL_STATE_OPTIONS, DEFAULT_TURN_TIME_SECONDS } from "./sessionConfig";
import type { ProductInstance } from "./types";
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

function withActiveInfluence(cardId: string) {
  const state = rankedInitialState();
  const card = INFLUENCE_CARDS.find((candidate) => candidate.id === cardId)!;
  return {
    ...state,
    players: state.players.map((player) => (player.id === state.activePlayer ? { ...player, influenceHand: [card] } : player))
  };
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

  it("applies influence and draft keep actions", () => {
    const current = withActiveInfluence("urgent_supply");
    const actor = actorForSeat(current.activePlayer);
    const afterInfluence = applyRankedReplayEvent(current, { actorId: actor, eventType: "play_influence", payload: { cardId: "urgent_supply" } }, playerMap);
    const keptCard = afterInfluence.choiceDraft?.cards[1] as ProductInstance | undefined;

    const afterKeep = applyRankedReplayEvent(afterInfluence, { actorId: actor, eventType: "keep_draft_card", payload: { index: 1 } }, playerMap);
    const productHand = afterKeep.players.find((player) => player.id === current.activePlayer)!.productHand;

    expect(afterInfluence.choiceDraft?.type).toBe("product");
    expect(afterKeep.choiceDraft).toBeNull();
    expect(productHand[productHand.length - 1]?.instanceId).toBe(keptCard?.instanceId);
  });

  it("applies ad table and upgrade buy actions", () => {
    const current = rankedInitialState();
    const activePlayer = current.players.find((player) => player.id === current.activePlayer)!;
    const adTable = UPGRADE_CARDS.find((upgrade) => upgrade.id === "ad_table")!;
    const extraShelf = UPGRADE_CARDS.find((upgrade) => upgrade.id === "extra_shelf")!;
    const afterAdTable = applyRankedReplayEvent(
      { ...current, players: current.players.map((player) => (player.id === activePlayer.id ? { ...player, upgrades: [adTable] } : player)) },
      { actorId: actorForSeat(activePlayer.id), eventType: "use_ad_table", payload: { slotIndex: 0 } },
      playerMap
    );
    const upgradeState: GameState = {
      ...afterAdTable,
      phase: "upgrade",
      upgradeOffer: [extraShelf],
      upgradeQueue: [activePlayer.id],
      activePlayer: activePlayer.id,
      players: afterAdTable.players.map((player) => (player.id === activePlayer.id ? { ...player, money: 9 } : player))
    };

    const afterUpgrade = applyRankedReplayEvent(upgradeState, { actorId: actorForSeat(activePlayer.id), eventType: "buy_upgrade", payload: { upgradeId: "extra_shelf" } }, playerMap);

    expect(afterAdTable.roundBonuses).toMatchObject([{ ownerId: activePlayer.id, slotIndex: 0, value: 1 }]);
    expect(afterUpgrade.players.find((player) => player.id === activePlayer.id)).toMatchObject({ money: 0, shelfSlots: 4 });
  });
});
