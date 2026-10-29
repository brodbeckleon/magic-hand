import type { Landmark } from "../types.ts";

/** Normalised rectangle in source-frame coordinates (unmirrored), 0..1. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1, h: 1 };
export const MIN_ZONE = 0.1;

export const clampRect = (r: Rect): Rect => {
  const w = Math.min(1, Math.max(MIN_ZONE, r.w));
  const h = Math.min(1, Math.max(MIN_ZONE, r.h));
  return { x: Math.min(1 - w, Math.max(0, r.x)), y: Math.min(1 - h, Math.max(0, r.y)), w, h };
};

/** Landmark normalised to a crop -> normalised to the full frame. */
export function cropToFull<T extends Landmark>(lm: T, crop: Rect): T {
  return { ...lm, x: crop.x + lm.x * crop.w, y: crop.y + lm.y * crop.h };
}

/** Full-frame landmark -> normalised to the crop (inverse of cropToFull). */
export function fullToCrop<T extends Landmark>(lm: T, crop: Rect): T {
  return { ...lm, x: (lm.x - crop.x) / crop.w, y: (lm.y - crop.y) / crop.h };
}

/** Mirrors a source-space rect into the mirrored view (and back: mirroring twice is identity). */
export const mirrorRect = (r: Rect): Rect => ({ ...r, x: 1 - r.x - r.w });

export const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Pixel crop for createImageBitmap, snapped to whole pixels inside the frame. */
export function pixelCrop(r: Rect, width: number, height: number): { sx: number; sy: number; sw: number; sh: number } {
  const sx = Math.max(0, Math.floor(r.x * width));
  const sy = Math.max(0, Math.floor(r.y * height));
  const sw = Math.max(1, Math.min(width - sx, Math.round(r.w * width)));
  const sh = Math.max(1, Math.min(height - sy, Math.round(r.h * height)));
  return { sx, sy, sw, sh };
}

/** The rect actually covered by a pixel crop (what the landmarks must be mapped back with). */
export function cropRect(c: { sx: number; sy: number; sw: number; sh: number }, width: number, height: number): Rect {
  return { x: c.sx / width, y: c.sy / height, w: c.sw / width, h: c.sh / height };
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
