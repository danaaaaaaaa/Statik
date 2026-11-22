# Statik-Rechner

Webapp (reines HTML/CSS/JavaScript, keine Installation, läuft offline) mit Startseite und zwei Bereichen
(Zurück-Taste und Lesezeichen funktionieren: `#stahlbau`, `#massivbau`):

- **Stahlbau** (alles auf einer Seite, Querschnitt und Stahlgüte nur einmal eingeben):
  Querschnittswerte (A, Schwerpunkt, Iy, Iz, Iyz, Hauptachsen, W, Wpl, i, Sy), Querschnittsklassen,
  Mel, Mpl, Mc, Npl, Vpl sowie elastische Spannungen (N, My, Mz) mit 3D-Ansicht und Vergleich mit f_yd
- **Querschnitte**: parametrische Formen, Walzprofile (IPE, HEA, HEB, HEM, UPN, Rund-, Quadrat-, Rechteckrohre)
  und **beliebige Polygone** per Koordinateneingabe (auch unsymmetrisch, mit Aussparungen);
  die Werte der Polygone werden mit der Umfahrungsmethode (Randintegral) berechnet
- **Massivbau**: Biegebemessung nach EC 2 mit NA (DE) für Rechteck und Plattenbalken inkl. Dehnungsebene und Spannungsverlauf
- **Info-Symbol (i)** hinter den Werten: Berechnungsformel und Normkapitel (EC 2, EC 3, EN 1990)

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

## Version 3 – Ergänzungen

**Stahlbau (eine Seite):** links Eingabe (Querschnitt, Stahlgüte, Schnittgrößen N, Vy, Vz, My, Mz, Punkte); daneben Querschnittswerte und Skizze; darunter Spannungen (mit 3D-Ansicht, kleiner als zuvor) und Tragfähigkeit.
- W_el steht nur noch bei den Querschnittswerten, die Tragfähigkeit zeigt nur Widerstände (M_el,Rd, M_pl,Rd, M_c,Rd, V_pl,Rd, N_pl,Rd).
- **Querkraft:** Schubspannung τ nach Jourawski (numerisch für beliebige Querschnitte), Vergleichsspannung σ_v = √(σ²+3τ²), Nachweis σ_v ≤ f_yd. Dargestellt wird wahlweise σ, τ oder σ_v.
- **Plastischer Nachweis E-P** (nur Klasse 1/2): V/V_pl,Rd, Abminderung ρ, M_V,Rd, M_N,Rd (Normalkraft), M_N,V,Rd und zweiachsige Interaktion.
- Vereinfachungen: Jourawski ist eine Näherung (keine Torsion, kein Schubmittelpunkt); M_N,V = M_N·M_V/M_pl; für allgemeine Querschnitte α = β = 1. Eurocode-Gleichungsnummern beziehen sich auf die 1. Generation und sind zu prüfen.

**Massivbau:** Betonarbeitslinie wählbar (Parabel-Rechteck-Diagramm oder Spannungsblock); der Spannungsverlauf zeigt das Parabel-Rechteck-Diagramm, der Block gestrichelt zum Vergleich.
