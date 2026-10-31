import { create } from "zustand";

export interface Sample {
  fps: number;
  handMs: number;
  pipelineMs: number;
}

export interface TriggerTiming {
  /** Threshold frame captured -> key sent, ms (MHR06 part we control). */
  detectMs: number;
  /** Movement onset -> key sent, ms (includes the swipe itself). */
  reactionMs: number;
}

interface DevStore {
  samples: Sample[];
  triggers: TriggerTiming[];
  dropped: number;
  recording: { startedAt: number; seconds: number; frames: number } | null;
  replay: { name: string; done: number; total: number; finished: boolean; diff: number | null } | null;
  addSample(s: Sample, dropped: number): void;
  addTrigger(t: TriggerTiming): void;
  set(patch: Partial<Pick<DevStore, "recording" | "replay">>): void;
}

const MAX_SAMPLES = 40; // 10 s at 4 Hz
const MAX_TRIGGERS = 20;

export const useDev = create<DevStore>()((set) => ({
  samples: [],
  triggers: [],
  dropped: 0,
  recording: null,
  replay: null,
  addSample: (s, dropped) => set((st) => ({ samples: [...st.samples, s].slice(-MAX_SAMPLES), dropped })),
  addTrigger: (t) => set((st) => ({ triggers: [...st.triggers, t].slice(-MAX_TRIGGERS) })),
  set: (patch) => set(patch),
}));

export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}
