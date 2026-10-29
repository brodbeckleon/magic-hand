// Optional sound feedback (off by default): a short synthesized tone, so the presenter knows a
// slide changed without looking. No audio files, nothing recorded.

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a user gesture (e.g. turning the option on) so the browser allows audio later. */
export function unlockSound(): void {
  context();
}

export type Cue = "next" | "prev" | "speaker";

const NOTES: Record<Cue, number[]> = {
  next: [660, 880],
  prev: [880, 660],
  speaker: [523, 659, 784],
};

export function playCue(cue: Cue, volume = 0.12): void {
  const c = context();
  if (!c) return;
  const t0 = c.currentTime;
  NOTES[cue].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t0 + i * 0.07;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.14);
  });
}
