import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { mirrorRect } from "../../core/zone/Zone.ts";
import type { PipelineSnapshot } from "../../core/pipeline/GesturePipeline.ts";
import { useEngineInstance } from "../engine/context.ts";
import type { UiEventKind } from "../state/engine.ts";
import { attr, useOverlayVisible } from "./svg.ts";

const MAX = 4;
/** How long the short reason next to the hand stays, ms. */
const REASON_MS = 1000;

/** Ignored movements explained right next to the hand, in two or three words. */
const REASONS: Partial<Record<UiEventKind, string>> = {
  ignored_weak: "slow",
  ignored_return: "still",
  ignored_windup: "still",
  ignored_not_speaker: "turn",
  ignored_other_hand: "otherHand",
};

/** Text of a label chip; the chip's width follows the text (measured only when the text changes). */
function setChip(chip: SVGGElement, text: string, x: number, y: number, unit: number): void {
  const [bg, label] = chip.children as unknown as [SVGRectElement, SVGTextElement];
  const size = 14 * unit;
  if (label.textContent !== text || chip.dataset.unit !== String(unit)) {
    label.textContent = text;
    chip.dataset.unit = String(unit);
    attr(label, "font-size", size.toFixed(1));
    // getComputedTextLength needs layout; it is cheap here and only runs on a change.
    const w = (label.getComputedTextLength?.() || text.length * size * 0.55) + 16 * unit;
    chip.dataset.w = w.toFixed(1);
  }
  const w = Number(chip.dataset.w);
  const h = size + 10 * unit;
  attr(bg, "x", x.toFixed(1));
  attr(bg, "y", (y - h).toFixed(1));
  attr(bg, "width", w.toFixed(1));
  attr(bg, "height", h.toFixed(1));
  attr(bg, "rx", (h / 2).toFixed(1));
  attr(label, "x", (x + 8 * unit).toFixed(1));
  attr(label, "y", (y - h / 2 + size * 0.35).toFixed(1));
}

/**
 * With several people in view: a soft halo around the person who may change slides, the others
 * dimmed, a chip naming each person ("Controls the slides" / "Person 2"), and a ring that fills
 * around an open palm held up (taking over). Only people seen on more than one pose frame are
 * drawn. For anyone: a short reason next to the hand when a movement was ignored. Direct DOM
 * updates.
 */
export function PersonLayer() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const svg = useRef<SVGSVGElement>(null);
  const people = useRef<(SVGGElement | null)[]>([]);
  const claims = useRef<(SVGGElement | null)[]>([]);
  const reason = useRef<SVGGElement>(null);
  const visible = useOverlayVisible();

  useEffect(() => {
    if (!visible) return;
    let shown: { text: string; person: number | null; side: string | undefined; until: number } | null = null;
    let last: PipelineSnapshot | null = null;
    let timer = 0;

    /** Puts the reason next to its hand (or above the person, or top centre). */
    const placeReason = (s: PipelineSnapshot) => {
      const g = reason.current;
      if (!g) return;
      if (!shown || performance.now() > shown.until) {
        attr(g, "visibility", "hidden");
        return;
      }
      const unit = Math.max(s.width, s.height) / 640;
      const { person, side } = shown;
      const hand = s.hands.find((h) => h.person === person && h.side === side) ?? s.hands.find((h) => h.person === person) ?? (s.hands.length === 1 ? s.hands[0] : undefined);
      const box = s.persons.find((p) => p.id === person)?.box;
      let x: number;
      let y: number;
      if (hand) {
        x = hand.hand.cx + hand.hand.scale * 1.2;
        y = hand.hand.cy - hand.hand.scale * 1.2;
      } else if (box) {
        const m = mirrorRect(box);
        x = m.x * s.width;
        y = m.y * s.height;
      } else {
        x = s.width / 2 - 60 * unit;
        y = 40 * unit;
      }
      const chip = g.firstElementChild as SVGGElement;
      setChip(chip, shown.text, 0, 0, unit);
      // Keep the bubble inside the picture.
      const w = Number(chip.dataset.w);
      x = Math.min(Math.max(x, 4 * unit), s.width - w - 4 * unit);
      y = Math.max(y, 30 * unit);
      attr(g, "transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      attr(g, "visibility", "visible");
    };

    const offEvents = engine.events.subscribe((e) => {
      const key = REASONS[e.kind];
      if (!key) return;
      shown = { text: t(`overlay.reason.${key}`), person: e.person ?? null, side: e.side, until: performance.now() + REASON_MS };
      if (last) placeReason(last);
      clearTimeout(timer);
      timer = window.setTimeout(() => last && placeReason(last), REASON_MS + 50);
    });

    const offFrames = engine.frames.subscribe((s: PipelineSnapshot) => {
      last = s;
      const el = svg.current;
      if (!el) return;
      attr(el, "viewBox", `0 0 ${s.width} ${s.height}`);
      const confirmed = s.persons.filter((p) => p.confirmed);
      const multi = confirmed.length >= 2;
      const unit = Math.max(s.width, s.height) / 640;
      for (let i = 0; i < MAX; i++) {
        const g = people.current[i];
        const p = confirmed[i];
        if (!g) continue;
        if (!multi || !p) {
          attr(g, "visibility", "hidden");
          continue;
        }
        const m = mirrorRect(p.box);
        const pad = 0.03;
        const x = (m.x - pad) * s.width;
        const y = (m.y - pad) * s.height;
        const w = (m.w + 2 * pad) * s.width;
        const h = (m.h + 2 * pad) * s.height;
        const [halo, dim, chip] = g.children as unknown as [SVGRectElement, SVGRectElement, SVGGElement];
        for (const r of [halo, dim]) {
          attr(r, "x", x.toFixed(1));
          attr(r, "y", y.toFixed(1));
          attr(r, "width", w.toFixed(1));
          attr(r, "height", h.toFixed(1));
          attr(r, "rx", String(18 * unit));
        }
        attr(halo, "stroke-width", String(4 * unit));
        setChip(chip, p.active ? t("overlay.controls") : t("overlay.person", { n: p.slot ?? "–" }), x + 8 * unit, y + 34 * unit, unit);
        if (g.dataset.active !== String(p.active)) g.dataset.active = String(p.active);
        if (g.dataset.slot !== String(p.slot)) g.dataset.slot = String(p.slot);
        attr(g, "visibility", "visible");
      }
      // Taking over only means something with several people in view (alone, the ring would just
      // compete with the calibration ring), and not for the speaker, who already has control.
      const claiming = multi ? s.hands.filter((x) => x.claim > 0.05 && confirmed.some((p) => p.id === x.person && !p.active)) : [];
      for (let i = 0; i < MAX; i++) {
        const g = claims.current[i];
        const h = claiming[i];
        if (!g) continue;
        if (!h) {
          attr(g, "visibility", "hidden");
          continue;
        }
        const [track, fill] = g.children as unknown as [SVGCircleElement, SVGCircleElement];
        const r = h.hand.scale * 1.8;
        for (const c of [track, fill]) {
          attr(c, "cx", h.hand.cx.toFixed(1));
          attr(c, "cy", h.hand.cy.toFixed(1));
          attr(c, "r", r.toFixed(1));
          attr(c, "stroke-width", String(6 * unit));
        }
        attr(fill, "stroke-dashoffset", String(Math.round(100 - h.claim * 100)));
        attr(fill, "transform", `rotate(-90 ${h.hand.cx.toFixed(1)} ${h.hand.cy.toFixed(1)})`);
        attr(g, "visibility", "visible");
      }
      placeReason(s);
    });
    return () => {
      offEvents();
      offFrames();
      clearTimeout(timer);
    };
  }, [engine, t, visible]);

  return (
    <svg ref={svg} className="overlay person-layer" preserveAspectRatio="none" aria-hidden data-testid="person-layer">
      {Array.from({ length: MAX }, (_, i) => (
        <g key={`p${i}`} ref={(el) => { people.current[i] = el; }} className="person" visibility="hidden">
          <rect className="person-halo" fill="none" />
          <rect className="person-dim" />
          <g className="person-chip">
            <rect className="chip-bg" />
            <text className="person-label chip-text" />
          </g>
        </g>
      ))}
      {Array.from({ length: MAX }, (_, i) => (
        <g key={`c${i}`} ref={(el) => { claims.current[i] = el; }} className="claim-ring" visibility="hidden">
          <circle fill="none" className="claim-track" />
          <circle fill="none" className="claim-fill" pathLength={100} strokeDasharray="100" strokeLinecap="round" />
        </g>
      ))}
      <g ref={reason} className="reason" visibility="hidden" data-testid="reason">
        <g className="reason-chip">
          <rect className="chip-bg" />
          <text className="chip-text" />
        </g>
      </g>
    </svg>
  );
}
