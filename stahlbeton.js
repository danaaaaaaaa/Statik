"use strict";

/**
 * stahlbeton.js - Biegebemessung im Stahlbetonbau nach DIN EN 1992-1-1 mit DE-NA.
 *
 * Annahmen:
 *  - Betonarbeitslinie wählbar: Parabel-Rechteck-Diagramm (EC 2, 3.1.7(1), numerische Integration über
 *    die Druckzone) oder rechteckiger Spannungsblock (EC 2, 3.1.7(3)) mit lambda und eta
 *  - fcd = alpha_cc * fck / gamma_c mit alpha_cc = 0,85 (NA DE), gamma_c = 1,5
 *  - Betonstahl B500B, Stahlspannungs-Dehnungs-Linie bilinear mit horizontalem Ast
 *  - Biegung mit Normalkraft (NEd > 0 Zug, < 0 Druck), Bezug auf die Zugbewehrung:
 *    MEds = MEd - NEd * zs1; As1 = (Fc + NEd) / fyd (Grundkombination, gamma_s = 1,15)
 *  - Verfahren: Spannungsblock, Parabel-Rechteck (direkt) oder omega-Verfahren (dimensionslos,
 *    mu_Eds -> omega_1, As1 = (omega_1 * b * d * fcd + NEd) / sigma_sd)
 *  - Betondeckung, Expositionsklassen und Stababstände: Klassen Expositionsklassen, Betondeckung, Bewehrungswahl
 *  - Duktilitätsgrenze xi_lim = x/d: 0,45 (<= C50/60), Druckbewehrung darüber hinaus
 *  - Intern: mm, N, N/mm². Eingabe der Maße in cm, Ausgabe der Bewehrung in cm².
 */

const ALPHA_CC = 0.85; // NA DE
const GAMMA_C = 1.5;
const GAMMA_S = 1.15;
const EPS_UD = 25; // Grenzdehnung des Betonstahls in ‰ (Grenze Bereich 2 / 3)

/** Betonklassen: [Name, fck [N/mm²], fctm [N/mm²]] (bis C50/60 umgesetzt) */
const BETONKLASSEN = [
  ["C12/15", 12, 1.6], ["C16/20", 16, 1.9], ["C20/25", 20, 2.2],
  ["C25/30", 25, 2.6], ["C30/37", 30, 2.9], ["C35/45", 35, 3.2],
  ["C40/50", 40, 3.5], ["C45/55", 45, 3.8], ["C50/60", 50, 4.1],
];

/** Betonkennwerte */
class Beton {
  constructor(name, fck, fctm) {
    this.name = name; this.fck = fck; this.fctm = fctm;
  }
  /** Beton aus der Klassenliste anhand des Namens erzeugen. */
  static aus(name) {
    const d = BETONKLASSEN.find(k => k[0] === name);
    if (!d) throw new Error("Unbekannte Betonklasse: " + name);
    return new Beton(...d);
  }
  get fcd() { return ALPHA_CC * this.fck / GAMMA_C; }
  get lambda() { return this.fck <= 50 ? 0.8 : 0.8 - (this.fck - 50) / 400; }
  get eta() { return this.fck <= 50 ? 1.0 : 1.0 - (this.fck - 50) / 200; }
  /** Bruchstauchung epsilon_cu2 in Promille */
  get epsCu2() { return this.fck <= 50 ? 3.5 : 2.6 + 35 * Math.pow((90 - this.fck) / 100, 4); }
  /** Parabel-Rechteck-Diagramm (EC 2, Tab. 3.1): Exponent n und Stauchung epsilon_c2 [‰] */
  get nPR() { return this.fck <= 50 ? 2.0 : 1.4 + 23.4 * Math.pow((90 - this.fck) / 100, 4); }
  get epsC2() { return this.fck <= 50 ? 2.0 : 2.0 + 0.085 * Math.pow(this.fck - 50, 0.53); }
  /** Betondruckspannung [N/mm²] bei der Stauchung eps [‰] (Druck positiv), Parabel-Rechteck (EC 2, Gl. 3.17/3.18) */
  sigmaPR(eps) {
    if (eps <= 0) return 0;
    if (eps >= this.epsC2) return this.fcd;
    return this.fcd * (1 - Math.pow(1 - eps / this.epsC2, this.nPR));
  }
  /** Grenzwert x/d */
  get xiLim() { return this.fck <= 50 ? 0.45 : 0.35; }
}

/** Betonstahl B500B */
class Betonstahl {
  constructor() { this.fyk = 500; this.Es = 200000; }
  get fyd() { return this.fyk / GAMMA_S; }
}

/** Stahlbeton-Querschnitt: Rechteck oder Plattenbalken. Eingabe in cm. */
class SBQuerschnitt {
  /**
   * @param {Object} p {typ:'rechteck'|'plattenbalken', b (bzw. b_w), h, bf, hf, d1, d2} in cm
   *   d1 = Randabstand der Zugbewehrung, d2 = Randabstand der Druckbewehrung
   */
  constructor({ typ, b, h, bf, hf, d1, d2 }) {
    const pb = typ === "plattenbalken";
    this.typ = typ;
    this.b = b * 10; this.h = h * 10;
    this.bf = (pb ? bf : b) * 10;
    this.hf = (pb ? hf : 0) * 10;
    this.d1 = d1 * 10; this.d2 = d2 * 10;
    this._pruefe();
  }
  _pruefe() {
    if (!(this.b > 0 && this.h > 0)) throw new Error("Breite und Höhe müssen größer 0 sein.");
    if (!(this.d1 > 0 && this.d2 > 0)) throw new Error("d₁ und d₂ müssen größer 0 sein.");
    if (this.d1 + this.d2 >= this.h) throw new Error("d₁ + d₂ muss kleiner als die Bauteilhöhe sein.");
    if (this.typ === "plattenbalken") {
      if (this.bf < this.b) throw new Error("Gurtbreite muss mindestens so groß wie die Stegbreite sein.");
      if (!(this.hf > 0 && this.hf < this.h)) throw new Error("Gurtdicke muss zwischen 0 und h liegen.");
    }
  }
  /** Betonfläche Ac [mm²] */
  get Ac() {
    return this.typ === "plattenbalken"
      ? this.bf * this.hf + this.b * (this.h - this.hf)
      : this.b * this.h;
  }
}

/** Biegebemessung (Berechnung ohne Bezug zur Oberfläche). */
class Biegebemessung {
  constructor(querschnitt, beton, stahl) {
    this.q = querschnitt; this.beton = beton; this.stahl = stahl;
  }

  /**
   * @param {number} MEd Bemessungsmoment [kNm]; positiv = Zug unten, negativ = Zug oben
   * @param {string} modus 'pr' = Parabel-Rechteck-Diagramm, 'block' = rechteckiger Spannungsblock,
   *                       'omega' = omega-Verfahren (Parabel-Rechteck, dimensionslose Darstellung)
   * @param {number} NEd Normalkraft [kN]; positiv = Zug, negativ = Druck (wirkt im Schwerpunkt des Betonquerschnitts)
   * @returns {Object} Ergebnis (Längen in mm, Flächen in mm²)
   */
  bemesse(MEd, modus = "pr", NEd = 0) {
    const { q, beton: bt, stahl: st } = this;
    const negativ = MEd < 0;
    const istT = q.typ === "plattenbalken" && !negativ;  // Gurt in der Druckzone?
    const d = q.h - q.d1;                                // statische Nutzhöhe
    const linie = modus === "block" ? "block" : "pr";    // Betonarbeitslinie (omega-Verfahren: Parabel-Rechteck)
    const N = NEd * 1e3;                                 // [N], Zug positiv
    // Schwerpunkt des Betonquerschnitts (Abstand vom Druckrand) und Hebelarm der Zugbewehrung dazu
    const zcOben = q.typ === "plattenbalken"
      ? (q.bf * q.hf * q.hf / 2 + q.b * (q.h - q.hf) * (q.hf + (q.h - q.hf) / 2)) / q.Ac : q.h / 2;
    const zc = negativ ? q.h - zcOben : zcOben;
    const zs1 = d - zc;
    const M = Math.abs(MEd) * 1e6 - N * zs1;             // MEds [Nmm] (Bezug Zugbewehrung)
    const a = bt.eta * bt.fcd;                           // Spannungsblock [N/mm²]
    const lam = bt.lambda;

    const res = {
      negativ, istT, d, modus, linie, NEd, zc, zs1, MEds: M / 1e6, hinweise: [], fehler: null,
      fcd: bt.fcd, fyd: st.fyd, lambda: lam, eta: bt.eta, epsCu2: bt.epsCu2, xiLim: bt.xiLim,
    };

    /** Betondruckkraft F und Moment M (um die Zugbewehrung) bei Druckzonenhöhe x */
    const druck = (x) => {
      const s = lam * x; // Höhe des Spannungsblocks
      if (!istT || s <= q.hf) {
        const b = istT ? q.bf : q.b;
        const F = a * b * s;
        return { F, M: F * (d - s / 2) };
      }
      const Ff = a * (q.bf - q.b) * q.hf; // überstehende Gurtanteile
      const Fw = a * q.b * s;             // Steg (über die volle Blockhöhe)
      return { F: Ff + Fw, M: Ff * (d - q.hf / 2) + Fw * (d - s / 2) };
    };

    /** Stauchung am Druckrand [‰]: Bereich 3 = eps_cu2, Bereich 2 (Stahl bei eps_ud) kleiner */
    const epsTop = x => Math.min(bt.epsCu2, EPS_UD * x / (d - x));

    /**
     * Parabel-Rechteck: Betondruckkraft F und Moment M (um die Zugbewehrung) bei Druckzonenhöhe x,
     * numerische Integration (Mittelpunktsregel) über die Druckzone; Plattenbalken mit Gurtbreite im Gurt.
     */
    const druckPR = (x) => {
      const n = 400, dz = x / n, et = epsTop(x);
      let F = 0, M = 0;
      for (let i = 0; i < n; i++) {
        const z = (i + 0.5) * dz;                                   // Abstand vom Druckrand
        const sig = bt.sigmaPR(et * (1 - z / x));
        const dF = sig * (istT && z <= q.hf ? q.bf : q.b) * dz;
        F += dF; M += dF * (d - z);
      }
      return { F, M };
    };
    const druckModell = linie === "pr" ? druckPR : druck;          // gewählte Arbeitslinie

    if (M < 0) {
      res.fehler = "Das Moment um die Zugbewehrung ist negativ (M_Eds = " + (M / 1e6).toFixed(1) + " kNm): überwiegend Zug (große Zugkraft, kleine Ausmitte). Diese Bemessung ist nicht umgesetzt.";
      return res;
    }

    const xLim = bt.xiLim * d;
    const lim = druckModell(xLim);
    let x, As1, As2 = 0;

    if (M <= lim.M) {
      // Einfach bewehrt: x per Intervallhalbierung bestimmen (druck(x).M wächst monoton)
      let lo = 0, hi = xLim;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (druckModell(mid).M < M) lo = mid; else hi = mid;
      }
      x = (lo + hi) / 2;
      As1 = (druckModell(x).F + N) / st.fyd;
      res.fall = "Einfach bewehrt";
    } else {
      // Druckbewehrung erforderlich: Betonanteil bei x = x_lim, Rest über Druckbewehrung
      if (q.d2 >= xLim) {
        res.fehler = "Druckbewehrung läge außerhalb der Druckzone (d₂ ≥ x_lim). Querschnitt vergrößern oder d₂ verkleinern.";
        return res;
      }
      const eps2 = bt.epsCu2 / 1000 * (xLim - q.d2) / xLim;
      const sig2 = Math.min(eps2 * st.Es, st.fyd);
      As2 = (M - lim.M) / ((d - q.d2) * sig2);
      As1 = (lim.F + As2 * sig2 + N) / st.fyd;
      x = xLim;
      res.sigS2 = sig2;
      res.fall = "Doppelt bewehrt (Druckbewehrung erforderlich)";
      res.hinweise.push("Verdrängter Beton im Bereich der Druckbewehrung wird vernachlässigt.");
    }

    res.x = x; res.xi = x / d;
    res.sBlock = lam * x;                                           // Höhe des Spannungsblocks
    res.s = linie === "pr" ? x : lam * x;                           // Höhe der Druckzone im gewählten Modell
    res.Fc = druckModell(x).F;                                      // Betondruckkraft [N]

    // ---- Dehnungsebene: Bereich 2 (Stahl bei eps_ud) oder Bereich 3 (Beton bei eps_cu2) ----
    // Dehnungen linear über die Höhe, Abstand zc vom Druckrand; Zug positiv, Druck negativ.
    if (x > 1e-6) {
      const bereich2 = x / d < bt.epsCu2 / (bt.epsCu2 + EPS_UD);
      const kappa = bereich2 ? EPS_UD / (d - x) : bt.epsCu2 / x; // Krümmung [‰/mm]
      const eps = zc => kappa * (zc - x);
      const ebenen = [{ name: "Druckrand", z: 0 }];
      if (As2 > 0) ebenen.push({ name: "Druckbewehrung As2", z: q.d2 });
      if (q.typ === "plattenbalken") ebenen.push({ name: "Gurtunterkante", z: negativ ? q.h - q.hf : q.hf });
      ebenen.push({ name: "Nulllinie x", z: x }, { name: "Zugbewehrung As1", z: d }, { name: "Zugrand", z: q.h });
      ebenen.sort((p, r) => p.z - r.z);
      ebenen.forEach(e => { e.eps = eps(e.z); });
      const epsYd = st.fyd / st.Es * 1000; // Fließdehnung [‰]
      res.dehnung = {
        bereich: bereich2 ? 2 : 3, kappa, ebenen, epsYd, epsUd: EPS_UD,
        epsS1: eps(d), fliesst: eps(d) >= epsYd - 1e-9,
      };
      // Spannungen der Bewehrung aus den Dehnungen (bilineare Linie mit horizontalem Ast)
      // Betonspannungen über die Druckzone: Parabel-Rechteck-Verlauf aus der Dehnungsebene (40 Stützstellen)
      const et = epsTop(x), pr = [];
      for (let i = 0; i <= 40; i++) { const z = x * i / 40; pr.push({ z, sig: bt.sigmaPR(et * (1 - z / x)) }); }
      res.spannung = {
        sigC: bt.eta * bt.fcd,                                          // Spannungsblock
        sigCmax: linie === "pr" ? bt.sigmaPR(et) : bt.eta * bt.fcd,     // größte Betonspannung (Druckrand) im gewählten Modell
        pr, epsTop: et,
        sigS1: Math.min(eps(d) / 1000 * st.Es, st.fyd),                 // Zugbewehrung
        sigS2: As2 > 0 ? res.sigS2 : 0,                                 // Druckbewehrung
      };
      if (bereich2) res.hinweise.push(linie === "pr"
        ? "Bereich 2: Stahldehnung auf 25 ‰ begrenzt, die Betonstauchung am Druckrand bleibt unter ε_cu2."
        : "Bereich 2: Stahldehnung auf 25 ‰ begrenzt, der Beton ist nicht voll ausgenutzt (Spannungsblock bleibt als Näherung).");
    }
    res.druckzone = !istT ? "Rechteck-Druckzone"
      : (res.s <= q.hf ? "Druckzone im Gurt (wie Rechteck mit b_eff)" : "Druckzone reicht in den Steg");

    // ---- omega-Verfahren: dimensionslose Größen (Rechnung mit b = b_eff im Gurt, sonst Stegbreite) ----
    if (modus === "omega") {
      const bRef = istT ? q.bf : q.b, nenner = bRef * d * bt.fcd;
      const o = {
        bRef, mu: M / (nenner * d), muLim: lim.M / (nenner * d),
        omega1: (As1 * st.fyd - N) / nenner,                       // As1 = (omega1·b·d·fcd + NEd) / sigma_sd
        sigmaSd: st.fyd, xi: x / d,
      };
      o.zeta = As2 > 0 ? null : M / (druckModell(x).F * d);          // z/d (nur einfach bewehrt)
      if (As2 > 0) { o.omega1lim = lim.F / nenner; o.omega2 = As2 * res.sigS2 / nenner; o.domega = (M - lim.M) / (nenner * d * (1 - q.d2 / d)); }
      res.omega = o;
      if (istT && res.s > q.hf) res.hinweise.push("ω-Verfahren: Druckzone reicht in den Steg – ω bezieht sich auf b_eff, die Rechnung erfolgt über die Integration des Parabel-Rechteck-Diagramms (Tafelwerte gelten für Rechteck).");
    }
    if (N !== 0) {
      res.hinweise.push(`Normalkraft N_Ed = ${NEd.toFixed(1)} kN (${NEd < 0 ? "Druck" : "Zug"}) im Betonschwerpunkt: M_Eds = M_Ed − N_Ed·z_s1 = ${(M / 1e6).toFixed(1)} kNm mit z_s1 = ${(zs1 / 10).toFixed(1)} cm.`);
      if (As1 < 0) res.hinweise.push("Zugbewehrung rechnerisch nicht erforderlich (Druckkraft überwiegt) – Mindestbewehrung bzw. Bewehrung von Druckgliedern (EC 2, 9.5) beachten; Knicken/Theorie II. Ordnung ist nicht berücksichtigt.");
    }

    // Mindest- und Höchstbewehrung (EC 2, 9.2.1.1), b_t = Stegbreite bzw. Breite
    res.AsMin = Math.max(0.26 * bt.fctm / st.fyk * q.b * d, 0.0013 * q.b * d);
    res.AsMax = 0.04 * q.Ac;
    res.As1erf = Math.max(As1, 0);
    res.As1 = Math.max(As1, res.AsMin);
    res.As2 = As2;
    res.AsMaxOk = (res.As1 + As2) <= res.AsMax;
    res.xiOk = res.xi <= bt.xiLim + 1e-9;

    if (q.typ === "plattenbalken" && negativ) {
      res.hinweise.push("Negatives Moment: Druckzone im Steg (Rechteck b_w). Mindestbewehrung der Gurtzugzone bitte gesondert prüfen.");
    }
    return res;
  }

  /** Bewehrungsvorschlag: Anzahl Stäbe je Durchmesser für die Fläche As [mm²]. */
  static vorschlag(As) {
    return [8, 10, 12, 14, 16, 20, 25, 28, 32].map(dm => {
      const A1 = Math.PI * dm * dm / 4;
      const n = Math.max(1, Math.ceil(As / A1 - 1e-9));
      return { dm, n, As: n * A1 };
    });
  }
}

/* ======================= Expositionsklassen, Betondeckung, Bewehrungswahl ======================= */

/**
 * Expositionsklassen nach DIN EN 206-1/DIN 1045-2 mit den Anforderungen aus DIN EN 1992-1-1/NA
 * (Tab. E.1DE: Mindestfestigkeitsklasse, Tab. 4.3DE/4.4DE: Strukturklasse und c_min,dur).
 * Alle Tabellenwerte sind vor der Anwendung an der Norm zu prüfen.
 * spalte = Spalte der Tabelle 4.4DE (0 X0, 1 XC1, 2 XC2/XC3, 3 XC4, 4 XD1/XS1, 5 XD2/XS2, 6 XD3/XS3, null = ohne Einfluss)
 * fckRed = Betonfestigkeit [N/mm²], ab der die Strukturklasse um 1 verringert werden darf (Tab. 4.3DE)
 */
class Expositionsklassen {
  static GRUPPEN = {
    XC: { titel: "Karbonatisierung (XC)", klassen: [
      { id: "XC1", text: "trocken oder ständig nass", fck: 16, spalte: 1, fckRed: 30 },
      { id: "XC2", text: "nass, selten trocken", fck: 16, spalte: 2, fckRed: 35 },
      { id: "XC3", text: "mäßige Feuchte", fck: 20, spalte: 2, fckRed: 35 },
      { id: "XC4", text: "wechselnd nass und trocken", fck: 25, spalte: 3, fckRed: 40 }] },
    XD: { titel: "Chloride, nicht Meerwasser (XD)", klassen: [
      { id: "XD1", text: "mäßige Feuchte", fck: 30, spalte: 4, fckRed: 40 },
      { id: "XD2", text: "nass, selten trocken", fck: 35, spalte: 5, fckRed: 40 },
      { id: "XD3", text: "wechselnd nass und trocken", fck: 35, spalte: 6, fckRed: 45 }] },
    XS: { titel: "Meerwasser (XS)", klassen: [
      { id: "XS1", text: "salzhaltige Luft", fck: 30, spalte: 4, fckRed: 40 },
      { id: "XS2", text: "unter Wasser", fck: 35, spalte: 5, fckRed: 40 },
      { id: "XS3", text: "Tidebereich, Spritzwasser", fck: 35, spalte: 6, fckRed: 45 }] },
    XF: { titel: "Frost (XF), mit Luftporen angesetzt", klassen: [
      { id: "XF1", text: "mäßige Wassersättigung, ohne Taumittel", fck: 25, spalte: null },
      { id: "XF2", text: "mäßige Wassersättigung, mit Taumittel", fck: 25, spalte: null },
      { id: "XF3", text: "hohe Wassersättigung, ohne Taumittel", fck: 25, spalte: null },
      { id: "XF4", text: "hohe Wassersättigung, mit Taumittel", fck: 30, spalte: null }] },
    XA: { titel: "chemischer Angriff (XA)", klassen: [
      { id: "XA1", text: "schwach angreifend", fck: 25, spalte: null },
      { id: "XA2", text: "mäßig angreifend", fck: 35, spalte: null },
      { id: "XA3", text: "stark angreifend", fck: 35, spalte: null }] },
    XM: { titel: "Verschleiß (XM)", klassen: [
      { id: "XM1", text: "mäßiger Verschleiß", fck: 30, spalte: null, zuschlag: 5 },
      { id: "XM2", text: "starker Verschleiß", fck: 35, spalte: null, zuschlag: 10 },
      { id: "XM3", text: "sehr starker Verschleiß", fck: 35, spalte: null, zuschlag: 15 }] },
  };
  /** Tab. 4.4DE (Betonstahl): c_min,dur [mm] je Strukturklasse S1..S6 und Spalte (X0, XC1, XC2/3, XC4, XD1/XS1, XD2/XS2, XD3/XS3) */
  static CMIN_DUR = [
    [10, 10, 10, 15, 20, 25, 30], [10, 10, 15, 20, 25, 30, 35], [10, 10, 20, 25, 30, 35, 40],
    [10, 15, 25, 30, 35, 40, 45], [15, 20, 30, 35, 40, 45, 50], [20, 25, 35, 40, 45, 50, 55],
  ];

  /** Klasse zur Betonfestigkeit fck [N/mm²] (nächsthöhere Klasse der Liste). */
  static klasseZuFck(fck) {
    const k = BETONKLASSEN.find(b => b[1] >= fck);
    return k ? k[0] : BETONKLASSEN[BETONKLASSEN.length - 1][0];
  }

  /**
   * @param {string[]} auswahl gewählte Expositionsklassen, z. B. ["XC4","XF1"] (leer = X0)
   * @param {{nutzung100:boolean, platte:boolean, fck:number}} opt 100 Jahre Nutzungsdauer, Plattengeometrie, gewählte Betonfestigkeit
   * @returns {{fckMin:number, klasseMin:string, cminDur:number, strukturklasse:number, schritte:string[], massgebend:string}}
   */
  static bewerte(auswahl, { nutzung100 = false, platte = false, fck = 0 } = {}) {
    const alle = Object.values(Expositionsklassen.GRUPPEN).flatMap(g => g.klassen);
    const gew = auswahl.map(id => alle.find(k => k.id === id)).filter(Boolean);
    const schritte = [];
    const fckMin = Math.max(12, ...gew.map(k => k.fck));
    const massgebend = gew.length ? gew.reduce((a, k) => k.fck > a.fck ? k : a).id : "X0";

    // Strukturklasse: Ausgangswert S3 (Deutschland, 50 Jahre; EC 2 empfiehlt S4); Zuschläge/Abminderungen nach Tab. 4.3DE
    let S = 3;
    if (nutzung100) { S += 2; schritte.push("Nutzungsdauer 100 Jahre: +2"); }
    // Abminderung Betonfestigkeit nur, wenn alle Klassen mit Einfluss die Festigkeit erfüllen
    const mitSpalte = gew.filter(k => k.spalte !== null);
    if (mitSpalte.length && mitSpalte.every(k => fck >= k.fckRed)) { S -= 1; schritte.push("Festigkeitsklasse über der Abminderungsgrenze: −1"); }
    if (platte) { S -= 1; schritte.push("Plattengeometrie (Bewehrungslage unverändert durch Bauablauf): −1"); }
    S = Math.min(6, Math.max(1, S));

    // c_min,dur: größter Wert der Klassen mit Einfluss; NA DE: Sicherheitszuschlag Δc_dur,γ bei XD1/XS1 (+10 mm) und XD2/XS2 (+5 mm)
    let cminDur = Expositionsklassen.CMIN_DUR[S - 1][0];
    for (const k of mitSpalte) {
      const zg = k.spalte === 4 ? 10 : k.spalte === 5 ? 5 : 0;
      cminDur = Math.max(cminDur, Expositionsklassen.CMIN_DUR[S - 1][k.spalte] + zg);
    }
    const zuschlag = Math.max(0, ...gew.map(k => k.zuschlag || 0));
    if (zuschlag) { cminDur += zuschlag; schritte.push(`Verschleiß: c_min,dur + ${zuschlag} mm`); }

    return { fckMin, klasseMin: Expositionsklassen.klasseZuFck(fckMin), cminDur, strukturklasse: S, schritte, massgebend };
  }
}

/** Betondeckung nach EC 2, 4.4.1: c_nom = c_min + Δc_dev, c_min = max(c_min,b; c_min,dur; 10 mm). */
class Betondeckung {
  /**
   * @param {number} cminDur [mm] aus der Expositionsklasse
   * @param {number} ds Längsstabdurchmesser (größter) [mm]
   * @param {number} dsw Bügeldurchmesser [mm] (0 = ohne Bügel)
   * @param {number} dev Vorhaltemaß Δc_dev [mm] (NA DE: 10 mm)
   */
  static berechne(cminDur, ds, dsw, dev) {
    // Verbund: Bügel liegt außen -> c_min,b = d_sw; zusätzlich muss der Längsstab mindestens d_s Deckung haben
    const cminB = dsw > 0 ? Math.max(dsw, ds - dsw) : ds;
    const cmin = Math.max(cminB, cminDur, 10);
    return { cminB, cminDur, cmin, dev, cnom: cmin + dev };
  }
}

/** Wahl der Bewehrung: Stabanzahl, Lagen, lichte Abstände und Vergleich mit den Normwerten (EC 2, 8.2 / 9.3.1.1). */
class Bewehrungswahl {
  /**
   * @param {{b:number, h:number, cnom:number, dsw:number, dg:number, platte:boolean}} p alles in mm
   */
  constructor(p) { Object.assign(this, p); }

  /** Mindestabstand nach EC 2, 8.2(2): max(d_s; d_g + 5 mm; 20 mm) */
  aMin(ds) { return Math.max(ds, this.dg + 5, 20); }

  /** Bewehrung im Balken: Stäbe in Lagen. nProLage = 0 → maximal mögliche Anzahl je Lage. */
  balken(As, ds, nProLage = 0) {
    const A1 = Math.PI * ds * ds / 4, n = Math.max(2, Math.ceil(As / A1 - 1e-9));
    const bNetto = this.b - 2 * (this.cnom + this.dsw);        // Breite zwischen den Bügeln
    const amin = this.aMin(ds);
    const nMax = Math.max(1, Math.floor((bNetto + amin) / (ds + amin)));
    let nl = nProLage > 0 ? Math.min(Math.floor(nProLage), n) : nMax;
    let lagen = Math.ceil(n / nl);
    if (nProLage <= 0) nl = Math.ceil(n / lagen);               // gleichmäßig auf die Lagen verteilen
    // Stabanzahl je Lage und Schwerpunktabstand der Lagen vom Rand (Lage 1 außen, lichter Lagenabstand = a_min)
    const proLage = []; let rest = n;
    for (let i = 0; i < lagen; i++) { const k = Math.min(nl, rest); proLage.push(k); rest -= k; }
    let summe = 0;
    proLage.forEach((k, i) => { summe += k * (ds / 2 + i * (ds + amin)); });
    const d1 = this.cnom + this.dsw + summe / n;                // Rand -> Schwerpunkt der Zugbewehrung
    const avh = nl > 1 ? (bNetto - nl * ds) / (nl - 1) : null;  // lichter horizontaler Abstand
    return {
      art: "balken", ds, n, nl, lagen, proLage, As: n * A1, amin, nMax, bNetto, d1,
      avh, ok: nl > 1 ? avh >= amin - 1e-9 : bNetto >= ds, grenzText: `a_min = max(Ø; d_g+5; 20) = ${amin} mm`,
    };
  }

  /** Bewehrung in der Platte: Stäbe gleichmäßig über die Breite b (je Meter, wenn b = 1000 mm). */
  flaechig(As, ds) {
    const A1 = Math.PI * ds * ds / 4, amin = this.aMin(ds);
    const smax = Math.min(2 * this.h, 250);                      // Hauptbewehrung im Bereich des Größtmoments
    // Stabanzahl: aus A_s und zusätzlich so viele, dass s_max eingehalten wird
    const n = Math.max(1, Math.ceil(As / A1 - 1e-9), Math.ceil(this.b / smax - 1e-9));
    const s = this.b / n;
    return {
      art: "platte", ds, n, nl: n, lagen: 1, As: n * A1, amin, s, smax, avh: s - ds,
      d1: this.cnom + ds / 2, ok: s - ds >= amin - 1e-9 && s <= smax + 1e-9,
      okMin: s - ds >= amin - 1e-9, okMax: s <= smax + 1e-9,
      grenzText: `a_min = ${amin} mm (lichter Abstand), s_max = min(2h; 250 mm) = ${fmt(smax, 0)} mm`,
    };
  }
}

/* ======================= Querkraftbemessung ======================= */

/**
 * Querkraftbemessung nach DIN EN 1992-1-1 mit NA (DE), senkrechte Bügel (α = 90°), Beton ≤ C50/60.
 *  - ohne Querkraftbewehrung: V_Rd,c nach NA, Gl. (6.2a) mit V_Rd,c,min
 *  - mit Querkraftbewehrung: Fachwerkmodell, V_Rd,max und erforderliche a_sw mit wählbarem cot θ (1,0 ≤ cot θ ≤ cot θ_max ≤ 3,0)
 * Intern: N, mm, N/mm².
 */
class Querkraftbemessung {
  constructor(querschnitt, beton, stahl) { this.q = querschnitt; this.bt = beton; this.st = stahl; }

  /**
   * @param {{VEd:number, NEd:number, d:number, Asl:number, cotVorgabe:number, m:number, dsw:number, sVorgabe:number}} p
   *   VEd, NEd in kN (NEd: Zug +, Druck −); d, Asl [mm, mm²] (Zugbewehrung, verankert); cotVorgabe 0 = automatisch;
   *   m = Schnittigkeit der Bügel; dsw = Bügeldurchmesser [mm]; sVorgabe = Bügelabstand [mm], 0 = automatisch
   */
  bemesse(p) {
    const { q, bt, st } = this;
    const bw = q.b, d = p.d, h = q.h, fck = bt.fck, fcd = bt.fcd, fywd = st.fyd;
    const V = Math.abs(p.VEd) * 1e3;
    const res = { V, hinweise: [], bw, d };

    // ---- Betontraganteil V_Rd,c (NA DE, 6.2.2) ----
    const sigCp = Math.min(-p.NEd * 1e3 / q.Ac, 0.2 * fcd);          // Druck positiv
    const k = Math.min(2, 1 + Math.sqrt(200 / d));
    const rho = Math.min(0.02, p.Asl / (bw * d));
    const CRdc = 0.15 / GAMMA_C;
    const c = d <= 600 ? 0.0525 : d >= 800 ? 0.0375 : 0.0525 + (0.0375 - 0.0525) * (d - 600) / 200;
    const vmin = c / GAMMA_C * Math.pow(k, 1.5) * Math.sqrt(fck);
    const vRdc = CRdc * k * Math.pow(100 * rho * fck, 1 / 3) + 0.12 * sigCp;
    const vRdcMin = vmin + 0.12 * sigCp;
    Object.assign(res, { sigCp, k, rho, CRdc, vmin, VRdc: Math.max(vRdc, vRdcMin) * bw * d, VRdcMinMassgebend: vRdcMin > vRdc });
    res.noetigBew = V > res.VRdc;
    res.ausnutzungC = V / res.VRdc;

    // ---- Fachwerkmodell ----
    const z = 0.9 * d;
    const nu1 = 0.75 * Math.min(1, 1.1 - fck / 500);
    const faktor = bw * z * nu1 * fcd;                                // V_Rd,max = faktor / (cot + tan)
    const VRdmax = cot => faktor / (cot + 1 / cot);
    const VRdcc = 0.5 * 0.48 * Math.pow(fck, 1 / 3) * (1 - 1.2 * sigCp / fcd) * bw * z;
    const cotMax = V > VRdcc ? Math.min(3, (1.2 + 1.4 * sigCp / fcd) / (1 - VRdcc / V)) : 3;
    const cotMin = 1;
    // größtes zulässiges cot θ, bei dem V_Rd,max noch ausreicht: cot + 1/cot <= faktor / V
    const cr = faktor / V;
    const cotTrag = cr >= 2 ? (cr + Math.sqrt(cr * cr - 4)) / 2 : 1;
    let cot = p.cotVorgabe > 0 ? p.cotVorgabe : Math.max(cotMin, Math.min(cotMax, cotTrag));
    if (cot < cotMin - 1e-9 || cot > cotMax + 1e-9) {
      res.hinweise.push(`cot θ = ${cot.toFixed(2)} liegt außerhalb des zulässigen Bereichs ${cotMin.toFixed(1)} … ${cotMax.toFixed(2)}.`);
      res.cotUnzulaessig = true;
    }
    res.z = z; res.nu1 = nu1; res.VRdcc = VRdcc; res.cotMax = cotMax; res.cotMin = cotMin; res.cot = cot;
    res.VRdmax = VRdmax(cot); res.okMax = V <= res.VRdmax + 1e-6; res.ausnutzungMax = V / res.VRdmax;

    // ---- Bügel ----
    const aswErf = V / (z * fywd * cot);                              // [mm²/mm]
    const rhoMin = 0.16 * bt.fctm / st.fyk;                           // NA DE, Gl. (9.5aDE)
    const aswMin = rhoMin * bw;
    const Aw1 = Math.PI * p.dsw * p.dsw / 4, schn = p.m * Aw1;         // Querschnittsfläche je Bügel
    res.aswErf = aswErf; res.aswMin = aswMin; res.rhoMin = rhoMin;
    res.aswMass = res.noetigBew ? Math.max(aswErf, aswMin) : aswMin;   // ohne Nachweisbedarf: konstruktive Mindestbewehrung
    res.schnittflaeche = schn; res.dsw = p.dsw; res.m = p.m;
    const rel = V / res.VRdmax;
    const sTab = rel <= 0.3 ? Math.min(0.7 * h, 300) : rel <= 0.6 ? Math.min(0.5 * h, 300) : Math.min(0.25 * h, 200);
    res.sMax = Math.min(sTab, 0.75 * d);
    res.sErf = schn / res.aswMass;
    res.s = p.sVorgabe > 0 ? p.sVorgabe : Math.max(50, Math.floor(Math.min(res.sErf, res.sMax) / 25) * 25);
    res.aswVorh = schn / res.s;
    res.okAsw = res.aswVorh + 1e-9 >= res.aswMass;
    res.okS = res.s <= res.sMax + 1e-9;
    res.dFtd = 0.5 * V * cot;                                          // zusätzliche Längszugkraft (Versatzmaß)
    res.dAs = res.dFtd / st.fyd;
    if (res.sErf < 75) res.hinweise.push("Erforderlicher Bügelabstand unter 75 mm: größeren Bügeldurchmesser oder höhere Schnittigkeit wählen.");
    if (!res.okMax) res.hinweise.push("V_Ed > V_Rd,max: Druckstrebe überlastet. Querschnitt (b_w, h) oder Betonfestigkeit erhöhen.");
    if (q.typ === "plattenbalken") res.hinweise.push("Plattenbalken: Nachweis mit der Stegbreite b_w; der Gurtanschluss (Schubkraft zwischen Gurt und Steg) ist nicht erfasst.");
    return res;
  }
}
