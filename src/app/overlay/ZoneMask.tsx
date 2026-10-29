import { useFrame } from "../engine/frameContext.ts";
import { mirrorRect, type Rect } from "../../core/zone/Zone.ts";
import { useSettings } from "../state/settings.ts";
import { useUi } from "../state/ui.ts";

/** Path covering the whole frame except `r` (even-odd fill), in mirrored view coordinates. */
export function maskPath(r: Rect, w: number, h: number): string {
  const m = mirrorRect(r);
  const x = m.x * w;
  const y = m.y * h;
  return `M0 0H${w}V${h}H0Z M${x} ${y}h${m.w * w}v${m.h * h}h${-m.w * w}Z`;
}

/** Dims everything outside the presenter zone: that part of the picture is not analysed. */
export function ZoneMask() {
  const { width, height } = useFrame();
  const stored = useSettings((s) => s.zone);
  const draft = useUi((s) => s.zoneDraft);
  const zone = draft === undefined ? stored : draft;
  if (!zone) return null;
  const m = mirrorRect(zone);
  return (
    <svg className="overlay zone-mask" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden data-testid="zone-mask">
      <path d={maskPath(zone, width, height)} fillRule="evenodd" fill="rgb(8 8 12 / 0.55)" />
      <rect x={m.x * width} y={m.y * height} width={m.w * width} height={m.h * height}
        fill="none" stroke="rgb(255 255 255 / 0.35)" strokeDasharray="6 6" strokeWidth={Math.max(width, height) / 400} />
    </svg>
  );
}
