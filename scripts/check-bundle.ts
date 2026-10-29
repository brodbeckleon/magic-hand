// Fails if the production bundle contains known telemetry endpoints or CDN URLs (MHR08).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  "odml.pa.googleapis.com",
  "play.googleapis.com/log",
  "google-analytics.com",
  "googletagmanager.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "storage.googleapis.com/mediapipe",
];

const root = join(import.meta.dirname, "..", "dist");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|html|css|json)$/.test(f)) files.push(p);
  }
};
walk(root);

let bad = 0;
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const needle of FORBIDDEN) {
    if (s.includes(needle)) {
      console.error(`${f}: contains ${needle}`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log(`bundle ok: ${files.length} files, no telemetry/CDN URLs`);
