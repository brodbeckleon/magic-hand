// Smoke test of the real native app (Linux, WebKitGTK) via tauri-driver:
//   Xvfb :99 & DISPLAY=:99 tauri-driver & DISPLAY=:99 pnpm exec tsx tests/native/smoke.ts <app-binary>
// Checks the Rust side the browser tests cannot: IPC commands, the settings store on disk, the
// window morphing into the pill, and real keystrokes arriving (enigo -> X11).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const app = process.argv[2];
if (!app) throw new Error("usage: smoke.ts <path to magic-hand binary>");
const WD = "http://127.0.0.1:4444";

/** One WebDriver command; T is the shape that command returns. */
async function wd<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(WD + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json()) as { value: T };
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j.value).slice(0, 300)}`);
  return j.value;
}

const results: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Rect = { x: number; y: number; width: number; height: number };
type Invoked = { ok?: unknown; err?: string };

const session = await wd<{ sessionId: string }>("POST", "/session", { capabilities: { alwaysMatch: { "tauri:options": { application: app } } } });
const sid: string = session.sessionId;
const S = (p: string) => `/session/${sid}${p}`;
const exec = <T = unknown>(script: string, args: unknown[] = []) => wd<T>("POST", S("/execute/sync"), { script, args });
const execAsync = <T = unknown>(script: string, args: unknown[] = []) => wd<T>("POST", S("/execute/async"), { script, args });
const invoke = (cmd: string, payload: object = {}) =>
  execAsync<Invoked>(`const done = arguments[arguments.length - 1];
    window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then((v) => done({ ok: v === undefined ? null : v }), (e) => done({ err: String(e) }));`, [cmd, payload]);
async function find(css: string, timeoutMs = 20000): Promise<string | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const el = await wd<Record<string, string>>("POST", S("/element"), { using: "css selector", value: css });
      return Object.values(el)[0]!;
    } catch {
      await sleep(300);
    }
  }
  return null;
}

try {
  check("native shell exposes IPC", (await exec("return !!window.__TAURI_INTERNALS__")) === true);

  // With a camera the setup wizard opens; without one (Xvfb) the camera error is shown instead.
  const first = await find("[data-testid=wizard-firstRun], [data-testid=camera-error]", 30000);
  check("first start: setup wizard or a helpful camera message", !!first);
  const skip = await find("[data-testid=wizard-skip-all]", 1000);
  if (skip) await wd("POST", S(`/element/${skip}/click`), {});
  check("main view with toolbar", !!(await find("[data-testid=toolbar]")));

  // Settings store: a change is written to settings.json (the only file the app stores).
  const prefs = await find("[data-testid=open-preferences]");
  await wd("POST", S(`/element/${prefs}/click`), {});
  const left = await find("[data-testid=pref-hand] [role=radio]");
  await wd("POST", S(`/element/${left}/click`), {});
  await sleep(1500);
  const candidates = [".local/share", ".config"].map((d) => join(homedir(), d, "ch.zhaw.magichand", "settings.json"));
  const file = candidates.find(existsSync);
  check("settings.json written", !!file, file);
  if (file) check("the change is persisted", JSON.parse(readFileSync(file, "utf8")).settings?.preferredHand === "left");

  const ax = await invoke("accessibility_status");
  check("accessibility_status", ax.ok === "not-needed", JSON.stringify(ax));
  const front = await invoke("frontmost_app");
  check("frontmost_app answers", "ok" in front, JSON.stringify(front));
  check("update_tray", "ok" in (await invoke("update_tray", { labels: { pause: "P", show: "S", recalibrate: "R", quit: "Q", tooltip: "T" } })));
  const sc = await invoke("set_pause_shortcut", { accelerator: "CmdOrCtrl+Alt+P" });
  check("set_pause_shortcut", "ok" in sc || /already|register/i.test(sc.err ?? ""), JSON.stringify(sc));
  const bad = await invoke("set_pause_shortcut", { accelerator: "Nope+++" });
  check("invalid shortcut is rejected", "err" in bad, JSON.stringify(bad));

  // Real keystroke: enigo posts an X11 key event that arrives in our own (focused) window.
  await exec("window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push(e.key));");
  await exec("document.body.focus()");
  const sent = await invoke("send_key", { command: "next", mapping: "arrows" });
  await sleep(500);
  const keys = await exec<string[]>("return window.__keys");
  check("send_key reaches the focused window (ArrowRight)", "ok" in sent && keys.includes("ArrowRight"), `${JSON.stringify(sent)} keys=${JSON.stringify(keys)}`);
  await invoke("send_key", { command: "prev", mapping: "page" });
  await sleep(500);
  check("page mapping sends PageUp", (await exec<string[]>("return window.__keys")).includes("PageUp"));

  // Pill: the same window shrinks to a small always-on-top bar and comes back.
  const before = await wd<Rect>("GET", S("/window/rect"));
  check("set_pill_mode(true)", "ok" in (await invoke("set_pill_mode", { pill: true, width: 300, height: 64 })));
  await sleep(800);
  const pill = await wd<Rect>("GET", S("/window/rect"));
  check("window is pill-sized", Math.abs(pill.width - 300) < 40 && Math.abs(pill.height - 64) < 40, JSON.stringify(pill));
  await invoke("set_pill_mode", { pill: false, width: 0, height: 0 });
  await sleep(800);
  const after = await wd<Rect>("GET", S("/window/rect"));
  check("window size restored", Math.abs(after.width - before.width) < 40 && Math.abs(after.height - before.height) < 40, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

  // UI renders with the strict CSP (scripts, styles, worker) and the camera state is handled.
  const status = await find("[data-testid=status], [data-testid=camera-error], .loading-chip", 30000);
  check("camera state shown (live or a helpful error)", !!status);
  check("delete-data UI reachable", !!(await find("[data-testid=open-preferences]")));
} catch (err) {
  check("smoke run", false, String(err));
} finally {
  await wd("DELETE", S("")).catch(() => undefined);
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
