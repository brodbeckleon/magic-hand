import { DEFAULT_PLAN, promptOrder, reportCsv, StudySession } from "../../src/core/study/StudySession.ts";

const plan = { ...DEFAULT_PLAN, perDirection: 2, freeTalk: 10 };

/** Advances to the next prompt and returns its start time. */
function toPrompt(s: StudySession, t: number): number {
  while (s.phase.kind !== "prompt" && s.phase.kind !== "free" && s.phase.kind !== "done") s.tick((t += 0.05));
  return t;
}

describe("StudySession", () => {
  it("alternates directions so return movements fall into the gaps", () => {
    expect(promptOrder(3)).toEqual(["next", "prev", "next", "prev", "next", "prev"]);
  });

  it("counts hits, wrong directions and misses, then free talk false triggers", () => {
    const s = new StudySession(0, plan);
    let t = toPrompt(s, 0);
    s.trigger((t += 0.6), "next", { reactionMs: 300, detectMs: 80 }); // hit
    t = toPrompt(s, t);
    s.trigger((t += 0.7), "next", { reactionMs: 350, detectMs: 90 }); // wrong (prev wanted)
    t = toPrompt(s, t);
    s.tick((t += plan.promptTimeout + 0.01)); // miss
    t = toPrompt(s, t);
    s.trigger((t += 0.5), "prev", { reactionMs: 420, detectMs: 100 }); // hit
    t = toPrompt(s, t);
    expect(s.phase.kind).toBe("free");
    s.trigger((t += 2), "next");
    s.tick(t + plan.freeTalk);
    expect(s.phase.kind).toBe("done");

    const r = s.report();
    expect(r.trials.map((x) => x.outcome)).toEqual(["hit", "wrong", "miss", "hit"]);
    expect([r.hits, r.misses, r.wrong, r.falseTriggers]).toEqual([2, 1, 1, 1]);
    expect(r.hitRate).toBeCloseTo(0.5, 9);
    expect(r.reactionP50).toBe(300);
    expect(r.reactionP95).toBe(420);
    expect(r.freeTalkSeconds).toBeCloseTo(10, 0);
  });

  it("ignores triggers during the gaps (return movements)", () => {
    const s = new StudySession(0, plan);
    let t = toPrompt(s, 0);
    s.trigger((t += 0.5), "next");
    s.trigger(t + 0.3, "prev"); // gap
    expect(s.trials).toHaveLength(1);
  });

  it("free talk can be ended early", () => {
    const s = new StudySession(0, { ...plan, perDirection: 1 });
    let t = toPrompt(s, 0);
    s.trigger((t += 0.5), "next");
    t = toPrompt(s, t);
    s.trigger((t += 0.5), "prev");
    t = toPrompt(s, t);
    s.endFreeTalk(t + 3);
    expect(s.phase.kind).toBe("done");
    expect(s.report().freeTalkSeconds).toBeCloseTo(3, 1);
  });

  it("exports a CSV report", () => {
    const s = new StudySession(0, { ...plan, perDirection: 1 });
    const t = toPrompt(s, 0);
    s.trigger(t + 0.5, "next", { reactionMs: 310, detectMs: 70 });
    const csv = reportCsv(s.report(), { distanz: "3 m" });
    expect(csv.split("\r\n")[0]).toBe("versuch,befehl,ergebnis,antwort_ms,reaktion_ms,detect_ms");
    expect(csv).toContain("1,next,hit,500,310,70");
    expect(csv).toContain("distanz,3 m");
  });
});
