"use strict";

/**
 * tragfaehigkeit.js - Querschnittstragfähigkeit von Stahlquerschnitten nach EN 1993-1-1 (NA DE).
 *
 * Berechnet für einen Querschnitt (aus querschnitte.js / profile.js):
 *  - elastische und plastische Biegetragfähigkeit M_el,Rd und M_pl,Rd (um y und z)
 *  - Querschnittsklassen und maßgebende Biegetragfähigkeit M_c,Rd
 *  - plastische Normalkrafttragfähigkeit N_pl,Rd
 *  - plastische Querkrafttragfähigkeit V_pl,Rd
 *  - Torsion (St. Venant): T_Rd und Torsion mit Querkraft nach EN 1993-1-1, 6.2.7 (Klasse TorsionsNachweis)
 * Biegung, Normalkraft und Querkraft werden einzeln betrachtet (keine Interaktion).
 * Einheiten: Eingang mm, N/mm²; Ausgang kN und kNm.
 */

/** Baustahlgüten: [Name, Streckgrenze f_y in N/mm² für t ≤ 40 mm] (EN 10025, EN 1993-1-1 Tab. 3.1). */
const STAHLGUETEN = [["S235", 235], ["S275", 275], ["S355", 355], ["S420", 420], ["S460", 460]];

class Stahlbemessung {
  /**
   * @param {Querschnitt} q Querschnitt
   * @param {number} fy Streckgrenze [N/mm²]
   * @param {number} gammaM0 Teilsicherheitsbeiwert (NA DE: 1,0)
   */
  constructor(q, fy, gammaM0 = 1.0) {
    this.q = q; this.fy = fy; this.g = gammaM0;
  }

  /** Biegetragfähigkeit um eine Achse ('y' oder 'z'). */
  biegung(achse, klassen) {
    const q = this.q;
    const Wel = achse === "y" ? q.Wely : q.Welz;
    const pl = q.plastisch(achse);
    const Mel = Wel * this.fy / this.g / 1e6;   // kNm
    const Mpl = pl.W * this.fy / this.g / 1e6;  // kNm

    // maßgebende Tragfähigkeit M_c,Rd nach Querschnittsklasse
    const kl = klassen ? klassen[achse === "y" ? "biegungY" : "biegungZ"] : null;
    let Mc = null;
    if (kl) {
      if (kl.klasse <= 2) Mc = Mpl;        // Klasse 1, 2: plastisch
      else if (kl.klasse === 3) Mc = Mel;  // Klasse 3: elastisch
      // Klasse 4: wirksamer Querschnitt nicht berechnet
    }
    return {
      Wel, Wpl: pl.W, alpha: pl.W / Wel, lage: pl.lage,
      Mel, Mpl, Mc, klasse: kl ? kl.klasse : null,
    };
  }

  /** Alle Tragfähigkeiten berechnen. */
  berechne() {
    const q = this.q, fy = this.fy;
    const klassen = q.klassen(fy);   // null, wenn nicht ermittelbar
    const av = q.schubflaechen();    // null, wenn nicht ermittelbar
    const schub = a => (av && av[a] ? av[a] * fy / (Math.sqrt(3) * this.g) / 1e3 : null);
    return {
      fy, eps: Klassifizierung.eps(fy), gammaM0: this.g,
      klassen, Av: av,
      klasseDruck: klassen ? klassen.druck.klasse : null,
      Npl: q.A * fy / this.g / 1e3,            // kN
      y: this.biegung("y", klassen),
      z: this.biegung("z", klassen),
      Vz: schub("z"), Vy: schub("y"),          // kN
    };
  }
}

/**
 * Torsion nach EN 1993-1-1, 6.2.7 (St.-Venant-Torsion, Wölbtorsion nicht erfasst):
 *  - elastisch:  τ_t,Ed = T_Ed / W_t ≤ f_y / (√3·γM0)  (T_Rd = W_t·f_y / (√3·γM0))
 *  - Torsion und Querkraft (6.2.7(9)): V_pl,T,Rd nach Gl. (6.26) für I/H, (6.27) für U, (6.28) für Hohlquerschnitte
 *    (alle anderen Querschnitte: linear wie (6.28), auf der sicheren Seite)
 * Die Abminderung gilt für V_z; für V_y wird (6.28) angesetzt.
 */
class TorsionsNachweis {
  constructor(q, fy, gammaM0, r) { this.q = q; this.fy = fy; this.g = gammaM0; this.r = r; }

  /** @param {number} T Torsionsmoment [kNm]; Vz, Vy in kN (Beträge) */
  berechne(T, Vz = 0, Vy = 0) {
    const k = this.q.torsion();
    const tauRd = this.fy / (Math.sqrt(3) * this.g);
    const res = { T: Math.abs(T), vorhanden: !!k, tauRd, redZ: 1, redY: 1, eta: 0 };
    if (!k) { res.eta = res.T > 0 ? Infinity : 0; return res; }
    const art = this.q.nachweisdaten() ? this.q.nachweisdaten().art : null;
    Object.assign(res, { It: k.It, Wt: k.Wt, tmax: k.tmax, art: k.art, hinweis: k.hinweis, bauart: art });
    res.TRd = k.Wt * tauRd / 1e6;                              // kNm
    res.tau = res.T * 1e6 / k.Wt;                              // maximale τ_t,Ed [N/mm²]
    res.eta = res.TRd > 0 ? res.T / res.TRd : Infinity;
    const x = res.tau / tauRd;
    const wurzel = Math.sqrt(Math.max(0, 1 - x / 1.25));
    if (art === "I") res.redZ = wurzel;                        // Gl. (6.26)
    else if (art === "U") {                                     // Gl. (6.27): zusätzlich τ_w,Ed aus V_Ed
      const Aw = this.r && this.r.Av && this.r.Av.z ? this.r.Av.z : null;
      res.redZ = wurzel - (Aw ? Vz * 1e3 / Aw / tauRd : 0);
    } else res.redZ = 1 - x;                                    // Gl. (6.28)
    res.redY = 1 - x;
    res.redZ = Math.max(0, res.redZ); res.redY = Math.max(0, res.redY);
    return res;
  }
}

/**
 * Plastischer Querschnittsnachweis (Verfahren E-P, EN 1993-1-1, 6.2.8 bis 6.2.10) für Klasse 1 und 2:
 *  - Querkraft:           V_Ed / V_pl,Rd ≤ 1
 *  - Biegung und Querkraft: ρ = (2·V_Ed/V_pl,Rd − 1)² bei V_Ed > 0,5·V_pl,Rd; M_V,Rd mit abgeminderter Streckgrenze im Schubbereich
 *  - Biegung und Normalkraft: M_N,Rd für I/H (Gl. 6.36, 6.37) und Hohlprofile (6.39, 6.40), sonst numerisch exakt (±f_yd-Blöcke)
 *  - Zweiachsige Biegung mit N: [M_y/M_N,y]^α + [M_z/M_N,z]^β ≤ 1 (Gl. 6.41)
 * Bei gleichzeitiger Querkraft wird M_N,V,Rd = M_N,Rd · M_V,Rd / M_pl,Rd angesetzt (abgeminderte Streckgrenze im Schubbereich).
 * Eingabe: N, V in kN, M in kNm; Ausgabe kNm bzw. kN.
 */
class PlastischerNachweis {
  /**
   * @param {Querschnitt} q
   * @param {number} fy Streckgrenze [N/mm²]
   * @param {number} gammaM0
   * @param {Object} r Ergebnis von Stahlbemessung.berechne() (Npl, Vz, Vy, Av, klassen)
   */
  constructor(q, fy, gammaM0, r) {
    this.q = q; this.fyd = fy / gammaM0; this.g = gammaM0; this.r = r;
    this.d = q.nachweisdaten();
  }

  /** Hebelarm des Schubbereichs (Steg bzw. Flansche) für W_v = A_v·Hebelarm/4; null = ganzer Querschnitt (W_pl). */
  _hebel(ax) {
    const d = this.d;
    if (!d) return null;
    if (d.art === "I" || d.art === "U") return ax === "y" ? d.h - 2 * d.tf : (d.art === "I" ? d.b : null);
    if (d.art === "RHS") return ax === "y" ? d.h - 2 * d.t : d.b - 2 * d.t;
    return null;
  }

  /** M_N,Rd [kNm] ohne Querkraftabminderung für Biegung um die Achse ax bei Normalkraft N [kN]. */
  _MN(ax, n, Mpl, N) {
    const d = this.d, A = this.q.A;
    if (n >= 1) return 0;
    if (d && d.art === "I") {
      const a = Math.min((A - 2 * d.b * d.tf) / A, 0.5);
      if (ax === "y") return Math.min(Mpl, Mpl * (1 - n) / (1 - 0.5 * a));
      return n <= a ? Mpl : Mpl * (1 - ((n - a) / (1 - a)) ** 2);
    }
    if (d && d.art === "RHS") {
      const a = Math.min((A - (ax === "y" ? 2 * d.b : 2 * d.h) * d.t) / A, 0.5);
      return Math.min(Mpl, Mpl * (1 - n) / (1 - 0.5 * a));
    }
    return Math.min(Mpl, this.q.plastischN(ax, N * 1e3, this.fyd) / 1e6);   // allgemein: numerisch
  }

  /** Nachweiswerte einer Biegeachse. ax = 'y' (My, Vz) oder 'z' (Mz, Vy). */
  _achse(ax, N, V, M, red = 1) {
    const q = this.q, r = this.r, fyd = this.fyd;
    const pl = q.plastisch(ax), Wpl = pl.W;
    const Mpl = Wpl * fyd / 1e6;
    const Vpl0 = ax === "y" ? r.Vz : r.Vy;
    const Vpl = Vpl0 ? Vpl0 * red : Vpl0;                       // ggf. durch Torsion abgemindert (V_pl,T,Rd)
    const Av = r.Av ? (ax === "y" ? r.Av.z : r.Av.y) : null;
    const n = Math.abs(N) / r.Npl;

    const Vabs = Math.abs(V);
    const etaV = Vpl ? Vabs / Vpl : (Vabs > 0 ? Infinity : 0);
    const rho = Vpl && Vabs > 0.5 * Vpl ? (2 * Vabs / Vpl - 1) ** 2 : 0;
    const hebel = this._hebel(ax);
    const Wv = Av && hebel ? Math.min(Wpl, Av * hebel / 4) : Wpl;       // plastisches Widerstandsmoment des Schubbereichs
    const MV = Math.max(0, (Wpl - rho * Wv)) * fyd / 1e6;
    const MN = this._MN(ax, n, Mpl, N);
    const MNV = MN * MV / Mpl;
    return { V: Vabs, Vpl, etaV, rho, Mpl, MV, MN, MNV, M: Math.abs(M), Wv };
  }

  /** Nachweis für die Schnittgrößen (N Zug +, V und M beliebiges Vorzeichen). */
  berechne(N, Vy, Vz, My, Mz, T = 0) {
    const r = this.r, art = this.d ? this.d.art : null;
    const n = Math.abs(N) / r.Npl;
    const tors = new TorsionsNachweis(this.q, this.fyd * this.g, this.g, r).berechne(T, Math.abs(Vz), Math.abs(Vy));
    const y = this._achse("y", N, Vz, My, tors.redZ), z = this._achse("z", N, Vy, Mz, tors.redY);

    // Exponenten der Interaktion (6.41)
    let alpha = 1, beta = 1, bem = "allgemeiner Querschnitt: linearer Ansatz (auf der sicheren Seite)";
    if (art === "I") { alpha = 2; beta = Math.max(5 * n, 1); bem = "I/H: α = 2, β = 5n ≥ 1"; }
    else if (art === "RHS") { alpha = beta = Math.min(1.66 / (1 - 1.13 * n * n), 6); bem = "Hohlprofil: α = β = 1,66/(1 − 1,13n²) ≤ 6"; }
    else if (art === "CHS") { alpha = beta = 2; bem = "Rohr: α = β = 2"; }

    const teil = (m, mn, e) => (m <= 1e-12 ? 0 : mn <= 1e-12 ? Infinity : (m / mn) ** e);
    const eta = n >= 1 && (y.M > 0 || z.M > 0 || n > 1) ? Infinity : teil(y.M, y.MNV, alpha) + teil(z.M, z.MNV, beta);

    // Gültigkeit: plastische Nachweise nur für Klasse 1 und 2
    let klasseMax = null;
    // maßgebend ist nur die Klasse der tatsächlich vorhandenen Beanspruchung (Druck, Biegung y, Biegung z)
    if (r.klassen) {
      const ks = [];
      if (N < 0) ks.push(r.klassen.druck.klasse);
      if (My !== 0) ks.push(r.klassen.biegungY.klasse);
      if (Mz !== 0) ks.push(r.klassen.biegungZ.klasse);
      if (!ks.length) ks.push(r.klassen.biegungY.klasse, r.klassen.biegungZ.klasse);
      klasseMax = Math.max(...ks);
    }
    return {
      n, art, y, z, alpha, beta, bem, eta, klasseMax, tors,
      zulaessig: klasseMax === null ? null : klasseMax <= 2,
      etaMax: Math.max(eta, y.etaV, z.etaV, n, tors.eta),
    };
  }
}
