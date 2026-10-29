// Persisted settings. Every field falls back to its default on its own when the stored value is
// missing or invalid, so an old or hand-edited settings.json never breaks the app.
import { z } from "zod";
import { DEFAULT_SWIPE_PARAMS, SWIPE_PARAM_RANGES, type SwipeParams } from "../../core/swipe/params.ts";

export const SETTINGS_VERSION = 1;

const swipeShape = Object.fromEntries(
  (Object.keys(DEFAULT_SWIPE_PARAMS) as (keyof SwipeParams)[]).map((k) => [
    k,
    z.number().min(SWIPE_PARAM_RANGES[k].min).max(SWIPE_PARAM_RANGES[k].max).catch(DEFAULT_SWIPE_PARAMS[k]),
  ]),
) as { [K in keyof SwipeParams]: z.ZodCatch<z.ZodNumber> };

/** Normalised rectangle in source-frame coordinates (unmirrored), 0..1. */
export const zoneSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.05).max(1),
  h: z.number().min(0.05).max(1),
});
export type Zone = z.infer<typeof zoneSchema>;

export const RESOLUTIONS = ["320x240", "640x480", "1280x720"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const SENSITIVITY_PRESETS = {
  low: { distance: 3.0, window: 0.45 },
  normal: { distance: 2.5, window: 0.5 },
  high: { distance: 2.0, window: 0.6 },
} as const;
export type Sensitivity = keyof typeof SENSITIVITY_PRESETS | "custom";

export const settingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION).catch(SETTINGS_VERSION),
  firstRunDone: z.boolean().catch(false),
  language: z.enum(["system", "de", "en"]).catch("system"),

  preferredHand: z.enum(["left", "right", "either"]).catch("either"),
  /** false: swipe left = next (like a phone). true: swipe right = next. */
  reverse: z.boolean().catch(false),
  sensitivity: z.enum(["low", "normal", "high", "custom"]).catch("normal"),
  swipe: z.object(swipeShape).catch({ ...DEFAULT_SWIPE_PARAMS }),
  keyMapping: z.enum(["arrows", "page"]).catch("arrows"),
  /** Help for presenters far from the camera (MHR03/MHR04). */
  farAssist: z.boolean().catch(true),
  /** Short tone when a slide changes. */
  sound: z.boolean().catch(false),
  /** Turn the camera off after this many minutes without anyone in view (0 = never). */
  autoPauseMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(20)]).catch(10),

  camera: z
    .object({
      deviceId: z.string().nullable().catch(null),
      resolution: z.enum(RESOLUTIONS).catch("640x480"),
    })
    .catch({ deviceId: null, resolution: "640x480" }),

  speaker: z
    .object({
      mode: z.enum(["manual", "auto"]).catch("manual"),
      autoSignal: z.enum(["mouth", "movement", "both"]).catch("both"),
    })
    .catch({ mode: "manual", autoSignal: "both" }),

  /** Presenter zone from calibration (MHR01/MHR08); null = whole frame. */
  zone: zoneSchema.nullable().catch(null),

  pauseShortcut: z.string().max(64).catch("CmdOrCtrl+Alt+P"),
  pill: z.object({ thumbnail: z.boolean().catch(true) }).catch({ thumbnail: true }),
  /** How often each hint was shown / completed (hint system). */
  hints: z.record(z.string(), z.number().int().min(0)).catch({}),

  dev: z
    .object({
      unlocked: z.boolean().catch(false),
      dryRun: z.boolean().catch(false),
      delegate: z.enum(["auto", "GPU", "CPU"]).catch("auto"),
      showEvents: z.boolean().catch(true),
    })
    .catch({ unlocked: false, dryRun: false, delegate: "auto", showEvents: true }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Parses stored data; anything unusable becomes the default. */
export function parseSettings(raw: unknown): Settings {
  const r = settingsSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return r.success ? r.data : DEFAULT_SETTINGS;
}

/** Which preset the current swipe parameters correspond to. */
export function sensitivityOf(swipe: SwipeParams): Sensitivity {
  for (const [name, p] of Object.entries(SENSITIVITY_PRESETS)) {
    if (swipe.distance === p.distance && swipe.window === p.window) return name as Sensitivity;
  }
  return "custom";
}

export function parseResolution(r: Resolution): { width: number; height: number } {
  const [w, h] = r.split("x").map(Number);
  return { width: w!, height: h! };
}
