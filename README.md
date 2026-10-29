# Magic Hand

Folien per Wischgeste vor der Laptop-Kamera wechseln. Desktop-App für macOS und Windows
(Tauri 2 + React/TypeScript, Handerkennung mit MediaPipe direkt in der App).

Alle Kamerabilder werden nur lokal im Arbeitsspeicher verarbeitet. Es werden keine Bilder
gespeichert oder gesendet, die App baut keine Netzwerkverbindungen auf (MHR08).

Der ursprüngliche Python-Prototyp liegt unter [`prototype/`](prototype/README.md) und dient als
Referenz für die Gestenlogik.

## Entwicklung

Voraussetzungen: Node 22, pnpm 9, Rust (stable). Unter Linux zusätzlich die
[Tauri-Systempakete](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm assets        # lädt die MediaPipe-Modelle (SHA-256 geprüft) und kopiert die wasm-Runtime
pnpm tauri dev     # App starten
pnpm dev           # nur die Oberfläche im Browser (ohne Tastendrücke)
```

| Befehl | Zweck |
|--------|-------|
| `pnpm test` | Unit-Tests (Vitest) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm tauri build` | Installer bauen (DMG bzw. NSIS/MSI) |
| `pnpm e2e` | Oberflächentests mit Fake-Kamera (Playwright) |
| `pnpm replay <datei>` | Entwickler-Aufnahme abspielen (siehe [Testen](docs/testing.md)) |

Testen, Entwicklerwerkzeuge und das manuelle Testprotokoll für MHR01–08: [docs/testing.md](docs/testing.md).
Signieren und Verteilen: [docs/release.md](docs/release.md).

### Projektaufbau

| Ordner | Inhalt |
|--------|--------|
| `src/core/` | Reine Gestenlogik ohne DOM/React/Tauri. Deterministisch (Zeit wird übergeben), damit Aufzeichnungen exakt wiedergegeben werden können. |
| `src/vision/` | Kamera und MediaPipe |
| `src/app/` | Oberfläche (React, SVG-Overlays) |
| `src/platform/` | Dünne Wrapper um Tauri-Befehle |
| `src-tauri/` | Rust: Tastendrücke, Berechtigungen, Fenster |
| `prototype/` | Python-Prototyp (Referenz) |
