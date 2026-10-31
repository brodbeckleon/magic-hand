#!/usr/bin/env python3
"""
Generates golden fixtures for the TypeScript port of SwipeDetector.

Runs the UNMODIFIED prototype SwipeDetector (prototype/magic_hand.py) on synthetic hand traces
and writes, per frame, what the detector returned and its observable state. The Vitest suite
(tests/core/swipe.golden.test.ts) replays the same traces through the TS port and must match.

cv2 and mediapipe are stubbed, so only the Python standard library is needed:
    python3 prototype/tools/gen_golden.py
"""

import json
import math
import sys
from pathlib import Path
from unittest.mock import MagicMock

for name in ["cv2", "mediapipe", "mediapipe.tasks", "mediapipe.tasks.python",
             "mediapipe.tasks.python.vision"]:
    sys.modules[name] = MagicMock()

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "prototype"))
from magic_hand import Hand, SwipeDetector, hand_features  # noqa: E402

OUT = ROOT / "tests" / "fixtures" / "golden"


# ---------------------------------------------------------------------------
# Trace building blocks. A trace is a list of (t, hand-or-None).
# ---------------------------------------------------------------------------
class Trace:
    def __init__(self, fps=30.0, t0=10.0):
        self.dt = 1.0 / fps
        self.t = t0
        self.frames = []
        self.x, self.y, self.scale = 320.0, 240.0, 40.0

    def _emit(self, hand=True):
        h = Hand(self.x, self.y, self.scale) if hand else None
        self.frames.append((self.t, h))
        self.t += self.dt

    def hold(self, seconds, jitter=0.0):
        n = round(seconds / self.dt)
        for i in range(n):
            dx = jitter * math.sin(i * 1.7)
            dy = jitter * math.cos(i * 2.3)
            self.x += dx
            self.y += dy
            self._emit()
            self.x -= dx
            self.y -= dy
        return self

    def move(self, dx, dy, seconds, ease=False):
        """Moves the palm by (dx, dy) pixels within `seconds`."""
        n = max(1, round(seconds / self.dt))
        x0, y0 = self.x, self.y
        for i in range(1, n + 1):
            f = i / n
            if ease:
                f = 0.5 - 0.5 * math.cos(math.pi * f)
            self.x, self.y = x0 + dx * f, y0 + dy * f
            self._emit()
        return self

    def gap(self, seconds):
        n = round(seconds / self.dt)
        for _ in range(n):
            self._emit(hand=False)
        return self

    def jump(self, dx, dy):
        self.x += dx
        self.y += dy
        self._emit()
        return self

    def set_scale(self, scale):
        self.scale = scale
        return self

    def scale_ramp(self, target, seconds):
        n = max(1, round(seconds / self.dt))
        s0 = self.scale
        for i in range(1, n + 1):
            self.scale = s0 + (target - s0) * i / n
            self._emit()
        return self

    def jittered_times(self, amount, seed=7):
        """Replaces timestamps with irregular frame spacing (deterministic)."""
        out, t, state = [], self.frames[0][0], seed
        for _, h in self.frames:
            out.append((t, h))
            state = (state * 1103515245 + 12345) % (2 ** 31)
            t += self.dt * (1 + amount * ((state / 2 ** 31) * 2 - 1))
        self.frames = out
        return self


def calibrated(**kw):
    """Trace that starts with a completed calibration (1.2 s still) plus the 0.5 s block."""
    return Trace(**kw).hold(1.2).hold(0.6)


SCENARIOS = {
    # Calibration (MHR01)
    "calib_exact": lambda: Trace().hold(1.5),
    "calib_drift_resets": lambda: Trace().hold(0.6).move(30, 0, 0.1).hold(1.3),
    "calib_gap_resets": lambda: Trace().hold(0.7).gap(0.3).hold(1.2),
    "calib_short_gap_ok": lambda: Trace().hold(0.7).gap(0.1).hold(0.5),
    "no_hand": lambda: Trace().gap(2.0),
    "swipe_before_calibration": lambda: Trace().move(-200, 0, 0.3).move(200, 0, 0.3).hold(0.3),
    # Basic swipes
    "swipe_left_fast": lambda: calibrated().move(-160, 0, 0.25).hold(0.5),
    "swipe_right_fast": lambda: calibrated().move(160, 0, 0.25).hold(0.5),
    "swipe_left_eased": lambda: calibrated().move(-180, 5, 0.4, ease=True).hold(0.5),
    "swipe_too_slow": lambda: calibrated().move(-160, 0, 1.5).hold(0.3),
    "swipe_too_short": lambda: calibrated().move(-80, 0, 0.2).hold(0.5),
    "diagonal_ignored": lambda: calibrated().move(-120, 100, 0.25).hold(0.2).move(0, 0, 0.1).hold(0.3),
    "vertical_only": lambda: calibrated().move(0, 160, 0.25).hold(0.5).move(0, -160, 0.25).hold(0.5),
    # Return period
    "return_swipe_ignored": lambda: calibrated().move(-160, 0, 0.25).move(160, 0, 0.3).hold(1.2),
    "two_swipes_after_return": lambda: calibrated().move(-160, 0, 0.25).hold(1.2).move(-160, 0, 0.25).hold(0.5),
    "back_and_forth": lambda: calibrated().move(-160, 0, 0.2).hold(0.2).move(160, 0, 0.2).hold(1.0)
                                  .move(160, 0, 0.2).hold(1.2),
    # Gaps and jumps
    "gap_tolerated_mid_swipe": lambda: calibrated().move(-60, 0, 0.1).gap(0.13).move(-100, 0, 0.1).hold(0.5),
    "gap_breaks_swipe": lambda: calibrated().move(-60, 0, 0.1).gap(0.3).move(-100, 0, 0.1).hold(0.5),
    "jump_rejected": lambda: calibrated().jump(-200, 0).move(-40, 0, 0.1).hold(0.5),
    "hand_switch_jump": lambda: calibrated().move(-60, 0, 0.1).jump(-150, 20).move(-60, 0, 0.1).hold(0.5),
    # Frame rates and scale (MHR03/MHR04)
    "fps15_swipe": lambda: calibrated(fps=15).move(-160, 0, 0.3).hold(0.5),
    "fps60_swipe": lambda: calibrated(fps=60).move(160, 0, 0.2).hold(0.5),
    "jitter_fps": lambda: calibrated().move(-160, 0, 0.25).hold(1.2).move(160, 0, 0.25).hold(0.5)
                              .jittered_times(0.4),
    "far_small_hand": lambda: Trace().set_scale(12).hold(1.2).hold(0.6).move(-50, 0, 0.25).hold(0.5),
    "approaching_camera": lambda: calibrated().scale_ramp(70, 0.5).move(-200, 0, 0.3).hold(0.5),
    "even_history_median": lambda: calibrated(fps=8).scale_ramp(48, 0.25).move(-150, 0, 0.375).hold(0.5),
    "jittery_hold_no_trigger": lambda: calibrated().hold(3.0, jitter=6.0),
    "explaining_gestures": lambda: calibrated().move(-60, -30, 0.4, ease=True).move(70, 40, 0.5, ease=True)
                                      .move(-40, 60, 0.3).move(50, -70, 0.4, ease=True).hold(0.4)
                                      .move(90, 0, 0.6, ease=True).hold(0.5),
}


def run(name, trace):
    det = SwipeDetector()
    rows = []
    for t, h in trace.frames:
        ev = det.update(t, h)
        row = {
            "event": ev,
            "progress": det.progress,
            "calibrated": det.calibrated,
            "blocked": det.is_blocked(t),
            "returning": det.is_returning(t),
            "calibProgress": det.calib_progress(t),
            "historyLen": len(det.history),
        }
        if ev in ("next", "prev"):
            row["onset"] = det.onset
            row["lastDx"] = det.last_dx
        rows.append(row)
    frames = [{"t": t, "hand": None if h is None else {"cx": h.cx, "cy": h.cy, "scale": h.scale}}
              for t, h in trace.frames]
    return {"name": name, "frames": frames, "expected": rows}


class Lm:
    def __init__(self, x, y, z=0.0):
        self.x, self.y, self.z = x, y, z


def features_cases():
    """hand_features on deterministic pseudo-random landmark sets, mirrored and unmirrored."""
    state, cases = 12345, []

    def rnd():
        nonlocal state
        state = (state * 1103515245 + 12345) % (2 ** 31)
        return state / 2 ** 31

    for i in range(12):
        lms = [Lm(rnd(), rnd(), rnd() - 0.5) for _ in range(21)]
        if i == 0:  # degenerate hand: wrist on the middle MCP, scale is clamped to 1
            lms[9] = Lm(lms[0].x, lms[0].y)
        w, h = (640, 480) if i % 2 else (320, 240)
        for mirror in (True, False):
            f = hand_features(lms, w, h, mirror)
            cases.append({"landmarks": [[l.x, l.y, l.z] for l in lms], "width": w, "height": h,
                          "mirror": mirror, "expected": {"cx": f.cx, "cy": f.cy, "scale": f.scale}})
    return cases


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT.parent / "hand_features.json").write_text(json.dumps(features_cases()) + "\n")
    summary = {}
    for name, build in SCENARIOS.items():
        data = run(name, build())
        (OUT / f"{name}.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")
        summary[name] = [r["event"] for r in data["expected"] if r["event"]]
    for name, events in summary.items():
        print(f"{name:28s} {events}")


if __name__ == "__main__":
    main()
