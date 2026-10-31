# Magic Hand

Folien per Wischgeste vor der Laptop-Kamera wechseln, ohne zum Laptop zurückzugehen und ohne
Presenter-Klicker. Desktop-App für **macOS und Windows**; die Handerkennung (MediaPipe) läuft
vollständig auf dem Gerät.

- **Wischen statt klicken**: zügig nach links oder rechts wischen wechselt die Folie in PowerPoint,
  Keynote, Google Slides oder einem PDF-Viewer.
- **Erklärgesten werden ignoriert**: langsame, kurze oder steile Bewegungen lösen nichts aus.
- **Schwebendes Kamerabild** beim Präsentieren: zeigt, ob die Hand erkannt wird.
- **Mehrere Vortragende**: per Handzeichen übernehmen oder automatisch nach Sprechen und Bewegung.
- **Auch auf Distanz**: hilft, wenn man weit von der Kamera entfernt steht.
- **Privat**: keine Bilder werden gespeichert oder gesendet, die App braucht kein Internet.

Ein Projekt im Modul Natural User Interfaces an der ZHAW von Léon Brodbeck, Michael Gasser,
Kaspar Streiff und Diego Esposito. Der ursprüngliche Python-Prototyp liegt unter
[`prototype/`](prototype/README.md).

---

## Installieren

> **Wichtig:** `localhost:1420` im Browser ist nur die **Vorschau der Oberfläche** für die
> Entwicklung. Dort werden Gesten erkannt, aber **keine Tasten an PowerPoint gesendet**, und das
> Kamerabild kann nicht über der Präsentation schweben. Zum Präsentieren die installierte App
> verwenden.

Solange es keine offiziellen Releases gibt, baut GitHub die Installer automatisch bei jedem Pull
Request: im Pull Request unter **Checks → CI → Artifacts** (Anmeldung bei GitHub nötig).

### macOS (13 oder neuer, Apple Silicon)

1. Artefakt **`magic-hand-macos-latest`** herunterladen, entpacken, die `.dmg` öffnen und
   **Magic Hand** in den Ordner **Programme** ziehen.
2. Die App ist noch nicht signiert: im Ordner Programme **Rechtsklick → Öffnen → Öffnen**.
   Meldet macOS, die App sei «beschädigt», einmal im Terminal ausführen und dann erneut öffnen:
   ```bash
   xattr -cr "/Applications/Magic Hand.app"
   ```
3. **Kamera** erlauben, wenn macOS fragt.
4. **Bedienungshilfen** erlauben: Die App zeigt dafür eine Karte. Unter *Systemeinstellungen →
   Datenschutz & Sicherheit → Bedienungshilfen* **Magic Hand** einschalten. Ohne diese
   Berechtigung kommen die Tasten nicht in PowerPoint an.

Hinweis: Bei unsignierten Builds vergisst macOS die Berechtigungen nach jeder neuen Version.
Dann einfach erneut erlauben.

### Windows (10 und 11)

1. Artefakt **`magic-hand-windows-latest`** herunterladen, entpacken und den Installer
   (`.exe` oder `.msi`) starten.
2. Warnt SmartScreen, weil die App nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.
3. Unter *Einstellungen → Datenschutz → Kamera* muss «Desktop-Apps den Zugriff erlauben» an sein.

PowerPoint nicht «als Administrator» starten, sonst lässt Windows keine Tastendrücke anderer Apps zu.

---

## Bedienung

### Erster Start

Beim ersten Start führt eine kurze Einrichtung durch die Grundlagen. Jeder Schritt lässt sich
überspringen:

1. **Richtung wählen**: beide Richtungen ausprobieren und festlegen, ob «nach links wischen»
   oder «nach rechts wischen» die nächste Folie bedeutet.
2. **Präsentationsbereich**: Magic Hand schlägt einen Bereich um dich vor. Nur dort wird
   analysiert, das Publikum ausserhalb nicht. Der Rahmen lässt sich mit der Maus oder den
   Pfeiltasten anpassen.
3. **Hand ruhig halten**: ca. 1 Sekunde, bis der Ring voll ist. Erst danach sind Gesten aktiv;
   vorher wechselt nie eine Folie.

### Präsentieren

1. Präsentation öffnen und die Bildschirmpräsentation starten.
2. In Magic Hand die Hand kurz ruhig halten (falls noch nicht geschehen), dann **Präsentieren**
   klicken. Das Fenster wird zu einem **schwebenden Kamerabild** über der Präsentation und gibt
   den Fokus an die Präsentation zurück. Es lässt sich am Kamerabild verschieben.
3. **Wischen**:
   - zügig in die gewählte Richtung: **nächste Folie**
   - in die andere Richtung: **vorherige Folie**
   - die Hand danach einfach zurückführen: das löst nichts aus (Rückholzeit 1 s)

Eine Bewegung zählt als Wischgeste, wenn sie **weit genug** ist (ca. 2.5 Handlängen,
unabhängig vom Abstand zur Kamera), **schnell genug** (innerhalb von 0.5 s) und **eher
waagrecht** (höchstens 45° geneigt). Die Handform spielt keine Rolle.

Zeigt das schwebende Fenster **«Tasten gehen an: …»**, ist eine andere App im Vordergrund.
Einmal in die Präsentation klicken.

### Pause

- **⌘⌥P** (macOS) bzw. **Ctrl+Alt+P** (Windows) pausiert und setzt fort, auch während die
  Präsentation im Vordergrund ist.
- Alternativ über die Pause-Taste im schwebenden Fenster oder das Symbol in der Menüleiste bzw.
  im Infobereich.
- In der Pause ist die **Kamera aus**. Ist länger niemand im Bild (Standard: 10 Minuten),
  schaltet sie sich selbst aus.

### Die drei Knöpfe

| Knopf | Was er macht |
|-------|--------------|
| **Kalibrieren** | Geführter Ablauf: Licht- und Abstandsprüfung, Präsentationsbereich, Hand ruhig halten, je 3 Übungswischer. Danach schlägt Magic Hand auf dich abgestimmte Werte vor (Weite, Tempo, Winkel). |
| **Hilfe** | Erste Schritte mit Animationen, **«Jetzt ausprobieren»** (zeigt live, was erkannt wurde, ohne Tasten zu senden), Probleme lösen, Datenschutz. |
| **Einstellungen** | Siehe unten. |

### Einstellungen

| Bereich | Möglichkeiten |
|---------|---------------|
| Gesten | Bevorzugte Hand (links / beide / rechts), Wischrichtung, Empfindlichkeit (Ruhig ~37° · Normal 45° · Empfindlich ~52°) |
| Mehrere Vortragende | Per Handzeichen oder automatisch: sprechende Person, aktivste Person oder beides |
| Kamera | Kamera, Auflösung, Hilfe auf Distanz |
| Präsentation | Gesendete Tasten (Pfeiltasten oder Bild auf/ab), Kamerabild beim Präsentieren (aus / klein / gross), Ton beim Folienwechsel, Kamera bei Abwesenheit ausschalten |
| Sprache | System, Deutsch, English |
| Datenschutz | Alle gespeicherten Daten löschen |

### Mehrere Vortragende

Sind mehrere Personen im Bild, darf immer nur eine Person die Folien wechseln. Sie ist im
Kamerabild markiert, die anderen sind abgedunkelt.

- **Per Handzeichen** (Standard): Wer übernehmen will, hebt die **offene Hand ca. 1 Sekunde**
  über die Schulter, bis der orange Ring voll ist.
- **Automatisch**: Magic Hand gibt das Wort der **sprechenden Person** (Mundbewegung), der
  **aktivsten Person** (Bewegung) oder nach **beidem**. Das Handzeichen übersteuert jederzeit.
- Es wird nie mitten in einer Wischgeste gewechselt. Wer kurz aus dem Bild geht, behält das
  Wort 3 Sekunden.

### Tastenkürzel im Fenster

| Taste | Funktion |
|-------|----------|
| `P` | Pause / Fortsetzen |
| `K` | Neu kalibrieren (Hand ruhig halten) |
| `M` / `F` | Verpasste Geste bzw. Fehlauslösung im Protokoll vermerken |
| `Esc` | Einstellungen, Hilfe oder Assistent schliessen |
| `Ctrl/⌘ + Shift + D` | Entwicklerwerkzeuge ein-/ausblenden |

---

## Datenschutz

- Kamerabilder werden **nur im Arbeitsspeicher** verarbeitet und sofort verworfen. Es werden
  **keine Bilder, Videos oder Handdaten gespeichert oder gesendet**.
- Die App baut **keine Internetverbindung** auf. Die Erkennungsmodelle sind in der App enthalten.
- Gespeichert werden nur die Einstellungen und die Kalibrierung (`settings.json`). Löschen unter
  *Einstellungen → Datenschutz*.
- Die Kamera läuft nur, solange die Gestensteuerung aktiv ist.
- Analysiert wird nur der kalibrierte Präsentationsbereich, nicht das Publikum.

---

## Probleme lösen

| Problem | Lösung |
|---------|--------|
| Folie wechselt nicht | In die Präsentation klicken (sie muss im Vordergrund sein). Unter macOS die Berechtigung Bedienungshilfen prüfen. |
| Kamera startet nicht | Kamerazugriff in den Systemeinstellungen erlauben; andere Apps schliessen, die die Kamera nutzen (Teams, Zoom). |
| Wechselt zu oft | Empfindlichkeit «Ruhig» oder eine bevorzugte Hand wählen; die andere Hand kann dann frei gestikulieren. |
| Wischen wird nicht erkannt | Zügiger und weiter wischen, Licht von vorne. Auf Distanz hilft die Auflösung «Hoch». Oder **Kalibrieren**. |
| App ist langsam | Auflösung «Niedrig» wählen. |

Mehr in der App unter **Hilfe → Probleme lösen**.

---

## Anforderungen (MHR01–08)

| ID | Anforderung | Umsetzung | Geprüft durch |
|----|-------------|-----------|---------------|
| MHR01 | Kalibrierung vor dem ersten Folienwechsel | Hand ruhig halten (oder Handzeichen) schaltet Gesten frei; Präsentationsbereich | Property-Test, e2e |
| MHR02 | Erkennung an verschiedenen Positionen | Positionsunabhängige Erkennung im ganzen Bereich | Property-Test (Translation), manuell |
| MHR03 | Erkennung auf Distanz | Strecke in Handlängen; Handsuche am Handgelenk und Armbewegung bei grossem Abstand | Property-Test (Skalierung), Pipeline-Tests, manuell |
| MHR04 | Niedrige Auflösung | Wie MHR03, Auflösung 320×240 wählbar | Property-Test, manuell |
| MHR05 | Mehrere Vortragende | Personen-Tracking, Handzeichen, automatische Sprecherwahl | Unit-, Pipeline- und e2e-Tests, manuell |
| MHR06 | Verzögerung < 0.5 s | Analyse im Hintergrund-Thread; Messwerte p50/p95 in den Entwicklerwerkzeugen | Studienmodus, Handyvideo (manuell) |
| MHR07 | Erklärgesten unterscheiden | Mindestweite, Mindesttempo, Winkel, Rückholzeit, bevorzugte Hand | Golden- und Property-Tests, Studienmodus |
| MHR08 | Datenschutz | Nur lokal, keine Speicherung, kein Netzwerk, Kamera aus in der Pause | e2e prüft null Netzwerkanfragen, CI-Bundle-Prüfung |

Das manuelle Testprotokoll steht in [docs/testing.md](docs/testing.md).

---

## Entwicklung

Voraussetzungen: Node 22, pnpm 9, Rust (stable). macOS: Xcode Command Line Tools. Linux: die
[Tauri-Systempakete](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm assets        # lädt die MediaPipe-Modelle (SHA-256 geprüft) und kopiert die wasm-Runtime
pnpm tauri dev     # App starten (mit Tastendrücken und schwebendem Fenster)
pnpm dev           # nur die Oberfläche im Browser (localhost:1420, ohne Tastendrücke)
```

| Befehl | Zweck |
|--------|-------|
| `pnpm test` | Unit-Tests (Vitest), inkl. Golden-Tests gegen den Python-Prototyp |
| `pnpm e2e` | Oberflächentests in Chromium und WebKit (Playwright, Fake-Kamera) |
| `E2E_PROD=1 pnpm e2e` | Dieselben Tests gegen den Produktions-Build |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm check-bundle` | Prüft, dass der Build keine Telemetrie- oder CDN-Adressen enthält |
| `pnpm replay <datei>` | Entwickler-Aufnahme abspielen und mit der Live-Sitzung vergleichen |
| `pnpm tauri build` | Installer bauen (DMG bzw. NSIS/MSI) |
| `python3 prototype/tools/gen_golden.py` | Golden-Fixtures aus dem Prototyp neu erzeugen |

CI prüft jeden Pull Request: Lint, Typen, Unit- und Oberflächentests (Chromium und WebKit, Dev
und Produktion), Golden-Fixtures, Builds für macOS und Windows sowie einen Rauchtest der echten
App unter Linux (`tests/native/smoke.ts`).

Weitere Dokumentation:

- [docs/testing.md](docs/testing.md): Testen, Entwicklerwerkzeuge (Messwerte, Parameter,
  Aufnahmen, Studienmodus) und das manuelle Protokoll
- [docs/release.md](docs/release.md): Signieren, Notarisieren, Verteilen

### Projektaufbau

| Ordner | Inhalt |
|--------|--------|
| `src/core/` | Reine Gestenlogik ohne DOM/React/Tauri: Wischerkennung, Tracking, Sprecherwahl, Kalibrierung, Aufnahmen. Deterministisch (Zeit wird übergeben), damit Aufnahmen exakt wiedergegeben werden können. |
| `src/vision/` | Kamera, MediaPipe-Modelle, Analyse im Worker (oder im Hauptthread, wo nötig) |
| `src/app/` | Oberfläche (React, SVG-Overlays), Assistenten, Hinweise, Entwicklerwerkzeuge |
| `src/platform/` | Dünne Wrapper um die Tauri-Befehle; Netzwerksperre |
| `src/i18n/` | Texte Deutsch und Englisch |
| `src-tauri/` | Rust: Tastendrücke, Berechtigungen, Fenster und schwebende Leiste, Menüleiste, Kurzbefehl |
| `tests/` | Unit-, Oberflächen- und native Tests; Golden-Fixtures und Aufnahmen |
| `prototype/` | Python-Prototyp (Referenz für die Gestenlogik) |
| `assets/` | App-Symbol (SVG-Quelle) |
