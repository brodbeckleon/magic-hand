// Recording format for developer test sessions: JSON lines, gzip-compressed by the caller.
// LANDMARKS ONLY: no images, no face mesh, nothing that shows what the person looks like (MHR08).
import type { PipelineSettings } from "../pipeline/GesturePipeline.ts";
import type { FrameObs, HandObs, PoseObs, Side } from "../types.ts";
import type { Rect } from "../zone/Zone.ts";

export const SCHEMA = "magic-hand-rec/1";

export interface RecHeader {
  type: "header";
  schema: typeof SCHEMA;
  app: string;
  created: string;
  platform: string;
  src: { w: number; h: number };
  /** Landmarks are stored unmirrored; handFeatures mirrors them like the live app. */
  mirror: true;
  handednessSwap: boolean;
  zone: Rect | null;
  settings: PipelineSettings;
}

type Q = [number, number, number];
export interface RecFrame {
  type: "frame";
  i: number;
  t: number;
  hands: { lm: Q[]; side: Side; score: number }[];
  /** null = the pose model did not run on this frame. */
  poses: { lm: [number, number, number, number][] }[] | null;
}
export interface RecSettings { type: "settings"; t: number; patch: Partial<PipelineSettings> }
export interface RecMark { type: "mark"; t: number; kind: "missed" | "false" }
export interface RecEvent { type: "event"; t: number; event: string; command?: string }
export type RecLine = RecHeader | RecFrame | RecSettings | RecMark | RecEvent;

const q = (v: number) => Math.round(v * 1e4) / 1e4;

export function encodeFrame(i: number, f: FrameObs): RecFrame {
  return {
    type: "frame",
    i,
    t: f.t,
    hands: f.hands.map((h) => ({ lm: h.landmarks.map((l) => [q(l.x), q(l.y), q(l.z)] as Q), side: h.side, score: q(h.sideScore) })),
    poses: f.poses ? f.poses.map((p) => ({ lm: p.landmarks.map((l) => [q(l.x), q(l.y), q(l.z), q(l.visibility ?? 1)] as [number, number, number, number]) })) : null,
  };
}

export function decodeFrame(r: RecFrame, src: { w: number; h: number }): FrameObs {
  const hands: HandObs[] = r.hands.map((h) => ({
    landmarks: h.lm.map(([x, y, z]) => ({ x, y, z })),
    side: h.side,
    sideScore: h.score,
  }));
  const poses: PoseObs[] | null = r.poses
    ? r.poses.map((p) => ({ landmarks: p.lm.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) }))
    : null;
  return { t: r.t, width: src.w, height: src.h, hands, poses };
}

export const encodeLine = (l: RecLine): string => JSON.stringify(l) + "\n";

export interface Recording {
  header: RecHeader;
  frames: FrameObs[];
  settings: RecSettings[];
  marks: RecMark[];
  events: RecEvent[];
}

/** Parses the (decompressed) text of a recording. Throws on a missing or unknown header. */
export function parseRecording(text: string): Recording {
  const lines = text.split("\n").filter((l) => l.trim());
  const header = JSON.parse(lines[0] ?? "{}") as RecHeader;
  if (header.type !== "header" || header.schema !== SCHEMA) throw new Error(`not a ${SCHEMA} recording`);
  const rec: Recording = { header, frames: [], settings: [], marks: [], events: [] };
  for (const raw of lines.slice(1)) {
    const l = JSON.parse(raw) as RecLine;
    if (l.type === "frame") rec.frames.push(decodeFrame(l, header.src));
    else if (l.type === "settings") rec.settings.push(l);
    else if (l.type === "mark") rec.marks.push(l);
    else if (l.type === "event") rec.events.push(l);
  }
  return rec;
}
