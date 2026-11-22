"use strict";

/**
 * spannung.js - Elastische Normalspannungen nach Navier (Biegung + Normalkraft).
 *
 * Vorzeichen:
 *   N  > 0 : Zug
 *   My > 0 : Zug auf der Seite z > 0 (unten)
 *   Mz > 0 : Zug auf der Seite y > 0 (rechts)
 *   sigma > 0 : Zug, sigma < 0 : Druck
 * Koordinaten (y, z) in mm, Ursprung im Schwerpunkt, z nach unten. Bei unsymmetrischen Querschnitten
 * (Iyz ≠ 0) wird die schiefe Biegung über das Deviationsmoment erfasst.
 * Eingabe: N in kN, M in kNm. Ausgabe: Spannung in N/mm².
 */
class Spannung {
  /**
   * @param {Querschnitt} q
   * @param {number} N  Normalkraft [kN]
   * @param {number} My Moment um die y-Achse [kNm]
   * @param {number} Mz Moment um die z-Achse [kNm]
   */
  constructor(q, N = 0, My = 0, Mz = 0) {
    this.q = q; this.N = N; this.My = My; this.Mz = Mz;
  }

  /**
   * Koeffizienten der Spannungsebene sigma = a0 + bz*z + by*y.
   * Allgemein (auch bei Iyz ≠ 0) aus  My = bz·Iy + by·Iyz  und  Mz = bz·Iyz + by·Iz.
   * Für Iyz = 0 ergibt sich bz = My/Iy und by = Mz/Iz.
   */
  get koeff() {
    const q = this.q, My = this.My * 1e6, Mz = this.Mz * 1e6;
    const D = q.Iy * q.Iz - q.Iyz ** 2;
    return {
      a0: this.N * 1e3 / q.A,
      bz: (My * q.Iz - Mz * q.Iyz) / D,
      by: (Mz * q.Iy - My * q.Iyz) / D,
    };
  }

  /** Spannung am Punkt (y, z) [N/mm²] */
  sigma(y, z) {
    const { a0, bz, by } = this.koeff;
    return a0 + bz * z + by * y;
  }

  /** Größte Zug- und Druckspannung (liegen immer am Rand des Querschnitts). */
  extremwerte() {
    let min = { wert: Infinity, y: 0, z: 0 };
    let max = { wert: -Infinity, y: 0, z: 0 };
    for (const p of this.q.randpunkte(360)) {
      const s = this.sigma(p.y, p.z);
      if (s > max.wert) max = { wert: s, y: p.y, z: p.z };
      if (s < min.wert) min = { wert: s, y: p.y, z: p.z };
    }
    return { min, max };
  }

  /**
   * Spannungsnulllinie (sigma = 0) als Strecke innerhalb des Umrandungsrechtecks.
   * @returns {Array|null} zwei Punkte {y,z} oder null (kein Nulldurchgang)
   */
  nulllinie() {
    const { a0, bz, by } = this.koeff;
    const { ymin, ymax, zmin, zmax } = this.q;
    const eps = 1e-12, tol = 1e-9;
    const pts = [];
    if (Math.abs(bz) > eps) {
      for (const y of [ymin, ymax]) {
        const z = -(a0 + by * y) / bz;
        if (z >= zmin - tol && z <= zmax + tol) pts.push({ y, z });
      }
    }
    if (Math.abs(by) > eps) {
      for (const z of [zmin, zmax]) {
        const y = -(a0 + bz * z) / by;
        if (y >= ymin - tol && y <= ymax + tol) pts.push({ y, z });
      }
    }
    if (pts.length < 2) return null;
    // die beiden am weitesten entfernten Schnittpunkte wählen
    let best = [pts[0], pts[1]], dmax = -1;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].y - pts[j].y, pts[i].z - pts[j].z);
        if (d > dmax) { dmax = d; best = [pts[i], pts[j]]; }
      }
    }
    return dmax > tol ? best : null;
  }
}


/**
 * Schubspannungen aus Querkräften nach Jourawski:  τ = V · S / (I · b)
 *  - Vz: waagerechte Schnitte (Sehne b(z) = Materialbreite, S = statisches Moment der Fläche darüber),
 *  - Vy: senkrechte Schnitte (Sehne b(y), S = statisches Moment der Fläche links davon).
 * Der Schubspannungsvektor wird aus beiden Anteilen zusammengesetzt: τ = √(τ_z² + τ_y²).
 * Das Verfahren liefert die mittlere Schubspannung über die Sehne (gut für dünnwandige Querschnitte und
 * Vollquerschnitte); Torsion und Schubmittelpunkt sind nicht berücksichtigt. Bei Iyz ≠ 0 nur genähert.
 * Eingabe: V in kN. Ausgabe: N/mm².
 */
class Schubspannung {
  constructor(q, Vy = 0, Vz = 0) {
    this.q = q; this.Vy = Vy; this.Vz = Vz;
    this._tab = {};
  }

  /** Tabelle S(c) und b(c) entlang der Koordinate ko ('z' oder 'y'), in Schwerpunktkoordinaten. */
  _tabelle(ko) {
    if (this._tab[ko]) return this._tab[ko];
    const q = this.q, n = 240;
    const off = ko === "z" ? q.zs : q.ys;
    const lo = ko === "z" ? q.zmin : q.ymin, hi = ko === "z" ? q.zmax : q.ymax;
    const dc = (hi - lo) / n, eps = (hi - lo) * 2e-4;
    const S = [], b = [];
    for (let i = 0; i <= n; i++) {
      const g = lo + i * dc + off;                      // lokale Koordinate des Schnitts
      const r = q.bis(ko, g);
      S.push(Math.abs(r.A * (off - g) + r.S));          // statisches Moment bezogen auf die Schwerachse
      b.push(Math.max(0, (q.bis(ko, g + eps).A - q.bis(ko, g - eps).A) / (2 * eps))); // Sehnenlänge = dA/dc
    }
    return (this._tab[ko] = { lo, dc, n, S, b });
  }

  /** Schubspannung S·V/(I·b) an der Stelle c (Schwerpunktkoordinate) für Schnitte senkrecht zu ko. */
  _anteil(ko, c, V, I) {
    if (!V) return 0;
    const t = this._tabelle(ko);
    const x = (c - t.lo) / t.dc;
    if (x < 0 || x > t.n) return 0;
    const i = Math.min(t.n - 1, Math.floor(x)), f = x - i;
    const S = t.S[i] + f * (t.S[i + 1] - t.S[i]);
    const b = t.b[i] + f * (t.b[i + 1] - t.b[i]);
    return b > 1e-6 ? Math.abs(V) * 1e3 * S / (I * b) : 0;
  }

  /** Schubspannungsanteile und Betrag am Punkt (y, z) [N/mm²]. */
  tau(y, z) {
    const tz = this._anteil("z", z, this.Vz, this.q.Iy);
    const ty = this._anteil("y", y, this.Vy, this.q.Iz);
    return { tz, ty, t: Math.hypot(tz, ty) };
  }
}

/**
 * Skalarfeld über dem Querschnitt für die Darstellung und den Nachweis:
 *  art = 'sigma' : Normalspannung σ (vorzeichenbehaftet)
 *  art = 'tau'   : Schubspannung τ
 *  art = 'v'     : Vergleichsspannung σ_v = √(σ² + 3τ²)   (EN 1993-1-1, 6.2.1(5), ohne σ_z)
 * Bietet dieselbe Schnittstelle wie Spannung (sigma, extremwerte, nulllinie), damit Ansicht3D alle Felder zeigen kann.
 */
class Spannungsfeld {
  constructor(spannung, schub, art = "sigma") {
    this.sp = spannung; this.schub = schub; this.art = art; this.q = spannung.q;
  }
  get vorzeichen() { return this.art === "sigma"; }
  get titel() { return { sigma: "σ", tau: "τ", v: "σ_v" }[this.art]; }

  sigma(y, z) {
    const s = this.sp.sigma(y, z);
    if (this.art === "sigma") return s;
    const t = this.schub.tau(y, z).t;
    return this.art === "tau" ? t : Math.sqrt(s * s + 3 * t * t);
  }

  /** Extremwerte über Randpunkte und Zellmittelpunkte (Ergebnis wird zwischengespeichert). */
  extremwerte() {
    if (this.art === "sigma") return this.sp.extremwerte();
    if (this._ext) return this._ext;
    let min = { wert: Infinity, y: 0, z: 0 }, max = { wert: -Infinity, y: 0, z: 0 };
    const pruefe = p => {
      const w = this.sigma(p.y, p.z);
      if (w > max.wert) max = { wert: w, y: p.y, z: p.z };
      if (w < min.wert) min = { wert: w, y: p.y, z: p.z };
    };
    this.q.randpunkte(360).forEach(pruefe);
    this.q.zellenAuto(2500).forEach(pruefe);
    return (this._ext = { min, max });
  }

  nulllinie() { return this.art === "sigma" ? this.sp.nulllinie() : null; }
}
