import { FAR_SHOULDER_PX, HandRatio, poseHand, shoulderPx, SMALL_HAND_PX, wristCrop } from "../far/wrist.ts";
import { handFeatures } from "../features.ts";
import { MotionEnergy, MouthActivity } from "../speaker/activity.ts";
import { Arbiter, type AutoSignal, type SpeakerMode, type SwitchReason } from "../speaker/Arbiter.ts";
import { ClaimDetector } from "../speaker/ClaimDetector.ts";
import { HandLock, LOCK_PROGRESS } from "../swipe/HandLock.ts";
import { DEFAULT_SWIPE_PARAMS, type SwipeParams } from "../swipe/params.ts";
import type { HistoryEntry } from "../swipe/SwipeDetector.ts";
import { HandAssociator } from "../tracking/associate.ts";
import { HandTracker, type HandTrack } from "../tracking/HandTracker.ts";
import { PersonTracker, type PersonTrack } from "../tracking/PersonTracker.ts";
import type { Command, FrameObs, Hand, HandObs, PreferredHand, Side } from "../types.ts";
import type { Rect } from "../zone/Zone.ts";

export interface PipelineSettings {
  swipe: SwipeParams;
  /** Swap directions: swipe right = next slide. */
  reverse: boolean;
  preferredHand: PreferredHand;
  speaker?: { mode: SpeakerMode; autoSignal: AutoSignal };
  /** Far away (MHR03/MHR04): hand model on wrist crops, pose wrists when no hand is found. */
  farAssist?: boolean;
}

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  swipe: { ...DEFAULT_SWIPE_PARAMS },
  reverse: false,
  preferredHand: "either",
  speaker: { mode: "manual", autoSignal: "both" },
  farAssist: true,
};

/** Person id used while no pose data is available (one presenter, like the prototype). */
export const SOLO = 0;

export type PipelineEvent =
  | { type: "calibrated"; t: number; side: Side; person: number }
  | {
      type: "trigger";
      t: number;
      side: Side;
      person: number;
      command: Command;
      /** Direction the hand moved in the mirrored view. */
      swipe: "left" | "right";
      /** Swipe distance in hand lengths, negative = to the left. */
      distance: number;
      /** When the movement started (for the reaction time). */
      onset: number;
    }
  | { type: "ignored_dir" | "ignored_return" | "ignored_not_speaker"; t: number; side: Side; person: number }
  | { type: "speaker"; t: number; person: number | null; reason: SwitchReason };

export interface HandView {
  id: number;
  obs: HandObs;
  hand: Hand;
  side: Side;
  person: number;
  /** May trigger: preferred hand and (with several people) belongs to the speaker. */
  allowed: boolean;
  /** 0..1 progress of a palm claim with this hand. */
  claim: number;
}

export interface PersonView {
  id: number;
  box: Rect;
  active: boolean;
  /** Normalised activity score (automatic mode), 0..1. */
  score: number | null;
  mouth: number | null;
  motion: number;
  claim: number;
  age: number;
  /** Far from the camera (small in the picture). */
  far: boolean;
}

/** What the overlay needs to draw one frame. */
export interface PipelineSnapshot {
  t: number;
  width: number;
  height: number;
  hands: HandView[];
  persons: PersonView[];
  /** Person allowed to change slides (SOLO without pose data, null: nobody yet). */
  speaker: number | null;
  calibrated: boolean;
  calibProgress: number;
  progress: number;
  trail: readonly HistoryEntry[];
  blocked: boolean;
  returnRemaining: number;
  activeSide: Side;
  lockedSide: Side | null;
  /** Where to run the hand model on enlarged crops next frame (far presenter, hand missing/small). */
  wristCrops: Rect[];
  /** Palms estimated from the pose (no hand landmarks), mirrored pixels. */
  poseHands: { person: number; side: Side; hand: Hand }[];
}

interface PersonState {
  lock: HandLock;
  mouth: MouthActivity;
  motion: MotionEnergy;
  ratio: HandRatio;
  /** Where each side's position came from last frame (switching sources restarts the swipe). */
  source: Record<Side, "hand" | "pose" | null>;
}

/**
 * Pure per-frame gesture processing: observations in, events and a drawable snapshot out.
 * Depends only on its inputs (time comes from the frame), so recordings replay identically.
 *
 * Without pose data every hand belongs to one presenter (SOLO), exactly like the prototype. With
 * people tracked, each person has their own hand detectors and the Arbiter decides who may change
 * slides; swipes of others are reported as ignored_not_speaker.
 *
 * Calibration (MHR01) arms the system as a whole: once armed, people who join are armed too, but
 * only the speaker's swipes count.
 */
export class GesturePipeline {
  settings: PipelineSettings;
  readonly tracker = new HandTracker();
  readonly persons = new PersonTracker();
  readonly associator = new HandAssociator();
  readonly arbiter = new Arbiter();
  private people = new Map<number, PersonState>();
  private claims = new Map<number, ClaimDetector>();
  private armed = false;
  private lastPersons: PersonTrack[] = [];

  constructor(settings: PipelineSettings = DEFAULT_PIPELINE_SETTINGS) {
    this.settings = { ...DEFAULT_PIPELINE_SETTINGS, ...settings, swipe: { ...settings.swipe } };
  }

  /** The hand detectors of the presenter shown in the UI. */
  get lock(): HandLock {
    return this.state(this.arbiter.active ?? this.lastPersons[0]?.id ?? SOLO).lock;
  }

  updateSettings(patch: Partial<PipelineSettings>): void {
    this.settings = { ...this.settings, ...patch, swipe: { ...this.settings.swipe, ...patch.swipe } };
    for (const p of this.people.values()) {
      p.lock.setParams(this.settings.swipe);
      p.lock.setPreferred(this.settings.preferredHand);
    }
  }

  resetCalibration(): void {
    this.armed = false;
    this.people.clear();
    this.claims.clear();
    this.tracker.reset();
    this.persons.reset();
    this.associator.reset();
    this.arbiter.reset();
    this.lastPersons = [];
  }

  /** `paused`: draw the hands but do not detect gestures (prototype key p). */
  step(frame: FrameObs, paused = false): { events: PipelineEvent[]; snapshot: PipelineSnapshot } {
    const { t, width, height } = frame;
    const aspect = width / height;
    const features = frame.hands.map((obs) => handFeatures(obs.landmarks, width, height));
    const tracks = this.tracker.update(t, frame.hands, features);

    // People (only on frames where the pose model ran).
    if (frame.poses) {
      this.lastPersons = this.persons.update(t, frame.poses);
      this.associator.update(tracks, this.lastPersons, aspect);
      for (const p of this.lastPersons) {
        const st = this.state(p.id);
        if (p.poseIndex !== null) {
          st.motion.update(t, p.pose, p.shoulder);
          const face = frame.faces?.[p.poseIndex];
          if (face) st.mouth.update(t, face);
        }
      }
      for (const id of [...this.people.keys()]) {
        if (id !== SOLO && !this.lastPersons.some((p) => p.id === id) && id !== this.arbiter.active) this.people.delete(id);
      }
    }
    const persons = this.lastPersons;

    // Which person and side each hand belongs to.
    const assigned = tracks.map((tr) => ({ tr, ...this.ownerOf(tr, persons, aspect) }));
    const byPerson = new Map<number, Partial<Record<Side, Hand>>>();
    for (const a of assigned) {
      const m = byPerson.get(a.person) ?? {};
      m[a.side] = a.tr.hand;
      byPerson.set(a.person, m);
    }

    // Far away: learn each person's hand size, and fall back to the pose wrists where no hand is found.
    const poseHands: PipelineSnapshot["poseHands"] = [];
    const farIds = new Set<number>();
    for (const p of persons) {
      const sh = shoulderPx(p.pose, width, height);
      if (sh === null) continue;
      if (sh < FAR_SHOULDER_PX) farIds.add(p.id);
      const st = this.state(p.id);
      if (frame.poses && p.poseIndex !== null) {
        for (const a of assigned) if (a.person === p.id) st.ratio.observe(a.tr.hand.scale, sh);
      }
      if (!this.settings.farAssist || !farIds.has(p.id) || !frame.poses || p.poseIndex === null) continue;
      const m = byPerson.get(p.id) ?? {};
      for (const side of ["left", "right"] as const) {
        if (m[side]) continue;
        const h = poseHand(p.pose, side, width, height, st.ratio.value);
        if (!h) continue;
        m[side] = h;
        poseHands.push({ person: p.id, side, hand: h });
      }
      byPerson.set(p.id, m);
    }

    const events: PipelineEvent[] = [];

    // Palm claims ("raise an open hand to take over").
    const claimed = new Map<number, number>(); // person -> claim start
    for (const id of [...this.claims.keys()]) if (!tracks.some((tr) => tr.id === id)) this.claims.delete(id);
    const claimProgress = new Map<number, number>();
    for (const a of assigned) {
      const c = this.claims.get(a.tr.id) ?? new ClaimDetector();
      this.claims.set(a.tr.id, c);
      const pose = persons.find((p) => p.id === a.person)?.pose;
      const start = c.startedAt;
      if (!paused && c.update(t, a.tr.obs.landmarks, a.tr.hand, pose, aspect)) claimed.set(a.person, start ?? t);
      claimProgress.set(a.tr.id, c.progress);
    }

    // Speaker arbitration (only meaningful once people are tracked).
    if (!paused && persons.length) {
      const sp = this.settings.speaker ?? DEFAULT_PIPELINE_SETTINGS.speaker!;
      const change = this.arbiter.update(
        t,
        persons.map((p) => {
          const st = this.state(p.id);
          return {
            id: p.id,
            present: t - p.lastSeen < 0.5,
            claimed: claimed.has(p.id),
            claimStart: claimed.get(p.id) ?? null,
            mouth: st.mouth.score(t),
            motion: st.motion.value,
            midSwipe: [st.lock.detectors.left, st.lock.detectors.right].some((d) => Math.abs(d.progress) > LOCK_PROGRESS),
          };
        }),
        sp.mode,
        sp.autoSignal,
      );
      if (change) {
        // The solo detectors (hands seen before people were) belong to the first speaker.
        if (change.id !== null && this.people.has(SOLO) && !this.people.has(change.id)) {
          this.people.set(change.id, this.people.get(SOLO)!);
          this.people.delete(SOLO);
        }
        events.push({ type: "speaker", t, person: change.id, reason: change.reason });
      }
    }
    // A completed claim also arms the system (it is a deliberate hold, like calibrating).
    if (!paused && claimed.size && !this.armed) {
      this.armed = true;
      const [person] = claimed.keys();
      events.push({ type: "calibrated", t, side: "right", person: person! });
    }
    let speaker = persons.length ? this.arbiter.active : SOLO;

    if (!paused) {
      for (const [person, hands] of byPerson) {
        const st = this.state(person);
        if (this.armed && !st.lock.calibrated) st.lock.forceCalibrated(t);
        for (const side of ["left", "right"] as const) {
          const src = !hands[side] ? null : poseHands.some((ph) => ph.person === person && ph.side === side) ? "pose" : "hand";
          if (src && st.source[side] && src !== st.source[side]) st.lock.detectors[side].clearHistory();
          if (src) st.source[side] = src;
        }
        for (const { side, event, detector } of st.lock.update(t, hands)) {
          if (event === "calibrated") {
            if (this.armed) continue;
            this.armed = true;
            events.push({ type: "calibrated", t, side, person });
            // Whoever arms gesture control gets it if nobody has it yet.
            const granted = persons.length ? this.arbiter.grant(person, t) : null;
            if (granted) {
              speaker = person;
              events.push({ type: "speaker", t, person, reason: granted.reason });
            }
          } else if (event === "next" || event === "prev") {
            if (person !== speaker) {
              events.push({ type: "ignored_not_speaker", t, side, person });
              continue;
            }
            const command: Command = this.settings.reverse ? (event === "next" ? "prev" : "next") : event;
            events.push({
              type: "trigger", t, side, person, command,
              swipe: detector.lastDx < 0 ? "left" : "right",
              distance: detector.lastDx,
              onset: detector.onset,
            });
          } else {
            events.push({ type: event, t, side, person });
          }
        }
      }
      // Hands of people that left the frame: let their detectors notice the gap.
      for (const [person, st] of this.people) if (!byPerson.has(person)) st.lock.update(t, {});
    }

    const shown = this.state(speaker ?? persons[0]?.id ?? SOLO).lock;
    const det = shown.primary;
    return {
      events,
      snapshot: {
        t, width, height,
        hands: assigned.map((a) => ({
          id: a.tr.id, obs: a.tr.obs, hand: a.tr.hand, side: a.side, person: a.person,
          allowed: shown.isAllowed(a.side) && (a.person === speaker),
          claim: claimProgress.get(a.tr.id) ?? 0,
        })),
        persons: persons.map((p) => {
          const st = this.state(p.id);
          return {
            id: p.id, box: p.box, active: p.id === speaker, score: this.arbiter.scores.get(p.id) ?? null,
            mouth: st.mouth.score(t), motion: st.motion.value, age: t - p.firstSeen, far: farIds.has(p.id),
            claim: Math.max(0, ...assigned.filter((a) => a.person === p.id).map((a) => claimProgress.get(a.tr.id) ?? 0)),
          };
        }),
        speaker,
        calibrated: this.armed || shown.calibrated,
        calibProgress: this.armed ? 0 : Math.max(...[...this.people.values()].map((p) => p.lock.primary.calibProgress(t)), det.calibProgress(t)),
        progress: det.progress,
        trail: det.history,
        blocked: det.isBlocked(t),
        returnRemaining: det.returnRemaining(t),
        activeSide: det === shown.detectors.left ? "left" : "right",
        lockedSide: shown.locked,
        wristCrops: this.wristCrops(persons, assigned, farIds, speaker, width, height),
        poseHands,
      },
    };
  }

  /** Crops for the next frame: the speaker's (or only person's) wrists if far and the hand is missing or tiny. */
  private wristCrops(persons: readonly PersonTrack[], assigned: { tr: HandTrack; person: number; side: Side }[],
    farIds: Set<number>, speaker: number | null, width: number, height: number): Rect[] {
    if (!this.settings.farAssist) return [];
    const target = persons.length === 1 ? persons[0] : persons.find((p) => p.id === speaker);
    if (!target || !farIds.has(target.id)) return [];
    const ratio = this.state(target.id).ratio.value;
    const out: Rect[] = [];
    for (const side of ["left", "right"] as const) {
      const real = assigned.find((a) => a.person === target.id && a.side === side);
      if (real && real.tr.hand.scale >= SMALL_HAND_PX) continue;
      const crop = wristCrop(target.pose, side, width, height, ratio);
      if (crop) out.push(crop);
    }
    return out;
  }

  private state(person: number): PersonState {
    let st = this.people.get(person);
    if (!st) {
      st = { lock: new HandLock(this.settings.preferredHand, this.settings.swipe), mouth: new MouthActivity(), motion: new MotionEnergy(), ratio: new HandRatio(), source: { left: null, right: null } };
      this.people.set(person, st);
    }
    return st;
  }

  /** Person and anatomical side of a hand: pose binding if known, otherwise the best guess. */
  private ownerOf(tr: HandTrack, persons: readonly PersonTrack[], aspect: number): { person: number; side: Side } {
    const b = this.associator.binding(tr.id);
    if (b && persons.some((p) => p.id === b.personId)) return { person: b.personId, side: b.side };
    if (!persons.length) return { person: SOLO, side: tr.side };
    if (persons.length === 1) return { person: persons[0]!.id, side: tr.side };
    const w = tr.obs.landmarks[0]!;
    const nearest = [...persons].sort((a, b) =>
      Math.hypot((a.cx - w.x) * aspect, a.cy - w.y) - Math.hypot((b.cx - w.x) * aspect, b.cy - w.y))[0]!;
    return { person: nearest.id, side: tr.side };
  }
}
