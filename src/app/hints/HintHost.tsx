import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../design/Icon.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";
import { useUi } from "../state/ui.ts";
import { HINTS, learnedKey, mayShow, shownKey, type HintId } from "./registry.ts";

const SHOW_S = 7;

/**
 * Watches what is happening and shows at most one short hint at a time. Hints count how often they
 * were shown and stop once learned (the user did the thing, or pressed "Got it").
 */
export function HintHost() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const [hint, setHint] = useState<HintId | null>(null);
  const lastShown = useRef(new Map<HintId, number>());
  const dismissRef = useRef<() => void>(() => setHint(null));

  const learn = (id: HintId) => {
    const { hints, update } = useSettings.getState();
    if (!hints[learnedKey(id)]) update({ hints: { [learnedKey(id)]: 1 } });
  };

  useEffect(() => {
    let hideTimer = 0;
    let triggers = 0;
    let noHandSince: number | null = null;
    let seenMulti = false;
    let seenFar = false;
    const queue: HintId[] = [];
    let current: HintId | null = null;
    const next = () => {
      current = null;
      setHint(null);
      const id = queue.shift();
      if (id) window.setTimeout(() => show(id), 400);
    };
    const show = (id: HintId) => {
      // One hint at a time; others wait their turn instead of replacing it.
      if (current) {
        if (current !== id && !queue.includes(id)) queue.push(id);
        return;
      }
      const now = performance.now() / 1000;
      const { hints, update, dev } = useSettings.getState();
      if (dev.unlocked && dev.showEvents) return; // developers see the raw event list instead
      if (useUi.getState().wizard || useUi.getState().sheet || useUi.getState().view !== "main") return;
      if (!mayShow(id, hints, lastShown.current.get(id), now)) return;
      lastShown.current.set(id, now);
      update({ hints: { [shownKey(id)]: (hints[shownKey(id)] ?? 0) + 1 } });
      current = id;
      setHint(id);
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(next, SHOW_S * 1000);
    };
    dismissRef.current = () => {
      clearTimeout(hideTimer);
      next();
    };

    const offEvents = engine.events.subscribe((e) => {
      if (e.kind !== "next" && e.kind !== "prev") return;
      triggers++;
      // Keys were sent while our own window had the focus: they did not reach the presentation.
      if (document.hasFocus() && useUi.getState().view === "main") show("focus");
      else if (triggers >= 3) show("present");
    });
    const offFrames = engine.frames.subscribe((s) => {
      if (!s.calibrated && s.hands.length === 0) {
        noHandSince ??= s.t;
        if (s.t - noHandSince > 8) show("noHand");
      } else {
        noHandSince = null;
      }
      if (s.persons.length >= 2 && !seenMulti) {
        seenMulti = true;
        show("takeover");
      }
      if (s.persons.some((p) => p.far) && !seenFar) {
        seenFar = true;
        show("far");
      }
    });
    return () => {
      offEvents();
      offFrames();
      clearTimeout(hideTimer);
    };
  }, [engine]);

  // Arming without help means "noHand" is learned.
  const calibrated = useEngine((s) => s.calibrated);
  useEffect(() => {
    if (calibrated) learn("noHand");
  }, [calibrated]);

  const anchor = hint ? HINTS[hint].anchor : undefined;
  return (
    <div className={`hint-slot${anchor ? ` anchor-${anchor}` : ""}`} aria-live="polite">
      <AnimatePresence>
        {hint && (
          <motion.div key={hint} className="hint glass" role="status" data-testid={`hint-${hint}`}
            initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}>
            <Icon name="info" size={18} />
            <span>{t(`hints.${hint}`)}</span>
            <button className="link" onClick={() => { learn(hint); dismissRef.current(); }} data-testid="hint-ok">{t("hints.ok")}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
