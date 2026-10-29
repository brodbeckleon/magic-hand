# Release

CI baut bei jedem Pull Request unsignierte Installer für macOS (DMG) und Windows (NSIS/MSI) und
legt sie als Artefakte des Workflow-Laufs ab. Für eine Verteilung an Dritte müssen sie signiert sein.

## macOS: signieren und notarisieren

Ohne Signatur blockiert Gatekeeper die App, und die Berechtigungen (Kamera, Bedienungshilfen) gehen
bei jedem neuen Build verloren, weil macOS sie an die Signatur bindet. Benötigt wird ein Apple
Developer Account.

1. Ein «Developer ID Application»-Zertifikat als `.p12` exportieren.
2. Im Repository unter *Settings → Secrets and variables → Actions* anlegen:

   | Secret | Inhalt |
   |--------|--------|
   | `APPLE_CERTIFICATE` | `.p12` als Base64 (`base64 -i cert.p12`) |
   | `APPLE_CERTIFICATE_PASSWORD` | Passwort des `.p12` |
   | `APPLE_SIGNING_IDENTITY` | z. B. `Developer ID Application: Name (TEAMID)` |
   | `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Für die Notarisierung (App-spezifisches Passwort) |

3. Tauri liest diese Variablen beim `tauri build` und signiert und notarisiert automatisch.

Die App läuft **ohne App Sandbox** (sonst kommen die Pfeiltasten nicht in PowerPoint/Keynote an),
aber mit Hardened Runtime und der Kamera-Berechtigung (`src-tauri/Entitlements.plist`). Damit ist
sie nicht für den Mac App Store geeignet, wohl aber für die direkte Verteilung.

**Zum Entwickeln**: Lokal mit einer festen Signatur bauen (z. B. «Apple Development»-Zertifikat),
sonst fragt macOS nach jedem Build erneut nach Kamera und Bedienungshilfen.

## Windows: signieren

Ohne Signatur warnt SmartScreen beim ersten Start. Für ein Code-Signing-Zertifikat in
`src-tauri/tauri.conf.json` unter `bundle.windows` `certificateThumbprint`, `digestAlgorithm` und
`timestampUrl` setzen oder einen `signCommand` verwenden (z. B. für Azure Trusted Signing).

Hinweis: Wird PowerPoint **als Administrator** gestartet, kommen Tastendrücke einer normalen App
dort nicht an (Windows UIPI). PowerPoint normal starten.

## Version

Die Version steht in `package.json`, `src-tauri/Cargo.toml` und `src-tauri/tauri.conf.json` und
muss in allen drei gleich sein. Die App zeigt sie unter Hilfe → Über.
