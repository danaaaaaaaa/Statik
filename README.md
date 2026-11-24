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

## Version 4 – E-P-Spannungen, Klassifizierung, Schalter
- **elastoplastisch.js (neu):** Klasse `ElastoPlastischeSpannung` – nichtlineare Spannungsverteilung (σ = E·ε, begrenzt auf ±f_yd) bis zum voll durchplastizierten Querschnitt, für beliebige Querschnitte inkl. Polygone (exaktes Beschneiden der Polygone, Newton-Verfahren für die Dehnungsebene). Gleiche Schnittstelle wie `Spannung`, daher nutzt die 3D-Ansicht beide.
- **Schalter „Berechnungsart":** E-E (linear) oder E-P. E-P ist bei Klasse 3/4 oder unbekannter Klasse gesperrt. Maßgebend ist die Klasse der tatsächlich vorhandenen Beanspruchung (Druck, M_y, M_z).
- **Querschnittsklassifizierung** steht jetzt direkt unter den Querschnittswerten.
- Im E-P-Modus entfallen σ_v-Darstellung und -Nachweis; der Nachweis ist die E-P-Interaktion. Übersteigt die Beanspruchung die Traglast, wird der Grenzzustand beim größten erreichbaren Lastanteil gezeigt.
- Einschränkung: Der E-P-Spannungszustand berücksichtigt N, M_y, M_z; τ bleibt elastisch (Jourawski), der Querkrafteinfluss steckt im Nachweis (M_V,Rd).

## Version 5
- Desktop: Eingabespalte links bleibt beim Scrollen stehen (sticky), nur die Ergebnisse scrollen.
- E-P: Ausnutzungen (Querkraft, Normalkraft, Biegung+N+V, maßgebend) in der Tragfähigkeit und im Spannungsblock.
- Neues Spannungsdiagramm σ(z) bzw. σ(y) unter dem 3D-Fenster: Fließplateaus an den Rändern (±f_yd), linearer Kern, gestrichelt die fortgesetzte Dehnungsebene. Bei M_pl: Rechteckblöcke oberhalb/unterhalb der Schwerachse.
- 3D: Grundfläche halbtransparent, damit die Druckzone in der Vorderansicht nicht verdeckt wird.

## Version 6
- Polygon: beliebig viele Aussparungen; eine neue Kontur beginnt nach einer Leerzeile **oder** automatisch, wenn der Startpunkt wieder erreicht wird (behebt den fehlerhaften Obergurt bei fortlaufend eingegebenen Konturen). Aussparungen dürfen den Rand berühren.
- Neuer Querschnitt „Geschweißt: Gurte + Stege (frei)": Ober-/Untergurt mit eigener Breite und Dicke, beliebig viele Stege mit Lage und Dicke (Zweistegträger, Kasten, unsymmetrisches I). Klassifizierung je Gurtüberstand/Gurtfeld/Steg, Schubfläche Σ h_w·t_w.
- Speicherslots 1–6 für die Querschnittseingabe (Stahlbau): automatisches Speichern im lokalen Browser-Speicher, Wechsel per Klick; leerer Slot startet als Kopie der aktuellen Eingabe.

## Version 7
- Geschweißter Träger: Eingabe von Anzahl und Dicke der Stege; Verteilung gleichmäßig (1 mittig, 2 in den Drittelspunkten, 3 in den Viertelspunkten ...) über die Breite des schmaleren Gurts. Textfeld nur noch im Sonderfall „Einzeln“ (Lage von der linken Gurtkante). Felder mit `zeigeWenn` werden bedingt eingeblendet.
- Bei ungültiger Eingabe wird jetzt auch die Klassifizierung mit der Fehlermeldung ersetzt (keine veralteten Werte).

## Version 8
- Reiter 1–6 speichern neben dem Querschnitt auch die Schnittgrößen (N, V_y, V_z, M_y, M_z); Knopf „Schnittgrößen aus Reiter 1 übernehmen" (nur aktiv, wenn nicht Reiter 1 aktiv ist). Allgemein: `QuerschnittWahl` hat einen optionalen Parameter `zusatz {holen, setzen}` für weitere reiterbezogene Eingaben.
- Neues Layout Stahlbau: Querschnittswerte in zwei Tabellen (Geometrie | Widerstände) neben Skizze und Klassifizierung; darunter Spannungen | Tragfähigkeit + „Spannungen an Punkten". Die Eingabespalte ist dadurch kürzer.

## Version 9: Statik und Massivbau-Erweiterung

**Statik (neu, `#statik`)** – `stabwerk.js` (Rechenkern) und `stabwerk-ui.js` (Eingabetabellen, Zeichnung, Ergebnisse).
Ebene Stabwerke, Direkte Steifigkeitsmethode, Theorie I. Ordnung, linear-elastisch, Euler-Bernoulli. Einheiten m, kN, kNm; X nach rechts, Z nach unten.
Eingabe: Knoten mit Lager, Stäbe (A, I, Momentengelenke), Knoten-, Strecken- und Einzellasten. Ausgabe: N-, V-, M-Verlauf, Verformung, Auflagerkräfte, Knotenverschiebungen, Extremwerte.
Nicht enthalten: Temperatur, Stützensenkung, Theorie II. Ordnung, Schubverformung.

**Massivbau** – `stahlbeton.js`, `app.js`, `index.html`, `info.js`
- Normalkraft N_Ed (Zug +, Druck −), Bemessung mit M_Eds = M_Ed − N_Ed·z_s1.
- Verfahren umschaltbar: Spannungsblock, ω-Verfahren (μ_Eds → ω1, Δω bei Druckbewehrung), Parabel-Rechteck direkt.
- Expositionsklassen (XC, XD, XS, XF, XA, XM) → Mindestfestigkeitsklasse, Strukturklasse, c_min,dur, c_nom.
- Durchmesser (Zug, Druck, Bügel), Stäbe je Lage, d1/d2 automatisch aus Deckung und Verlegung (iterativ) oder manuell.
- Stababstände: lichter Abstand gegen a_min = max(Ø; d_g+5; 20 mm); Platten zusätzlich s_max = min(2h; 250 mm).
- Tabellenwerte (Mindestfestigkeit, Strukturklasse, c_min,dur) vor Verwendung an der Norm prüfen.

## Version 10: Torsion im Stahlbau
St.-Venant-Torsion: Eingabe T [kNm] je Reiter, Kennwerte I_t/W_t (I, U, T, Hohlprofile, Rohr, Kreis, Rechteck), T_Rd, Abminderung der Querkrafttragfähigkeit nach EN 1993-1-1, 6.2.7 (Gl. 6.26 bis 6.28). Nicht enthalten: Wölbkrafttorsion, Torsionsschubspannungen im Spannungsbild, Polygone und mehrzellige Querschnitte.
