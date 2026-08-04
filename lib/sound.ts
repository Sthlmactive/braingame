/**
 * Feedback is visual first. iOS Safari has no Vibration API, so haptics are a
 * bonus where they exist, never the thing the feel depends on. The audible
 * part is a very short Web Audio click, built on demand so no AudioContext is
 * created until the first tap.
 */

export type Cue = "tap" | "place" | "good" | "bad" | "win";

interface CueSpec {
  freq: number;
  /** Seconds. */
  dur: number;
  gain: number;
  type: OscillatorType;
  /** Optional second note, played straight after the first. */
  then?: { freq: number; dur: number };
}

const CUES: Record<Cue, CueSpec> = {
  tap: { freq: 660, dur: 0.018, gain: 0.05, type: "square" },
  place: { freq: 420, dur: 0.03, gain: 0.07, type: "triangle" },
  good: { freq: 780, dur: 0.05, gain: 0.07, type: "sine", then: { freq: 1180, dur: 0.07 } },
  bad: { freq: 180, dur: 0.09, gain: 0.07, type: "sawtooth" },
  win: { freq: 660, dur: 0.09, gain: 0.08, type: "sine", then: { freq: 990, dur: 0.16 } },
};

const VIBE: Record<Cue, number | number[]> = {
  tap: 8,
  place: 12,
  good: 18,
  bad: [12, 40, 12],
  win: [20, 50, 30],
};

let ctx: AudioContext | null = null;
let enabled = true;

type Ctor = typeof AudioContext;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * iOS suspends the context until a user gesture resumes it. Call this from the
 * first real tap so the very next cue is audible.
 */
export function primeAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function play(cue: Cue): void {
  vibrate(cue);
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const spec = CUES[cue];
  try {
    const now = c.currentTime;
    note(c, spec.type, spec.freq, spec.gain, now, spec.dur);
    if (spec.then) {
      note(c, spec.type, spec.then.freq, spec.gain, now + spec.dur, spec.then.dur);
    }
  } catch {
    // A dead audio context must never break a game.
  }
}

function note(
  c: AudioContext,
  type: OscillatorType,
  freq: number,
  gain: number,
  at: number,
  dur: number,
): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  // A hard stop clicks; a short ramp does not.
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function vibrate(cue: Cue): void {
  if (typeof navigator === "undefined") return;
  const n = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof n.vibrate !== "function") return;
  try {
    n.vibrate(VIBE[cue]);
  } catch {
    // Some browsers expose the method and then refuse to run it.
  }
}
