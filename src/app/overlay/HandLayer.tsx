import { useEffect, useRef } from "react";
import type { PipelineSnapshot } from "../../core/pipeline/GesturePipeline.ts";
import type { Landmark } from "../../core/types.ts";
import { useEngineInstance } from "../engine/context.ts";

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const MAX_HANDS = 4;

/** Mirrored pixel position of a landmark (matches the mirrored video and handFeatures). */
const px = (lm: Landmark, w: number, h: number): [number, number] => [(1 - lm.x) * w, lm.y * h];

export function skeletonPath(lms: readonly Landmark[], w: number, h: number): string {
  let d = "";
  for (const [a, b] of HAND_CONNECTIONS) {
    const [x1, y1] = px(lms[a]!, w, h);
    const [x2, y2] = px(lms[b]!, w, h);
    d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return d;
}

export function jointsPath(lms: readonly Landmark[], w: number, h: number, r: number): string {
  let d = "";
  for (const lm of lms) {
    const [x, y] = px(lm, w, h);
    d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return d;
}

/**
 * Hand skeletons and the palm trail of the current movement. Updated by direct DOM writes on every
 * frame; React renders this component once.
 */
export function HandLayer() {
  const engine = useEngineInstance();
  const svg = useRef<SVGSVGElement>(null);
  const hands = useRef<(SVGGElement | null)[]>([]);
  const trail = useRef<SVGPathElement>(null);

  useEffect(
    () =>
      engine.frames.subscribe((s: PipelineSnapshot) => {
        const el = svg.current;
        if (!el) return;
        const vb = `0 0 ${s.width} ${s.height}`;
        if (el.getAttribute("viewBox") !== vb) el.setAttribute("viewBox", vb);
        const unit = Math.max(s.width, s.height) / 640; // stroke widths relative to a 640 px frame
        for (let i = 0; i < MAX_HANDS; i++) {
          const g = hands.current[i];
          if (!g) continue;
          const view = s.hands[i];
          if (!view) {
            g.setAttribute("visibility", "hidden");
            continue;
          }
          g.setAttribute("visibility", "visible");
          g.dataset.allowed = String(view.allowed);
          g.dataset.side = view.side;
          (g.children[0] as SVGPathElement).setAttribute("d", skeletonPath(view.obs.landmarks, s.width, s.height));
          (g.children[0] as SVGPathElement).setAttribute("stroke-width", String(3 * unit));
          (g.children[1] as SVGPathElement).setAttribute("d", jointsPath(view.obs.landmarks, s.width, s.height, 3.5 * unit));
        }
        const pts = s.trail.map((e) => `${e.hand.cx.toFixed(1)} ${e.hand.cy.toFixed(1)}`);
        trail.current?.setAttribute("d", pts.length > 1 ? `M${pts.join("L")}` : "");
        trail.current?.setAttribute("stroke-width", String(6 * unit));
      }),
    [engine],
  );

  return (
    <svg ref={svg} className="overlay hand-layer" preserveAspectRatio="none" aria-hidden>
      <path ref={trail} className="trail" fill="none" stroke="var(--amber)" strokeLinecap="round" strokeLinejoin="round" />
      {Array.from({ length: MAX_HANDS }, (_, i) => (
        <g key={i} ref={(el) => { hands.current[i] = el; }} className="hand" visibility="hidden">
          <path fill="none" strokeLinecap="round" />
          <path />
        </g>
      ))}
    </svg>
  );
}
