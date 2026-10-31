// Settings persistence. Natively: settings.json in the app's config folder (Tauri store plugin).
// In the browser (development, tests): localStorage. This is the ONLY data the app stores (MHR08).
import { isTauri } from "@tauri-apps/api/core";
import { parseSettings, type Settings } from "./schema.ts";

const KEY = "settings";
const LOCAL_KEY = "magic-hand.settings";
const FILE = "settings.json";

type StoreLike = { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void>; delete(k: string): Promise<boolean>; save(): Promise<void> };

let storePromise: Promise<StoreLike> | null = null;
function store(): Promise<StoreLike> {
  storePromise ??= import("@tauri-apps/plugin-store").then((m) => m.load(FILE, { autoSave: false, defaults: {} }));
  return storePromise;
}

export async function loadSettings(): Promise<Settings> {
  try {
    if (isTauri()) return parseSettings(await (await store()).get(KEY));
    const raw = localStorage.getItem(LOCAL_KEY);
    return parseSettings(raw ? JSON.parse(raw) : {});
  } catch (err) {
    console.warn("settings unreadable, using defaults", err);
    return parseSettings({});
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  if (isTauri()) {
    const st = await store();
    await st.set(KEY, s);
    await st.save();
  } else {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
  }
}

/** Deletes everything the app has stored. */
export async function deleteSettings(): Promise<void> {
  if (isTauri()) {
    const st = await store();
    await st.delete(KEY);
    await st.save();
  } else {
    localStorage.removeItem(LOCAL_KEY);
  }
}
