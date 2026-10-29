// Small inline icon set (24px grid, stroke icons) so the app needs no icon font or image files.
import type { SVGProps } from "react";
import { HAND_H, HAND_PATH, HAND_VIEWBOX, HAND_W } from "./hand.ts";

const PATHS = {
  calibrate: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 11.2a.8.8 0 1 0 0 1.6a.8.8 0 1 0 0-1.6",
  help: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2-2.5 3.6M12 16.8v.2",
  preferences: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4M4 12h13M20 12h0",
  present: "M4 5h16v11H4zM9 20h6M12 16v4M10.5 8.5l4 2-4 2z",
  pause: "M9 6v12M15 6v12",
  play: "M8 5.5v13l10.5-6.5z",
  close: "M6 6l12 12M18 6L6 18",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  camera: "M3 8h3l2-3h8l2 3h3v11H3zM12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7",
  keyboard: "M3 7h18v10H3zM7 10h0M10 10h0M13 10h0M16 10h0M8 14h8",
  globe: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  shield: "M12 3l8 3v6c0 4.5-3.4 8-8 9c-4.6-1-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  people: "M9 11a3 3 0 1 0 0-6a3 3 0 1 0 0 6M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 11a2.5 2.5 0 1 0 0-5M17.5 14c2 .6 3.5 2.6 3.5 5.5",
  bug: "M9 7a3 3 0 0 1 6 0M7 10h10v5a5 5 0 0 1-10 0zM12 10v10M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2",
  download: "M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  warning: "M12 4l9 16H3zM12 10v4M12 17v.2",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v5M12 8v.2",
  chevron: "M9 6l6 6-6 6",
  mic: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M6 11a6 6 0 0 0 12 0M12 17v4",
  move: "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3",
} as const;

export type IconName = keyof typeof PATHS | "hand";

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  if (name === "hand") {
    // Filled glyph on its own 24 x 32 grid: same height as the other icons, proportional width.
    return (
      <svg width={(size * HAND_W) / HAND_H} height={size} viewBox={HAND_VIEWBOX} fill="currentColor" aria-hidden {...rest}>
        <path d={HAND_PATH} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
