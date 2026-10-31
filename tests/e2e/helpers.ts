import { test, type Page } from "@playwright/test";
import type { FrameObs } from "../../src/core/types.ts";
import { toFrames } from "../support/landmarks.ts";
import type { TraceBuilder } from "../support/traces.ts";

/** Opens the app. Headless Chromium only has software WebGL, where the CPU delegate is ~10x faster. */
export async function open(page: Page, path = "/", query = ""): Promise<void> {
  const fakeCamera = test.info().project.name === "webkit" ? "&camera=fake" : "";
  await page.goto(`${path}?delegate=CPU${fakeCamera}${query}`);
}

/** Waits until the camera and the hand model are running. */
export async function waitLive(page: Page): Promise<void> {
  await page.getByTestId("status").waitFor({ timeout: test.info().project.name === "webkit" ? 50_000 : 30_000 });
}

/** Plays a synthetic hand trace through the real engine (replacing the camera's detections). */
export async function play(page: Page, trace: TraceBuilder, extra: Partial<FrameObs> = {}): Promise<void> {
  const frames: FrameObs[] = toFrames(trace.frames).map((f) => ({ ...f, ...extra }));
  await page.evaluate((f) => (window as unknown as { __magicHand: { play(f: FrameObs[]): Promise<void> } }).__magicHand.play(f), frames);
}

export const sentKeys = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sentKeys: string[] }).__sentKeys.slice());

type Hooks = { __magicHand: { settings: { getState(): { update(p: object): void } } } };

/** Shows the developer tools (event list, stats, export) like Ctrl/Cmd+Shift+D does. */
export async function unlockDev(page: Page): Promise<void> {
  await page.evaluate(() => (window as never as Hooks).__magicHand.settings.getState().update({ dev: { unlocked: true, showEvents: true } }));
}

export async function updateSettings(page: Page, patch: object): Promise<void> {
  await page.evaluate((p) => (window as never as Hooks).__magicHand.settings.getState().update(p), patch);
}

/** Plays prepared observations (e.g. several people) through the real engine. */
export async function playFrames(page: Page, frames: FrameObs[]): Promise<void> {
  await page.evaluate((f) => (window as unknown as { __magicHand: { play(f: FrameObs[]): Promise<void> } }).__magicHand.play(f), frames);
}
