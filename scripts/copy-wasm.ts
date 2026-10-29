// Copies the MediaPipe wasm runtime into public/mediapipe/wasm so it is served locally
// instead of from a CDN (MHR08).
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copied   wasm -> ${dest}`);
