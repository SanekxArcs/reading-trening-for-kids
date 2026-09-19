/**
 * Web Audio, created lazily and resumed on demand.
 *
 * Ported from the math trainer, where the lesson was learned the hard way: an
 * AudioContext built at module load starts `suspended` and nothing ever resumes
 * it, so a freshly loaded page is silent. Constructing on first play — which is
 * always inside a tap handler — and resuming defensively fixes both halves.
 *
 * No audio files: five tones synthesised on the fly weigh nothing, work
 * offline, and never need a loading state.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Tone {
  freq: number;
  to?: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  delay?: number;
}

function play(tones: readonly Tone[]): void {
  const audio = context();
  if (!audio) return;

  for (const tone of tones) {
    const start = audio.currentTime + (tone.delay ?? 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.duration);
    }

    // Ramp from ~0 rather than stepping, so the attack does not click.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }
}

export const sounds = {
  correct: () => play([{ freq: 523.25, to: 880, type: "sine", duration: 0.28, gain: 0.09 }]),

  /**
   * Low and short, never harsh.
   *
   * A wrong answer here is usually a child who read carefully and remembered
   * imperfectly, and the sound should sound like "not that one", not like a
   * buzzer on a quiz show.
   */
  wrong: () => play([{ freq: 180, to: 90, type: "triangle", duration: 0.32, gain: 0.08 }]),

  /** Neither right nor wrong: an answer a grown-up will look at later. */
  pending: () =>
    play([
      { freq: 440, type: "sine", duration: 0.12, gain: 0.05 },
      { freq: 554.37, type: "sine", duration: 0.14, gain: 0.05, delay: 0.1 },
    ]),

  // Rising arpeggio, so a tier-up is audibly different from a plain correct
  // answer rather than the same sound played twice at the same instant.
  comboUp: () =>
    play([
      { freq: 523.25, type: "sine", duration: 0.12, gain: 0.07 },
      { freq: 659.25, type: "sine", duration: 0.12, gain: 0.07, delay: 0.1 },
      { freq: 783.99, type: "sine", duration: 0.2, gain: 0.08, delay: 0.2 },
    ]),

  win: () =>
    play([
      { freq: 523.25, type: "sine", duration: 0.15, gain: 0.08 },
      { freq: 659.25, type: "sine", duration: 0.15, gain: 0.08, delay: 0.13 },
      { freq: 783.99, type: "sine", duration: 0.15, gain: 0.08, delay: 0.26 },
      { freq: 1046.5, type: "sine", duration: 0.45, gain: 0.09, delay: 0.39 },
    ]),
};

export type SoundName = keyof typeof sounds;

/**
 * The only way the screens play anything.
 *
 * Takes the setting rather than reading it, so the rule "sound is off" lives in
 * one place and cannot be forgotten by a new caller.
 */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  try {
    sounds[name]();
  } catch {
    // A browser that refuses audio is not a reason to lose an answer.
  }
}
