# Magic Hand

Folien per Wischgeste vor der Laptop-Kamera wechseln. Das Skript erkennt die Hand mit MediaPipe,
zeigt in einem Overlay-Fenster live an, was erkannt wird, und sendet bei einer Wischgeste die
Pfeiltaste rechts bzw. links an das Fenster, das gerade den Fokus hat (z.B. PowerPoint, Keynote,
PDF-Viewer).

## Installation

Python 3.10 oder neuer wird benötigt.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`opencv-python` nicht zusätzlich installieren: mediapipe bringt `opencv-contrib-python` schon mit,
ein zweites OpenCV-Paket kollidiert damit.

Das Handmodell (`hand_landmarker.task`, ca. 8 MB) wird beim ersten Start automatisch
heruntergeladen und neben dem Skript gespeichert.

### macOS-Berechtigungen

Beim ersten Start fragt macOS nach Berechtigungen für das Terminal (bzw. die IDE), aus dem das
Skript läuft. Unter *Systemeinstellungen → Datenschutz & Sicherheit* freigeben:

- **Kamera**: sonst lässt sich die Kamera nicht öffnen.
- **Bedienungshilfen**: sonst kommen die gesendeten Pfeiltasten nicht an.

Nach dem Freigeben das Terminal neu starten.

## Start

```bash
source .venv/bin/activate
python magic_hand.py              # Overlay + Tasten senden
python magic_hand.py --trocken    # nur Overlay, keine Tasten (gut zum Ausprobieren)
python magic_hand.py --oben       # Overlay-Fenster bleibt über anderen Fenstern
```

Optionen lassen sich kombinieren, z.B. `python magic_hand.py --oben --umkehren`.
Alle Optionen anzeigen: `python magic_hand.py --help`.

## Bedienung

1. **Kalibrieren**: Hand ca. 1 Sekunde ruhig vor die Kamera halten, bis der Balken unten voll ist.
   Vorher wird keine Folie gewechselt.
2. **In die Präsentation klicken**, damit sie den Fokus hat. Nur dann kommen die Tasten dort an.
3. **Wischen**:
   - Hand zügig nach **links** wischen → **nächste Folie** (Pfeil rechts)
   - Hand zügig nach **rechts** wischen → **vorherige Folie** (Pfeil links)

   Wie Blättern auf dem Handy; die Handform spielt keine Rolle. Mit `--umkehren` gilt die
   umgekehrte Zuordnung.
4. Nach einer Auslösung läuft 1 s **Rückholzeit**: Die Hand zurückführen löst nichts aus.

Eine Wischgeste zählt nur, wenn sie

- weit genug ist (mind. 2.5 Handlängen, unabhängig vom Abstand zur Kamera),
- schnell genug ist (innerhalb von 0.5 s) und
- überwiegend horizontal verläuft.

Schräge oder langsame Bewegungen beim Erklären werden ignoriert.

### Tasten im Overlay-Fenster

Das Overlay-Fenster muss dafür den Fokus haben (einmal hineinklicken).

| Taste | Funktion |
|-------|----------|
| `q` | Beenden |
| `p` | Pause ein/aus (keine Gesten erkennen) |
| `k` | Neu kalibrieren |
| `m` | Verpasste Geste protokollieren (Geste gemacht, aber nichts passiert) |
| `f` | Fehlauslösung protokollieren (Folie gewechselt, obwohl nicht gewollt) |

Beenden geht auch mit `Ctrl+C` im Terminal.

### Was das Overlay zeigt

- **Oben**: Modus (Kalibrieren / Aktiv / Pause), ob eine Hand erkannt wird, Sperr- bzw.
  Rückholzeit und Bildrate.
- **Handskelett** der erkannten Hand und eine **Spur** der Handmitte.
- **Balken unten**: wie weit die aktuelle Bewegung bis zur Auslöseschwelle ist (Mitte = Ruhe,
  ganz links/rechts = Schwelle erreicht).
- **Grosser Pfeil** bei einem ausgelösten Befehl.
- **Rechts oben**: die letzten 5 Inputs, auch ignorierte Bewegungen mit Grund und die
  Reaktionszeit ausgelöster Befehle.

## Optionen

| Option | Standard | Bedeutung |
|--------|----------|-----------|
| `--kamera N` | `0` | Kamera-Index, falls mehrere Kameras angeschlossen sind |
| `--breite N` | `640` | Kamerabreite in Pixel (z.B. `320` für schwächere Rechner) |
| `--hoehe N` | `480` | Kamerahöhe in Pixel |
| `--distanz X` | `2.5` | Mindeststrecke einer Wischgeste in Handlängen |
| `--fenster-zeit X` | `0.5` | Maximale Dauer einer Wischgeste in s |
| `--sperrzeit X` | `1.0` | Rückholzeit nach einer Auslösung in s |
| `--umkehren` | aus | Wischrichtungen vertauschen |
| `--trocken` | aus | Nur Overlay, keine Tasten senden |
| `--oben` | aus | Overlay-Fenster immer im Vordergrund |

Löst die Geste zu oft ungewollt aus, `--distanz` erhöhen oder `--fenster-zeit` verkleinern.
Wird sie zu selten erkannt, umgekehrt.

## Protokoll

Alle Ereignisse werden in `magic_hand_log.csv` geschrieben (wird bei jedem Start ergänzt):

| Spalte | Inhalt |
|--------|--------|
| `zeit` | Zeitstempel |
| `ereignis` | `calibrated`, `ausgeloest`, `ignored_dir`, `ignored_return`, `verpasst`, `fehlausloesung`, `pause`, `fortgesetzt`, `kalibrierung_zurueckgesetzt` |
| `richtung` | gesendeter Befehl: `next` / `prev` |
| `wischrichtung` | Richtung der Handbewegung: `links` / `rechts` |
| `strecke_handlaengen` | zurückgelegte Strecke in Handlängen (negativ = nach links) |
| `reaktion_ms` | Beginn der Wischbewegung bis Tastendruck |
| `verarbeitung_ms` | nur Bildauswertung des auslösenden Frames |

Die Pufferung der Kamera selbst (typisch 30–100 ms) ist in beiden Zeiten nicht enthalten.
Hat eine bestehende Logdatei ein anderes Spaltenformat, wird sie in
`magic_hand_log_alt_<datum>.csv` umbenannt und eine neue angelegt.

## Probleme

- **„Kamera 0 lässt sich nicht öffnen“**: Kamerazugriff für das Terminal freigeben (siehe oben)
  oder einen anderen Index mit `--kamera 1` probieren.
- **Overlay reagiert, aber die Folie wechselt nicht**: Präsentation hat nicht den Fokus, das
  Skript läuft mit `--trocken`, oder die Bedienungshilfen-Berechtigung fehlt.
- **Tasten `q`, `p` usw. tun nichts**: Das Overlay-Fenster hat nicht den Fokus.
