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
