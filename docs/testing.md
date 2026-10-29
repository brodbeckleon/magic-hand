# Testen

## Automatisch

| Befehl | Was |
|--------|-----|
| `pnpm test` | Vitest: Gestenlogik (Golden-Tests gegen den Python-Prototyp, Property-Tests), Tracker, CSV, Übersetzungen |
| `pnpm e2e` | Playwright: echte Oberfläche mit Fake-Kamera; synthetische Handbewegungen laufen durch die ganze App |
| `cargo test` (in `src-tauri/`) | Rust: Tastenzuordnung |
| `python3 prototype/tools/gen_golden.py` | Erzeugt die Golden-Fixtures neu aus dem **unveränderten** Prototyp. CI prüft, dass sie aktuell sind. |

Die e2e-Tests starten Vite im Modus `e2e`. Nur in diesem Modus gibt es `window.__magicHand`
(Testzugriff). Produktionsbuilds enthalten diesen Code nicht.

## Manuell (vor jedem Meilenstein-Abschluss, auf macOS und Windows)

Vorbereitung: Protokoll leeren (App neu starten), Präsentation mit ≥ 30 Folien öffnen.
Ergebnisse mit `e` als CSV exportieren und der Abgabe beilegen.

### Seitenerkennung (einmalig pro Plattform)

MediaPipe nimmt an, dass das Bild gespiegelt ist; wir geben es ungespiegelt hinein
(`HANDEDNESS_SWAP` in `src/vision/landmarkers.ts`).

1. Einstellungen → Bevorzugte Hand: **Rechts**.
2. Nur die **rechte** Hand heben und wischen → Folie wechselt, Skelett ist farbig.
3. Nur die **linke** Hand heben → Skelett grau, keine Auslösung.

Ist es umgekehrt, `HANDEDNESS_SWAP` umstellen.

### Anforderungen

| ID | Ablauf | Bestanden wenn |
|----|--------|----------------|
| MHR01 | App starten, ohne die Hand ruhig zu halten 10× wischen | 0 Tastendrücke |
| MHR02 | An 5 Positionen im Bild (links, rechts, Mitte, nah, fern) je 10 Wischgesten | ≥ 90 % ausgelöst |
| MHR03 | Je 20 Wischgesten pro Richtung auf 3 m und 4 m Abstand | ≥ 90 % bzw. ≥ 80 % |
| MHR04 | Auflösung 320×240 einstellen, 40 Wischgesten | ≥ 85 % |
| MHR05 | 2–3 Personen, 10 Übergaben (offene Hand heben) | Übergabe < 2 s, 0 Tasten von Nicht-Sprechenden |
| MHR06 | Mit 240-fps-Handyvideo 20 Wischgesten filmen: Ende der Handbewegung bis Folienwechsel | p95 < 500 ms |
| MHR07 | 3 Minuten frei erklären, mit Händen gestikulieren | ≤ 1 Fehlauslösung |
| MHR08 | Netzwerkmonitor (Little Snitch / Wireshark), Dateizugriffe (fs_usage / ProcMon), Kamera-LED in Pause | 0 Verbindungen; nur `settings.json` geschrieben; LED aus |

`reaktion_ms` im Protokoll misst vom Beginn der Wischbewegung bis zum Tastendruck und enthält
damit die Dauer der Geste selbst. Für MHR06 zählt deshalb die Videomessung.
