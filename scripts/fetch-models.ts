// Downloads the MediaPipe models into public/models at BUILD time.
// The app never fetches anything at runtime (MHR08), so models ship inside the bundle.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://storage.googleapis.com/mediapipe-models/";
const MODELS = [
  {
    file: "hand_landmarker.task",
    path: "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    sha256: "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  },
  {
    file: "pose_landmarker_lite.task",
    path: "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  },
  {
    file: "face_landmarker.task",
    path: "face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    sha256: "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  },
];

const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");
const outDir = join(import.meta.dirname, "..", "public", "models");
mkdirSync(outDir, { recursive: true });

for (const m of MODELS) {
  const target = join(outDir, m.file);
  if (existsSync(target) && sha256(readFileSync(target)) === m.sha256) {
    console.log(`ok       ${m.file}`);
    continue;
  }
  const res = await fetch(BASE + m.path);
  if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const hash = sha256(buf);
  if (hash !== m.sha256) throw new Error(`${m.file}: sha256 mismatch (got ${hash})`);
  writeFileSync(target, buf);
  console.log(`fetched  ${m.file} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
