// Measures what the app costs while it runs: headless Chromium on `vite --mode e2e` with the CPU
// delegate and the fake camera. The models run on the fake camera's real frames; a test hook
// replaces their detections with a scene (nobody, a person without hands, a hand swiping), so the
// adaptive analysis rate and the overlay see what they would see in a room.
//
//   pnpm bench                       all scenes, main window and presenting bar
//   pnpm bench --seconds 20          longer measurement per scene (default 10, after 6 s to settle)
//   pnpm bench --pin full            analyse every frame (the behaviour before the adaptive rate)
//   pnpm bench --views bar --scenes empty,person --json out.json
//
// Numbers are per second of wall time. CPU is the sum over Chromium's processes (renderer with
// the vision worker, GPU, browser); main-thread times come from the page's Performance metrics.
import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FrameObs } from "../src/core/types.ts";
import { handObs } from "../tests/support/landmarks.ts";
import { person } from "../tests/support/poses.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : def;
};
const seconds = Number(opt("seconds", "10"));
const settle = Number(opt("settle", "6"));
const pin = opt("pin", "") === "full" ? "full" : null;
const views = opt("views", "main,bar").split(",") as ("main" | "bar")[];
const sceneNames = opt("scenes", "empty,person,swipe").split(",") as SceneName[];
const jsonOut = opt("json", "");
const PORT = 1425;
const URL = `http://127.0.0.1:${PORT}/?delegate=CPU`;

type SceneName = "empty" | "person" | "swipe";
/** What the e2e hook benchStats() returns (src/app/testHooks.ts; this script has no DOM types). */
interface BenchStats {
  analysed: number;
  skipped: number;
  dropped: number;
  pumped: number;
  modelMsTotal: number;
  results: number;
  mode: string;
  fps: number;
}
type Hooks = { __magicHand: { benchStats(): BenchStats; scene(f: unknown[]): void; pinRate(m: "full" | null): void } };
type SceneFrame = Pick<FrameObs, "hands" | "poses">;

/** Looped scenes at 30 fps (normalised landmarks, any camera size). */
function scene(name: SceneName): SceneFrame[] {
  // Near the camera (shoulders 128 px of 640): far-away assistance would add model runs.
  const presenter = [person(0.45, 0.12, 0.2)];
  if (name === "empty") return [{ hands: [], poses: [] }];
  if (name === "person") return [{ hands: [], poses: presenter }];
  // Hold still (arms), swipe left, rest, swipe back: 3 s per loop.
  const out: SceneFrame[] = [];
  const at = (cx: number) => out.push({ hands: [handObs({ cx, cy: 250, scale: 40 })], poses: presenter });
  for (let i = 0; i < 36; i++) at(380);
  for (let i = 1; i <= 8; i++) at(380 - i * 20);
  for (let i = 0; i < 20; i++) at(220);
  for (let i = 1; i <= 8; i++) at(220 + i * 20);
  for (let i = 0; i < 18; i++) at(380);
  return out;
}

interface Sample {
  t: number;
  stats: BenchStats;
  metrics: Record<string, number>;
  cpu: Record<string, number>;
}

async function sample(page: Page, pageCdp: CDPSession, browserCdp: CDPSession): Promise<Sample> {
  const stats = await page.evaluate(() => (globalThis as unknown as Hooks).__magicHand.benchStats());
  const { metrics } = (await pageCdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] };
  const { processInfo } = (await browserCdp.send("SystemInfo.getProcessInfo" as never)) as { processInfo: { type: string; cpuTime: number }[] };
  const cpu: Record<string, number> = {};
  for (const p of processInfo) cpu[p.type] = (cpu[p.type] ?? 0) + p.cpuTime;
  return { t: performance.now() / 1000, stats, metrics: Object.fromEntries(metrics.map((m) => [m.name, m.value])), cpu };
}

interface Row {
  view: string;
  scene: SceneName;
  mode: string;
  analysedPerS: number;
  skippedPerS: number;
  droppedPerS: number;
  modelMs: number;
  taskMsPerS: number;
  layoutMsPerS: number;
  styleMsPerS: number;
  cpuRendererPct: number;
  cpuGpuPct: number;
  cpuTotalPct: number;
}

async function measure(browser: Browser, browserCdp: CDPSession, view: "main" | "bar", name: SceneName): Promise<Row> {
  const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
  await page.goto(URL);
  await page.getByTestId("status").waitFor({ timeout: 60_000 });
  if (view === "bar") {
    await page.getByTestId("present").click();
    await page.setViewportSize({ width: 380, height: 353 }); // pillSize("large") for a 4:3 camera
  }
  await page.evaluate(([frames, p]) => {
    const h = (globalThis as unknown as Hooks).__magicHand;
    h.scene(frames);
    h.pinRate(p);
  }, [scene(name), pin] as const);
  const pageCdp = await page.context().newCDPSession(page);
  await pageCdp.send("Performance.enable");
  await page.waitForTimeout(settle * 1000);
  const a = await sample(page, pageCdp, browserCdp);
  await page.waitForTimeout(seconds * 1000);
  const b = await sample(page, pageCdp, browserCdp);
  await page.close();
  const dt = b.t - a.t;
  const per = (k: keyof BenchStats) => ((b.stats[k] as number) - (a.stats[k] as number)) / dt;
  const ms = (k: string) => ((b.metrics[k]! - a.metrics[k]!) * 1000) / dt;
  const cpu = (k: string) => (((b.cpu[k] ?? 0) - (a.cpu[k] ?? 0)) / dt) * 100;
  const results = b.stats.results - a.stats.results;
  return {
    view, scene: name, mode: b.stats.mode,
    analysedPerS: per("analysed"), skippedPerS: per("skipped"), droppedPerS: per("dropped"),
    modelMs: results ? (b.stats.modelMsTotal - a.stats.modelMsTotal) / results : 0,
    taskMsPerS: ms("TaskDuration"), layoutMsPerS: ms("LayoutDuration"), styleMsPerS: ms("RecalcStyleDuration"),
    cpuRendererPct: cpu("renderer"), cpuGpuPct: cpu("gpu"),
    cpuTotalPct: Object.keys(b.cpu).reduce((s, k) => s + cpu(k), 0),
  };
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite did not start");
}

const server = spawn(join(root, "node_modules", ".bin", "vite"), ["--mode", "e2e", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "ignore" });
const rows: Row[] = [];
try {
  await waitForServer();
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const browserCdp = await browser.newBrowserCDPSession();
  for (const view of views) {
    for (const name of sceneNames) {
      const row = await measure(browser, browserCdp, view, name);
      rows.push(row);
      console.error(`${view}/${name}: ${row.analysedPerS.toFixed(1)} analysed/s, CPU ${row.cpuTotalPct.toFixed(0)} %`);
    }
  }
  await browser.close();
} finally {
  server.kill();
}

const f1 = (v: number) => v.toFixed(1);
console.log(`\n${seconds} s per scene after ${settle} s${pin ? ", rate pinned to every frame" : ""}; CPU in % of one core\n`);
console.log("| view | scene | mode | analysed/s | skipped/s | dropped/s | model ms | main task ms/s | layout ms/s | style ms/s | CPU renderer | CPU GPU | CPU total |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.view} | ${r.scene} | ${r.mode} | ${f1(r.analysedPerS)} | ${f1(r.skippedPerS)} | ${f1(r.droppedPerS)} | ${f1(r.modelMs)} | ${f1(r.taskMsPerS)} | ${f1(r.layoutMsPerS)} | ${f1(r.styleMsPerS)} | ${f1(r.cpuRendererPct)} | ${f1(r.cpuGpuPct)} | ${f1(r.cpuTotalPct)} |`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seconds, settle, pin, rows }, null, 2));
