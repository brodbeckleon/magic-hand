import { create } from "zustand";
import { DEFAULT_PLAN, StudySession, type Phase, type StudyPlan, type StudyReport } from "../../core/study/StudySession.ts";
import type { Engine } from "../engine/Engine.ts";

interface StudyStore {
  phase: Phase | null;
  progress: { done: number; total: number };
  last: "hit" | "miss" | "wrong" | null;
  report: StudyReport | null;
  meta: Record<string, string>;
  start(engine: Engine, plan: StudyPlan, meta: Record<string, string>): void;
  stop(): void;
  endFreeTalk(): void;
  clear(): void;
}

const now = () => performance.now() / 1000;
let teardown: (() => void) | null = null;
let session: StudySession | null = null;

/** Runs a StudySession against the live engine: no keys are sent while it runs. */
export const useStudy = create<StudyStore>()((set, get) => ({
  phase: null,
  progress: { done: 0, total: 0 },
  last: null,
  report: null,
  meta: {},
  start: (engine, plan, meta) => {
    teardown?.();
    session = new StudySession(now(), plan);
    const s = session;
    const release = engine.suppressKeys();
    const sync = () => {
      const before = s.trials.length;
      s.tick(now());
      const last = s.trials.length > before ? s.trials[s.trials.length - 1]!.outcome : get().last;
      set({ phase: s.phase, progress: s.progress, last });
      if (s.phase.kind === "done") finish();
    };
    const offEvents = engine.events.subscribe((e) => {
      if (e.kind !== "next" && e.kind !== "prev") return;
      const before = s.trials.length;
      s.trigger(now(), e.kind, { reactionMs: e.reactionMs, detectMs: e.detectMs });
      if (s.trials.length > before) set({ last: s.trials[s.trials.length - 1]!.outcome });
      sync();
    });
    const timer = window.setInterval(sync, 100);
    const finish = () => {
      teardown?.();
      set({ report: s.report(), phase: { kind: "done" } });
    };
    teardown = () => {
      window.clearInterval(timer);
      offEvents();
      release();
      teardown = null;
    };
    set({ phase: s.phase, progress: s.progress, last: null, report: null, meta });
  },
  stop: () => {
    teardown?.();
    session = null;
    set({ phase: null, report: null, last: null });
  },
  endFreeTalk: () => {
    session?.endFreeTalk(now());
  },
  clear: () => set({ phase: null, report: null, last: null }),
}));

export { DEFAULT_PLAN };
