import type { Command } from "../types.ts";

/**
 * Scripted test session for the course's webcam tests: the app asks for swipes one at a time,
 * then for a stretch of free talking with gestures, and measures hits, misses, wrong directions,
 * false triggers and latency (MHR02, MHR06, MHR07). Pure and time-driven, so it is unit-testable.
 */
export interface StudyPlan {
  /** Swipes requested per direction. */
  perDirection: number;
  /** Time allowed for each requested swipe, s. */
  promptTimeout: number;
  /** Pause between prompts, s. */
  gap: number;
  /** Free talking with hand gestures (no swipes wanted), s. */
  freeTalk: number;
}

export const DEFAULT_PLAN: StudyPlan = { perDirection: 10, promptTimeout: 4, gap: 1.2, freeTalk: 120 };

export type Phase =
  | { kind: "prompt"; index: number; command: Command; until: number }
  | { kind: "gap"; until: number; next: number }
  | { kind: "free"; until: number }
  | { kind: "done" };

export type Outcome = "hit" | "miss" | "wrong";

export interface TrialResult {
  command: Command;
  outcome: Outcome;
  /** Prompt shown -> key, ms. */
  responseMs: number | null;
  reactionMs: number | null;
  detectMs: number | null;
}

export interface StudyReport {
  trials: TrialResult[];
  hits: number;
  misses: number;
  wrong: number;
  /** Triggers during free talk (MHR07). */
  falseTriggers: number;
  freeTalkSeconds: number;
  reactionP50: number | null;
  reactionP95: number | null;
  detectP50: number | null;
  detectP95: number | null;
  /** Share of requested swipes recognised correctly (MHR02 target >= 0.9). */
  hitRate: number;
}

const pct = (v: number[], p: number): number | null => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
};

/** Alternating order (next, prev, next, …) so return movements do not count as the next trial. */
export function promptOrder(perDirection: number): Command[] {
  return Array.from({ length: perDirection * 2 }, (_, i) => (i % 2 === 0 ? "next" : "prev"));
}

export class StudySession {
  readonly plan: StudyPlan;
  readonly order: Command[];
  phase: Phase;
  readonly trials: TrialResult[] = [];
  falseTriggers = 0;
  private promptStart = 0;
  private freeStart = 0;
  private freeEnd = 0;

  constructor(t: number, plan: StudyPlan = DEFAULT_PLAN) {
    this.plan = plan;
    this.order = promptOrder(plan.perDirection);
    this.phase = { kind: "gap", until: t + plan.gap, next: 0 };
  }

  /** Advances time; call every frame or timer tick. */
  tick(t: number): void {
    const p = this.phase;
    if (p.kind === "gap" && t >= p.until) this.startPrompt(p.next, t);
    else if (p.kind === "prompt" && t >= p.until) this.finishPrompt({ command: p.command, outcome: "miss", responseMs: null, reactionMs: null, detectMs: null }, t);
    else if (p.kind === "free" && t >= p.until) {
      this.freeEnd = p.until;
      this.phase = { kind: "done" };
    }
  }

  /** A slide key was (or would have been) sent. */
  trigger(t: number, command: Command, timing: { reactionMs?: number; detectMs?: number } = {}): void {
    this.tick(t);
    const p = this.phase;
    if (p.kind === "prompt") {
      this.finishPrompt({
        command: p.command,
        outcome: command === p.command ? "hit" : "wrong",
        responseMs: (t - this.promptStart) * 1000,
        reactionMs: timing.reactionMs ?? null,
        detectMs: timing.detectMs ?? null,
      }, t);
    } else if (p.kind === "free") {
      this.falseTriggers++;
    }
    // Triggers during gaps are return movements or late swipes: not counted.
  }

  /** Skips the rest of free talk (e.g. the tester ends early). */
  endFreeTalk(t: number): void {
    if (this.phase.kind !== "free") return;
    this.freeEnd = t;
    this.phase = { kind: "done" };
  }

  get progress(): { done: number; total: number } {
    return { done: this.trials.length, total: this.order.length };
  }

  report(): StudyReport {
    const hits = this.trials.filter((r) => r.outcome === "hit");
    const reaction = hits.map((r) => r.reactionMs).filter((v): v is number => v !== null);
    const detect = hits.map((r) => r.detectMs).filter((v): v is number => v !== null);
    return {
      trials: this.trials,
      hits: hits.length,
      misses: this.trials.filter((r) => r.outcome === "miss").length,
      wrong: this.trials.filter((r) => r.outcome === "wrong").length,
      falseTriggers: this.falseTriggers,
      freeTalkSeconds: Math.max(0, this.freeEnd - this.freeStart),
      reactionP50: pct(reaction, 50),
      reactionP95: pct(reaction, 95),
      detectP50: pct(detect, 50),
      detectP95: pct(detect, 95),
      hitRate: this.trials.length ? hits.length / this.trials.length : 0,
    };
  }

  private startPrompt(index: number, t: number): void {
    if (index >= this.order.length) {
      this.freeStart = t;
      this.phase = { kind: "free", until: t + this.plan.freeTalk };
      return;
    }
    this.promptStart = t;
    this.phase = { kind: "prompt", index, command: this.order[index]!, until: t + this.plan.promptTimeout };
  }

  private finishPrompt(r: TrialResult, t: number): void {
    const index = this.phase.kind === "prompt" ? this.phase.index : 0;
    this.trials.push(r);
    this.phase = { kind: "gap", until: t + this.plan.gap, next: index + 1 };
  }
}

/** The report as CSV (one row per trial, summary at the end) for the milestone documentation. */
export function reportCsv(r: StudyReport, meta: Record<string, string>): string {
  const f = (v: number | null) => (v === null ? "" : v.toFixed(0));
  const rows = [
    ["versuch", "befehl", "ergebnis", "antwort_ms", "reaktion_ms", "detect_ms"],
    ...r.trials.map((t, i) => [String(i + 1), t.command, t.outcome, f(t.responseMs), f(t.reactionMs), f(t.detectMs)]),
    [],
    ["treffer", String(r.hits)],
    ["verpasst", String(r.misses)],
    ["falsche_richtung", String(r.wrong)],
    ["trefferquote", r.hitRate.toFixed(3)],
    ["fehlausloesungen_freies_reden", String(r.falseTriggers)],
    ["freies_reden_s", r.freeTalkSeconds.toFixed(0)],
    ["reaktion_p50_ms", f(r.reactionP50)],
    ["reaktion_p95_ms", f(r.reactionP95)],
    ["detect_p50_ms", f(r.detectP50)],
    ["detect_p95_ms", f(r.detectP95)],
    ...Object.entries(meta).map(([k, v]) => [k, v]),
  ];
  return rows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}
