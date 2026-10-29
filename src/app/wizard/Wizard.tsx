import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Movement } from "../../core/calibration/practice.ts";
import { Icon } from "../design/Icon.tsx";
import { spring } from "../design/controls.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useSettings } from "../state/settings.ts";
import { useUi, type WizardKind } from "../state/ui.ts";
import { ArmStep, DirectionStep, DoneStep, FramingStep, PracticeStep, SummaryStep, WelcomeStep, ZoneStep, type StepNav } from "./steps.tsx";
import "./wizard.css";

const FLOWS: Record<WizardKind, string[]> = {
  firstRun: ["welcome", "direction", "zone", "arm", "done"],
  calibrate: ["framing", "zone", "arm", "practice", "summary"],
};

/**
 * Guided flows over the live camera. Every step can be skipped and the whole wizard closed;
 * no keys are sent while it is open, so practising never changes a slide.
 */
export function Wizard({ kind }: { kind: WizardKind }) {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const close = useUi((s) => s.closeWizard);
  const setView = useUi((s) => s.setView);
  const update = useSettings((s) => s.update);
  const steps = FLOWS[kind];
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [moves, setMoves] = useState<Movement[]>([]);
  const step = steps[index]!;

  useEffect(() => engine.suppressKeys(), [engine]);

  const finish = useCallback(() => {
    if (kind === "firstRun") update({ firstRunDone: true });
    close();
  }, [kind, update, close]);
  const nav: StepNav = useMemo(() => ({
    next: () => (index + 1 < steps.length ? (setDir(1), setIndex(index + 1)) : finish()),
    back: index > 0 ? () => (setDir(-1), setIndex(index - 1)) : undefined,
    finish,
  }), [index, steps.length, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  return (
    <motion.aside className="wizard glass" role="dialog" aria-label={t(`wizard.${kind}.name`)} data-testid={`wizard-${kind}`}
      data-step={step} initial={{ x: "105%" }} animate={{ x: 0 }} transition={spring}>
      <header className="wizard-head">
        <span className="wizard-name">{t(`wizard.${kind}.name`)}</span>
        <ol className="dots" aria-label={t("wizard.progress", { n: index + 1, total: steps.length })}>
          {steps.map((s, i) => <li key={s} data-state={i < index ? "done" : i === index ? "current" : "todo"} />)}
        </ol>
        <button className="icon-btn" onClick={finish} aria-label={t("common.close")} data-testid="wizard-close"><Icon name="close" /></button>
      </header>
      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={step} className="wizard-step" custom={dir}
          initial={{ opacity: 0, x: 30 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 * dir }}
          transition={{ duration: 0.18 }}>
          {step === "welcome" && <WelcomeStep nav={nav} onSkipAll={finish} />}
          {step === "direction" && <DirectionStep nav={nav} />}
          {step === "framing" && <FramingStep nav={nav} />}
          {step === "zone" && <ZoneStep nav={nav} />}
          {step === "arm" && <ArmStep nav={nav} />}
          {step === "practice" && <PracticeStep nav={nav} onDone={setMoves} />}
          {step === "summary" && <SummaryStep nav={nav} moves={moves} />}
          {step === "done" && <DoneStep nav={nav} onPresent={() => { finish(); setView("pill"); }} />}
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
}
