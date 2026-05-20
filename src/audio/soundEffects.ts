export const SOUND_EFFECT_IDS = [
  "ui-click",
  "card-select",
  "card-place",
  "invalid-action",
  "ready-confirm",
  "influence-play",
  "coin-sale",
  "customer-arrive",
  "trend-shift",
  "upgrade-buy",
  "round-end",
  "turn-start",
  "timer-tick",
  "game-win"
] as const;

export type SoundEffectId = (typeof SOUND_EFFECT_IDS)[number];

type BaseLayer = {
  start: number;
  duration: number;
  gain: number;
  attack?: number;
  release?: number;
};

type OscLayer = BaseLayer & {
  kind: "osc";
  wave: OscillatorType;
  frequency: number;
  endFrequency?: number;
};

type NoiseLayer = BaseLayer & {
  kind: "noise";
  filterFrequency: number;
  endFilterFrequency?: number;
  filterType?: BiquadFilterType;
};

export type SoundLayer = OscLayer | NoiseLayer;

export interface SoundEffectRecipe {
  duration: number;
  prompt: string;
  layers: SoundLayer[];
}

export const SOUND_EFFECTS: Record<SoundEffectId, SoundEffectRecipe> = {
  "ui-click": {
    duration: 0.5,
    prompt:
      "Soft cozy UI button click, tiny rounded wooden tap, clean casual card game interface, warm and minimal, very short one-shot, no harsh sound, no voice, no music.",
    layers: [
      { kind: "osc", wave: "triangle", start: 0, duration: 0.08, gain: 0.42, frequency: 520, endFrequency: 340, attack: 0.004, release: 0.055 },
      { kind: "noise", start: 0.012, duration: 0.035, gain: 0.11, filterFrequency: 1400, filterType: "lowpass", attack: 0.002, release: 0.02 }
    ]
  },
  "card-select": {
    duration: 0.6,
    prompt:
      "Soft card selection sound, light paper touch with a tiny warm chime, cozy casual card game, gentle and minimal, short one-shot, non-distracting, no voice, no music.",
    layers: [
      { kind: "noise", start: 0, duration: 0.11, gain: 0.16, filterFrequency: 2300, filterType: "bandpass", attack: 0.005, release: 0.08 },
      { kind: "osc", wave: "sine", start: 0.045, duration: 0.22, gain: 0.2, frequency: 880, endFrequency: 660, attack: 0.012, release: 0.16 }
    ]
  },
  "card-place": {
    duration: 0.8,
    prompt:
      "Card placed on a wooden market stall counter, soft paper slap with gentle wooden tap, cozy 2D card game sound, warm, clean, short one-shot, no harsh impact, no voice, no music.",
    layers: [
      { kind: "noise", start: 0, duration: 0.16, gain: 0.24, filterFrequency: 1800, filterType: "lowpass", attack: 0.003, release: 0.11 },
      { kind: "osc", wave: "triangle", start: 0.025, duration: 0.13, gain: 0.2, frequency: 250, endFrequency: 180, attack: 0.004, release: 0.09 }
    ]
  },
  "invalid-action": {
    duration: 0.6,
    prompt:
      "Gentle invalid action UI sound, soft muted wooden knock, slightly negative but not annoying, cozy casual card game, very short one-shot, no alarm, no harsh beep, no voice, no music.",
    layers: [
      { kind: "osc", wave: "triangle", start: 0, duration: 0.11, gain: 0.25, frequency: 220, endFrequency: 165, attack: 0.005, release: 0.08 },
      { kind: "osc", wave: "sine", start: 0.09, duration: 0.1, gain: 0.12, frequency: 185, endFrequency: 150, attack: 0.01, release: 0.075 }
    ]
  },
  "ready-confirm": {
    duration: 0.8,
    prompt:
      "Soft ready confirmation sound, warm UI chime with small wooden click, calm positive feedback, cozy casual card game, short one-shot, no bright arcade sound, no voice, no music.",
    layers: [
      { kind: "osc", wave: "triangle", start: 0, duration: 0.07, gain: 0.18, frequency: 360, endFrequency: 260, attack: 0.004, release: 0.05 },
      { kind: "osc", wave: "sine", start: 0.035, duration: 0.34, gain: 0.26, frequency: 660, endFrequency: 880, attack: 0.015, release: 0.24 }
    ]
  },
  "influence-play": {
    duration: 1.2,
    prompt:
      "Soft magical card effect, gentle paper whoosh with warm sparkle, cozy market card game, subtle and elegant, short one-shot, no loud impact, no dramatic magic, no voice, no music.",
    layers: [
      { kind: "noise", start: 0, duration: 0.42, gain: 0.16, filterFrequency: 1600, endFilterFrequency: 4200, filterType: "bandpass", attack: 0.04, release: 0.22 },
      { kind: "osc", wave: "sine", start: 0.16, duration: 0.42, gain: 0.18, frequency: 740, endFrequency: 1180, attack: 0.03, release: 0.3 },
      { kind: "osc", wave: "sine", start: 0.42, duration: 0.22, gain: 0.12, frequency: 1320, attack: 0.012, release: 0.16 }
    ]
  },
  "coin-sale": {
    duration: 1,
    prompt:
      "Small successful sale sound, soft coins gently dropping into a pouch, warm cozy market feeling, pleasant reward, short one-shot, not loud, no casino sound, no voice, no music.",
    layers: [
      { kind: "osc", wave: "sine", start: 0, duration: 0.18, gain: 0.18, frequency: 980, endFrequency: 860, attack: 0.006, release: 0.13 },
      { kind: "osc", wave: "sine", start: 0.11, duration: 0.2, gain: 0.16, frequency: 1240, endFrequency: 920, attack: 0.006, release: 0.15 },
      { kind: "noise", start: 0.07, duration: 0.22, gain: 0.1, filterFrequency: 2600, filterType: "bandpass", attack: 0.006, release: 0.16 }
    ]
  },
  "customer-arrive": {
    duration: 1,
    prompt:
      "New customer arrival sound, tiny soft shop bell above a cozy market stall, warm and friendly, short one-shot, subtle, no loud doorbell, no voice, no music.",
    layers: [
      { kind: "osc", wave: "sine", start: 0, duration: 0.34, gain: 0.22, frequency: 920, endFrequency: 900, attack: 0.008, release: 0.26 },
      { kind: "osc", wave: "sine", start: 0.12, duration: 0.4, gain: 0.14, frequency: 1220, endFrequency: 1180, attack: 0.01, release: 0.3 }
    ]
  },
  "trend-shift": {
    duration: 1.2,
    prompt:
      "Soft trend change transition sound, gentle paper cards sliding with airy whoosh and tiny sparkle, cozy casual strategy card game, clean and minimal, short one-shot, no dramatic impact, no voice, no music.",
    layers: [
      { kind: "noise", start: 0, duration: 0.52, gain: 0.18, filterFrequency: 1200, endFilterFrequency: 3400, filterType: "bandpass", attack: 0.06, release: 0.3 },
      { kind: "osc", wave: "sine", start: 0.38, duration: 0.24, gain: 0.11, frequency: 1040, endFrequency: 1280, attack: 0.012, release: 0.18 }
    ]
  },
  "upgrade-buy": {
    duration: 1.2,
    prompt:
      "Upgrade purchase sound, warm positive chime with soft coins and gentle sparkle, cozy casual market game, rewarding but calm, short one-shot, no loud fanfare, no voice, no music.",
    layers: [
      { kind: "osc", wave: "sine", start: 0, duration: 0.2, gain: 0.16, frequency: 760, endFrequency: 900, attack: 0.008, release: 0.14 },
      { kind: "osc", wave: "sine", start: 0.14, duration: 0.28, gain: 0.18, frequency: 980, endFrequency: 1260, attack: 0.012, release: 0.2 },
      { kind: "noise", start: 0.08, duration: 0.18, gain: 0.08, filterFrequency: 2600, filterType: "bandpass", attack: 0.006, release: 0.13 }
    ]
  },
  "round-end": {
    duration: 1.8,
    prompt:
      "Round end calculation sound, soft cards flipping and coins counting, gentle warm resolution chime, cozy casual card game, calm and satisfying, short one-shot, no tension, no voice, no music.",
    layers: [
      { kind: "noise", start: 0, duration: 0.16, gain: 0.12, filterFrequency: 1900, filterType: "bandpass", attack: 0.004, release: 0.11 },
      { kind: "noise", start: 0.18, duration: 0.15, gain: 0.11, filterFrequency: 2100, filterType: "bandpass", attack: 0.004, release: 0.1 },
      { kind: "osc", wave: "sine", start: 0.32, duration: 0.22, gain: 0.13, frequency: 880, attack: 0.01, release: 0.16 },
      { kind: "osc", wave: "sine", start: 0.5, duration: 0.38, gain: 0.16, frequency: 660, endFrequency: 880, attack: 0.018, release: 0.28 }
    ]
  },
  "turn-start": {
    duration: 0.75,
    prompt:
      "Short gentle your-turn cue, warm two-note wooden chime, cozy card game notification, clear but soft, no alarm, no voice, no music.",
    layers: [
      { kind: "osc", wave: "triangle", start: 0, duration: 0.16, gain: 0.2, frequency: 520, endFrequency: 620, attack: 0.008, release: 0.11 },
      { kind: "osc", wave: "sine", start: 0.12, duration: 0.3, gain: 0.22, frequency: 780, endFrequency: 1040, attack: 0.014, release: 0.22 }
    ]
  },
  "timer-tick": {
    duration: 0.35,
    prompt:
      "Soft muted clock tick, tiny dry wooden clock mechanism, cozy card game timer, short and readable, low impact, not harsh, no alarm, no voice, no music.",
    layers: [
      { kind: "osc", wave: "triangle", start: 0, duration: 0.045, gain: 0.16, frequency: 360, endFrequency: 260, attack: 0.007, release: 0.034 },
      { kind: "noise", start: 0.004, duration: 0.024, gain: 0.035, filterFrequency: 950, filterType: "lowpass", attack: 0.004, release: 0.018 }
    ]
  },
  "game-win": {
    duration: 2.5,
    prompt:
      "Small cozy victory jingle sound effect, warm bells, soft coins, gentle happy chime, casual card game ending, calm and satisfying, not epic, not loud, no voice, no lyrics.",
    layers: [
      { kind: "osc", wave: "sine", start: 0, duration: 0.32, gain: 0.18, frequency: 660, attack: 0.012, release: 0.22 },
      { kind: "osc", wave: "sine", start: 0.22, duration: 0.36, gain: 0.18, frequency: 880, attack: 0.012, release: 0.25 },
      { kind: "osc", wave: "sine", start: 0.46, duration: 0.48, gain: 0.2, frequency: 990, endFrequency: 1320, attack: 0.016, release: 0.34 },
      { kind: "noise", start: 0.32, duration: 0.25, gain: 0.08, filterFrequency: 2800, filterType: "bandpass", attack: 0.006, release: 0.16 }
    ]
  }
};

export function clampVolume(volume: number) {
  return Math.min(1, Math.max(0, volume));
}

let sharedAudioContext: AudioContext | null = null;
let audioContextUnavailable = false;

function getSharedAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (audioContextUnavailable) {
    return null;
  }

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    try {
      sharedAudioContext = new AudioContextClass();
    } catch {
      audioContextUnavailable = true;
      sharedAudioContext = null;
      return null;
    }
  }

  return sharedAudioContext;
}

export function primeSoundEffects() {
  const audio = getSharedAudioContext();
  if (!audio || audio.state !== "suspended") {
    return;
  }

  void audio.resume().catch(() => undefined);
}

function scheduleGain(gain: AudioParam, start: number, duration: number, peakVolume: number, attack = 0.006, release = 0.08) {
  const safePeak = Math.max(0.0001, peakVolume);
  const end = start + duration;
  const sustainEnd = Math.max(start + attack, end - release);

  gain.setValueAtTime(0.0001, start);
  gain.exponentialRampToValueAtTime(safePeak, start + Math.max(0.001, attack));
  gain.setValueAtTime(safePeak, sustainEnd);
  gain.exponentialRampToValueAtTime(0.0001, end);
}

function makeNoiseBuffer(audio: AudioContext, duration: number) {
  const frameCount = Math.max(1, Math.ceil(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, frameCount, audio.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function playOscLayer(audio: AudioContext, layer: OscLayer, masterGain: number) {
  const start = audio.currentTime + layer.start;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = layer.wave;
  oscillator.frequency.setValueAtTime(layer.frequency, start);
  if (layer.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, layer.endFrequency), start + layer.duration);
  }

  scheduleGain(gain.gain, start, layer.duration, layer.gain * masterGain, layer.attack, layer.release);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + layer.duration + 0.02);
}

function playNoiseLayer(audio: AudioContext, layer: NoiseLayer, masterGain: number) {
  const start = audio.currentTime + layer.start;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();

  source.buffer = makeNoiseBuffer(audio, layer.duration);
  filter.type = layer.filterType ?? "bandpass";
  filter.frequency.setValueAtTime(layer.filterFrequency, start);
  if (layer.endFilterFrequency) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, layer.endFilterFrequency), start + layer.duration);
  }

  scheduleGain(gain.gain, start, layer.duration, layer.gain * masterGain, layer.attack, layer.release);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  source.start(start);
  source.stop(start + layer.duration + 0.02);
}

function scheduleSoundEffect(audio: AudioContext, recipe: SoundEffectRecipe, masterGain: number) {
  for (const layer of recipe.layers) {
    if (layer.kind === "osc") {
      playOscLayer(audio, layer, masterGain);
    } else {
      playNoiseLayer(audio, layer, masterGain);
    }
  }
}

export function playSoundEffect(enabled: boolean, id: SoundEffectId, volume = 1) {
  const recipe = SOUND_EFFECTS[id];
  const masterGain = 0.28 * clampVolume(volume);
  if (!enabled || masterGain <= 0) {
    return;
  }

  const audio = getSharedAudioContext();
  if (!audio) {
    return;
  }

  if (audio.state === "suspended") {
    void audio
      .resume()
      .then(() => {
        try {
          scheduleSoundEffect(audio, recipe, masterGain);
        } catch {
          // Sound effects are optional; audio errors must not interrupt gameplay.
        }
      })
      .catch(() => undefined);
    return;
  }

  try {
    scheduleSoundEffect(audio, recipe, masterGain);
  } catch {
    // Sound effects are optional; audio errors must not interrupt gameplay.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
