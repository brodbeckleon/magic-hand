import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { autotune } from "../../core/calibration/autotune.ts";
import { checkFraming, meanLuma, type Check } from "../../core/calibration/framingCheck.ts";
import { MovementSegmenter, type Movement } from "../../core/calibration/practice.ts";
import type { PoseObs } from "../../core/types.ts";
import { proposeZone } from "../../core/zone/proposeZone.ts";
import type { Rect } from "../../core/zone/Zone.ts";
import { Icon } from "../design/Icon.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useFrame } from "../engine/frameContext.ts";
import { DirectionIllustration, HoldStillDemo, SwipeDemo } from "../screens/illustrations.tsx";
import { useSettings } from "../state/settings.ts";
import { useUi } from "../state/ui.ts";
import { SilhouetteGuide, ZoneEditor } from "./guides.tsx";
import { CheckRow, StepFrame, type Action } from "./StepFrame.tsx";

export interface StepNav {
  next: () => void;
  back?: () => void;
  finish: () => void;
}

/** Movements of the hand that is currently in view, segmented into swipes. */
function useMovements(onMovement: (m: Movement) => void): void {
  const engine = useEngineInstance();
  const emit = useEffectEvent(onMovement);
  useEffect(() => {
    const seg = new MovementSegmenter();
    return engine.frames.subscribe((s) => {
      const view = s.hands.find((h) => h.side === s.activeSide) ?? s.hands[0];
      const m = seg.update(s.t, view ? view.hand : null);
      if (m) emit(m);
    });
  }, [engine]);
}

// ---------------------------------------------------------------------------------------------
export function WelcomeStep({ nav, onSkipAll }: { nav: StepNav; onSkipAll: () => void }) {
  const { t } = useTranslation();
  return (
    <StepFrame title={t("wizard.welcome.title")} primary={{ label: t("wizard.welcome.start"), onClick: nav.next }}
      secondary={{ label: t("wizard.welcome.skip"), onClick: onSkipAll, testId: "wizard-skip-all" }}>
      <p className="lead">{t("wizard.welcome.lead")}</p>
      <ul className="welcome-points">
        <li><SwipeDemo next="left" /><span>{t("wizard.welcome.p1")}</span></li>
        <li><HoldStillDemo /><span>{t("wizard.welcome.p2")}</span></li>
      </ul>
      <p className="privacy-line"><Icon name="shield" size={16} /> {t("wizard.welcome.privacy")}</p>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------------------------
/** First run: try both directions, then pick the one that felt natural (backlog question). */
export function DirectionStep({ nav }: { nav: StepNav }) {
  const { t } = useTranslation();
  const reverse = useSettings((s) => s.reverse);
  const update = useSettings((s) => s.update);
  const [tried, setTried] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
  const [last, setLast] = useState<"left" | "right" | null>(null);
  useMovements((m) => {
    if (Math.abs(m.dy) > Math.abs(m.dx)) return;
    const dir = m.dx < 0 ? "left" : "right";
    setLast(dir);
    setTried((s) => ({ ...s, [dir]: s[dir] + 1 }));
  });
  const choice = reverse ? "right" : "left";
  return (
    <StepFrame title={t("wizard.direction.title")} onBack={nav.back} primary={{ label: t("common.next"), onClick: nav.next }}>
      <p>{t("wizard.direction.lead")}</p>
      <div className="direction-cards" role="radiogroup" aria-label={t("wizard.direction.title")}>
        {(["left", "right"] as const).map((d) => (
          <button key={d} role="radio" aria-checked={choice === d} className="direction-card" data-testid={`direction-${d}`}
            data-flash={last === d ? "true" : undefined} onClick={() => update({ reverse: d === "right" })}>
            <DirectionIllustration next={d} />
            <strong>{t(d === "left" ? "prefs.directionLeft" : "prefs.directionRight")}</strong>
            <small>{t(d === "left" ? "wizard.direction.leftHint" : "wizard.direction.rightHint")}</small>
            <span className="tried">{tried[d] > 0 ? t("wizard.direction.tried", { n: tried[d] }) : " "}</span>
          </button>
        ))}
      </div>
      <p className="dim small">{t("wizard.direction.note")}</p>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------------------------
const checkState = (c: Check): "ok" | "bad" | "wait" => (c === "ok" ? "ok" : c === "unknown" ? "wait" : "bad");

export function FramingStep({ nav }: { nav: StepNav }) {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const { video } = useFrame();
  const [luma, setLuma] = useState<number | null>(null);
  const [poses, setPoses] = useState<PoseObs[] | null>(null);
  const [handPx, setHandPx] = useState<number | null>(null);

  useEffect(() => engine.requestPose({ fullFrame: true }), [engine]);
  useEffect(() => {
    let last = 0;
    return engine.observations.subscribe((f) => {
      if (f.t - last < 0.3) return;
      last = f.t;
      if (f.poses) setPoses(f.poses);
    });
  }, [engine]);
  useEffect(() => engine.frames.subscribe((s) => setHandPx(s.hands[0] ? s.hands[0].hand.scale : null)), [engine]);
  useEffect(() => {
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const id = window.setInterval(() => {
      if (!ctx || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, 32, 24);
      setLuma(meanLuma(ctx.getImageData(0, 0, 32, 24).data)); // in memory only, discarded at once
    }, 400);
    return () => window.clearInterval(id);
  }, [video]);

  const r = checkFraming(luma, poses, handPx);
  const allOk = r.light === "ok" && r.distance === "ok" && r.hand === "ok";
  return (
    <StepFrame title={t("wizard.framing.title")} onBack={nav.back}
      primary={{ label: allOk ? t("common.next") : t("wizard.continueAnyway"), onClick: nav.next }}>
      <SilhouetteGuide ok={allOk} />
      <p>{t("wizard.framing.lead")}</p>
      <div className="checks" data-testid="framing-checks">
        <CheckRow state={checkState(r.light)} label={t("wizard.framing.light")} detail={r.light === "low" ? t("wizard.framing.lightLow") : r.light === "high" ? t("wizard.framing.lightHigh") : undefined} />
        <CheckRow state={checkState(r.distance)} label={t("wizard.framing.distance")} detail={r.distance === "low" ? t("wizard.framing.tooFar") : r.distance === "high" ? t("wizard.framing.tooClose") : r.distance === "unknown" ? t("wizard.framing.noPerson") : undefined} />
        <CheckRow state={checkState(r.hand)} label={t("wizard.framing.hand")} detail={r.hand === "low" ? t("wizard.framing.handSmall") : r.hand === "unknown" ? t("wizard.framing.showHand") : undefined} />
      </div>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------------------------
const OBSERVE_S = 3;

/** Proposes the presenter zone from the people in view, then lets the user adjust it (MHR01). */
export function ZoneStep({ nav }: { nav: StepNav }) {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const stored = useSettings((s) => s.zone);
  const update = useSettings((s) => s.update);
  const setDraft = useUi((s) => s.setZoneDraft);
  const [phase, setPhase] = useState<"observing" | "edit">("observing");
  const [zone, setZone] = useState<Rect | null>(stored);
  const [found, setFound] = useState(true);
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (phase !== "observing") return;
    const release = engine.requestPose({ fullFrame: true });
    const seen: PoseObs[][] = [];
    let t0: number | null = null;
    const off = engine.observations.subscribe((f) => {
      t0 ??= f.t;
      if (f.poses) seen.push(f.poses);
      setProgress(Math.min(1, (f.t - t0) / OBSERVE_S));
      if (f.t - t0 >= OBSERVE_S) {
        off();
        const z = proposeZone(seen);
        setFound(z !== null);
        setZone(z ?? stored);
        setPhase("edit");
      }
    });
    return () => {
      off();
      release();
    };
  }, [engine, phase, run, stored]);

  useEffect(() => {
    setDraft(phase === "edit" ? zone : null);
  }, [phase, zone, setDraft]);
  useEffect(() => () => setDraft(undefined), [setDraft]);

  const confirm = () => {
    update({ zone });
    nav.next();
  };
  if (phase === "observing") {
    return (
      <StepFrame title={t("wizard.zone.title")} onBack={nav.back} secondary={{ label: t("common.skip"), onClick: nav.next }}>
        <p>{t("wizard.zone.observing")}</p>
        <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
        <p className="dim small"><Icon name="info" size={14} /> {t("wizard.zone.fullFrameNote")}</p>
      </StepFrame>
    );
  }
  return (
    <StepFrame title={t("wizard.zone.title")} onBack={nav.back}
      primary={{ label: t("wizard.zone.confirm"), onClick: confirm, testId: "zone-confirm" }}
      secondary={{ label: t("wizard.zone.again"), onClick: () => { setPhase("observing"); setRun((r) => r + 1); } }}>
      {zone && <ZoneEditor zone={zone} onChange={setZone} />}
      <p>{found ? t("wizard.zone.lead") : t("wizard.zone.nobody")}</p>
      <ul className="small-list">
        <li>{t("wizard.zone.tipDrag")}</li>
        <li>{t("wizard.zone.tipPrivacy")}</li>
      </ul>
      <div className="button-row">
        {zone ? (
          <button className="link" data-testid="zone-whole" onClick={() => setZone(null)}>{t("wizard.zone.whole")}</button>
        ) : (
          <button className="link" onClick={() => setZone({ x: 0.15, y: 0.05, w: 0.7, h: 0.95 })}>{t("wizard.zone.limit")}</button>
        )}
      </div>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------------------------
export function ArmStep({ nav, autoNext = true }: { nav: StepNav; autoNext?: boolean }) {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const [calibrated, setCalibrated] = useState(false);
  // Start from scratch and wait for this hold, not an earlier calibration.
  useEffect(() => {
    engine.recalibrate();
    return engine.events.subscribe((e) => e.kind === "calibrated" && setCalibrated(true));
  }, [engine]);
  useEffect(() => {
    if (!calibrated || !autoNext) return;
    const id = window.setTimeout(nav.next, 900);
    return () => window.clearTimeout(id);
  }, [calibrated, autoNext, nav.next]);
  return (
    <StepFrame title={t("wizard.arm.title")} onBack={nav.back}
      primary={{ label: calibrated ? t("common.next") : t("common.skip"), onClick: nav.next }}>
      <div className="arm-visual">
        <HoldStillDemo />
        <AnimatePresence mode="wait">
          {calibrated ? (
            <motion.p key="ok" className="ok-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="arm-done">
              <Icon name="check" size={18} /> {t("wizard.arm.done")}
            </motion.p>
          ) : (
            <motion.p key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{t("wizard.arm.lead")}</motion.p>
          )}
        </AnimatePresence>
      </div>
      <p className="dim small">{t("wizard.arm.why")}</p>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------------------------
export const PRACTICE_PER_SIDE = 3;

export function PracticeStep({ nav, onDone }: { nav: StepNav; onDone: (m: Movement[]) => void }) {
  const { t } = useTranslation();
  const reverse = useSettings((s) => s.reverse);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [feedback, setFeedback] = useState<{ id: number; kind: "ok" | "diagonal"; dir: "left" | "right" } | null>(null);
  const counts = {
    left: moves.filter((m) => m.dx < 0).length,
    right: moves.filter((m) => m.dx > 0).length,
  };
  useMovements((m) => {
    const dir = m.dx < 0 ? "left" : "right";
    if (Math.abs(m.dy) > 0.8 * Math.abs(m.dx)) {
      setFeedback({ id: Date.now(), kind: "diagonal", dir });
      return;
    }
    setMoves((list) => (list.filter((x) => (x.dx < 0) === (m.dx < 0)).length >= PRACTICE_PER_SIDE ? list : [...list, m]));
    setFeedback({ id: Date.now(), kind: "ok", dir });
  });
  const done = counts.left >= PRACTICE_PER_SIDE && counts.right >= PRACTICE_PER_SIDE;
  const finish = () => {
    onDone(moves);
    nav.next();
  };
  const nextDir = reverse ? "right" : "left";
  return (
    <StepFrame title={t("wizard.practice.title")} onBack={nav.back}
      primary={{ label: done ? t("common.next") : t("common.skip"), onClick: finish, disabled: false }}>
      <p>{t("wizard.practice.lead", { n: PRACTICE_PER_SIDE })}</p>
      <div className="practice-targets" data-testid="practice">
        {(["left", "right"] as const).map((d) => (
          <div key={d} className="practice-target" data-done={counts[d] >= PRACTICE_PER_SIDE}>
            <Icon name={d === "left" ? "arrowLeft" : "arrowRight"} size={28} />
            <div className="pips">
              {Array.from({ length: PRACTICE_PER_SIDE }, (_, i) => <span key={i} className="pip" data-on={i < counts[d]} />)}
            </div>
            <small>{t(d === nextDir ? "wizard.practice.nextSlide" : "wizard.practice.prevSlide")}</small>
          </div>
        ))}
      </div>
      <div className="practice-feedback" aria-live="polite">
        <AnimatePresence mode="wait">
          {feedback && (
            <motion.span key={feedback.id} className={`fb ${feedback.kind}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {feedback.kind === "ok" ? t("wizard.practice.ok") : t("wizard.practice.diagonal")}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="dim small">{t("wizard.practice.note")}</p>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------------------------
export function SummaryStep({ nav, moves }: { nav: StepNav; moves: Movement[] }) {
  const { t } = useTranslation();
  const swipe = useSettings((s) => s.swipe);
  const updateSwipe = useSettings((s) => s.updateSwipe);
  const result = autotune(moves);
  const usable = result.used >= 2;
  const rows: { key: "distance" | "window" | "maxSlope"; fmt: (v: number) => string }[] = [
    { key: "distance", fmt: (v) => t("wizard.summary.handLengths", { v: v.toFixed(1) }) },
    { key: "window", fmt: (v) => `${(v * 1000).toFixed(0)} ms` },
    { key: "maxSlope", fmt: (v) => `${Math.round((Math.atan(v) * 180) / Math.PI)}°` },
  ];
  const keep: Action = { label: t("wizard.summary.keep"), onClick: nav.finish, testId: "summary-keep" };
  return (
    <StepFrame title={t("wizard.summary.title")} onBack={nav.back}
      primary={usable ? { label: t("wizard.summary.use"), onClick: () => { updateSwipe(result.params); nav.finish(); }, testId: "summary-use" } : { ...keep, label: t("common.done") }}
      secondary={usable ? keep : undefined}>
      {usable ? (
        <>
          <p>{t("wizard.summary.lead", { n: result.used })}</p>
          <table className="summary-table" data-testid="summary-table">
            <thead><tr><th /><th>{t("wizard.summary.now")}</th><th>{t("wizard.summary.new")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th>{t(`wizard.summary.${r.key}`)}</th>
                  <td>{r.fmt(swipe[r.key])}</td>
                  <td data-changed={swipe[r.key] !== result.params[r.key]}>{r.fmt(result.params[r.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>{t("wizard.summary.notEnough")}</p>
      )}
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------------------------
export function DoneStep({ nav, onPresent }: { nav: StepNav; onPresent: () => void }) {
  const { t } = useTranslation();
  const reverse = useSettings((s) => s.reverse);
  return (
    <StepFrame title={t("wizard.done.title")} onBack={nav.back}
      primary={{ label: t("main.present"), onClick: onPresent, testId: "done-present" }}
      secondary={{ label: t("wizard.done.stay"), onClick: nav.finish, testId: "done-stay" }}>
      <SwipeDemo next={reverse ? "right" : "left"} />
      <p>{t("wizard.done.lead")}</p>
      <p className="dim small">{t("wizard.done.calibrateLater")}</p>
    </StepFrame>
  );
}
