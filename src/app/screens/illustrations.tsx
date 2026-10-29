import { HAND_PATH } from "../design/hand.ts";

// Small SVG illustrations used in Preferences, the first-run wizard and Help.

/** A hand moving in the direction that means "next slide", with the slide stack reacting. */
export function DirectionIllustration({ next }: { next: "left" | "right" }) {
  const flip = next === "right" ? -1 : 1;
  return (
    <svg width="96" height="44" viewBox="0 0 96 44" aria-hidden className="direction-illu">
      <g transform={`translate(48 0) scale(${flip} 1) translate(-48 0)`}>
        <rect x="58" y="6" width="30" height="22" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
        <rect x="62" y="10" width="30" height="22" rx="3" fill="rgb(255 255 255 / 0.08)" stroke="currentColor" strokeWidth="1.5" />
        <path d="M46 22 H14 M22 14 L13 22 L22 30" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="direction-arrow" />
      </g>
    </svg>
  );
}

/** A hand held still while a ring fills around it (calibration). */
export function HoldStillDemo() {
  return (
    <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden className="help-illu">
      <circle cx="60" cy="40" r="30" fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth="5" />
      <circle cx="60" cy="40" r="30" fill="none" stroke="var(--teal)" strokeWidth="5" strokeLinecap="round"
        pathLength={100} strokeDasharray="100" className="ring-fill" transform="rotate(-90 60 40)" />
      <path transform="translate(48.6 25.5) scale(0.9)" d={HAND_PATH} fill="var(--text)" />
    </svg>
  );
}

/** A hand swiping in the "next" direction with a fading trail. */
export function SwipeDemo({ next }: { next: "left" | "right" }) {
  return (
    <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden className={`help-illu swipe-demo to-${next}`}>
      <path d="M20 46 H100" stroke="var(--amber)" strokeWidth="4" strokeLinecap="round" strokeDasharray="4 8" opacity="0.5" />
      <g className="swipe-hand">
        <path transform="translate(50 18) scale(0.85)" d={HAND_PATH} fill="var(--text)" />
      </g>
    </svg>
  );
}
