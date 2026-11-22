"use strict";

/**
 * stahlbeton.js - Biegebemessung im Stahlbetonbau nach DIN EN 1992-1-1 mit DE-NA.
 *
 * Annahmen:
 *  - Betonarbeitslinie wählbar: Parabel-Rechteck-Diagramm (EC 2, 3.1.7(1), numerische Integration über
 *    die Druckzone) oder rechteckiger Spannungsblock (EC 2, 3.1.7(3)) mit lambda und eta
 *  - fcd = alpha_cc * fck / gamma_c mit alpha_cc = 0,85 (NA DE), gamma_c = 1,5
 *  - Betonstahl B500B, Stahlspannungs-Dehnungs-Linie bilinear mit horizontalem Ast
 *  - Reine Biegung (NEd = 0), Grundkombination (gamma_s = 1,15)
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
   * @param {string} modus 'pr' = Parabel-Rechteck-Diagramm, 'block' = rechteckiger Spannungsblock
   * @returns {Object} Ergebnis (Längen in mm, Flächen in mm²)
   */
  bemesse(MEd, modus = "pr") {
    const { q, beton: bt, stahl: st } = this;
    const negativ = MEd < 0;
    const M = Math.abs(MEd) * 1e6;                       // [Nmm]
    const istT = q.typ === "plattenbalken" && !negativ;  // Gurt in der Druckzone?
    const d = q.h - q.d1;                                // statische Nutzhöhe
    const a = bt.eta * bt.fcd;                           // Spannungsblock [N/mm²]
    const lam = bt.lambda;

    const res = {
      negativ, istT, d, modus, hinweise: [], fehler: null,
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
    const druckModell = modus === "pr" ? druckPR : druck;          // gewählte Arbeitslinie

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
      As1 = druckModell(x).F / st.fyd;
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
      As1 = (lim.F + As2 * sig2) / st.fyd;
      x = xLim;
      res.sigS2 = sig2;
      res.fall = "Doppelt bewehrt (Druckbewehrung erforderlich)";
      res.hinweise.push("Verdrängter Beton im Bereich der Druckbewehrung wird vernachlässigt.");
    }

    res.x = x; res.xi = x / d;
    res.sBlock = lam * x;                                           // Höhe des Spannungsblocks
    res.s = modus === "pr" ? x : lam * x;                           // Höhe der Druckzone im gewählten Modell
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
        sigCmax: modus === "pr" ? bt.sigmaPR(et) : bt.eta * bt.fcd,     // größte Betonspannung (Druckrand) im gewählten Modell
        pr, epsTop: et,
        sigS1: Math.min(eps(d) / 1000 * st.Es, st.fyd),                 // Zugbewehrung
        sigS2: As2 > 0 ? res.sigS2 : 0,                                 // Druckbewehrung
      };
      if (bereich2) res.hinweise.push(modus === "pr"
        ? "Bereich 2: Stahldehnung auf 25 ‰ begrenzt, die Betonstauchung am Druckrand bleibt unter ε_cu2."
        : "Bereich 2: Stahldehnung auf 25 ‰ begrenzt, der Beton ist nicht voll ausgenutzt (Spannungsblock bleibt als Näherung).");
    }
    res.druckzone = !istT ? "Rechteck-Druckzone"
      : (res.s <= q.hf ? "Druckzone im Gurt (wie Rechteck mit b_eff)" : "Druckzone reicht in den Steg");

    // Mindest- und Höchstbewehrung (EC 2, 9.2.1.1), b_t = Stegbreite bzw. Breite
    res.AsMin = Math.max(0.26 * bt.fctm / st.fyk * q.b * d, 0.0013 * q.b * d);
    res.AsMax = 0.04 * q.Ac;
    res.As1erf = As1;
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
