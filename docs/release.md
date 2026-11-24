# Release

CI baut bei jedem Pull Request Installer für macOS (Universal-DMG, ad hoc signiert) und Windows
(NSIS/MSI, unsigniert) und legt sie als Artefakte des Workflow-Laufs ab. Für eine Verteilung an
Dritte ohne Warnungen müssen sie mit einem Zertifikat signiert sein (siehe unten).

## Release veröffentlichen

Ein Versions-Tag löst `.github/workflows/release.yml` aus. Der Workflow baut die Installer und
veröffentlicht sie unter **Releases** auf GitHub.

1. Version setzen, per Pull Request auf `main` bringen:
   ```bash
   pnpm version:set 0.2.0   # package.json, src-tauri/Cargo.toml, Cargo.lock
   ```
2. Nach dem Merge den Tag auf `main` setzen und pushen:
   ```bash
   git checkout main && git pull
   git tag v0.2.0 && git push origin v0.2.0
   ```
3. Der Workflow
   - prüft, dass der Tag zur Version passt (`pnpm version:check`), sonst bricht er ab;
   - legt einen Release-Entwurf an, mit automatisch erzeugten Release Notes (die gemergten Pull
     Requests seit dem letzten Tag);
   - baut macOS (eine Universal-DMG für Apple Silicon und Intel) und Windows (`.exe` und `.msi`)
     und lädt sie in den Entwurf hoch;
   - prüft die Signatur der macOS-App (`scripts/verify-macos-signature.sh`, siehe unten);
   - veröffentlicht das Release erst, wenn beide Plattformen erfolgreich waren. Schlägt ein Build
     fehl, bleibt der Entwurf liegen: unter *Releases* löschen, Fehler beheben, Tag neu setzen
     (`git push --delete origin v0.2.0`, dann Schritt 2).

Tags mit Bindestrich (z. B. `v0.2.0-beta.1`) werden als Pre-Release markiert. Signiert wird wie
unten beschrieben, sobald die Secrets angelegt sind; ohne sie ist die macOS-App ad hoc signiert und
die Windows-Installer sind unsigniert.

## macOS: signieren und notarisieren

### Ohne Apple-Secrets: ad hoc

`src-tauri/tauri.conf.json` setzt `bundle.macOS.signingIdentity` auf `"-"`. Tauri signiert damit das
ganze Bundle ad hoc, in der Universal-DMG beide Architekturen. Nach dem Build prüfen CI und der
Release-Workflow mit `scripts/verify-macos-signature.sh`, dass `codesign --verify --deep --strict`
durchgeht und arm64 wie x86_64 je einen CDHash haben. Lokal nach `pnpm tauri build --target
universal-apple-darwin` dasselbe Skript ausführen.

Ohne diese Signatur (so bei v0.2.0: nur die Linker-Signatur auf arm64, auf x86_64 gar keine)
speichert macOS die Freigabe für Kamera und Bedienungshilfen gegen einen Hash, der zur App auf der
Platte nicht passt. Die Prüfung schlägt bei jedem Start fehl (`errSecCSReqFailed`), und macOS fragt
endlos neu. Abhilfe für Nutzer: README → *macOS fragt immer wieder nach Kamera oder
Bedienungshilfen*.

Auch ad hoc signiert gehen die Berechtigungen **mit jeder neuen Version verloren**. Eine
Ad-hoc-Signatur hat kein Zertifikat, deshalb besteht ihre Designated Requirement nur aus dem CDHash
(`codesign -d -r- "Magic Hand.app"` zeigt `cdhash H"…"`). macOS bindet die Freigabe an diese
Requirement, und jeder neue Build hat einen anderen CDHash. Nach einem Update muss man also einmal
neu erlauben, die Endlosschleife gibt es aber nicht mehr.

### Stabile Berechtigungen ohne Apple Developer Account: selbst signiertes Zertifikat

Mit einem Zertifikat lautet die Designated Requirement `identifier "ch.zhaw.magichand" and
certificate root = H"…"`. Sie bleibt über Versionen gleich, solange dasselbe Zertifikat signiert.
Dafür genügt ein selbst signiertes Codesigning-Zertifikat in den bestehenden Secrets
(`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`):

- Tauri erkennt importierte Zertifikate nur, wenn der Common Name mit einem Apple-Präfix beginnt
  (z. B. `Apple Development:`) und das Subject eine Organisationseinheit (OU) hat. Beispiel, das
  Zertifikat und Schlüssel nur lokal ablegt (**nie committen**):
  ```bash
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout key.pem -out cert.pem \
    -subj "/CN=Apple Development: Magic Hand (MAGICHAND)/OU=MAGICHAND/O=Magic Hand" \
    -addext "basicConstraints=critical,CA:false" -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning"
  openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem -name "Magic Hand" -out sign.p12
  base64 -i sign.p12 | pbcopy   # Inhalt für APPLE_CERTIFICATE
  ```
- `APPLE_SIGNING_IDENTITY` auf den Common Name setzen (`Apple Development: Magic Hand
  (MAGICHAND)`). Diese Variable hat Vorrang vor dem `"-"` aus `tauri.conf.json`. Ohne sie bricht der
  Build ab, weil Tauri das Zertifikat mit `"-"` vergleicht.
- `APPLE_ID`, `APPLE_PASSWORD` und `APPLE_TEAM_ID` **nicht** anlegen. Ein selbst signiertes
  Zertifikat lässt sich nicht notarisieren. Gatekeeper warnt beim ersten Öffnen weiterhin
  (Rechtsklick → Öffnen), die Berechtigungen bleiben aber über Updates erhalten.
- Das Zertifikat nicht wechseln: Ein neues Zertifikat hat einen anderen Hash, dann muss man die
  Berechtigungen wieder einmal neu erlauben.

### Mit Apple Developer Account: Developer ID und Notarisierung

Ohne Gatekeeper-Warnung geht es nur mit einem Apple Developer Account.

1. Ein «Developer ID Application»-Zertifikat als `.p12` exportieren.
2. Im Repository unter *Settings → Secrets and variables → Actions* anlegen:

   | Secret | Inhalt |
   |--------|--------|
   | `APPLE_CERTIFICATE` | `.p12` als Base64 (`base64 -i cert.p12`) |
   | `APPLE_CERTIFICATE_PASSWORD` | Passwort des `.p12` |
   | `APPLE_SIGNING_IDENTITY` | z. B. `Developer ID Application: Name (TEAMID)` |
   | `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Für die Notarisierung (App-spezifisches Passwort) |

3. Tauri liest diese Variablen beim `tauri build`, signiert und notarisiert automatisch.

`scripts/apple-signing-env.sh` gibt in beiden Workflows nur die Secrets weiter, die gesetzt sind.
GitHub macht aus einem fehlenden Secret einen leeren String, und Tauri nimmt eine vorhandene
Variable beim Wort, auch wenn sie leer ist. Ein leeres `APPLE_CERTIFICATE` würde als Zertifikat
importiert, leere `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` würden eine Notarisierung starten,
die fehlschlägt. Notarisiert wird deshalb nur mit Zertifikat und allen drei Werten. Ist nur ein
Teil davon gesetzt, bricht der Workflow mit einer Meldung ab.

Die App läuft **ohne App Sandbox** (sonst kommen die Pfeiltasten nicht in PowerPoint/Keynote an),
aber mit Hardened Runtime und der Kamera-Berechtigung (`src-tauri/Entitlements.plist`). Damit ist
sie nicht für den Mac App Store geeignet, wohl aber für die direkte Verteilung.

**Zum Entwickeln**: Lokale Builds sind ebenfalls ad hoc signiert, macOS fragt deshalb nach jedem
Build erneut nach Kamera und Bedienungshilfen. Mit einer festen Signatur bauen, um das zu vermeiden,
z. B. `APPLE_SIGNING_IDENTITY="Apple Development: …" pnpm tauri build` mit einem Zertifikat aus dem
Schlüsselbund.

## Windows: signieren

Ohne Signatur warnt SmartScreen beim ersten Start. Für ein Code-Signing-Zertifikat in
`src-tauri/tauri.conf.json` unter `bundle.windows` `certificateThumbprint`, `digestAlgorithm` und
`timestampUrl` setzen oder einen `signCommand` verwenden (z. B. für Azure Trusted Signing).

Hinweis: Wird PowerPoint **als Administrator** gestartet, kommen Tastendrücke einer normalen App
dort nicht an (Windows UIPI). PowerPoint normal starten.

## Version

Die Version steht in `package.json` und `src-tauri/Cargo.toml` (`tauri.conf.json` verweist auf
`package.json`). `pnpm version:set` setzt beide. Die App zeigt sie unter Hilfe → Über.
