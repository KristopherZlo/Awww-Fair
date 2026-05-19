import { describe, expect, it } from "vitest";
import { SOUND_EFFECTS, SOUND_EFFECT_IDS } from "./soundEffects";

const requestedDurations = {
  "ui-click": 0.5,
  "card-select": 0.6,
  "card-place": 0.8,
  "invalid-action": 0.6,
  "ready-confirm": 0.8,
  "influence-play": 1.2,
  "coin-sale": 1,
  "customer-arrive": 1,
  "trend-shift": 1.2,
  "upgrade-buy": 1.2,
  "round-end": 1.8,
  "timer-tick": 0.35,
  "game-win": 2.5
} as const;

describe("sound effects catalog", () => {
  it("defines every requested one-shot sound id with its requested duration", () => {
    expect(SOUND_EFFECT_IDS).toEqual(Object.keys(requestedDurations));

    for (const [id, duration] of Object.entries(requestedDurations)) {
      expect(SOUND_EFFECTS[id as keyof typeof requestedDurations].duration).toBe(duration);
    }
  });

  it("keeps every sound playable with at least one Web Audio layer", () => {
    for (const id of SOUND_EFFECT_IDS) {
      expect(SOUND_EFFECTS[id].layers.length).toBeGreaterThan(0);
    }
  });

  it("stores the prompt intent next to each sound recipe", () => {
    expect(SOUND_EFFECTS["card-place"].prompt).toMatch(/wooden market stall/i);
    expect(SOUND_EFFECTS["game-win"].prompt).toMatch(/victory jingle/i);
  });

  it("keeps the timer tick muted and clock-like instead of sharp", () => {
    const tick = SOUND_EFFECTS["timer-tick"];
    const oscillatorLayers = tick.layers.filter((layer) => layer.kind === "osc");
    const noiseLayers = tick.layers.filter((layer) => layer.kind === "noise");

    expect(tick.prompt).toMatch(/muted clock tick/i);
    expect(oscillatorLayers.every((layer) => layer.frequency <= 440 && (layer.endFrequency ?? layer.frequency) <= 440)).toBe(true);
    expect(tick.layers.every((layer) => layer.gain <= 0.18)).toBe(true);
    expect(noiseLayers.every((layer) => layer.filterType === "lowpass" && layer.filterFrequency <= 1200)).toBe(true);
  });
});
