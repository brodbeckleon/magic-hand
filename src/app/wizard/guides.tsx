import { useRef, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { clampRect, mirrorRect, type Rect } from "../../core/zone/Zone.ts";
import { useFrame } from "../engine/frameContext.ts";

/** Renders children as SVG in camera-frame coordinates (mirrored view), above the hand overlay. */
export function FrameOverlay({ children, interactive, testId }: { children: React.ReactNode; interactive?: boolean; testId?: string }) {
  const { overlayHost, width, height } = useFrame();
  if (!overlayHost) return null;
  return createPortal(
    <svg className={`overlay guide${interactive ? " interactive" : ""}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" data-testid={testId}>
      {children}
    </svg>,
    overlayHost,
  );
}

/** Dashed head-and-shoulders outline showing where to stand. */
export function SilhouetteGuide({ ok }: { ok: boolean }) {
  const { width: w, height: h } = useFrame();
  const cx = w / 2;
  const s = h / 480;
  const d = [
    `M${cx - 30 * s} ${h * 0.42}`,
    `a${32 * s} ${40 * s} 0 1 1 ${60 * s} 0`,
    `a${32 * s} ${40 * s} 0 0 1 ${-60 * s} 0`,
    `M${cx - 120 * s} ${h}`,
    `C${cx - 120 * s} ${h * 0.68} ${cx - 70 * s} ${h * 0.6} ${cx} ${h * 0.6}`,
    `C${cx + 70 * s} ${h * 0.6} ${cx + 120 * s} ${h * 0.68} ${cx + 120 * s} ${h}`,
  ].join(" ");
  return (
    <FrameOverlay testId="silhouette">
      <path d={d} fill="none" stroke={ok ? "var(--green)" : "white"} strokeOpacity={0.85} strokeWidth={3 * s}
        strokeDasharray={`${10 * s} ${8 * s}`} className="silhouette" />
    </FrameOverlay>
  );
}

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Presenter-zone editor: drag inside to move, drag the handles to resize; arrow keys move it,
 * Shift+arrow keys resize it. `zone` is in source coordinates; everything is drawn mirrored.
 */
export function ZoneEditor({ zone, onChange }: { zone: Rect; onChange: (z: Rect) => void }) {
  const { width: W, height: H } = useFrame();
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Rect } | null>(null);
  const svgPoint = (e: RPointerEvent<SVGElement>) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x / W, y: pt.y / H }; // mirrored view, normalised
  };
  const m = mirrorRect(zone);

  const onDown = (e: RPointerEvent<SVGElement>) => {
    e.stopPropagation();
    const handle = ((e.currentTarget as SVGElement).dataset.handle ?? "move") as Handle;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = svgPoint(e);
    drag.current = { handle, x: p.x, y: p.y, start: m };
  };
  const onMove = (e: RPointerEvent<SVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = svgPoint(e);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    let { x, y, w, h } = d.start;
    if (d.handle === "move") {
      x += dx;
      y += dy;
    } else {
      if (d.handle.includes("w")) { x += dx; w -= dx; }
      if (d.handle.includes("e")) w += dx;
      if (d.handle.includes("n")) { y += dy; h -= dy; }
      if (d.handle.includes("s")) h += dy;
    }
    if (w < 0.1) { if (d.handle.includes("w")) x -= 0.1 - w; w = 0.1; }
    if (h < 0.1) { if (d.handle.includes("n")) y -= 0.1 - h; h = 0.1; }
    onChange(mirrorRect(clampRect({ x, y, w, h })));
  };
  const onUp = () => (drag.current = null);
  const onKey = (e: React.KeyboardEvent) => {
    const step = 0.02;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!k) return;
    e.preventDefault();
    const [kx, ky] = k as [number, number];
    const r = e.shiftKey ? { ...m, w: m.w + kx, h: m.h + ky } : { ...m, x: m.x + kx, y: m.y + ky };
    onChange(mirrorRect(clampRect(r)));
  };

  const x = m.x * W;
  const y = m.y * H;
  const w = m.w * W;
  const h = m.h * H;
  const r = Math.max(W, H) / 70;
  const pos: Record<Handle, [number, number]> = {
    nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2],
    se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2], move: [0, 0],
  };
  return (
    <FrameOverlay interactive testId="zone-editor">
      <g onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <rect x={x} y={y} width={w} height={h} className="zone-rect" tabIndex={0} role="slider"
          aria-label="Presenter zone" aria-valuetext={`${Math.round(zone.w * 100)} × ${Math.round(zone.h * 100)} %`}
          data-handle="move" onPointerDown={onDown} onKeyDown={onKey} strokeWidth={r / 4} />
        {HANDLES.map((hd) => (
          <circle key={hd} cx={pos[hd][0]} cy={pos[hd][1]} r={r} className={`zone-handle h-${hd}`} data-handle={hd} onPointerDown={onDown} strokeWidth={r / 4} />
        ))}
      </g>
    </FrameOverlay>
  );
}
