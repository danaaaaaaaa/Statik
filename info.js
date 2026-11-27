"use strict";

/**
 * info.js - Berechnungsformeln und Normverweise zu den angezeigten Werten.
 *
 * Hinter jedem Wert steht ein Info-Symbol "i". Ein Tipp darauf öffnet ein Fenster mit
 *  - der Berechnungsformel,
 *  - einer kurzen Erläuterung und
 *  - dem Kapitel bzw. der Gleichung der zugehörigen Norm.
 *
 * Inhalt:
 *  - INFO      : Datenbank (Schlüssel -> {titel, formeln, text, normen})
 *  - infoBtn() : erzeugt das HTML des Info-Symbols für einen Schlüssel
 *  - InfoPanel : Fenster, das beim Antippen eines Info-Symbols erscheint
 *
 * Neuer Eintrag: in INFO ergänzen und mit infoBtn("schluessel") bzw. im HTML mit
 * <button type="button" class="info" data-info="schluessel">i</button> einbinden.
 */

/** Kurzbezeichnungen der Normen (1. Generation der Eurocodes, jeweils mit Nationalem Anhang). */
const NORMEN = {
  EC0: "DIN EN 1990",
  EC1: "DIN EN 1991-1-1",
  EC2: "DIN EN 1992-1-1",
  EC3: "DIN EN 1993-1-1",
};
const { EC0, EC1, EC2, EC3 } = NORMEN;

/** Hinweis am Ende jedes Info-Fensters mit Normverweisen. */
const INFO_HINWEIS =
  "Kapitel- und Gleichungsnummern beziehen sich auf die Eurocodes der 1. Generation " +
  "(DIN EN 1992-1-1, DIN EN 1993-1-1) mit Nationalem Anhang; die 2. Generation ist anders nummeriert. " +
  "Bitte vor Verwendung mit der eingeführten Normfassung abgleichen.";

const INFO = {

  /* ---------------- Querschnittswerte ---------------- */

  breite: {
    titel: "Breite b",
    formeln: ["b = y<sub>max</sub> − y<sub>min</sub>"],
    text: "Ausdehnung des Querschnitts in y-Richtung (Umrandungsrechteck).",
  },
  hoehe: {
    titel: "Höhe h",
    formeln: ["h = z<sub>max</sub> − z<sub>min</sub>"],
    text: "Ausdehnung des Querschnitts in z-Richtung (Umrandungsrechteck).",
  },
  A: {
    titel: "Querschnittsfläche A",
    formeln: [
      "A = Σ A<sub>i</sub> &nbsp;(Aussparungen mit negativem Vorzeichen)",
      "Rechteck: A = b·h &nbsp; Kreis: A = π·d²/4 &nbsp; Rohr: A = π·(d² − d<sub>i</sub>²)/4",
    ],
    text: "Walzprofile werden aus den Katalogabmessungen (h, b, t<sub>w</sub>, t<sub>f</sub>, r) als Polygon " +
      "mit Ausrundungen (Hohlkehlen) berechnet. Die Werte stimmen daher mit den Profiltabellen auf wenige Zehntel Prozent überein.",
    normen: [`${EC3}, 6.2.2 (Querschnittswerte)`],
  },
  masse: {
    titel: "Masse je Meter",
    formeln: ["g = A·ρ &nbsp; mit ρ = 7850 kg/m³", "g [kg/m] = A [mm²] · 7,85·10<sup>−3</sup>"],
    text: "Eigenmasse des Stahlquerschnitts je laufendem Meter.",
    normen: [`${EC1}, Anhang A (Wichten von Baustoffen: Stahl 77,0 bis 78,5 kN/m³)`],
  },
  zs: {
    titel: "Schwerpunkt z<sub>s</sub>",
    formeln: ["z<sub>s</sub> = Σ (A<sub>i</sub>·z<sub>i</sub>) / Σ A<sub>i</sub>"],
    text: "Abstand der Schwerachse von der Oberkante; der Abstand von der Unterkante ist h − z<sub>s</sub>.",
  },
  ys: {
    titel: "Schwerpunkt y<sub>s</sub>",
    formeln: ["y<sub>s</sub> = Σ (A<sub>i</sub>·y<sub>i</sub>) / Σ A<sub>i</sub>"],
    text: "Abstand der Schwerachse von der linken Außenkante (bei U-Profilen der Abstand e von der Stegrückseite).",
  },
  Iy: {
    titel: "Flächenmoment 2. Grades I<sub>y</sub>",
    formeln: [
      "I<sub>y</sub> = Σ [ I<sub>y,i</sub> + A<sub>i</sub>·(z<sub>i</sub> − z<sub>s</sub>)² ] &nbsp;(Satz von Steiner)",
      "Rechteck: I<sub>y</sub> = b·h³/12 &nbsp; Kreis: I = π·d⁴/64",
    ],
    text: "Trägheitsmoment um die horizontale Schwerachse y (starke Achse bei Walzprofilen).",
  },
  Iz: {
    titel: "Flächenmoment 2. Grades I<sub>z</sub>",
    formeln: [
      "I<sub>z</sub> = Σ [ I<sub>z,i</sub> + A<sub>i</sub>·(y<sub>i</sub> − y<sub>s</sub>)² ] &nbsp;(Satz von Steiner)",
      "Rechteck: I<sub>z</sub> = h·b³/12",
    ],
    text: "Trägheitsmoment um die vertikale Schwerachse z (schwache Achse bei Walzprofilen).",
  },
  Ip: {
    titel: "Polares Flächenmoment I<sub>p</sub>",
    formeln: ["I<sub>p</sub> = I<sub>y</sub> + I<sub>z</sub>"],
    text: "Bezogen auf den Schwerpunkt. Nicht zu verwechseln mit dem Torsionsträgheitsmoment I<sub>T</sub> (St.-Venant), " +
      "das hier nicht berechnet wird.",
  },
  Wyo: {
    titel: "Widerstandsmoment W<sub>y,o</sub>",
    formeln: ["W<sub>y,o</sub> = I<sub>y</sub> / z<sub>o</sub>"],
    text: "z<sub>o</sub> = Abstand der oberen Randfaser vom Schwerpunkt. Elastisches Widerstandsmoment für die Randspannung σ = M/W.",
    normen: [`${EC3}, 6.2.5(2) (W<sub>el,min</sub>)`],
  },
  Wyu: {
    titel: "Widerstandsmoment W<sub>y,u</sub>",
    formeln: ["W<sub>y,u</sub> = I<sub>y</sub> / z<sub>u</sub>"],
    text: "z<sub>u</sub> = Abstand der unteren Randfaser vom Schwerpunkt. Bei unsymmetrischen Querschnitten (z. B. T) ist der kleinere der beiden Werte W<sub>y,o</sub>, W<sub>y,u</sub> maßgebend.",
    normen: [`${EC3}, 6.2.5(2) (W<sub>el,min</sub>)`],
  },
  Wz: {
    titel: "Widerstandsmoment W<sub>z</sub>",
    formeln: ["W<sub>z</sub> = I<sub>z</sub> / y<sub>max</sub>"],
    text: "y<sub>max</sub> = größerer Randabstand von der z-Achse (bei U-Profilen die offene Flanschseite).",
    normen: [`${EC3}, 6.2.5(2) (W<sub>el,min</sub>)`],
  },
  Wpl: {
    titel: "Plastisches Widerstandsmoment W<sub>pl</sub>",
    formeln: [
      "W<sub>pl</sub> = S<sub>o</sub> + S<sub>u</sub> = Σ A<sub>i</sub>·|z<sub>i</sub>| &nbsp;(bezogen auf die plastische Nulllinie)",
      "plastische Nulllinie: A<sub>o</sub> = A<sub>u</sub> = A/2",
      "Rechteck: W<sub>pl</sub> = b·h²/4 &nbsp; Kreis: W<sub>pl</sub> = d³/6",
    ],
    text: "Statisches Moment beider Flächenhälften um die Nulllinie, die die Fläche halbiert. Bei Walzprofilen werden die Ausrundungen mit berücksichtigt.",
    normen: [`${EC3}, 6.2.5(2), Gl. (6.13) (Klasse 1 und 2)`],
  },
  iy: {
    titel: "Trägheitsradius i<sub>y</sub>",
    formeln: ["i<sub>y</sub> = √( I<sub>y</sub> / A )"],
    text: "Grundlage für Schlankheiten, z. B. λ = L<sub>cr</sub> / i beim Biegeknicken.",
    normen: [`${EC3}, 6.3.1.3 (Schlankheit beim Biegeknicken)`],
  },
  iz: {
    titel: "Trägheitsradius i<sub>z</sub>",
    formeln: ["i<sub>z</sub> = √( I<sub>z</sub> / A )"],
    text: "Grundlage für Schlankheiten, z. B. λ = L<sub>cr</sub> / i beim Biegeknicken.",
    normen: [`${EC3}, 6.3.1.3 (Schlankheit beim Biegeknicken)`],
  },
  Sy: {
    titel: "Statisches Moment S<sub>y</sub>",
    formeln: [
      "S<sub>y</sub> = ∫ z dA = A<sub>o</sub>·z<sub>s,o</sub> &nbsp;(Fläche oberhalb der Schwerachse)",
      "τ = V<sub>z</sub>·S<sub>y</sub> / ( I<sub>y</sub>·t )",
    ],
    text: "Maßgebend für die elastische Schubspannung in der Schwerachse (t = Stegdicke bzw. Wanddicke an dieser Stelle).",
    normen: [`${EC3}, 6.2.6(4), Gl. (6.20) (elastische Schubspannung)`],
  },

  polygon: {
    titel: "Beliebiges Polygon: Eingabe und Berechnung",
    formeln: [
      "Umfahrungsmethode (Gaußscher Integralsatz), Kante i von P<sub>i</sub>(y<sub>i</sub>|z<sub>i</sub>) nach P<sub>i+1</sub>:",
      "c<sub>i</sub> = y<sub>i</sub>·z<sub>i+1</sub> − y<sub>i+1</sub>·z<sub>i</sub>",
      "A = ½·Σ c<sub>i</sub>",
      "S<sub>y</sub> = ∫z dA = ⅙·Σ (z<sub>i</sub> + z<sub>i+1</sub>)·c<sub>i</sub> &nbsp;&nbsp; S<sub>z</sub> = ∫y dA = ⅙·Σ (y<sub>i</sub> + y<sub>i+1</sub>)·c<sub>i</sub>",
      "I<sub>y</sub> = ∫z² dA = 1/12·Σ (z<sub>i</sub>² + z<sub>i</sub>·z<sub>i+1</sub> + z<sub>i+1</sub>²)·c<sub>i</sub>",
      "I<sub>z</sub> = ∫y² dA = 1/12·Σ (y<sub>i</sub>² + y<sub>i</sub>·y<sub>i+1</sub> + y<sub>i+1</sub>²)·c<sub>i</sub>",
      "I<sub>yz</sub> = ∫y·z dA = 1/24·Σ (y<sub>i</sub>·z<sub>i+1</sub> + 2·y<sub>i</sub>·z<sub>i</sub> + 2·y<sub>i+1</sub>·z<sub>i+1</sub> + y<sub>i+1</sub>·z<sub>i</sub>)·c<sub>i</sub>",
      "Schwerpunkt: y<sub>s</sub> = S<sub>z</sub>/A, z<sub>s</sub> = S<sub>y</sub>/A; danach Verschiebung: I<sub>y,s</sub> = I<sub>y</sub> − A·z<sub>s</sub>² usw.",
    ],
    text: "Eingabe: eine Ecke je Zeile als „y z“ in mm (y nach rechts, z nach <b>unten</b>). Dezimalkomma oder -punkt, Trennung durch Leerzeichen oder Semikolon. " +
      "Die 1. Kontur ist die Außenkontur, jede weitere eine Aussparung (beliebig viele). Eine neue Kontur beginnt nach einer Leerzeile oder automatisch, sobald der Startpunkt der aktuellen Kontur wieder erreicht wird. Aussparungen dürfen den Rand berühren. " +
      "Umlaufsinn und Wiederholung des Startpunkts sind egal; Kanten dürfen sich nicht kreuzen. " +
      "Der Rand wird nur einmal umfahren, es werden keine Teilflächen und Steineranteile gebildet. Jede Kontur geht mit ihrem Vorzeichen (Loch negativ) in die Summen ein.",
    normen: ["Technische Mechanik / Geometrie (kein Normverweis)"],
  },
  stege: {
    titel: "Geschweißter Träger: Stege",
    formeln: ["Gleichmäßig: Steg i bei y<sub>i</sub> = i·b/(n+1) von der Gurtkante (b = schmalerer Gurt)", "A<sub>v,z</sub> = Σ h<sub>w</sub>·t<sub>w</sub> &nbsp;(h<sub>w</sub> = h − t<sub>o</sub> − t<sub>u</sub>)"],
    text: "Standard: Anzahl und Dicke der Stege eingeben; die Stege werden gleichmäßig verteilt (1 Steg mittig, 2 Stege in den Drittelspunkten, 3 in den Viertelspunkten usw.). " +
      "Mit Stegabstand a &gt; 0 werden die Stege stattdessen im Achsabstand a symmetrisch zur Mitte angeordnet (a = 0: gleichmäßig). Sonderfall „Einzeln“: je Zeile ein Steg mit Lage y (Stegmitte, gemessen von der linken Kante des breiteren Gurts) und Dicke t. " +
      "Beispiel Kasten 200 mm breit mit 10 mm Wänden: „5 10“ und „195 10“. Obergurt und Untergurt können unterschiedliche Breite und Dicke haben. " +
      "Die Stege müssen innerhalb des schmaleren Gurtes liegen und dürfen sich nicht überlappen. " +
      "Klassifizierung: Gurtüberstände (einseitig gestützt) und Gurtfelder zwischen den Stegen (beidseitig gestützt) einzeln; beide Gurte werden vereinfachend als gedrückt angenommen.",
    normen: [`${EC3}, Tab. 5.2 (Klassifizierung)`, `${EC3}, 6.2.6(3) (Schubfläche)`],
  },
  Iyz: {
    titel: "Deviationsmoment I<sub>yz</sub>",
    formeln: ["I<sub>yz</sub> = ∫ y·z dA &nbsp;(bezogen auf die Schwerachsen)"],
    text: "Bei Querschnitten mit einer Symmetrieachse parallel zu y oder z ist I<sub>yz</sub> = 0. Ist I<sub>yz</sub> ≠ 0, sind y und z keine Hauptachsen: " +
      "ein Moment um eine Achse erzeugt dann auch eine Krümmung um die andere (schiefe Biegung).",
  },
  hauptachsen: {
    titel: "Hauptträgheitsmomente und Hauptachsen",
    formeln: [
      "I<sub>1,2</sub> = (I<sub>y</sub> + I<sub>z</sub>)/2 ± √( ((I<sub>y</sub> − I<sub>z</sub>)/2)² + I<sub>yz</sub>² )",
      "tan 2α = −2·I<sub>yz</sub> / (I<sub>y</sub> − I<sub>z</sub>)",
    ],
    text: "I<sub>1</sub> ist das größte, I<sub>2</sub> das kleinste Flächenmoment 2. Grades. α ist der Winkel der Hauptachse 1 (Achse, um die I<sub>1</sub> wirkt) " +
      "gegen die y-Achse, positiv in Richtung +z (in der Darstellung im Uhrzeigersinn). Um die Hauptachsen ist das Deviationsmoment null.",
    normen: ["Technische Mechanik (Hauptachsentransformation)"],
  },
  ausnutzung: {
    titel: "Spannungsnachweis (elastisch)",
    formeln: [
      "f<sub>yd</sub> = f<sub>y</sub> / γ<sub>M0</sub>",
      "Ausnutzung = max |σ| / f<sub>yd</sub> ≤ 1,0",
    ],
    text: "Vergleich der größten Normalspannung am Querschnittsrand mit der Bemessungsstreckgrenze. Schubspannungen und die Vergleichsspannung sind nicht enthalten. " +
      "Bei Querschnitten der Klasse 1 und 2 darf auch plastisch nachgewiesen werden (siehe Tragfähigkeit).",
    normen: [`${EC3}, 6.2.1(5) (Fließkriterium, elastischer Nachweis)`],
  },
  arbeitslinie: {
    titel: "Spannungs-Dehnungs-Linie des Betons",
    formeln: [
      "Parabel-Rechteck-Diagramm: &nbsp;0 ≤ ε<sub>c</sub> ≤ ε<sub>c2</sub>: σ<sub>c</sub> = f<sub>cd</sub>·[ 1 − (1 − ε<sub>c</sub>/ε<sub>c2</sub>)<sup>n</sup> ]",
      "ε<sub>c2</sub> ≤ ε<sub>c</sub> ≤ ε<sub>cu2</sub>: σ<sub>c</sub> = f<sub>cd</sub>",
      "f<sub>ck</sub> ≤ 50 N/mm²: n = 2,0, ε<sub>c2</sub> = 2,0 ‰, ε<sub>cu2</sub> = 3,5 ‰",
      "Spannungsblock: Höhe λ·x, Spannung η·f<sub>cd</sub>",
      "ω-Verfahren: μ<sub>Eds</sub> = M<sub>Eds</sub> / (b·d²·f<sub>cd</sub>) → ω<sub>1</sub>, ξ, ζ; A<sub>s1</sub> = (ω<sub>1</sub>·b·d·f<sub>cd</sub> + N<sub>Ed</sub>) / σ<sub>sd</sub>",
    ],
    text: "Beim Parabel-Rechteck-Diagramm wird die Betonspannung an jeder Stelle der Druckzone aus der Dehnungsebene bestimmt; die Druckkraft und ihr Moment ergeben sich durch numerische Integration über die Druckzone (Plattenbalken mit Gurtbreite). " +
      "Das ω-Verfahren ist die dimensionslose (tabellarische) Form dieser Bemessung mit dem Parabel-Rechteck-Diagramm: aus μ<sub>Eds</sub> folgt ω<sub>1</sub>; mit Druckbewehrung werden ω<sub>1</sub> und ω<sub>2</sub> über Δω bestimmt. Hier werden die Tafelwerte numerisch berechnet (σ<sub>sd</sub> = f<sub>yd</sub>, ohne Verfestigung). " +
      "Der Spannungsblock ist die vereinfachte Ersatzform; alle Verfahren sind zulässig und liefern ähnliche Bewehrungsmengen. In Bereich 2 ist die Betonstauchung kleiner als ε<sub>cu2</sub> (ε<sub>c</sub> = 25 ‰·x/(d − x)).",
    normen: [`${EC2}, 3.1.7(1), Bild 3.3, Gl. (3.17), (3.18)`, `${EC2}, 3.1.7(3), Bild 3.5 (Spannungsblock)`, `${EC2}, Tab. 3.1 (ε<sub>c2</sub>, ε<sub>cu2</sub>, n)`],
  },
  sbSpannung: {
    titel: "Spannungsverlauf im Querschnitt",
    formeln: [
      "Parabel-Rechteck: σ<sub>c</sub>(z) = f<sub>cd</sub>·[ 1 − (1 − ε<sub>c</sub>(z)/ε<sub>c2</sub>)<sup>n</sup> ] mit ε<sub>c</sub> aus der Dehnungsebene",
      "Spannungsblock: σ<sub>c</sub> = −η·f<sub>cd</sub> &nbsp;konstant über die Höhe λ·x",
      "Zugbewehrung: σ<sub>s1</sub> = min( ε<sub>s1</sub>·E<sub>s</sub> ; f<sub>yd</sub> )",
      "Druckbewehrung: σ<sub>s2</sub> = min( |ε<sub>s2</sub>|·E<sub>s</sub> ; f<sub>yd</sub> )",
    ],
    text: "Gezeichnet ist die Betonspannung der gewählten Arbeitslinie (gestrichelt die jeweils andere zum Vergleich). Beton und Stahl sind in getrennten Maßstäben gezeichnet. " +
      "Der Beton nimmt keine Zugspannungen auf.",
    normen: [`${EC2}, 3.1.7, Bild 3.3 und 3.5`, `${EC2}, 3.2.7 (Spannungs-Dehnungs-Linie des Betonstahls)`],
  },

  /* ---------------- Querkraft, Vergleichsspannung, plastische Nachweise ---------------- */

  tau: {
    titel: "Schubspannung τ aus Querkraft (Jourawski)",
    formeln: [
      "τ<sub>z</sub> = V<sub>z</sub>·S<sub>y</sub>(z) / ( I<sub>y</sub>·b(z) ) &nbsp;(waagerechter Schnitt)",
      "τ<sub>y</sub> = V<sub>y</sub>·S<sub>z</sub>(y) / ( I<sub>z</sub>·b(y) ) &nbsp;(senkrechter Schnitt)",
      "τ = √( τ<sub>z</sub>² + τ<sub>y</sub>² )",
    ],
    text: "S = statisches Moment der abgeschnittenen Fläche um die Schwerachse, b = Materialbreite im Schnitt. " +
      "Das Verfahren liefert die mittlere Schubspannung über den Schnitt und ist für dünnwandige Querschnitte und Vollquerschnitte gut geeignet. " +
      "Torsion und Schubmittelpunkt sind nicht enthalten; bei unsymmetrischen Querschnitten (I<sub>yz</sub> ≠ 0) ist es nur eine Näherung. " +
      "S(z) und b(z) werden numerisch aus der Querschnittsgeometrie bestimmt.",
    normen: [`${EC3}, 6.2.6(4), Gl. (6.20)`],
  },
  vergleich: {
    titel: "Vergleichsspannung σ<sub>v</sub>",
    formeln: [
      "σ<sub>v</sub> = √( σ<sub>x</sub>² + 3·τ² ) &nbsp;(σ<sub>z</sub> = 0)",
      "Nachweis: σ<sub>v</sub> ≤ f<sub>y</sub> / γ<sub>M0</sub>",
      "allgemein: (σ<sub>x</sub>/f<sub>yd</sub>)² + (σ<sub>z</sub>/f<sub>yd</sub>)² − (σ<sub>x</sub>/f<sub>yd</sub>)(σ<sub>z</sub>/f<sub>yd</sub>) + 3(τ/f<sub>yd</sub>)² ≤ 1",
    ],
    text: "Fließkriterium nach von Mises für den elastischen Nachweis (E-E). σ<sub>x</sub> aus N, M<sub>y</sub>, M<sub>z</sub>, τ aus V<sub>y</sub>, V<sub>z</sub>. " +
      "Der Größtwert wird über Rand- und Innenpunkte gesucht (häufig am Übergang Steg/Flansch).",
    normen: [`${EC3}, 6.2.1(5), Gl. (6.1)`],
  },
  berechnungsart: {
    titel: "Berechnungsart E-E / E-P",
    formeln: [
      "E-E: σ = N/A + M<sub>y</sub>/I<sub>y</sub>·z + M<sub>z</sub>/I<sub>z</sub>·y &nbsp;(linear), Nachweis σ<sub>v</sub> ≤ f<sub>yd</sub>",
      "E-P: σ = E·ε, begrenzt auf ±f<sub>yd</sub> &nbsp;(Dehnungsebene, Gleichgewicht mit N, M<sub>y</sub>, M<sub>z</sub>)",
    ],
    text: "E-E (elastisch-elastisch): linearer Spannungsverlauf, die Randspannung darf f<sub>yd</sub> nicht überschreiten. " +
      "E-P (elastisch-plastisch): der Querschnitt darf teilweise bis voll durchplastizieren; dargestellt wird der nichtlineare Spannungszustand " +
      "(Fließzonen bei σ = ±f<sub>yd</sub>). E-P ist nur für Querschnitte der Klasse 1 und 2 möglich; bei Klasse 3 und 4 ist der Schalter gesperrt. " +
      "Der dargestellte E-P-Spannungszustand gilt für N, M<sub>y</sub>, M<sub>z</sub>; der Einfluss der Querkraft steckt im Nachweis (M<sub>V,Rd</sub>). " +
      "Die Schubspannung τ wird weiterhin elastisch nach Jourawski berechnet.",
    normen: [`${EC3}, 5.4.3 (Plastisches Verfahren)`, `${EC3}, 5.5 (Klassifizierung)`, `${EC3}, 6.2.1 bis 6.2.10`],
  },
  erddruck: {
    titel: "Erddruck (Lastermittlung)",
    formeln: [
      "σ′<sub>v</sub>(z) = p + Σ γ<sub>i</sub>·Δz<sub>i</sub> (unter Grundwasser γ′)",
      "aktiv: e<sub>ah</sub> = K<sub>agh</sub>·σ′<sub>v</sub> − 2·c′·√K<sub>agh</sub> ≥ 0",
      "Ruhe: e<sub>0h</sub> = K<sub>0h</sub>·σ′<sub>v</sub>, K<sub>0h</sub> = (1 − sinφ′)·(1 + sinβ)",
      "passiv: e<sub>ph</sub> = K<sub>pgh</sub>·σ′<sub>v</sub> + 2·c′·√K<sub>pgh</sub>",
      "erhöht aktiv: e = 0,5·(e<sub>ah</sub> + e<sub>0h</sub>)",
      "K<sub>agh</sub> = cos²(φ′−α) / {cos²α·[1 + √(sin(φ′+δ)·sin(φ′−β)/(cos(α+δ)·cos(α−β)))]²}",
      "K<sub>pgh</sub> = cos²(φ′+α) / {cos²α·[1 − √(sin(φ′+δ)·sin(φ′+β)/(cos(α−δ)·cos(α−β)))]²}",
      "E<sub>h</sub> = ∫ e<sub>h</sub> dz, E<sub>v</sub> = Σ E<sub>h,i</sub>·tan(α+δ<sub>i</sub>) (aktiv), W = ½·γ<sub>w</sub>·h<sub>w</sub>²",
      "Mindesterddruck: e<sub>ah</sub> ≥ K<sub>agh</sub>(φ′<sub>min</sub>, c′=0)·σ′<sub>v</sub>",
      "Ingold: σ<sub>hc</sub> = √(2·P′·γ/π), z<sub>c</sub> = σ<sub>hc</sub>/(K<sub>a</sub>·γ), z<sub>e</sub> = σ<sub>hc</sub>/(K<sub>p</sub>·γ)",
      "Linienlast Q: E<sub>h</sub> = Q·k<sub>q</sub>, Rechteck zwischen z = a·tanφ′ und z = a·tanϑ<sub>a</sub>",
    ],
    text: "Coulomb/Müller-Breslau mit ebener Gleitfläche, horizontale Komponente der Beiwerte (Wandneigung α: + = Wandkopf vom Boden weg; Tiefen lotrecht); die Beiwerte lassen sich je Schicht überschreiben. Kohäsion über 2·c′·√K; bei aktivem Druck nie negativ. Der Faktor skaliert nur den Bodendruck. Die Auflast p wirkt gleichmäßig auf dem Gelände. Zusätze (nur aktiv/erhöht): Verdichtungserddruck nach Ingold (Rankine-Beiwerte der Schicht 1), Linien-/Streifenlasten im Gleitflächenverfahren mit φ′, δ der Schicht 1 – vereinfacht, nicht identisch mit den Verteilungen der DIN 4085; Streifenlast als Integral von Linienlasten. Reicht die Lastausbreitung unter den Wandfuß, wird nur der Anteil bis H angesetzt. Nicht erfasst: Erdbeben, aktive gekrümmte Gleitflächen. Alle Werte charakteristisch. Alle Formeln vor Verwendung an DIN 4085 und EAB prüfen – sie stammen aus der Literatur, nicht aus dem Normtext.",
    normen: ["DIN 4085 (Baugrund – Berechnung des Erddrucks)", "DIN EN 1997-1 mit NA, Anhang C", "EAB (Empfehlungen des Arbeitskreises Baugruben)"],
  },
  erdDelta: {
    titel: "Wandreibungswinkel δ",
    text: "Statt δ je Schicht einzutragen, kann δ als Anteil von φ′ gewählt werden (0, ⅓, ½, ⅔·φ′ entsprechen den Spalten der Erddruckbeiwert-Tabellen; φ′ für verzahnte Wandflächen). Welcher Anteil zur Wandbeschaffenheit (glatt, rau, verzahnt; aktiv/passiv) gehört, regelt DIN 4085 Anhang A – der Normtext lag hier nicht vor, daher die Zuordnung bitte dort prüfen. Bei gewähltem Anteil sind die δ-Felder der Schichten gesperrt.",
  },
  windQp: {
    titel: "Böengeschwindigkeitsdruck q_p(z)",
    formeln: [
      "q<sub>p</sub>(z) = f·q<sub>b</sub>·(z/10)<sup>n</sup>·NN<sub>mod</sub> (Mischprofile und Geländekategorien nach NA, Anhang NA.B)",
      "Binnenland: z ≤ 7 m: 1,5·q<sub>b</sub>; 7–50 m: 1,7·q<sub>b</sub>·(z/10)<sup>0,37</sup>; 50–300 m: 2,1·q<sub>b</sub>·(z/10)<sup>0,24</sup>",
      "Küste/Ostsee-Inseln: ≤ 4 m: 1,8·q<sub>b</sub>; 4–50 m: 2,3·q<sub>b</sub>·(z/10)<sup>0,27</sup>; 50–300 m: 2,6·q<sub>b</sub>·(z/10)<sup>0,19</sup>",
      "q<sub>b</sub> (Windzone 1…4) = 0,32 / 0,39 / 0,47 / 0,56 kN/m² (v<sub>b,0</sub> = 22,5 / 25 / 27,5 / 30 m/s)",
      "NN<sub>mod</sub> = 1 (≤ 800 m ü. NN); 0,2 + H/1000 (800–1100 m)",
    ],
    text: "Das genaue Verfahren verwendet die Profilformeln; das vereinfachte Verfahren (Tabelle NA.B.3, h ≤ 25 m) einen konstanten Wert für das ganze Gebäude (Binnenland z. B. Zone 2, h ≤ 10 m: 0,65 kN/m²). Die Zahlen stammen aus der Literatur (u. a. Dlubal-Wissensdatenbank zum NA) und wurden nicht am Normtext selbst geprüft – für Nachweise bitte mit DIN EN 1991-1-4/NA abgleichen. Ausgegeben werden charakteristische Werte (ohne γ<sub>Q</sub>).",
  },
  windWand: {
    titel: "Windlast auf lotrechte Wände",
    formeln: [
      "w<sub>e</sub> = q<sub>p</sub>(z<sub>e</sub>)·c<sub>pe</sub>; netto: w = q<sub>p</sub>·(c<sub>pe</sub> − c<sub>pi</sub>)",
      "e = min(b; 2h); Zonen A = e/5, B = 4e/5 (bzw. d − e/5), C = d − e (Bild 7.5)",
      "Staffelung Luvwand D (Bild 7.4): h ≤ b: z<sub>e</sub> = h; b < h ≤ 2b: unten z<sub>e</sub> = b, oben z<sub>e</sub> = h; h > 2b: zusätzlich Mittelstreifen (hier mit Streifenoberkante h − b angesetzt)",
      "c<sub>pe</sub> für h/d = 5, 1, 0,25 aus Tabelle 7.1/NA.1, dazwischen linear; c<sub>pe,10</sub> für Lasteinzugsflächen ≥ 10 m², c<sub>pe,1</sub> für ≤ 1 m²",
    ],
    text: "Sogzonen (A, B, C, E) mit q<sub>p</sub>(h). Innendruckbeiwerte ohne dominante Öffnung: c<sub>pi</sub> = +0,2 oder −0,3 (der jeweils ungünstigere wird für „netto“ gewählt). Die Beiwerte stammen aus Sekundärquellen; Zone E bei h/d ≥ 5 (−0,7) und die Zuordnung der Zwischenwerte bitte gegen die Norm prüfen.",
  },
  windDach: {
    titel: "Windlast auf Flachdächer",
    formeln: [
      "Zonen F, G, H, I für Wind quer zu b; e = min(b; 2h): F = e/4 × e/10 (zwei Ecken), G = Randstreifen e/10, H bis e/2, I Rest (Bild 7.6)",
      "c<sub>pe,10</sub> / c<sub>pe,1</sub> scharfkantig: F −1,8/−2,5; G −1,2/−2,0; H −0,7/−1,2; I ±0,2",
      "mit Attika h<sub>p</sub>/h = 0,025 / 0,05 / 0,10: F −1,6/−1,4/−1,2 (c<sub>pe,10</sub>); G −1,1/−0,9/−0,8; dazwischen linear; z<sub>e</sub> = h + h<sub>p</sub>",
    ],
    text: "Nur Flachdächer (−5° bis +5°); abgerundete oder abgeschrägte Traufen, Pult-, Sattel- und Walmdächer sind nicht enthalten. Werte aus Sekundärquellen – vor Verwendung gegen DIN EN 1991-1-4/NA prüfen.",
  },
  erdVogt: {
    titel: "Mobilisierter Erdwiderstand nach Vogt (RE-ING)",
    formeln: [
      "K<sub>ph,mob</sub>(z) = K<sub>0</sub> + (K<sub>ph</sub> − K<sub>0</sub>)·(v(z)/z) / (α + v(z)/z)",
      "starre Wand, Fußpunktdrehung: v(z) = s<sub>h</sub>·(1 − z/h); e<sub>ph,mob</sub>(z) = K<sub>ph,mob</sub>(z)·γ·z",
      "α = 0,02 für Hinterfüllung nach RiZ Was 7; im Grenzzustand der Gebrauchstauglichkeit s<sub>h</sub> ≤ 1 % von h",
    ],
    text: "K<sub>ph</sub> mit δ = −⅔·φ′ (bei φ′ ≥ 30° gekrümmte Gleitfläche, DIN 4085 oder Caquot-Kérisel). Die Pregl-Werte liegen etwas unter den Caquot-Kérisel-Werten (z. B. φ′ = 35°, δ = −⅔φ′: 7,3 gegenüber etwa 8); bei Bedarf K<sub>p</sub> je Schicht manuell vorgeben. Der Ansatz gilt für den Anteil aus Bodeneigengewicht; er wird hier auch auf Auflast und Kohäsion angewendet.",
    normen: ["RE-ING Teil 2 Brücken, Abschnitt 5, 2.3, Gl. (1), (2); Vogt"],
  },
  erdWand: {
    titel: "Art der Wandbewegung / Erddruckumlagerung",
    formeln: [
      "aktiv (Tab. C.1): a) Drehung um den Fuß: Dreieck; b) Parallelverschiebung: Dreieck bis 0,5·h, darunter konstant, e<sup>b</sup> = 0,67·e<sup>a</sup>; c) Drehung um den Kopf und d) Durchbiegung: konstant, e = 0,5·e<sup>a</sup>; stets E<sup>b,c,d</sup> = E<sup>a</sup>",
      "erforderliche Wandbewegung s<sub>a</sub>/h (locker / dicht): a) 0,004–0,005 / 0,001–0,002; b) 0,002–0,003 / 0,0005–0,001; c) 0,008–0,01 / 0,002–0,005; d) 0,004–0,005 / 0,001–0,002",
      "passiv (Tab. D.1, Bezug b) Parallelverschiebung, Dreieck, Resultierende 0,33·h): a) ½·E<sup>b</sup> ≤ E<sup>a</sup> ≤ ⅔·E<sup>b</sup>, Resultierende 0,5·h, δ<sub>p,mittel</sub> = ¾·δ<sub>p,min</sub>; c) E<sup>c</sup> ≈ ⅔·E<sup>b</sup>, Resultierende 0,2·h; s<sub>p</sub>/h = −0,08·D + 0,12 (a, b) bzw. −0,05·D + 0,09 (c), D &gt; 0,3",
    ],
    text: "Die Umlagerung betrifft den Erddruck aus Bodeneigengewicht; die Resultierende bleibt (aktiv) unverändert, nur ihre Verteilung ändert sich. Gleichmäßige Auflast p wird nicht umgelagert, Linien-/Streifenlasten folgen Tab. C.2. Werte der Tabellen C.1 und D.1 wurden aus einem Normauszug abgelesen; passiv sind Kraft und Angriffshöhe der Tabelle D.1 umgesetzt; a) ist ein symmetrisches Dreieck (null an Kopf und Fuß, Spitze bei 0,5·h), c) eine konkave Kurve (hier e ∝ z³ mit Resultierender bei 0,2·h, Kurvenform angenähert).",
    normen: ["DIN 4085:2017, Tab. C.1, Tab. D.1, Gl. (44), (45)"],
  },
  erdPassiv: {
    titel: "Passiver Erddruck",
    formeln: [
      "gekrümmte Gleitflächen (Pregl/Sokolowski, DIN 4085:2017 Gl. 41–43): K<sub>pgh</sub> = cos(δ<sub>p</sub>+α)·K<sub>pg,0</sub>·i<sub>pg</sub>·g<sub>pg</sub>·t<sub>pg</sub> (analog K<sub>pph</sub> für Auflast, K<sub>pch</sub> für Kohäsion)",
      "e<sub>ph</sub> = (σ′<sub>v</sub> − p)·K<sub>pgh</sub> + p·K<sub>pph</sub> + c′·K<sub>pch</sub>",
      "z. B. i<sub>pg</sub> = (1 − 0,53·δ<sub>p</sub>)<sup>0,26+5,96·φ′</sup> (δ<sub>p</sub> ≤ 0), g<sub>pg</sub> = (1 + 0,35·β)<sup>0,42+8,15·φ′</sup> (β > 0), t<sub>pp</sub> = e<sup>−2α·tanφ′</sup>/cosα; Winkel im Bogenmaß",
      "δ<sub>p</sub> = −δ (Wandreibung beim Erdwiderstand negativ); Grundwerte (α = β = δ<sub>p</sub> = 0): K<sub>pg,0</sub> = K<sub>pp,0</sub> = tan²(45°+φ′/2), K<sub>pc,0</sub> = 2·tan(45°+φ′/2)",
      "eben (Coulomb/Müller-Breslau): K<sub>pgh</sub> = cos²(φ′+α)/(cos²α·[1 − √(sin(φ′+δ)·sin(φ′+β)/(cos(α−δ)·cos(α−β)))]²)",
    ],
    text: "Die ebene Gleitfläche überschätzt K<sub>p</sub> bei großem δ; der Ansatz nach Pregl/Sokolowski (DIN 4085:2017, Tabelle 3) gilt auch für geneigte Wände und Gelände. Die Grundwerte K<sub>p,0</sub> (Gl. 35–37) lagen nicht vor und sind aus dem Sonderfall der glatten, lotrechten Wand abgeleitet; die Tabellenfaktoren wurden von der Normseite übernommen. Die Mobilisierung ist ein einfacher Parabelansatz mit Bruchverschiebung s<sub>B</sub> als Anteil der Wandhöhe – NICHT die Originalfunktion nach Vogt (nicht verfügbar); Funktion und s<sub>B</sub> bitte mit DIN 4085/EAB abgleichen.",
  },
  erdSchicht: {
    titel: "Bodenschichten",
    formeln: ["γ feucht/über Grundwasser, γ′ = γ − γ<sub>w</sub> unter Grundwasser (leer: γ − 10)"],
    text: "Je Schicht: Dicke d, Wichte γ, Wichte unter Auftrieb γ′, Reibungswinkel φ′, Kohäsion c′, Wandreibungswinkel δ (0 ≤ δ ≤ φ′; üblich aktiv 2/3·φ′, Ruhedruck und passiv oft 0). Wandreibung wird beim Ruhedruck und beim erhöhten aktiven Druck nicht angesetzt. Hinweis: Ein hoher Wandreibungswinkel bei passivem Erddruck ergibt mit ebener Gleitfläche zu große Beiwerte.",
    normen: ["DIN 4085", "DIN 1055-2 (Bodenkennwerte, Anhaltswerte)"],
  },
  swFeder: {
    titel: "Federlager und Bettung",
    formeln: ["Knotenfeder: F = −c·u (c in kN/m, Richtungen X und Z)", "Bettung: q = −k·u (k in kN/m je m Stablänge, d. h. kN/m²)", "Systemlänge l<sub>e</sub> = (4·E·I/k)<sup>¼</sup>"],
    text: "Federn an Knoten sind elastische Lager in globaler X- und Z-Richtung (kN/m). Die Bettung wirkt über die ganze Stablänge; „lokal“ bezieht k auf die Stabachsen (x′ längs, z′ quer), „global“ auf X und Z. Der Rechenkern teilt bettete Stäbe in kurze Abschnitte (Länge ≲ l<sub>e</sub>/4) und setzt Einzelfedern mit Einflusslänge an die Teilknoten (Winkler-Bettung, zugfest und druckfest – keine Abhebung). Federn und Bettung gelten als linear-elastisch; die Auflagerkräfte der Federn stehen in der Auflagertabelle, die Bettungskräfte als größte Werte je Stab unter den Extremwerten. Ein Bettungsmodul in kN/m³ wird mit der Stabbreite zu k in kN/m² (z. B. k<sub>s</sub> = 20 000 kN/m³ bei 0,5 m Breite → 10 000 kN/m²).",
    normen: ["Winkler-Bettungsmodell (kein Normverfahren)"],
  },
  swQuerschnitt: {
    titel: "Querschnitte und Material (Statik)",
    formeln: ["EA und EI aus A, I und E: EA = E·A, EI = E·I<sub>y</sub>"],
    text: "Jeder Stab verweist auf einen Querschnitt (Q1, Q2 …) mit Material oder wird „manuell“ mit A, I und dem globalen E-Modul definiert. A und I<sub>y</sub> (starke Achse) werden aus der Geometrie berechnet. E-Moduln: Baustahl 210 000, nichtrostender Stahl 200 000, Aluminium 70 000 N/mm²; Beton E<sub>cm</sub> nach EN 1992-1-1 Tab. 3.1 (C20/25: 30 000 bis C50/60: 37 000); Brettschichtholz E<sub>0,mean</sub> (GL24h 11 500, GL28h 12 600). Voute: Wird am Stabende ein anderer Querschnitt gewählt, werden die Maße linear zwischen Anfang und Ende interpoliert (gleicher Typ und gleiche Auswahlfelder bzw. gewalzte I-/H-Profile untereinander; gleicher E-Modul). Der Rechenkern zerlegt den Stab dazu in 24 Abschnitte mit je konstantem Querschnitt (harmonisches Mittel von A und I); die Ergebnisse werden wieder zu einem Stab zusammengefasst, Schubverformung bleibt unberücksichtigt. Kein Kriechen, keine Rissbildung (Stahlbeton: ungerissener Querschnitt mit E<sub>cm</sub>), keine Schubverformung; bei Verbund/Stahlbeton ist der Querschnitt Betonquerschnitt ohne Bewehrung.",
    normen: ["DIN EN 1992-1-1, Tab. 3.1", "DIN EN 1993-1-1, 3.2.6", "DIN EN 1995-1-1 / EN 14080"],
  },
  swEinwirkung: {
    titel: "Einwirkungen und Kombinationsbeiwerte",
    formeln: ["G ständig, Q veränderlich (Nutzlast, Schnee, Wind, Temperatur), A außergewöhnlich", "ψ₀ seltener Wert, ψ₁ häufiger Wert, ψ₂ quasi-ständiger Wert"],
    text: "Jede Last wird einer Einwirkung zugeordnet. Die Kategorie belegt ψ₀, ψ₁, ψ₂ nach DIN EN 1990/NA vor (z. B. Büro 0,7/0,5/0,3, Schnee bis NN+1000 m 0,5/0,2/0, Wind 0,6/0,2/0); die Werte sind änderbar. Mehrere Lasten gleicher Herkunft gehören zu derselben Einwirkung (sie wirken gemeinsam). Tabellenwerte vor Verwendung an der Norm prüfen.",
    normen: ["DIN EN 1990/NA, Tab. NA.A.1.1 (ψ-Werte)"],
  },
  swEigengewicht: {
    titel: "Eigengewicht der Stäbe",
    formeln: ["g = A·γ  [kN/m] je m Stablänge, Richtung global Z (nach unten)"],
    text: "Das Eigengewicht wird aus der Querschnittsfläche und der Wichte des Materials berechnet (Stahl 78,5, Beton 25, Brettschichtholz 4,2–4,5 kN/m³, Aluminium 27 kN/m³; bei „eigenes Material“ frei wählbar, bei Stäben mit „manuell“ über die Wichte unter den Stäben). Es wird als Streckenlast über die ganze Stablänge der ersten ständigen Einwirkung (Art G) zugeordnet und grau dargestellt. Gevoutete Stäbe: das Eigengewicht verläuft linear von A_Anfang·γ bis A_Ende·γ (veränderliche Streckenlast). Bettung und Lagerreaktionen bleiben unberührt. Tabellenwerte der Wichte nach EN 1991-1-1, Anhang A – bei Bedarf anpassen.",
    normen: ["DIN EN 1991-1-1 mit NA, Anhang A (Wichten)"],
  },
  swTsb: {
    titel: "Teilsicherheitsbeiwerte und Kombinationen",
    formeln: [
      "GZT (6.10): Σ γ<sub>G,j</sub>·G<sub>k,j</sub> + γ<sub>Q</sub>·Q<sub>k,1</sub> + Σ γ<sub>Q</sub>·ψ<sub>0,i</sub>·Q<sub>k,i</sub>",
      "GZT außergewöhnlich (6.11b): Σ G<sub>k,j</sub> + A<sub>d</sub> + ψ<sub>1,1</sub>·Q<sub>k,1</sub> + Σ ψ<sub>2,i</sub>·Q<sub>k,i</sub>",
      "GZG charakteristisch (6.14b): Σ G<sub>k,j</sub> + Q<sub>k,1</sub> + Σ ψ<sub>0,i</sub>·Q<sub>k,i</sub>",
      "GZG häufig (6.15b): Σ G<sub>k,j</sub> + ψ<sub>1,1</sub>·Q<sub>k,1</sub> + Σ ψ<sub>2,i</sub>·Q<sub>k,i</sub>",
      "GZG quasi-ständig (6.16b): Σ G<sub>k,j</sub> + Σ ψ<sub>2,i</sub>·Q<sub>k,i</sub>",
    ],
    text: "Vorbelegung STR/GEO: γ<sub>G,sup</sub> = 1,35, γ<sub>G,inf</sub> = 1,00, γ<sub>Q</sub> = 1,50 (günstig: 0); EQU: 1,10/0,90/1,50. Es werden alle Möglichkeiten gebildet (jede veränderliche Einwirkung als Leiteinwirkung, jede ständige ungünstig oder günstig, veränderliche vorhanden oder nicht) und daraus die Umhüllende. Bei mehr als drei ständigen Einwirkungen wirken sie gemeinsam ungünstig bzw. günstig. Nicht erfasst: Erdbeben, 6.10a/b, Ermüdung. Ergebnisse der Umhüllenden sind nicht gleichzeitig wirkende Extremwerte; einzelne Kombinationen sind wählbar.",
    normen: ["DIN EN 1990 mit NA, Abschnitte 6.4.3 und Anhang A", "DIN EN 1990/NA, Tab. NA.A.1.2(A) und (B)"],
  },
  schweissnaht: {
    titel: "Schweißnahtnachweis (Kehlnaht, Stumpfnaht)",
    formeln: [
      "σ<sub>⊥</sub> = τ<sub>⊥</sub> = (|F<sub>n</sub>| + |F<sub>q</sub>|)/(√2·Σ a·l), τ<sub>∥</sub> = F<sub>l</sub>/Σ a·l",
      "√(σ<sub>⊥</sub>² + 3(τ<sub>⊥</sub>² + τ<sub>∥</sub>²)) ≤ f<sub>u</sub>/(β<sub>w</sub>·γ<sub>M2</sub>) und σ<sub>⊥</sub> ≤ 0,9·f<sub>u</sub>/γ<sub>M2</sub>",
      "vereinfacht: F<sub>w,Ed</sub> = √(F<sub>l</sub>² + F<sub>⊥</sub>²)/(n·l<sub>eff</sub>) ≤ F<sub>w,Rd</sub> = f<sub>u</sub>/(√3·β<sub>w</sub>·γ<sub>M2</sub>)·a",
      "Stumpfnaht: √(σ² + 3τ²) ≤ f<sub>y</sub>/γ<sub>M0</sub>",
    ],
    text: "Doppelkehlnaht im T-Stoß mit 45°-Kehlschnitt. Die Kräfte F<sub>n</sub> (senkrecht zur Anschlussfläche) und F<sub>q</sub> (quer zur Naht in der Anschlussfläche) werden für die ungünstigere Naht betragsmäßig addiert (konservativ); F<sub>l</sub> wirkt in Nahtrichtung. Nicht erfasst: Nahtgruppen mit Biegung/Torsion (Schweißnahtgruppe aus Querschnitt), Abminderung β<sub>Lw</sub> bei langen Überlappstößen, Ermüdung, Schweißen mit Fremdwerkstoffen. β<sub>w</sub> und f<sub>u</sub> nach EN 1993-1-8, Tab. 4.1; γ<sub>M2</sub> = 1,25. Tabellenwerte und Formeln vor Verwendung an der Norm prüfen.",
    normen: ["DIN EN 1993-1-8 mit NA, Abschnitt 4 (Schweißverbindungen)"],
  },
  torsion: {
    titel: "Torsion (St. Venant)",
    formeln: [
      "τ<sub>t,Ed</sub> = T<sub>Ed</sub> / W<sub>t</sub> ≤ τ<sub>Rd</sub> = f<sub>y</sub> / (√3·γ<sub>M0</sub>)",
      "offen: I<sub>t</sub> = Σ b·t³/3; geschlossen (Bredt): I<sub>t</sub> = 4·A<sub>m</sub>²·t/U, W<sub>t</sub> = 2·A<sub>m</sub>·t",
      "I/H: V<sub>pl,T,Rd</sub> = √(1 − τ<sub>t,Ed</sub> / (1,25·τ<sub>Rd</sub>)) · V<sub>pl,Rd</sub>  (6.26)",
      "U: V<sub>pl,T,Rd</sub> = [ √(1 − τ<sub>t,Ed</sub> / (1,25·τ<sub>Rd</sub>)) − τ<sub>w,Ed</sub>/τ<sub>Rd</sub> ] · V<sub>pl,Rd</sub>  (6.27)",
      "Hohlquerschnitt: V<sub>pl,T,Rd</sub> = [ 1 − τ<sub>t,Ed</sub> / τ<sub>Rd</sub> ] · V<sub>pl,Rd</sub>  (6.28)",
    ],
    text: "Berücksichtigt ist die primäre (St.-Venant-)Torsion. Bei offenen Profilen (I, U, T) wird sie meist durch Wölbkrafttorsion begleitet; diese (Bimoment, Wölbnormalspannungen) ist nicht erfasst, sodass offene Profile mit Torsion nur mit Zusatznachweis zu beurteilen sind. " +
      "Das Torsionsmoment reduziert die Querkrafttragfähigkeit; mit dem abgeminderten V<sub>pl,T,Rd</sub> werden auch Biegung und Querkraft (ρ) nachgewiesen. Walzprofile: I<sub>t</sub> ohne Ausrundungen (tatsächlich etwas größer). Die Spannungsdiagramme enthalten keine Torsionsschubspannungen.",
    normen: ["EN 1993-1-1, 6.2.7 (Torsion), Gl. (6.23) bis (6.28)", "Bredt'sche Formeln, z. B. Petersen, Statik und Stabilität der Baukonstruktionen"],
  },
  epNachweis: {
    titel: "Plastischer Nachweis (Verfahren E-P)",
    formeln: [
      "V<sub>Ed</sub> / V<sub>pl,Rd</sub> ≤ 1,0",
      "M<sub>y,Ed</sub> / M<sub>N,V,y,Rd</sub> ≤ 1,0 &nbsp;bzw. zweiachsig: [M<sub>y,Ed</sub>/M<sub>N,V,y,Rd</sub>]<sup>α</sup> + [M<sub>z,Ed</sub>/M<sub>N,V,z,Rd</sub>]<sup>β</sup> ≤ 1,0",
    ],
    text: "E-P: Schnittgrößen elastisch ermittelt, Querschnitt plastisch ausgenutzt. Zulässig nur für Querschnitte der Klasse 1 und 2. " +
      "Die Ausnutzung ist der größte Wert aus Querkraft, Normalkraft und der Interaktion von Biegung, Normalkraft und Querkraft. " +
      "Bei Klasse 3 ist der elastische Nachweis (Vergleichsspannung) zu führen.",
    normen: [`${EC3}, 6.2.8 (Biegung und Querkraft)`, `${EC3}, 6.2.9 (Biegung und Normalkraft)`, `${EC3}, 6.2.10 (Biegung, Querkraft und Normalkraft)`],
  },
  rho: {
    titel: "Abminderungsfaktor ρ (Querkraft)",
    formeln: [
      "V<sub>Ed</sub> ≤ 0,5·V<sub>pl,Rd</sub>: ρ = 0 (keine Abminderung)",
      "V<sub>Ed</sub> > 0,5·V<sub>pl,Rd</sub>: ρ = ( 2·V<sub>Ed</sub> / V<sub>pl,Rd</sub> − 1 )²",
    ],
    text: "Im Schubbereich (Steg bzw. A<sub>v</sub>) wird die Streckgrenze auf (1 − ρ)·f<sub>y</sub> abgemindert.",
    normen: [`${EC3}, 6.2.8(3)`],
  },
  MV: {
    titel: "Momententragfähigkeit bei Querkraft M<sub>V,Rd</sub>",
    formeln: [
      "M<sub>V,Rd</sub> = ( W<sub>pl</sub> − ρ·W<sub>v</sub> ) · f<sub>y</sub> / γ<sub>M0</sub> &nbsp;≤ M<sub>pl,Rd</sub>",
      "W<sub>v</sub> = A<sub>v</sub>·h<sub>v</sub> / 4 &nbsp;(plastisches Widerstandsmoment des Schubbereichs, ≤ W<sub>pl</sub>)",
      "I-Profil (um y): W<sub>v</sub> = t<sub>w</sub>·h<sub>w</sub>² / 4 &nbsp;⇒&nbsp; M<sub>y,V,Rd</sub> = [ W<sub>pl,y</sub> − ρ·A<sub>w</sub>²/(4·t<sub>w</sub>) ]·f<sub>y</sub>/γ<sub>M0</sub>",
    ],
    text: "h<sub>v</sub> = Hebelarm des Schubbereichs: h − 2t<sub>f</sub> (Steg) bzw. b (Flansche); bei Vollquerschnitten, Rohren und Polygonen wird der gesamte Querschnitt als Schubbereich angesetzt (W<sub>v</sub> = W<sub>pl</sub>, auf der sicheren Seite).",
    normen: [`${EC3}, 6.2.8(3), Gl. (6.30)`],
  },
  MN: {
    titel: "Momententragfähigkeit bei Normalkraft M<sub>N,Rd</sub>",
    formeln: [
      "n = N<sub>Ed</sub> / N<sub>pl,Rd</sub>",
      "I/H um y: M<sub>N,y,Rd</sub> = M<sub>pl,y,Rd</sub>·(1 − n)/(1 − 0,5·a) ≤ M<sub>pl,y,Rd</sub>, &nbsp;a = (A − 2·b·t<sub>f</sub>)/A ≤ 0,5",
      "I/H um z: n ≤ a: M<sub>N,z,Rd</sub> = M<sub>pl,z,Rd</sub>; &nbsp;n > a: M<sub>pl,z,Rd</sub>·[ 1 − ((n − a)/(1 − a))² ]",
      "Hohlprofil: M<sub>N,Rd</sub> = M<sub>pl,Rd</sub>·(1 − n)/(1 − 0,5·a<sub>w</sub> bzw. a<sub>f</sub>) ≤ M<sub>pl,Rd</sub>, &nbsp;a<sub>w</sub> = (A − 2bt)/A, a<sub>f</sub> = (A − 2ht)/A ≤ 0,5",
      "alle anderen Querschnitte: numerisch aus dem Gleichgewicht der Spannungsblöcke ±f<sub>yd</sub> mit N",
    ],
    text: "Bei gleichzeitiger Querkraft über 0,5·V<sub>pl,Rd</sub>: M<sub>N,V,Rd</sub> = M<sub>N,Rd</sub>·M<sub>V,Rd</sub>/M<sub>pl,Rd</sub> (abgeminderte Streckgrenze im Schubbereich).",
    normen: [`${EC3}, 6.2.9.1, Gl. (6.36), (6.37)`, `${EC3}, 6.2.10 (Kombination mit Querkraft)`],
  },
  interaktion: {
    titel: "Interaktion Biegung, Normalkraft und Querkraft",
    formeln: [
      "[ M<sub>y,Ed</sub> / M<sub>N,V,y,Rd</sub> ]<sup>α</sup> + [ M<sub>z,Ed</sub> / M<sub>N,V,z,Rd</sub> ]<sup>β</sup> ≤ 1,0",
      "I/H: α = 2, β = 5n ≥ 1",
      "Rechteckhohlprofil: α = β = 1,66 / (1 − 1,13·n²) ≤ 6",
      "Rohr: α = β = 2",
      "sonstige Querschnitte: α = β = 1 (linear, auf der sicheren Seite)",
    ],
    text: "Für einachsige Biegung (M<sub>z</sub> = 0) vereinfacht sich der Nachweis zu M<sub>y,Ed</sub> ≤ M<sub>N,V,y,Rd</sub>.",
    normen: [`${EC3}, 6.2.9.1(6), Gl. (6.41)`],
  },

  /* ---------------- Spannungen ---------------- */

  sigma: {
    titel: "Normalspannung σ (Navier)",
    formeln: [
      "σ(y,z) = N/A + M<sub>y</sub>/I<sub>y</sub> · z + M<sub>z</sub>/I<sub>z</sub> · y &nbsp;&nbsp;(I<sub>yz</sub> = 0)",
      "allgemein: σ = N/A + b<sub>z</sub>·z + b<sub>y</sub>·y",
      "b<sub>z</sub> = (M<sub>y</sub>·I<sub>z</sub> − M<sub>z</sub>·I<sub>yz</sub>) / (I<sub>y</sub>·I<sub>z</sub> − I<sub>yz</sub>²)",
      "b<sub>y</sub> = (M<sub>z</sub>·I<sub>y</sub> − M<sub>y</sub>·I<sub>yz</sub>) / (I<sub>y</sub>·I<sub>z</sub> − I<sub>yz</sub>²)",
    ],
    text: "Zug positiv, Druck negativ. Koordinaten y (nach rechts) und z (nach unten) im Schwerpunkt. " +
      "Bei unsymmetrischen Querschnitten (I<sub>yz</sub> ≠ 0) gilt die allgemeine Form (schiefe Biegung). " +
      "N in kN und M in kNm werden intern in N bzw. Nmm umgerechnet.",
    normen: [
      "Navier-Formel (Technische Mechanik)",
      `${EC3}, 6.2.1(5), Gl. (6.1) (Fließkriterium, für reine Normalspannung σ<sub>x,Ed</sub> ≤ f<sub>y</sub>/γ<sub>M0</sub>)`,
    ],
  },
  sigmaExtrem: {
    titel: "Extremwerte σ<sub>max</sub> und σ<sub>min</sub>",
    formeln: [
      "σ<sub>max</sub> = max σ(y,z), &nbsp;σ<sub>min</sub> = min σ(y,z) &nbsp;(über alle Randpunkte)",
      "σ(y,z) = N/A + M<sub>y</sub>/I<sub>y</sub> · z + M<sub>z</sub>/I<sub>z</sub> · y",
    ],
    text: "Wegen der linearen Spannungsverteilung liegen die Extremwerte immer an einem Randpunkt des Querschnitts.",
    normen: [`${EC3}, 6.2.1(5), Gl. (6.1) (elastischer Nachweis)`],
  },
  nulllinie: {
    titel: "Spannungsnulllinie",
    formeln: ["σ = 0: &nbsp; N/A + M<sub>y</sub>/I<sub>y</sub> · z + M<sub>z</sub>/I<sub>z</sub> · y = 0"],
    text: "Gerade im Querschnitt, auf deren einer Seite Zug und auf der anderen Druck herrscht. " +
      "Bei reiner Biegung (N = 0) geht sie durch den Schwerpunkt.",
  },

  /* ---------------- Tragfähigkeit Stahl ---------------- */

  fy: {
    titel: "Streckgrenze f<sub>y</sub>",
    formeln: ["S235: 235 &nbsp; S275: 275 &nbsp; S355: 355 &nbsp; S420: 420 &nbsp; S460: 460 N/mm²"],
    text: "Nennwerte für Erzeugnisdicken t ≤ 40 mm. Bei dickeren Blechen sind die Werte nach Tabelle 3.1 abgemindert (hier nicht berücksichtigt).",
    normen: [`${EC3}, 3.2.1, Tab. 3.1`, "DIN EN 10025-2 bis -4 (Technische Lieferbedingungen)"],
  },
  gammaM0: {
    titel: "Teilsicherheitsbeiwert γ<sub>M0</sub>",
    formeln: ["γ<sub>M0</sub> = 1,0"],
    text: "Teilsicherheitsbeiwert für den Widerstand von Querschnitten gegen Fließen, unabhängig von der Querschnittsklasse.",
    normen: [`${EC3}, 6.1(1); Nationaler Anhang: γ<sub>M0</sub> = 1,0`],
  },
  eps: {
    titel: "Beiwert ε",
    formeln: ["ε = √( 235 / f<sub>y</sub> ) &nbsp;(f<sub>y</sub> in N/mm²)"],
    text: "S235: 1,00 · S275: 0,92 · S355: 0,81 · S420: 0,75 · S460: 0,71. Skaliert die Grenzwerte c/t der Querschnittsklassen.",
    normen: [`${EC3}, 5.5, Tab. 5.2`],
  },
  Wel: {
    titel: "Elastisches Widerstandsmoment W<sub>el</sub>",
    formeln: [
      "W<sub>el,y</sub> = I<sub>y</sub> / z<sub>max</sub>",
      "W<sub>el,z</sub> = I<sub>z</sub> / y<sub>max</sub>",
    ],
    text: "Bei unterschiedlichen Randabständen ist der kleinere Wert maßgebend (W<sub>el,min</sub>).",
    normen: [`${EC3}, 6.2.5(2), Gl. (6.14)`],
  },
  alpha: {
    titel: "Formfaktor α<sub>pl</sub>",
    formeln: ["α<sub>pl</sub> = W<sub>pl</sub> / W<sub>el</sub>"],
    text: "Tragreserve beim Plastizieren gegenüber dem elastischen Grenzzustand. Rechteck: 1,5 · Kreis: 1,70 · Doppel-T um die starke Achse etwa 1,1 bis 1,2.",
  },
  pna: {
    titel: "Lage der plastischen Nulllinie",
    formeln: ["A<sub>o</sub> = A<sub>u</sub> = A / 2"],
    text: "Abstand der plastischen Nulllinie vom Schwerpunkt. Bei Querschnitten, die zur Biegeachse symmetrisch sind, fällt sie mit der Schwerachse zusammen (0 mm). " +
      "Bei U-Profilen um die z-Achse und bei T-Querschnitten liegt sie versetzt.",
    normen: [`${EC3}, 6.2.5(2) (Grundlage für W<sub>pl</sub>)`],
  },
  klasse: {
    titel: "Querschnittsklasse",
    formeln: [
      "Klasse = ungünstigste Klasse aller Querschnittsteile (c/t gegen Grenzwerte)",
      "Flansch (außenstehend, Druck): c/t ≤ 9ε (Kl. 1), 10ε (Kl. 2), 14ε (Kl. 3)",
      "Steg unter Biegung: c/t ≤ 72ε, 83ε, 124ε",
      "Steg/Wand unter Druck (beidseitig gestützt): c/t ≤ 33ε, 38ε, 42ε",
      "Kreisrohr: d/t ≤ 50ε², 70ε², 90ε²",
      "I/H gewalzt: c<sub>Flansch</sub> = (b − t<sub>w</sub> − 2r)/2, &nbsp;c<sub>Steg</sub> = h − 2t<sub>f</sub> − 2r",
      "U-Profil: c<sub>Flansch</sub> = b − t<sub>w</sub> − r &nbsp; Hohlprofil: c = b − 3t bzw. h − 3t",
    ],
    text: "Klasse 1: plastisch mit voller Rotationskapazität · 2: plastisch mit begrenzter Rotation · 3: elastisch bis zur Streckgrenze · " +
      "4: örtliches Beulen vor Erreichen der Streckgrenze (wirksamer Querschnitt, hier nicht berechnet). " +
      "Biegung um z–z: vereinfachend nur der Flansch bzw. die Wand betrachtet.",
    normen: [`${EC3}, 5.5 (Klassifizierung), Tab. 5.2 (Blatt 1 bis 3)`],
  },
  Mel: {
    titel: "Elastische Momententragfähigkeit M<sub>el,Rd</sub>",
    formeln: ["M<sub>el,Rd</sub> = W<sub>el,min</sub> · f<sub>y</sub> / γ<sub>M0</sub>"],
    text: "Moment, bei dem die Streckgrenze in der Randfaser erreicht wird. Maßgebend für Querschnitte der Klasse 3.",
    normen: [`${EC3}, 6.2.5(2), Gl. (6.14)`],
  },
  Mpl: {
    titel: "Plastische Momententragfähigkeit M<sub>pl,Rd</sub>",
    formeln: ["M<sub>pl,Rd</sub> = W<sub>pl</sub> · f<sub>y</sub> / γ<sub>M0</sub>"],
    text: "Voll durchplastizierter Querschnitt. Anwendbar bei Querschnitten der Klasse 1 und 2.",
    normen: [`${EC3}, 6.2.5(2), Gl. (6.13)`],
  },
  Mc: {
    titel: "Maßgebende Momententragfähigkeit M<sub>c,Rd</sub>",
    formeln: [
      "Klasse 1, 2: M<sub>c,Rd</sub> = M<sub>pl,Rd</sub> = W<sub>pl</sub>·f<sub>y</sub>/γ<sub>M0</sub> &nbsp;(6.13)",
      "Klasse 3: M<sub>c,Rd</sub> = M<sub>el,Rd</sub> = W<sub>el,min</sub>·f<sub>y</sub>/γ<sub>M0</sub> &nbsp;(6.14)",
      "Klasse 4: M<sub>c,Rd</sub> = W<sub>eff,min</sub>·f<sub>y</sub>/γ<sub>M0</sub> &nbsp;(6.15), hier nicht berechnet",
      "Nachweis: M<sub>Ed</sub> / M<sub>c,Rd</sub> ≤ 1,0 &nbsp;(6.12)",
    ],
    text: "Die Querschnittsklasse bestimmt, welche Tragfähigkeit angesetzt werden darf. Stabilitätsversagen (Biegedrillknicken) ist nicht enthalten.",
    normen: [`${EC3}, 6.2.5, Gl. (6.12) bis (6.15)`],
  },
  Npl: {
    titel: "Normalkrafttragfähigkeit N<sub>pl,Rd</sub>",
    formeln: ["N<sub>pl,Rd</sub> = A · f<sub>y</sub> / γ<sub>M0</sub>"],
    text: "Gilt für Zug und für Druck der Klassen 1 bis 3; bei Klasse 4 ist A<sub>eff</sub> anzusetzen (hier nicht berechnet). Knicken ist nicht enthalten.",
    normen: [`${EC3}, 6.2.3, Gl. (6.6) (Zug)`, `${EC3}, 6.2.4, Gl. (6.10) (Druck)`],
  },
  Av: {
    titel: "Schubfläche A<sub>v</sub>",
    formeln: [
      "a) gewalzter I/H, Last ∥ Steg: A<sub>v</sub> = A − 2·b·t<sub>f</sub> + (t<sub>w</sub> + 2r)·t<sub>f</sub> &nbsp;(mindestens η·h<sub>w</sub>·t<sub>w</sub>)",
      "b) gewalztes U-Profil, Last ∥ Steg: A<sub>v</sub> = A − 2·b·t<sub>f</sub> + (t<sub>w</sub> + r)·t<sub>f</sub>",
      "d) geschweißter I/Kasten, Last ∥ Steg: A<sub>v</sub> = η · Σ h<sub>w</sub>·t<sub>w</sub>",
      "e) Last ∥ Flansch: A<sub>v</sub> = A − Σ h<sub>w</sub>·t<sub>w</sub> &nbsp;(hier auch für gewalzte Profile angesetzt)",
      "f) gewalzte Hohlprofile: A<sub>v</sub> = A·h/(b+h) bzw. A·b/(b+h)",
      "g) Rohr: A<sub>v</sub> = 2A/π &nbsp; T (geschweißt): A<sub>v</sub> = t<sub>w</sub>·(h − t<sub>f</sub>/2) &nbsp; Rechteck: A<sub>v</sub> = A (vereinfacht)",
    ],
    text: "h<sub>w</sub> = h − 2t<sub>f</sub> (Stegmaß). η = 1,0 nach Nationalem Anhang. V<sub>z</sub>: Querkraft in z-Richtung (parallel zum Steg), V<sub>y</sub>: in y-Richtung (parallel zu den Flanschen).",
    normen: [`${EC3}, 6.2.6(3); Nationaler Anhang: η = 1,0`],
  },
  Vpl: {
    titel: "Querkrafttragfähigkeit V<sub>pl,Rd</sub>",
    formeln: ["V<sub>pl,Rd</sub> = A<sub>v</sub> · ( f<sub>y</sub> / √3 ) / γ<sub>M0</sub>"],
    text: "Plastische Querkrafttragfähigkeit. Nachweis V<sub>Ed</sub> / V<sub>c,Rd</sub> ≤ 1,0. " +
      "Ab V<sub>Ed</sub> > 0,5·V<sub>pl,Rd</sub> ist die Momententragfähigkeit abzumindern (siehe plastischer Nachweis E-P).",
    normen: [`${EC3}, 6.2.6(1) und (2), Gl. (6.17), (6.18)`, `${EC3}, 6.2.8 (Biegung und Querkraft)`],
  },

  /* ---------------- Stahlbeton-Biegebemessung ---------------- */

  sbBeton: {
    titel: "Betonfestigkeitsklasse",
    formeln: [
      "C30/37: f<sub>ck</sub> = 30 N/mm² (Zylinder) &nbsp; f<sub>ck,cube</sub> = 37 N/mm² (Würfel)",
      "f<sub>ctm</sub> = 0,30 · f<sub>ck</sub><sup>2/3</sup> &nbsp;(≤ C50/60)",
    ],
    text: "Charakteristische Zylinderdruckfestigkeit f<sub>ck</sub> und mittlere Zugfestigkeit f<sub>ctm</sub> (für die Mindestbewehrung).",
    normen: [`${EC2}, 3.1.2, Tab. 3.1`],
  },
  sbStahl: {
    titel: "Betonstahl B500B",
    formeln: ["f<sub>yk</sub> = 500 N/mm² &nbsp; E<sub>s</sub> = 200 000 N/mm²", "Duktilitätsklasse B (hochduktil)"],
    text: "Charakteristische Streckgrenze und Elastizitätsmodul des Betonstahls.",
    normen: [`${EC2}, 3.2 und Anhang C`, "DIN 488-1"],
  },
  fcd: {
    titel: "Bemessungswert der Betondruckfestigkeit f<sub>cd</sub>",
    formeln: ["f<sub>cd</sub> = α<sub>cc</sub> · f<sub>ck</sub> / γ<sub>C</sub> = 0,85 · f<sub>ck</sub> / 1,5"],
    text: "α<sub>cc</sub> = 0,85 berücksichtigt Langzeitwirkung und ungünstige Lasteinwirkung (Nationaler Anhang).",
    normen: [`${EC2}, 3.1.6(1)P, Gl. (3.15)`, "Nationaler Anhang: α<sub>cc</sub> = 0,85; γ<sub>C</sub> = 1,5 (Tab. 2.1DE)"],
  },
  fyd: {
    titel: "Bemessungswert der Streckgrenze f<sub>yd</sub>",
    formeln: ["f<sub>yd</sub> = f<sub>yk</sub> / γ<sub>S</sub> = 500 / 1,15 = 434,8 N/mm²"],
    text: "Bilineare Spannungs-Dehnungs-Linie des Betonstahls mit horizontalem Ast.",
    normen: [`${EC2}, 3.2.7(2), Bild 3.8`, "Nationaler Anhang: γ<sub>S</sub> = 1,15 (Tab. 2.1DE)"],
  },
  lambdaEta: {
    titel: "Beiwerte λ und η des Spannungsblocks",
    formeln: [
      "f<sub>ck</sub> ≤ 50 N/mm²: λ = 0,8 &nbsp;(3.19), &nbsp;η = 1,0 &nbsp;(3.21)",
      "f<sub>ck</sub> > 50 N/mm²: λ = 0,8 − (f<sub>ck</sub> − 50)/400 &nbsp;(3.20), &nbsp;η = 1,0 − (f<sub>ck</sub> − 50)/200 &nbsp;(3.22)",
    ],
    text: "Rechteckiger Spannungsblock: Höhe λ·x, Spannung η·f<sub>cd</sub>.",
    normen: [`${EC2}, 3.1.7(3), Bild 3.5, Gl. (3.19) bis (3.22)`],
  },
  NEdSb: {
    titel: "Normalkraft N<sub>Ed</sub> (Massivbau)",
    formeln: [
      "M<sub>Eds</sub> = M<sub>Ed</sub> − N<sub>Ed</sub>·z<sub>s1</sub> &nbsp;(N<sub>Ed</sub> &gt; 0 Zug, &lt; 0 Druck)",
      "z<sub>s1</sub> = Abstand der Zugbewehrung vom Schwerpunkt des Betonquerschnitts",
      "A<sub>s1</sub> = ( F<sub>c</sub> + N<sub>Ed</sub> ) / f<sub>yd</sub>",
    ],
    text: "Die Normalkraft wirkt im Schwerpunkt des Betonquerschnitts. Bemessung um die Zugbewehrung: das Moment wird auf die Zugbewehrung bezogen, die Zugkraft der Bewehrung um N<sub>Ed</sub> verändert. " +
      "Nicht erfasst: Stabilität/Theorie II. Ordnung, überwiegender Zug (M<sub>Eds</sub> &lt; 0), Bemessung von Druckgliedern mit voll überdrücktem Querschnitt.",
    normen: [`${EC2}, 6.1 (Biegung mit Längskraft)`, "Bemessungsverfahren mit M<sub>Eds</sub>: Bemessungshilfen (z. B. Zilch/Zehetmaier, Grasser)"],
  },
  sbBauteil: {
    titel: "Bauteil: Balken oder Platte",
    text: "Balken: Stäbe liegen in Lagen innerhalb der Bügel; geprüft wird der lichte Abstand. Platte: Die Stäbe liegen gleichmäßig über die Breite b (b = 100 cm → je Meter); zusätzlich wird der größte Stababstand geprüft. Plattengeometrie darf die Strukturklasse um 1 verringern.",
    normen: [`${EC2}, 8.2(2) (lichter Abstand)`, `${EC2}, 9.3.1.1(3) (größter Stababstand Platten)`, `${EC2}/NA, Tab. 4.3DE (Strukturklasse)`],
  },
  sbQuer: {
    titel: "Querkraftbemessung (EC 2, NA DE)",
    formeln: [
      "V<sub>Rd,c</sub> = [ C<sub>Rd,c</sub>·k·(100·ρ<sub>l</sub>·f<sub>ck</sub>)<sup>1/3</sup> + 0,12·σ<sub>cp</sub> ]·b<sub>w</sub>·d ≥ ( v<sub>min</sub> + 0,12·σ<sub>cp</sub> )·b<sub>w</sub>·d",
      "C<sub>Rd,c</sub> = 0,15/γ<sub>c</sub>; k = 1 + √(200/d) ≤ 2,0; ρ<sub>l</sub> = A<sub>sl</sub>/(b<sub>w</sub>·d) ≤ 0,02",
      "V<sub>Rd,max</sub> = b<sub>w</sub>·z·ν<sub>1</sub>·f<sub>cd</sub> / (cot θ + tan θ), z = 0,9·d, ν<sub>1</sub> = 0,75·(1,1 − f<sub>ck</sub>/500) ≤ 0,75",
      "a<sub>sw</sub> = V<sub>Ed</sub> / (z·f<sub>ywd</sub>·cot θ); a<sub>sw,min</sub> = 0,16·f<sub>ctm</sub>/f<sub>yk</sub>·b<sub>w</sub>",
      "1,0 ≤ cot θ ≤ ( 1,2 + 1,4·σ<sub>cp</sub>/f<sub>cd</sub> ) / ( 1 − V<sub>Rd,cc</sub>/V<sub>Ed</sub> ) ≤ 3,0",
      "ΔF<sub>td</sub> = ½·V<sub>Ed</sub>·cot θ (zusätzliche Längszugkraft)",
    ],
    text: "V<sub>Ed</sub> ist die Bemessungsquerkraft im Abstand d vom Auflagerrand (Betrag). Ist V<sub>Ed</sub> ≤ V<sub>Rd,c</sub>, braucht ein Bauteil rechnerisch keine Querkraftbewehrung (Balken erhalten die Mindestbewehrung). " +
      "cot θ = 0: die App wählt den flachsten zulässigen Druckstrebenwinkel, bei dem V<sub>Rd,max</sub> noch reicht (wenigste Bügel). Der größte Bügelabstand folgt aus V<sub>Ed</sub>/V<sub>Rd,max</sub> (≤ 0,3: 0,7h; ≤ 0,6: 0,5h; sonst 0,25h, jeweils ≤ 300 bzw. 200 mm) und 0,75·d. " +
      "Nicht erfasst: Lasten nahe am Auflager, Gurtanschluss, geneigte Bügel, Beton über C50/60. Tabellenwerte vor Verwendung an der Norm prüfen.",
    normen: [`${EC2}, 6.2.2 und 6.2.3`, `${EC2}/NA, 6.2.2(1), Gl. (6.2a), (6.2b), NA.6.2.3(2)`, `${EC2}, 9.2.2 (Querkraftbewehrung)`],
  },
  sbLage: {
    titel: "Verlegung: Stäbe je Lage",
    formeln: [
      "a<sub>min</sub> = max( Ø ; d<sub>g</sub> + 5 mm ; 20 mm )",
      "a<sub>vorh</sub> = ( b − 2·(c<sub>nom</sub> + d<sub>sw</sub>) − n<sub>l</sub>·Ø ) / ( n<sub>l</sub> − 1 )",
      "d<sub>1</sub> = c<sub>nom</sub> + d<sub>sw</sub> + Schwerpunktabstand der Lagen",
    ],
    text: "0 = so viele Stäbe je Lage, wie der Mindestabstand zulässt (gleichmäßig auf die Lagen verteilt). Der lichte Lagenabstand wird mit a<sub>min</sub> angesetzt. d<sub>1</sub> wird iterativ bestimmt, weil die Lagenzahl von A<sub>s1</sub> und A<sub>s1</sub> von d<sub>1</sub> abhängt.",
    normen: [`${EC2}, 8.2(2)`],
  },
  sbVerank: {
    titel: "Verankerung und Übergreifung",
    formeln: [
      "f<sub>bd</sub> = 2,25·η<sub>1</sub>·η<sub>2</sub>·f<sub>ctd</sub>, f<sub>ctd</sub> = α<sub>ct</sub>·f<sub>ctk;0,05</sub>/γ<sub>c</sub> (α<sub>ct</sub> = 1,0)",
      "l<sub>b,rqd</sub> = (Ø/4)·σ<sub>sd</sub>/f<sub>bd</sub>",
      "l<sub>bd</sub> = α<sub>1</sub>·α<sub>2</sub>·α<sub>3</sub>·α<sub>4</sub>·α<sub>5</sub>·l<sub>b,rqd</sub> ≥ l<sub>b,min</sub>",
      "l<sub>0</sub> = α<sub>1</sub>·α<sub>2</sub>·α<sub>3</sub>·α<sub>5</sub>·α<sub>6</sub>·l<sub>b,rqd</sub> ≥ l<sub>0,min</sub>, α<sub>6</sub> = √(ρ<sub>1</sub>/25), 1,0 ≤ α<sub>6</sub> ≤ 1,5",
    ],
    text: "Verbund gut (η<sub>1</sub> = 1,0): Stab 45°–90° geneigt, oder liegend bei Bauteilhöhe ≤ 250 mm bzw. in der unteren Bauteilhälfte oder ≥ 300 mm unter Oberkante; sonst mäßig (0,7). η<sub>2</sub> = 1,0 für Ø ≤ 32 mm. α<sub>1</sub>: Haken/Schlaufen 0,7 bei c<sub>d</sub> &gt; 3Ø (Zug); α<sub>2</sub> = 1 − 0,15·(c<sub>d</sub> − Ø)/Ø (gerade) bzw. (c<sub>d</sub> − 3Ø)/Ø (Haken), 0,7…1,0; α<sub>3</sub> = 1 − K·λ mit λ = (ΣA<sub>st</sub> − ΣA<sub>st,min</sub>)/A<sub>s</sub> (Verankerung 0,25·A<sub>s</sub>, Stoß 1,0·A<sub>s</sub>); α<sub>5</sub> = 1 − 0,04·p. Es gilt α<sub>2</sub>·α<sub>3</sub>·α<sub>5</sub> ≥ 0,7. Nicht erfasst: angeschweißte Querstäbe (α<sub>4</sub>), Schweißstöße, Mattenstöße, Ø &gt; 32 mm Sonderregeln, Außenrüttler-Sonderregel der Verbundbedingung. Vorbelegung von σ<sub>sd</sub> aus A<sub>s,erf</sub>/A<sub>s,vorh</sub> der Biegebemessung. Normwerte vor Verwendung prüfen.",
    normen: ["DIN EN 1992-1-1, 8.4 und 8.7", "DIN EN 1992-1-1/NA (Verbundspannung α<sub>ct</sub> = 1,0)"],
  },
  sbDeckung: {
    titel: "Betondeckung c<sub>nom</sub>",
    formeln: [
      "c<sub>nom</sub> = c<sub>min</sub> + Δc<sub>dev</sub>",
      "c<sub>min</sub> = max( c<sub>min,b</sub> ; c<sub>min,dur</sub> ; 10 mm )",
      "c<sub>min,b</sub> = max( d<sub>sw</sub> ; d<sub>s</sub> − d<sub>sw</sub> ) &nbsp;(Bügel außen)",
    ],
    text: "c<sub>min,dur</sub> folgt aus der Expositionsklasse über die Strukturklasse (Start S3 bei 50 Jahren, bei XD1/XS1 +10 mm, XD2/XS2 +5 mm Sicherheitszuschlag, Zu-/Abschläge für Nutzungsdauer, Festigkeit, Plattengeometrie). Vorhaltemaß nach NA: Δc<sub>dev</sub> = 10 mm. " +
      "Die Tabellenwerte sind vor Verwendung an der Norm zu prüfen; Sonderfälle (Verbund, Brandschutz, Erdberührung) sind nicht erfasst.",
    normen: [`${EC2}, 4.4.1.1 bis 4.4.1.3`, `${EC2}/NA, Tab. 4.3DE, 4.4DE`, "Mindestfestigkeitsklassen: EC 2/NA, Tab. E.1DE"],
  },
  epsCu2: {
    titel: "Bruchstauchung ε<sub>cu2</sub>",
    formeln: [
      "f<sub>ck</sub> ≤ 50 N/mm²: ε<sub>cu2</sub> = 3,5 ‰",
      "f<sub>ck</sub> > 50 N/mm²: ε<sub>cu2</sub> = 2,6 + 35·[(90 − f<sub>ck</sub>)/100]⁴ ‰",
    ],
    text: "Grenzstauchung des Betons am gedrückten Rand bei Biegung.",
    normen: [`${EC2}, 3.1.7, Tab. 3.1`],
  },
  d: {
    titel: "Statische Nutzhöhe d",
    formeln: ["d = h − d<sub>1</sub>"],
    text: "Abstand des Schwerpunkts der Zugbewehrung vom gedrückten Rand.",
  },
  x: {
    titel: "Druckzonenhöhe x",
    formeln: [
      "Rechteck (bzw. λ·x ≤ h<sub>f</sub> beim Plattenbalken): M<sub>Ed</sub> = η·f<sub>cd</sub>·b·λx·(d − λx/2)",
      "x = d/λ · [ 1 − √( 1 − 2·M<sub>Ed</sub> / (η·f<sub>cd</sub>·b·d²) ) ]",
      "Plattenbalken mit λ·x > h<sub>f</sub>: Gleichgewicht am T-Querschnitt (Steg und Gurtüberstände), numerisch gelöst",
    ],
    text: "Momentengleichgewicht um die Zugbewehrung (bei Normalkraft mit M<sub>Eds</sub> statt M<sub>Ed</sub>). Beim Plattenbalken gilt für b die mitwirkende Gurtbreite b<sub>eff</sub>.",
    normen: [`${EC2}, 6.1(2)P (Annahmen)`, `${EC2}, 3.1.7(3), Bild 3.5 (rechteckiger Spannungsblock)`],
  },
  xi: {
    titel: "Bezogene Druckzonenhöhe ξ",
    formeln: ["ξ = x / d ≤ 0,45 &nbsp;(≤ C50/60)"],
    text: "Begrenzung für ausreichende Duktilität. Würde ξ überschritten, wird Druckbewehrung angeordnet (ξ = 0,45 wird dann als Grenze angesetzt).",
    normen: [`${EC2}/NA, Duktilitätsbegrenzung x/d ≤ 0,45 (zu 5.4)`, `Bei Momentenumlagerung: ${EC2}, 5.5(4), Gl. (5.10a)`],
  },
  As1erf: {
    titel: "Erforderliche Zugbewehrung A<sub>s1</sub>",
    formeln: [
      "A<sub>s1</sub> = ( η·f<sub>cd</sub>·b·λ·x + N<sub>Ed</sub> ) / f<sub>yd</sub> &nbsp;(N<sub>Ed</sub> &gt; 0 Zug)",
      "ω-Verfahren: A<sub>s1</sub> = ( ω<sub>1</sub>·b·d·f<sub>cd</sub> + N<sub>Ed</sub> ) / σ<sub>sd</sub>",
      "mit Druckbewehrung: A<sub>s1</sub> = ( F<sub>cd,lim</sub> + A<sub>s2</sub>·σ<sub>s2</sub> ) / f<sub>yd</sub>",
    ],
    text: "Kräftegleichgewicht am Querschnitt: Betondruckkraft plus Druckbewehrungskraft = Zugkraft der Bewehrung. Beim Plattenbalken wird die Druckkraft von Gurt und Steg getrennt erfasst.",
    normen: [`${EC2}, 6.1 (Biegung mit oder ohne Längskraft)`, `${EC2}, 3.1.7(3)`],
  },
  Asmin: {
    titel: "Mindestbewehrung A<sub>s,min</sub>",
    formeln: ["A<sub>s,min</sub> = max( 0,26 · f<sub>ctm</sub>/f<sub>yk</sub> · b<sub>t</sub> · d ; &nbsp;0,0013 · b<sub>t</sub> · d )"],
    text: "b<sub>t</sub> = mittlere Breite der Zugzone (hier Breite bzw. Stegbreite). Weitere Mindestbewehrungen (Rissbreitenbegrenzung, Duktilität) sind gesondert zu prüfen.",
    normen: [`${EC2}, 9.2.1.1(1), Gl. (9.1N)`],
  },
  As1: {
    titel: "Maßgebende Zugbewehrung A<sub>s1</sub>",
    formeln: ["A<sub>s1</sub> = max( A<sub>s1,erf</sub> ; A<sub>s,min</sub> )"],
    text: "Größerer Wert aus rechnerisch erforderlicher Bewehrung und Mindestbewehrung.",
    normen: [`${EC2}, 6.1 und 9.2.1.1`],
  },
  As2: {
    titel: "Druckbewehrung A<sub>s2</sub>",
    formeln: [
      "ε<sub>s2</sub> = ε<sub>cu2</sub> · ( x<sub>lim</sub> − d<sub>2</sub> ) / x<sub>lim</sub> &nbsp;, &nbsp;σ<sub>s2</sub> = min( ε<sub>s2</sub>·E<sub>s</sub> ; f<sub>yd</sub> )",
      "A<sub>s2</sub> = ( M<sub>Ed</sub> − M<sub>lim</sub> ) / ( ( d − d<sub>2</sub> ) · σ<sub>s2</sub> )",
    ],
    text: "Erforderlich, wenn ξ<sub>lim</sub> = 0,45 überschritten würde. M<sub>lim</sub> = Moment des Betons bei x = ξ<sub>lim</sub>·d. " +
      "Der durch die Druckbewehrung verdrängte Beton wird vernachlässigt.",
    normen: [`${EC2}, 6.1`],
  },
  Asmax: {
    titel: "Höchstbewehrung A<sub>s,max</sub>",
    formeln: ["A<sub>s,max</sub> = 0,04 · A<sub>c</sub>"],
    text: "Obergrenze der Längsbewehrung, auch im Bereich von Übergreifungsstößen.",
    normen: [`${EC2}, 9.2.1.1(3)`],
  },
  dehnung: {
    titel: "Dehnungsebene",
    formeln: [
      "ε(z<sub>c</sub>) = κ · ( z<sub>c</sub> − x ) &nbsp;(z<sub>c</sub> vom Druckrand, Druck negativ)",
      "Bereich 3 (Betonversagen): κ = ε<sub>cu2</sub> / x",
      "Bereich 2 (Stahlversagen): κ = ε<sub>ud</sub> / ( d − x )",
      "Grenze der Bereiche: ξ = ε<sub>cu2</sub> / ( ε<sub>cu2</sub> + ε<sub>ud</sub> )",
    ],
    text: "Ebene Dehnungsverteilung (Ebenbleiben der Querschnitte), Betonzugfestigkeit wird vernachlässigt. ε<sub>ud</sub> = 25 ‰.",
    normen: [`${EC2}, 6.1(2)P, Bild 6.1`, `${EC2}, 3.2.7 (Nationaler Anhang: ε<sub>ud</sub> = 25 ‰)`],
  },
  epsYd: {
    titel: "Fließdehnung ε<sub>yd</sub>",
    formeln: ["ε<sub>yd</sub> = f<sub>yd</sub> / E<sub>s</sub> = 434,8 / 200 000 = 2,17 ‰", "Zugbewehrung fließt, wenn ε<sub>s1</sub> ≥ ε<sub>yd</sub>"],
    text: "Fließt die Bewehrung, wird die volle Stahlspannung f<sub>yd</sub> angesetzt (horizontaler Ast der Spannungs-Dehnungs-Linie).",
    normen: [`${EC2}, 3.2.7, Bild 3.8`],
  },
  bewehrung: {
    titel: "Bewehrungsvorschlag",
    formeln: ["A<sub>s,vorh</sub> = n · π · Ø² / 4 ≥ A<sub>s1</sub>"],
    text: "Anzahl n der Stäbe je Durchmesser, aufgerundet. Stababstände, Verbund, Verankerung und Konstruktionsregeln sind gesondert nachzuweisen.",
    normen: [`${EC2}, 8.2 (Stababstände)`, `${EC2}, 9.2.1.1`],
  },
  MEd: {
    titel: "Bemessungsmoment M<sub>Ed</sub>",
    formeln: [
      "M<sub>Ed</sub> = Σ γ<sub>G,j</sub>·M<sub>Gk,j</sub> + γ<sub>Q,1</sub>·M<sub>Qk,1</sub> + Σ γ<sub>Q,i</sub>·ψ<sub>0,i</sub>·M<sub>Qk,i</sub>",
      "γ<sub>G</sub> = 1,35 &nbsp; γ<sub>Q</sub> = 1,5",
    ],
    text: "Bemessungswert aus der Grundkombination für ständige und vorübergehende Bemessungssituationen. Hier wird M<sub>Ed</sub> direkt eingegeben; positiv = Zug unten.",
    normen: [`${EC0}, 6.4.3.2, Gl. (6.10)`, `${EC0}/NA, Tab. NA.A.1.2(B)`],
  },
  d1d2: {
    titel: "Randabstände d<sub>1</sub> und d<sub>2</sub>",
    formeln: ["d<sub>1</sub> = c<sub>nom</sub> + Ø<sub>Bügel</sub> + Ø<sub>s</sub>/2", "c<sub>nom</sub> = c<sub>min</sub> + Δc<sub>dev</sub>"],
    text: "Abstand des Bewehrungsschwerpunkts vom Rand (d<sub>1</sub> Zugbewehrung, d<sub>2</sub> Druckbewehrung). " +
      "Das Vorhaltemaß Δc<sub>dev</sub> und die Mindestbetondeckung c<sub>min</sub> richten sich nach Expositionsklasse und Nationalem Anhang.",
    normen: [`${EC2}, 4.4.1.1(2), Gl. (4.1)`],
  },
  beff: {
    titel: "Mitwirkende Gurtbreite b<sub>eff</sub>",
    formeln: [
      "b<sub>eff</sub> = Σ b<sub>eff,i</sub> + b<sub>w</sub> ≤ b",
      "b<sub>eff,i</sub> = 0,2·b<sub>i</sub> + 0,1·l<sub>0</sub> ≤ 0,2·l<sub>0</sub> &nbsp;und ≤ b<sub>i</sub>",
    ],
    text: "l<sub>0</sub> = Abstand der Momentennullpunkte, b<sub>i</sub> = Gurtüberstand neben dem Steg. Hier wird b<sub>eff</sub> direkt eingegeben.",
    normen: [`${EC2}, 5.3.2.1(3), Gl. (5.7) bis (5.7b), Bild 5.3`],
  },
};

/** HTML eines Info-Symbols für den Schlüssel (leer, wenn der Schlüssel unbekannt ist). */
function infoBtn(key) {
  if (!INFO[key]) { console.warn("Unbekannter Info-Schlüssel:", key); return ""; }
  return `\u2060<button type="button" class="info" data-info="${key}" aria-label="Formel und Norm anzeigen" title="Formel und Norm">i</button>`;
}

/** Fenster, das beim Antippen eines Info-Symbols Formel, Erläuterung und Normverweis zeigt. */
class InfoPanel {
  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.id = "info-overlay";
    this.overlay.hidden = true;
    this.overlay.innerHTML =
      '<div id="info-panel" role="dialog" aria-modal="true" aria-labelledby="info-titel">' +
      '<button type="button" id="info-zu" aria-label="Schließen">✕</button>' +
      '<h3 id="info-titel"></h3><div id="info-inhalt"></div></div>';
    document.body.appendChild(this.overlay);

    // Ein Klick-Handler für alle Info-Symbole (auch die erst später erzeugten)
    document.addEventListener("click", e => {
      const b = e.target.closest ? e.target.closest("[data-info]") : null;
      if (b) { e.preventDefault(); this.zeige(b.dataset.info, b); return; }
      if (e.target === this.overlay || e.target.id === "info-zu") this.schliesse();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") this.schliesse(); });

    // Im HTML fest eingetragene Symbole bekommen eine Beschriftung für Screenreader
    document.querySelectorAll("[data-info]").forEach(b => {
      b.setAttribute("aria-label", "Formel und Norm anzeigen");
      b.title = "Formel und Norm";
    });
  }

  /** Eintrag anzeigen. */
  zeige(key, ausloeser = null) {
    const i = INFO[key];
    if (!i) return;
    this.ausloeser = ausloeser;
    document.getElementById("info-titel").innerHTML = i.titel;
    let h = (i.formeln || []).map(f => `<div class="formel">${f}</div>`).join("");
    if (i.text) h += `<p class="infotext">${i.text}</p>`;
    if (i.normen && i.normen.length) {
      h += '<p class="infokopf">Norm</p><ul class="normen">' + i.normen.map(n => `<li>${n}</li>`).join("") + "</ul>";
      h += `<p class="infohinweis">${INFO_HINWEIS}</p>`;
    }
    document.getElementById("info-inhalt").innerHTML = h;
    this.overlay.hidden = false;
    document.getElementById("info-zu").focus();
  }

  schliesse() {
    if (this.overlay.hidden) return;
    this.overlay.hidden = true;
    if (this.ausloeser && this.ausloeser.focus) this.ausloeser.focus();
  }
}
