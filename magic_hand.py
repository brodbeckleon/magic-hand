#!/usr/bin/env python3
"""
Magic Hand: Folien per Wischgeste vor der Laptop-Kamera wechseln, mit Live-Overlay.

Das Overlay zeigt, was erkannt wird:
  - Handskelett der erkannten Hand
  - Spur der Handmitte und Balken unten: wie weit die aktuelle Bewegung bis zur Auslöseschwelle ist
  - grosser Pfeil bei einem ausgelösten Befehl
  - Liste der letzten Inputs, auch ignorierte Bewegungen (z.B. schräge Bewegung, Rückholbewegung)

Ablauf
  1. Kalibrieren: Hand ca. 1 Sekunde ruhig halten. Vorher wird keine Folie gewechselt (MHR01).
  2. Hand zügig nach links wischen  -> nächste Folie (Taste Pfeil rechts)
     Hand zügig nach rechts wischen -> vorherige Folie (Taste Pfeil links)
     (wie Blättern auf dem Handy; Handform egal; mit --umkehren gilt die umgekehrte Zuordnung)
     Danach 1 s Rückholzeit (--sperrzeit): Die Hand zurückführen löst nichts aus.
  3. Damit die Tasten ankommen, muss die Präsentation den Fokus haben (einmal hineinklicken).

Installation
  pip install mediapipe opencv-python pynput

Start
  python magic_hand.py              # Overlay + Tasten senden
  python magic_hand.py --trocken    # nur Overlay, keine Tasten (gut zum Ausprobieren)
  python magic_hand.py --oben       # Overlay-Fenster bleibt über anderen Fenstern

Tasten im Overlay-Fenster
  q beenden   p Pause   k neu kalibrieren   m verpasste Geste protokollieren   f Fehlauslösung protokollieren

Alle Ereignisse landen in magic_hand_log.csv (für den Webcam-Test: verpasste Befehle,
Fehlauslösungen, Reaktionszeit). reaktion_ms misst vom Beginn der Wischbewegung bis zum
Tastendruck, verarbeitung_ms nur die Bildauswertung des auslösenden Frames. Die Pufferung der
Kamera selbst (typisch 30-100 ms) ist in beiden nicht enthalten.
"""

import argparse
import csv
import math
import time
import urllib.request
from collections import deque, namedtuple
from datetime import datetime
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_PATH = Path(__file__).with_name("hand_landmarker.task")
LOG_PATH = Path(__file__).with_name("magic_hand_log.csv")

WRIST, MIDDLE_MCP = 0, 9
PALM = [0, 5, 9, 13, 17]
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20), (0, 17),
]

# Farben (BGR)
CORAL = (42, 69, 224)
TEAL = (112, 124, 14)
AMBER = (71, 181, 255)
WHITE = (255, 255, 255)
GREY = (170, 165, 160)
INK = (43, 26, 29)
LIGHT_GREEN = (150, 220, 140)

Hand = namedtuple("Hand", "cx cy scale")


# ---------------------------------------------------------------------------
# Gestenlogik (ohne Kamera testbar)
# ---------------------------------------------------------------------------
def hand_features(landmarks, width, height, mirror=True):
    """Handmitte und Handlänge in Pixeln."""
    xs = [((1 - lm.x) if mirror else lm.x) * width for lm in landmarks]
    ys = [lm.y * height for lm in landmarks]
    cx = sum(xs[i] for i in PALM) / len(PALM)
    cy = sum(ys[i] for i in PALM) / len(PALM)
    scale = max(math.dist((xs[WRIST], ys[WRIST]), (xs[MIDDLE_MCP], ys[MIDDLE_MCP])), 1.0)
    return Hand(cx, cy, scale)


class SwipeDetector:
    """
    Trennt bewusste Wischgesten von Erklärgesten (MHR07):
      - weite Bewegung (mind. `distance` Handlängen, dadurch unabhängig vom Kamera-Abstand, MHR03)
        innerhalb von höchstens `window` Sekunden; die Handform spielt dabei keine Rolle,
      - überwiegend horizontal,
      - danach Rückholzeit von `return_time` Sekunden: Bewegungen in dieser Zeit (typisch das
        Zurückführen der Hand) lösen nichts aus, auch nicht die Gegenrichtung.

    Robustheit:
      - Lücken ohne erkannte Hand bis `max_gap` Sekunden unterbrechen eine Geste nicht,
      - springt die Handmitte schneller als eine Hand sich bewegen kann (z.B. Wechsel auf die
        andere Hand), beginnt die Geste neu.

    update() liefert: "calibrated", "next", "prev", "ignored_dir", "ignored_return" oder None.
    """

    def __init__(self, distance=2.5, window=0.5, return_time=1.0, max_slope=0.6,
                 calib_time=1.0, calib_still=0.4, max_gap=0.2, max_jump=1.5, max_speed=40.0):
        self.distance = distance
        self.window = window
        self.return_time = return_time
        self.max_slope = max_slope
        self.calib_time = calib_time
        self.calib_still = calib_still
        self.max_gap = max_gap
        self.max_jump = max_jump      # Handlängen, die pro Frame immer erlaubt sind
        self.max_speed = max_speed    # Handlängen pro Sekunde, für längere Lücken zwischen Frames
        self.reset_calibration()

    def reset_calibration(self):
        self.calibrated = False
        self.history = deque()
        self.calib_start = None
        self.calib_anchor = None
        self.blocked_until = 0.0
        self.return_until = None      # Ende der Rückholzeit, None = keine aktiv
        self.last_seen = -math.inf
        self.progress = 0.0   # -1..1 Anteil der Schwelle, Vorzeichen = Richtung
        self.last_dx = 0.0
        self.onset = 0.0      # Beginn der zuletzt ausgelösten Bewegung (für die Reaktionszeit)

    def is_blocked(self, t):
        return t < self.blocked_until

    def is_returning(self, t):
        return self.return_until is not None and t < self.return_until

    def calib_progress(self, t):
        if self.calibrated or self.calib_start is None:
            return 0.0
        return min(1.0, (t - self.calib_start) / self.calib_time)

    def update(self, t, hand):
        self.progress = 0.0
        if self.return_until is not None and t >= self.return_until:
            self.return_until = None
            self.history.clear()      # Rückholbewegung nicht in die nächste Geste übernehmen
        if hand is None:
            if t - self.last_seen > self.max_gap:
                self.history.clear()
                self.calib_start = None
            return None
        self.last_seen = t

        if not self.calibrated:
            return self._calibrate(t, hand)

        if self.is_blocked(t):
            self.history.clear()
            return None

        if self.history:
            t_prev, prev = self.history[-1]
            allowed = max(self.max_jump, self.max_speed * (t - t_prev)) * prev.scale
            if math.dist((hand.cx, hand.cy), (prev.cx, prev.cy)) > allowed:
                self.history.clear()

        self.history.append((t, hand))
        while t - self.history[0][0] > self.window:
            self.history.popleft()
        if len(self.history) < 3:
            return None

        first = self.history[0][1]
        dx, dy = hand.cx - first.cx, hand.cy - first.cy
        ref = sorted(h.scale for _, h in self.history)[len(self.history) // 2]
        threshold = self.distance * ref
        self.progress = max(-1.0, min(1.0, dx / threshold))

        if math.hypot(dx, dy) < threshold:
            return None

        swipe = list(self.history)
        self.history.clear()
        self.progress = 0.0
        if self.is_returning(t):
            return "ignored_return"
        if abs(dy) > self.max_slope * abs(dx):
            self.blocked_until = t + 0.3
            return "ignored_dir"
        self.return_until = t + self.return_time
        self.last_dx = dx / ref
        self.onset = self._onset(swipe, threshold)
        return "next" if dx < 0 else "prev"  # Wisch nach links = weiterblättern

    def _calibrate(self, t, hand):
        if self.calib_start is None or \
                math.dist((hand.cx, hand.cy), self.calib_anchor) > self.calib_still * hand.scale:
            self.calib_start, self.calib_anchor = t, (hand.cx, hand.cy)
            return None
        if t - self.calib_start >= self.calib_time:
            self.calibrated = True
            self.blocked_until = t + 0.5
            return "calibrated"
        return None

    @staticmethod
    def _onset(swipe, threshold):
        """Letzter Frame, bevor sich die Hand merklich (10 % der Schwelle) zu bewegen begann."""
        t0, h0 = swipe[0]
        for (t_prev, _), (_, h) in zip(swipe, swipe[1:]):
            if math.hypot(h.cx - h0.cx, h.cy - h0.cy) > 0.1 * threshold:
                return t_prev
        return t0


# ---------------------------------------------------------------------------
# Overlay
# ---------------------------------------------------------------------------
def text(img, s, org, scale=0.6, color=WHITE, thick=1):
    cv2.putText(img, s, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, thick, cv2.LINE_AA)


def panel(img, x1, y1, x2, y2, alpha=0.6):
    roi = img[y1:y2, x1:x2]
    roi[:] = (roi * (1 - alpha) + [c * alpha for c in INK]).astype(roi.dtype)


class Overlay:
    EVENT_STYLE = {
        "calibrated": ("Kalibriert, Gesten aktiv", LIGHT_GREEN),
        "next": ("Naechste Folie", CORAL),
        "prev": ("Vorherige Folie", CORAL),
        "ignored_dir": ("Ignoriert: nicht horizontal", GREY),
        "ignored_return": ("Ignoriert: Rueckholzeit", GREY),
        "missed": ("Verpasst (protokolliert)", AMBER),
        "false": ("Fehlausloesung (protokolliert)", AMBER),
    }

    def __init__(self, reverse=False):
        self.reverse = reverse   # --umkehren: Wisch nach rechts = weiter
        self.events = deque(maxlen=5)
        self.flash_kind = None
        self.flash_swipe = None
        self.flash_until = 0.0

    def add(self, kind, t, extra="", swipe=None):
        """swipe: Richtung der Handbewegung ("links"/"rechts"); Pfeile folgen der Hand, nicht der Taste."""
        label, color = self.EVENT_STYLE[kind]
        if swipe:
            label = ("<- " if swipe == "links" else "-> ") + label
            self.flash_kind, self.flash_swipe, self.flash_until = kind, swipe, t + 0.8
        self.events.appendleft((datetime.now().strftime("%H:%M:%S"), label + extra, color))

    def draw(self, img, t, landmarks, hand, detector, mode, fps):
        h, w = img.shape[:2]

        # Handskelett und Spur
        if landmarks:
            pts = [(int((1 - lm.x) * w), int(lm.y * h)) for lm in landmarks]
            for a, b in HAND_CONNECTIONS:
                cv2.line(img, pts[a], pts[b], TEAL, 3, cv2.LINE_AA)
            for p in pts:
                cv2.circle(img, p, 4, WHITE, -1, cv2.LINE_AA)
        trail = [(int(hh.cx), int(hh.cy)) for _, hh in detector.history]
        for i in range(1, len(trail)):
            cv2.line(img, trail[i - 1], trail[i], AMBER, 2 + i // 3, cv2.LINE_AA)

        # Statuszeile oben
        panel(img, 0, 0, w, 64)
        text(img, f"Modus: {mode}", (12, 26), 0.65, WHITE, 2)
        if hand is None:
            hand_txt, hand_col = "Hand: keine erkannt", GREY
        else:
            hand_txt, hand_col = "Hand: erkannt", LIGHT_GREEN
        text(img, hand_txt, (12, 52), 0.55, hand_col, 1)
        if detector.calibrated:
            if detector.is_blocked(t):
                text(img, "Sperrzeit", (w - 230, 52), 0.55, AMBER, 1)
            elif detector.is_returning(t):
                text(img, f"Rueckholzeit {detector.return_until - t:.1f} s", (w - 230, 52), 0.55, AMBER, 1)
        text(img, f"{fps:4.1f} fps", (w - 110, 26), 0.55, GREY, 1)

        # Kalibrierungsfortschritt
        prog = detector.calib_progress(t)
        if not detector.calibrated:
            panel(img, 0, h - 60, w, h)
            text(img, "Hand ca. 1 s ruhig halten", (12, h - 34), 0.6, WHITE, 1)
            cv2.rectangle(img, (12, h - 22), (w - 12, h - 12), GREY, 1)
            if prog > 0:
                cv2.rectangle(img, (12, h - 22), (12 + int((w - 24) * prog), h - 12), TEAL, -1)
        else:
            # Wischbalken: Mitte = Ruhe, voll links/rechts = Schwelle erreicht
            panel(img, 0, h - 44, w, h)
            left, right = ("zurueck", "weiter") if self.reverse else ("weiter", "zurueck")
            left, right = f"<- {left}", f"{right} ->"
            lw = cv2.getTextSize(left, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
            rw = cv2.getTextSize(right, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
            cx, half = w // 2, w // 2 - max(lw, rw) - 20
            cv2.rectangle(img, (cx - half, h - 28), (cx + half, h - 16), GREY, 1)
            if detector.progress:
                end = cx + int(half * detector.progress)
                cv2.rectangle(img, (min(cx, end), h - 28), (max(cx, end), h - 16),
                              CORAL if abs(detector.progress) > 0.8 else AMBER, -1)
            cv2.line(img, (cx, h - 32), (cx, h - 12), WHITE, 1)
            text(img, left, (cx - half - lw - 8, h - 16), 0.5, WHITE, 1)
            text(img, right, (cx + half + 8, h - 16), 0.5, WHITE, 1)

        # Liste der letzten Inputs
        if self.events:
            bw = 330
            panel(img, w - bw - 10, 74, w - 10, 84 + 26 * len(self.events))
            for i, (ts, label, col) in enumerate(self.events):
                text(img, f"{ts}  {label}", (w - bw, 100 + 26 * i), 0.5, col, 1 if i else 2)

        # Grosser Pfeil bei Auslösung
        if t < self.flash_until:
            y = h // 2
            a, b = (int(w * 0.3), y), (int(w * 0.7), y)
            if self.flash_swipe == "links":
                a, b = b, a
            cv2.arrowedLine(img, a, b, CORAL, 18, cv2.LINE_AA, tipLength=0.3)
            label = "NAECHSTE FOLIE" if self.flash_kind == "next" else "VORHERIGE FOLIE"
            size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 1.2, 3)[0]
            text(img, label, ((w - size[0]) // 2, y + 70), 1.2, WHITE, 3)


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------
def ensure_model():
    if not MODEL_PATH.exists():
        print(f"Lade Handmodell herunter nach {MODEL_PATH.name} ...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)


LOG_FIELDS = ["zeit", "ereignis", "richtung", "wischrichtung", "strecke_handlaengen",
              "reaktion_ms", "verarbeitung_ms"]


class Logger:
    def __init__(self, path):
        if path.exists():
            with open(path, newline="", encoding="utf-8") as f:
                header = next(csv.reader(f), None)
            if header != LOG_FIELDS:
                # Protokolle mit anderem Format (z.B. vor dem Tausch der Wischrichtung) nicht vermischen
                old = path.with_name(f"{path.stem}_alt_{datetime.now():%Y%m%d_%H%M%S}{path.suffix}")
                path.rename(old)
                print(f"Altes Protokoll umbenannt in {old.name}")
        new = not path.exists()
        self.f = open(path, "a", newline="", encoding="utf-8")
        self.w = csv.writer(self.f)
        if new:
            self.w.writerow(LOG_FIELDS)

    def log(self, event, *values):
        self.w.writerow([datetime.now().isoformat(timespec="milliseconds"), event, *values])
        self.f.flush()

    def close(self):
        self.f.close()


def make_keyboard(dry_run):
    if dry_run:
        return None
    from pynput.keyboard import Controller, Key
    kb = Controller()

    def press(direction):
        key = Key.right if direction == "next" else Key.left
        kb.press(key)
        kb.release(key)
    return press


# ---------------------------------------------------------------------------
# Hauptprogramm
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Magic Hand: Folien per Wischgeste wechseln")
    ap.add_argument("--kamera", type=int, default=0, help="Kamera-Index (Standard 0)")
    ap.add_argument("--breite", type=int, default=640, help="Kamerabreite in Pixel (für MHR04 z.B. 320)")
    ap.add_argument("--hoehe", type=int, default=480, help="Kamerahöhe in Pixel")
    ap.add_argument("--distanz", type=float, default=2.5, help="Mindeststrecke in Handlängen")
    ap.add_argument("--fenster-zeit", type=float, default=0.5, help="max. Dauer einer Wischgeste in s")
    ap.add_argument("--sperrzeit", type=float, default=1.0,
                    help="Rückholzeit nach einer Auslösung in s (Bewegungen lösen nichts aus)")
    ap.add_argument("--umkehren", action="store_true", help="Richtungen vertauschen")
    ap.add_argument("--trocken", action="store_true", help="nur Overlay, keine Tasten senden")
    ap.add_argument("--oben", action="store_true", help="Overlay-Fenster immer im Vordergrund")
    args = ap.parse_args()

    ensure_model()
    landmarker = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_hand_presence_confidence=0.6,
        min_tracking_confidence=0.5,
    ))

    cap = cv2.VideoCapture(args.kamera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.breite)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.hoehe)
    if not cap.isOpened():
        raise SystemExit(f"Kamera {args.kamera} lässt sich nicht öffnen. Anderen Index mit --kamera "
                         "versuchen oder dem Terminal den Kamerazugriff erlauben.")

    win = "Magic Hand"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    if args.oben and hasattr(cv2, "WND_PROP_TOPMOST"):
        try:
            cv2.setWindowProperty(win, cv2.WND_PROP_TOPMOST, 1)
        except cv2.error:
            print("Hinweis: 'immer im Vordergrund' wird hier nicht unterstützt.")

    detector = SwipeDetector(distance=args.distanz, window=args.fenster_zeit, return_time=args.sperrzeit)
    overlay = Overlay(reverse=args.umkehren)
    press = make_keyboard(args.trocken)
    log = Logger(LOG_PATH)
    paused = False
    last_ts = -1
    fps, t_prev = 0.0, time.perf_counter()

    print("Bereit. Hand ca. 1 s ruhig halten zum Kalibrieren. Beenden mit q im Fenster.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Kein Kamerabild.")
                break
            t_cap = time.perf_counter()

            ts = max(int(time.monotonic() * 1000), last_ts + 1)  # MediaPipe braucht steigende Zeitstempel
            last_ts = ts
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)

            h, w = frame.shape[:2]
            landmarks = result.hand_landmarks[0] if result.hand_landmarks else None
            hand = hand_features(landmarks, w, h) if landmarks else None
            event = None if paused else detector.update(t_cap, hand)

            if event in ("next", "prev"):
                direction = event
                if args.umkehren:
                    direction = "prev" if event == "next" else "next"
                if press:
                    press(direction)
                t_key = time.perf_counter()
                reaction = (t_key - detector.onset) * 1000
                processing = (t_key - t_cap) * 1000
                swipe = "links" if detector.last_dx < 0 else "rechts"
                overlay.add(direction, t_cap, f"  {reaction:.0f} ms", swipe)
                log.log("ausgeloest", direction, swipe, f"{detector.last_dx:.2f}",
                        f"{reaction:.0f}", f"{processing:.1f}")
            elif event:
                overlay.add(event, t_cap)
                log.log(event)

            now = time.perf_counter()
            fps = 0.9 * fps + 0.1 / max(now - t_prev, 1e-6)
            t_prev = now

            if paused:
                mode = "PAUSE (p)"
            elif not detector.calibrated:
                mode = "Kalibrieren"
            else:
                mode = "Aktiv" + (" (trocken)" if args.trocken else "")
            view = cv2.flip(frame, 1)
            overlay.draw(view, t_cap, landmarks, hand, detector, mode, fps)
            cv2.imshow(win, view)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("p"):
                paused = not paused
                log.log("pause" if paused else "fortgesetzt")
            elif key == ord("k"):
                detector.reset_calibration()
                log.log("kalibrierung_zurueckgesetzt")
            elif key == ord("m"):
                overlay.add("missed", t_cap)
                log.log("verpasst")
            elif key == ord("f"):
                overlay.add("false", t_cap)
                log.log("fehlausloesung")
    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        cv2.destroyAllWindows()
        landmarker.close()
        log.close()
        print(f"Protokoll: {LOG_PATH}")


if __name__ == "__main__":
    main()
