// Thin wrappers around the Rust commands. In a plain browser (pnpm dev, Playwright) they fall back
// to harmless stand-ins so the UI can be developed and tested without the native shell.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Command } from "../core/types.ts";

export type KeyMapping = "arrows" | "page";
export type PermissionState = "granted" | "denied" | "not-needed";
export type TrayAction = "pause" | "recalibrate";

export interface TrayLabels {
  pause: string;
  show: string;
  recalibrate: string;
  quit: string;
  tooltip: string;
}

export interface Platform {
  readonly native: boolean;
  sendKey(command: Command, mapping: KeyMapping): Promise<void>;
  accessibilityStatus(): Promise<PermissionState>;
  requestAccessibility(): Promise<PermissionState>;
  openAccessibilitySettings(): Promise<void>;
  openCameraSettings(): Promise<void>;
  /** Lets the user pick a location and saves the text there. Returns the path, or null if cancelled. */
  saveTextFile(defaultName: string, extension: string, contents: string): Promise<string | null>;
  /** Morphs the main window into the presenter pill (or back). */
  setPillMode(pill: boolean, width: number, height: number): Promise<void>;
  /** Gives keyboard focus back to the app behind us (the presentation). */
  yieldFocus(): Promise<void>;
  updateTray(labels: TrayLabels): Promise<void>;
  /** Registers the global pause shortcut ("" disables it). Rejects if it is invalid or taken. */
  setPauseShortcut(accelerator: string): Promise<void>;
  onTrayAction(fn: (action: TrayAction) => void): () => void;
  onPauseShortcut(fn: () => void): () => void;
}

/** Subscribes to a Tauri event and returns a synchronous unsubscribe. */
function subscribe<T>(event: string, fn: (payload: T) => void): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  void listen<T>(event, (e) => fn(e.payload)).then((u) => (cancelled ? u() : (off = u)));
  return () => {
    cancelled = true;
    off?.();
  };
}

const native: Platform = {
  native: true,
  sendKey: (command, mapping) => invoke("send_key", { command, mapping }),
  accessibilityStatus: () => invoke("accessibility_status"),
  requestAccessibility: () => invoke("request_accessibility"),
  openAccessibilitySettings: () => invoke("open_accessibility_settings"),
  openCameraSettings: () => invoke("open_camera_settings"),
  saveTextFile: (defaultName, extension, contents) =>
    invoke("save_text_file", { defaultName, extension, contents }),
  setPillMode: (pill, width, height) => invoke("set_pill_mode", { pill, width, height }),
  yieldFocus: () => invoke("yield_focus"),
  updateTray: (labels) => invoke("update_tray", { labels }),
  setPauseShortcut: (accelerator) => invoke("set_pause_shortcut", { accelerator }),
  onTrayAction: (fn) => subscribe<TrayAction>("tray-action", fn),
  onPauseShortcut: (fn) => subscribe<null>("shortcut-pause", () => fn()),
};

/** Keys sent in browser mode, for tests (window.__sentKeys). */
const sentKeys: Command[] = [];

const browser: Platform = {
  native: false,
  sendKey: async (command) => {
    sentKeys.push(command);
  },
  accessibilityStatus: async () => "not-needed",
  requestAccessibility: async () => "not-needed",
  openAccessibilitySettings: async () => {},
  openCameraSettings: async () => {},
  saveTextFile: async (defaultName, _extension, contents) => {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: defaultName });
    a.click();
    URL.revokeObjectURL(url);
    return defaultName;
  },
  setPillMode: async () => {},
  yieldFocus: async () => {},
  updateTray: async () => {},
  setPauseShortcut: async () => {},
  onTrayAction: () => () => {},
  onPauseShortcut: () => () => {},
};

export const platform: Platform = isTauri() ? native : browser;

if (import.meta.env.MODE === "e2e") (window as unknown as { __sentKeys: Command[] }).__sentKeys = sentKeys;
