import type { Page } from "@playwright/test";
import type { FrameObs } from "../../src/core/types.ts";
import { toFrames } from "../support/landmarks.ts";
import type { TraceBuilder } from "../support/traces.ts";

/** Opens the app. Headless Chromium only has software WebGL, where the CPU delegate is ~10x faster. */
export async function open(page: Page, path = "/"): Promise<void> {
  await page.goto(`${path}?delegate=CPU`);
}

/** Waits until the camera and the hand model are running. */
export async function waitLive(page: Page): Promise<void> {
  await page.getByTestId("status").waitFor({ timeout: 30_000 });
}

/** Plays a synthetic hand trace through the real engine (replacing the camera's detections). */
export async function play(page: Page, trace: TraceBuilder): Promise<void> {
  const frames: FrameObs[] = toFrames(trace.frames);
  await page.evaluate((f) => (window as unknown as { __magicHand: { play(f: FrameObs[]): Promise<void> } }).__magicHand.play(f), frames);
}

export const sentKeys = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sentKeys: string[] }).__sentKeys.slice());
