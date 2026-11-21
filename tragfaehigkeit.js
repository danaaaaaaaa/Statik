"use strict";

/**
 * tragfaehigkeit.js - Querschnittstragfähigkeit von Stahlquerschnitten nach EN 1993-1-1 (NA DE).
 *
 * Berechnet für einen Querschnitt (aus querschnitte.js / profile.js):
 *  - elastische und plastische Biegetragfähigkeit M_el,Rd und M_pl,Rd (um y und z)
 *  - Querschnittsklassen und maßgebende Biegetragfähigkeit M_c,Rd
 *  - plastische Normalkrafttragfähigkeit N_pl,Rd
 *  - plastische Querkrafttragfähigkeit V_pl,Rd
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
