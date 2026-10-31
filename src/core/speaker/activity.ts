import type { FaceObs, PoseObs } from "../types.ts";

/**
 * Talking = the jaw moves. The standard deviation of jawOpen over the last second separates talking
 * from a mouth that is simply open. Falls back to the inner-lip gap relative to the face height.
 */
export class MouthActivity {
  private samples: { t: number; v: number }[] = [];
  private readonly window: number;

  constructor(window = 1.0) {
    this.window = window;
  }

  update(t: number, face: FaceObs | null): void {
    if (!face) return;
    let v = face.jawOpen;
    if (v === null && face.lip) {
      const [up, low, top, chin] = face.lip;
      const h = Math.hypot(top.x - chin.x, top.y - chin.y);
      v = h > 0 ? Math.hypot(up.x - low.x, up.y - low.y) / h : null;
    }
    if (v === null) return;
    this.samples.push({ t, v });
    while (this.samples.length && t - this.samples[0]!.t > this.window * 1.5) this.samples.shift();
  }

  /**
   * Activity score (std dev of the mouth signal over the last `window`), or null without recent face
   * data. With sparse samples (faces only every ~0.5 s under load) it looks back up to 1.5 windows.
   */
  score(t: number): number | null {
    let s = this.samples.filter((x) => t - x.t <= this.window);
    if (s.length < 3) s = this.samples.filter((x) => t - x.t <= this.window * 1.5);
    if (s.length < 3) return null;
    const mean = s.reduce((a, x) => a + x.v, 0) / s.length;
    return Math.sqrt(s.reduce((a, x) => a + (x.v - mean) ** 2, 0) / s.length);
  }
}

const UPPER_BODY = [11, 12, 13, 14, 15, 16];

/** Movement energy: exponentially averaged speed of shoulders, elbows and wrists in shoulder widths/s. */
export class MotionEnergy {
  private prev: { t: number; pose: PoseObs } | null = null;
  value = 0;
  private readonly tau: number;

  constructor(tau = 1.0) {
    this.tau = tau;
  }

  update(t: number, pose: PoseObs, shoulder: number): void {
    const prev = this.prev;
    this.prev = { t, pose };
    if (!prev || t <= prev.t || shoulder <= 0) return;
    const dt = t - prev.t;
    let sum = 0;
    let n = 0;
    for (const i of UPPER_BODY) {
      const a = prev.pose.landmarks[i];
      const b = pose.landmarks[i];
      if (!a || !b || (b.visibility ?? 1) < 0.5) continue;
      sum += Math.hypot(b.x - a.x, b.y - a.y) / shoulder / dt;
      n++;
    }
    if (!n) return;
    const speed = sum / n;
    const k = 1 - Math.exp(-dt / this.tau);
    this.value += k * (speed - this.value);
  }
}
