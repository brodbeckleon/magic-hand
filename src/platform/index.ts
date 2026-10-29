// Thin wrappers around the Rust commands. In a plain browser (pnpm dev, Playwright) they fall back
// to harmless stand-ins so the UI can be developed and tested without the native shell.
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Command } from "../core/types.ts";

export type KeyMapping = "arrows" | "page";
export type PermissionState = "granted" | "denied" | "not-needed";

export interface Platform {
  readonly native: boolean;
  sendKey(command: Command, mapping: KeyMapping): Promise<void>;
  accessibilityStatus(): Promise<PermissionState>;
  requestAccessibility(): Promise<PermissionState>;
  openAccessibilitySettings(): Promise<void>;
  openCameraSettings(): Promise<void>;
  /** Lets the user pick a location and saves the text there. Returns the path, or null if cancelled. */
  saveTextFile(defaultName: string, extension: string, contents: string): Promise<string | null>;
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
};

export const platform: Platform = isTauri() ? native : browser;

if (import.meta.env.MODE === "e2e") (window as unknown as { __sentKeys: Command[] }).__sentKeys = sentKeys;
