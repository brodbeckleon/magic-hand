// Contextual hints: guided, not nagging. Each hint has a condition, a maximum number of showings and
// a "learned" signal after which it never appears again. Counters persist in settings.hints.

export type HintId = "noHand" | "focus" | "present" | "takeover" | "far";

export interface HintDef {
  id: HintId;
  /** Never shown more often than this. */
  maxShows: number;
  /** Minimum time between two showings of this hint, s. */
  cooldown: number;
  /** Where the hint points ("present" = the Present button; default: above the swipe bar). */
  anchor?: "present";
}

export const HINTS: Record<HintId, HintDef> = {
  /** Live, not armed, no hand for a while. */
  noHand: { id: "noHand", maxShows: 3, cooldown: 60 },
  /** A slide key was sent while Magic Hand itself had the keyboard focus (keys went nowhere). */
  focus: { id: "focus", maxShows: 3, cooldown: 20 },
  /** Gestures work in the main window: suggest presenting mode once or twice. */
  present: { id: "present", maxShows: 2, cooldown: 120, anchor: "present" },
  /** Several people in view for the first time. */
  takeover: { id: "takeover", maxShows: 2, cooldown: 120 },
  /** Someone far away: keep movements big. */
  far: { id: "far", maxShows: 2, cooldown: 120 },
};

export const shownKey = (id: HintId) => `hint.${id}.shown`;
export const learnedKey = (id: HintId) => `hint.${id}.learned`;

/** Whether a hint may be shown now, given the persisted counters and the last showing time. */
export function mayShow(id: HintId, hints: Record<string, number>, lastShownAt: number | undefined, now: number): boolean {
  const def = HINTS[id];
  if ((hints[learnedKey(id)] ?? 0) > 0) return false;
  if ((hints[shownKey(id)] ?? 0) >= def.maxShows) return false;
  return lastShownAt === undefined || now - lastShownAt >= def.cooldown;
}
