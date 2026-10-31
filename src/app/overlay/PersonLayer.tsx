import { useEffect, useRef } from "react";
import { mirrorRect } from "../../core/zone/Zone.ts";
import type { PipelineSnapshot } from "../../core/pipeline/GesturePipeline.ts";
import { useEngineInstance } from "../engine/context.ts";

const MAX = 4;

/**
 * With several people in view: a soft halo around the person who may change slides, the others
 * dimmed, and a ring that fills around a raised open hand (taking over). Direct DOM updates.
 */
export function PersonLayer() {
  const engine = useEngineInstance();
  const svg = useRef<SVGSVGElement>(null);
  const people = useRef<(SVGGElement | null)[]>([]);
  const claims = useRef<(SVGGElement | null)[]>([]);

  useEffect(
    () =>
      engine.frames.subscribe((s: PipelineSnapshot) => {
        const el = svg.current;
        if (!el) return;
        const vb = `0 0 ${s.width} ${s.height}`;
        if (el.getAttribute("viewBox") !== vb) el.setAttribute("viewBox", vb);
        const multi = s.persons.length >= 2;
        const unit = Math.max(s.width, s.height) / 640;
        for (let i = 0; i < MAX; i++) {
          const g = people.current[i];
          const p = s.persons[i];
          if (!g) continue;
          if (!multi || !p) {
            g.setAttribute("visibility", "hidden");
            continue;
          }
          const m = mirrorRect(p.box);
          const pad = 0.03;
          const x = (m.x - pad) * s.width;
          const y = (m.y - pad) * s.height;
          const w = (m.w + 2 * pad) * s.width;
          const h = (m.h + 2 * pad) * s.height;
          const [halo, dim, label] = g.children as unknown as [SVGRectElement, SVGRectElement, SVGTextElement];
          for (const r of [halo, dim]) {
            r.setAttribute("x", x.toFixed(1));
            r.setAttribute("y", y.toFixed(1));
            r.setAttribute("width", w.toFixed(1));
            r.setAttribute("height", h.toFixed(1));
            r.setAttribute("rx", String(18 * unit));
          }
          halo.setAttribute("stroke-width", String(4 * unit));
          label.setAttribute("x", (x + 10 * unit).toFixed(1));
          label.setAttribute("y", (y + 22 * unit).toFixed(1));
          label.setAttribute("font-size", String(15 * unit));
          label.textContent = `${p.active ? "★ " : ""}${p.id}`;
          g.dataset.active = String(p.active);
          g.setAttribute("visibility", "visible");
        }
        for (let i = 0; i < MAX; i++) {
          const g = claims.current[i];
          // Taking over only means something with several people in view; alone, the ring would
          // just compete with the calibration ring.
          const h = multi ? s.hands.filter((x) => x.claim > 0.05)[i] : undefined;
          if (!g) continue;
          if (!h) {
            g.setAttribute("visibility", "hidden");
            continue;
          }
          const [track, fill] = g.children as unknown as [SVGCircleElement, SVGCircleElement];
          const r = h.hand.scale * 1.8;
          for (const c of [track, fill]) {
            c.setAttribute("cx", h.hand.cx.toFixed(1));
            c.setAttribute("cy", h.hand.cy.toFixed(1));
            c.setAttribute("r", r.toFixed(1));
            c.setAttribute("stroke-width", String(6 * unit));
          }
          fill.setAttribute("stroke-dashoffset", String(100 - h.claim * 100));
          fill.setAttribute("transform", `rotate(-90 ${h.hand.cx.toFixed(1)} ${h.hand.cy.toFixed(1)})`);
          g.setAttribute("visibility", "visible");
        }
      }),
    [engine],
  );

  return (
    <svg ref={svg} className="overlay person-layer" preserveAspectRatio="none" aria-hidden data-testid="person-layer">
      {Array.from({ length: MAX }, (_, i) => (
        <g key={`p${i}`} ref={(el) => { people.current[i] = el; }} className="person" visibility="hidden">
          <rect className="person-halo" fill="none" />
          <rect className="person-dim" />
          <text className="person-label" />
        </g>
      ))}
      {Array.from({ length: MAX }, (_, i) => (
        <g key={`c${i}`} ref={(el) => { claims.current[i] = el; }} className="claim-ring" visibility="hidden">
          <circle fill="none" className="claim-track" />
          <circle fill="none" className="claim-fill" pathLength={100} strokeDasharray="100" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
