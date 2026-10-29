import { handFeatures } from "../features.ts";
import { HandLock } from "../swipe/HandLock.ts";
import { DEFAULT_SWIPE_PARAMS, type SwipeParams } from "../swipe/params.ts";
import type { HistoryEntry } from "../swipe/SwipeDetector.ts";
import type { Command, FrameObs, Hand, HandObs, PreferredHand, Side } from "../types.ts";
import { HandTracker, type HandTrack } from "../tracking/HandTracker.ts";

export interface PipelineSettings {
  swipe: SwipeParams;
  /** Swap directions: swipe right = next slide. */
  reverse: boolean;
  preferredHand: PreferredHand;
}

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  swipe: { ...DEFAULT_SWIPE_PARAMS },
  reverse: false,
  preferredHand: "either",
};

export type PipelineEvent =
  | { type: "calibrated"; t: number; side: Side }
  | {
      type: "trigger";
      t: number;
      side: Side;
      command: Command;
      /** Direction the hand moved in the mirrored view. */
      swipe: "left" | "right";
      /** Swipe distance in hand lengths, negative = to the left. */
      distance: number;
      /** When the movement started (for the reaction time). */
      onset: number;
    }
  | { type: "ignored_dir" | "ignored_return"; t: number; side: Side };

export interface HandView {
  id: number;
  obs: HandObs;
  hand: Hand;
  side: Side;
  /** Allowed to trigger by the preferred-hand setting. */
  allowed: boolean;
}

/** What the overlay needs to draw one frame. */
export interface PipelineSnapshot {
  t: number;
  width: number;
  height: number;
  hands: HandView[];
  calibrated: boolean;
  calibProgress: number;
  progress: number;
  trail: readonly HistoryEntry[];
  blocked: boolean;
  returnRemaining: number;
  activeSide: Side;
  lockedSide: Side | null;
}

/**
 * Pure per-frame gesture processing: observations in, events and a drawable snapshot out.
 * Depends only on its inputs (time comes from the frame), so recordings replay identically.
 */
export class GesturePipeline {
  settings: PipelineSettings;
  readonly lock: HandLock;
  readonly tracker = new HandTracker();

  constructor(settings: PipelineSettings = DEFAULT_PIPELINE_SETTINGS) {
    this.settings = { ...settings, swipe: { ...settings.swipe } };
    this.lock = new HandLock(settings.preferredHand, settings.swipe);
  }

  updateSettings(patch: Partial<PipelineSettings>): void {
    this.settings = { ...this.settings, ...patch, swipe: { ...this.settings.swipe, ...patch.swipe } };
    this.lock.setParams(this.settings.swipe);
    this.lock.setPreferred(this.settings.preferredHand);
  }

  resetCalibration(): void {
    this.lock.resetCalibration();
    this.tracker.reset();
  }

  /** `paused`: draw the hands but do not detect gestures (prototype key p). */
  step(frame: FrameObs, paused = false): { events: PipelineEvent[]; snapshot: PipelineSnapshot } {
    const { t, width, height } = frame;
    const features = frame.hands.map((obs) => handFeatures(obs.landmarks, width, height));
    const tracks = this.tracker.update(t, frame.hands, features);
    const hands: Partial<Record<Side, Hand>> = {};
    for (const tr of tracks) hands[tr.side] = tr.hand;
    const views: HandView[] = tracks.map((tr: HandTrack) => ({
      id: tr.id, obs: tr.obs, hand: tr.hand, side: tr.side, allowed: this.lock.isAllowed(tr.side),
    }));

    const events: PipelineEvent[] = [];
    if (!paused) {
      for (const { side, event, detector } of this.lock.update(t, hands)) {
        if (event === "next" || event === "prev") {
          const command: Command = this.settings.reverse ? (event === "next" ? "prev" : "next") : event;
          events.push({
            type: "trigger", t, side, command,
            swipe: detector.lastDx < 0 ? "left" : "right",
            distance: detector.lastDx,
            onset: detector.onset,
          });
        } else {
          events.push({ type: event, t, side });
        }
      }
    }

    const det = this.lock.primary;
    return {
      events,
      snapshot: {
        t, width, height,
        hands: views,
        calibrated: this.lock.calibrated,
        calibProgress: det.calibProgress(t),
        progress: det.progress,
        trail: det.history,
        blocked: det.isBlocked(t),
        returnRemaining: det.returnRemaining(t),
        activeSide: det === this.lock.detectors.left ? "left" : "right",
        lockedSide: this.lock.locked,
      },
    };
  }
}
