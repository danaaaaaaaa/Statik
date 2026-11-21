# Statik-Rechner

Webapp (reines HTML/CSS/JavaScript, keine Installation, läuft offline) mit:

- **Startseite** mit den Bereichen **Stahlbau** und **Massivbau** (Zurück-Taste und Lesezeichen funktionieren: `#stahlbau`, `#massivbau`)
- **Walzprofile** (IPE, HEA, HEB, HEM, UPN, Rund-, Quadrat-, Rechteckrohre) und **Tragfähigkeit** (Klassen, Mel, Mpl, Npl, Vpl)
- **Info-Symbol (i)** hinter den Werten: Berechnungsformel und Normkapitel (EC 2, EC 3, EN 1990)
- **Spannungen & 3D**: elastische Normalspannungen (N, My, Mz) an beliebigen Punkten, 3D-Spannungsfläche
- **Querschnittswerte**: A, Schwerpunkt, Iy, Iz, Ip, Wy,o/u, Wz, iy, iz, Sy
- **Stahlbeton**: Biegebemessung nach EC 2 NA (DE) für Rechteck und Plattenbalken inkl. Dehnungsebene

## Dateien (alle in den Hauptordner des Repositories, nicht in Unterordner)

`index.html`, `style.css`, `util.js`, `info.js`, `querschnitte.js`, `profile.js`, `spannung.js`, `tragfaehigkeit.js`, `ansicht3d.js`, `stahlbeton.js`, `app.js`, `README.md`

## Auf dem iPhone über GitHub Pages aufrufen

1. In Safari auf github.com anmelden → oben rechts **+** → **New repository**.
   Name z. B. `statik-rechner`, **Public** wählen, **Create repository**.
2. Im neuen Repository **Add file → Upload files**, alle Dateien aus der Dateien-App auswählen
   und unten **Commit changes** tippen.
3. **Settings → Pages**: bei *Source* **Deploy from a branch**, Branch **main**, Ordner **/ (root)**, **Save**.
4. Nach 1–2 Minuten ist die Seite erreichbar unter
   `https://DEIN-BENUTZERNAME.github.io/statik-rechner/`
5. Link in Safari öffnen → **Teilen → Zum Home-Bildschirm**, dann startet sie wie eine App.

(Die Menünamen von GitHub können leicht abweichen.)

## Aktualisieren

Geänderte Datei im Repository öffnen und über das Stift-Symbol ersetzen, oder mit **Add file → Upload files**
unter gleichem Namen erneut hochladen. Danach 1–2 Minuten warten und die Seite neu laden.

## Hinweise

- Die Ergebnisse ersetzen keine geprüfte statische Berechnung.
- Annahmen der Stahlbetonbemessung: reine Biegung (NEd = 0), Spannungsblock, αcc = 0,85, B500B, Betonklassen bis C50/60, ξ ≤ 0,45.
- Normverweise (Info-Fenster) beziehen sich auf die 1. Generation der Eurocodes mit NA (DIN EN 1992-1-1:2011-01, DIN EN 1993-1-1:2010-12); bitte mit der eingeführten Fassung abgleichen.
