import { GesturePipeline, type PipelineEvent, type PipelineSettings } from "../pipeline/GesturePipeline.ts";
import type { Recording } from "./format.ts";

export interface ReplayEvent {
  t: number;
  event: string;
  command?: string;
}

export const toReplayEvent = (e: PipelineEvent): ReplayEvent =>
  e.type === "trigger" ? { t: e.t, event: "trigger", command: e.command } : { t: e.t, event: e.type };

/**
 * Runs a recording through a fresh pipeline with the recorded settings (or overrides) and the
 * recorded live parameter changes. Deterministic: the same recording always gives the same events.
 */
export function replay(rec: Recording, override: Partial<PipelineSettings> = {}): ReplayEvent[] {
  const p = new GesturePipeline({ ...rec.header.settings, ...override, swipe: { ...rec.header.settings.swipe, ...override.swipe } });
  const changes = [...rec.settings];
  const out: ReplayEvent[] = [];
  for (const f of rec.frames) {
    // A change is recorded with the time of the last frame processed before it, so it applies from
    // the next frame on, as it did live.
    while (changes.length && changes[0]!.t < f.t) {
      const { patch } = changes.shift()!;
      const swipe = patch.swipe || override.swipe ? { swipe: { ...patch.swipe!, ...override.swipe } } : {};
      p.updateSettings({ ...patch, ...override, ...swipe });
    }
    for (const e of p.step(f).events) out.push(toReplayEvent(e));
  }
  return out;
}

/** Differences between two event lists (same events at the same frame times). */
export function diffEvents(expected: readonly ReplayEvent[], actual: readonly ReplayEvent[]): string[] {
  const key = (e: ReplayEvent) => `${e.t.toFixed(4)} ${e.event}${e.command ? `:${e.command}` : ""}`;
  // Counted, not a set: two equal events in one frame (two people ignored at once) must both match.
  const left = new Map<string, number>();
  for (const e of actual) left.set(key(e), (left.get(key(e)) ?? 0) + 1);
  const missing: string[] = [];
  for (const e of expected) {
    const n = left.get(key(e)) ?? 0;
    if (n > 0) left.set(key(e), n - 1);
    else missing.push(`- ${key(e)}`);
  }
  const extra = [...left].flatMap(([k, n]) => Array.from({ length: n }, () => `+ ${k}`));
  return [...missing, ...extra];
}
