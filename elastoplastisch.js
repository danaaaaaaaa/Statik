"use strict";

/**
 * elastoplastisch.js - Spannungsverteilung für elastisch-ideal-plastisches Material (Verfahren E-P).
 *
 * Dehnungsebene (ebener Querschnitt bleibt eben):  Trial(y,z) = t0 + ty·y + tz·z   (= E·ε, in N/mm²)
 * Spannung:  σ = Trial, begrenzt auf ±f_yd.  Der Querschnitt zerfällt in drei Zonen:
 *    plastisch Zug (σ = +fyd), elastisch (|Trial| < fyd), plastisch Druck (σ = −fyd).
 * Die Zonen entstehen durch exaktes Beschneiden der Polygone mit Geraden; die Schnittgrößen folgen aus den
 * Flächenmomenten der Zonen (Umfahrungsmethode). Die Dehnungsebene wird mit gedämpftem Newton-Verfahren so
 * bestimmt, dass N, Mz, My im Gleichgewicht stehen. Gilt für beliebige Querschnitte (auch mit Iyz ≠ 0).
 * Bietet dieselbe Schnittstelle wie Spannung (sigma, extremwerte, nulllinie), damit Ansicht3D sie darstellen kann.
 *
 * Vorzeichen wie in Spannung: N > 0 Zug, My > 0 Zug unten (z > 0), Mz > 0 Zug rechts (y > 0).
 */
class ElastoPlastischeSpannung {
  /**
   * @param {Querschnitt} q
   * @param {number} N [kN], @param {number} My [kNm], @param {number} Mz [kNm]
   * @param {number} fyd Bemessungsstreckgrenze [N/mm²]
   */
  constructor(q, N, My, Mz, fyd) {
    this.q = q; this.N = N; this.My = My; this.Mz = Mz; this.fyd = fyd;
    this.polys = q.materialpolygone();
    this.vorzeichen = true; this.titel = "σ";
    this.ymax = Math.max(Math.abs(q.ymin), Math.abs(q.ymax));
    this.zmax = Math.max(Math.abs(q.zmin), Math.abs(q.zmax));
    this._rechne();
  }

  /** Flächenmomente einer Zone (alle Polygone, Aussparungen mit negativem Vorzeichen). */
  _zone(cuts) {
    const m = { A: 0, Sy: 0, Sz: 0, Iyy: 0, Izz: 0, Iyz: 0 };
    for (const { vz, p } of this.polys) {
      let pk = p;
      for (const [c0, cy, cz] of cuts) { pk = Geometrie.beschneideEbene(pk, c0, cy, cz); if (pk.length < 3) break; }
      if (pk.length < 3) continue;
      const k = Geometrie.umfahre(pk);
      for (const key in m) m[key] += vz * k[key];
    }
    return m;
  }

  /** Zonen und Schnittgrößen für die Dehnungsebene u = (t0, ty, tz). */
  _auswerten(u) {
    const [t0, ty, tz] = u, f = this.fyd;
    const E = this._zone([[t0 - f, ty, tz], [-t0 - f, -ty, -tz]]);      // |Trial| <= fyd
    const P = this._zone([[f - t0, -ty, -tz]]);                           // Trial >= fyd
    const M = this._zone([[t0 + f, ty, tz]]);                             // Trial <= −fyd
    const r = [                                                           // Resultierende [N, Mz, My] in N, Nmm
      f * (P.A - M.A) + t0 * E.A + ty * E.Sz + tz * E.Sy,
      f * (P.Sz - M.Sz) + t0 * E.Sz + ty * E.Izz + tz * E.Iyz,
      f * (P.Sy - M.Sy) + t0 * E.Sy + ty * E.Iyz + tz * E.Iyy,
    ];
    const J = [[E.A, E.Sz, E.Sy], [E.Sz, E.Izz, E.Iyz], [E.Sy, E.Iyz, E.Iyy]];   // Tangente (symmetrisch)
    return { r, J, E, P, M };
  }

  /** Newton-Verfahren (Levenberg-gedämpft) für den Lastfaktor lam; null, wenn kein Gleichgewicht existiert. */
  _loese(lam) {
    const q = this.q, f = this.fyd;
    const L = [this.N * 1e3 * lam, this.Mz * 1e6 * lam, this.My * 1e6 * lam];
    const w = [f * q.A, f * q.A * this.ymax, f * q.A * this.zmax];       // Skalierung der Residuen
    const diag = [q.A, q.Iz, q.Iy];
    const D = q.Iy * q.Iz - q.Iyz ** 2;
    let u = [L[0] / q.A, (L[1] * q.Iy - L[2] * q.Iyz) / D, (L[2] * q.Iz - L[1] * q.Iyz) / D];   // elastischer Start
    const res = a => { const e = this._auswerten(a); const g = e.r.map((v, i) => v - L[i]); return { e, g, n: Math.hypot(...g.map((v, i) => v / w[i])) }; };
    let cur = res(u);
    for (let it = 0; it < 120 && cur.n > 1e-7; it++) {
      let ok = false;
      for (let mu = 1e-10; mu < 1e3; mu *= 10) {
        const A = cur.e.J.map((row, i) => row.map((v, j) => v + (i === j ? mu * diag[i] : 0)));
        const d = ElastoPlastischeSpannung._gauss(A, cur.g.map(v => -v));
        if (!d) continue;
        const nu = u.map((v, i) => v + d[i]);
        if (nu.some(v => !Number.isFinite(v) || Math.abs(v) > 1e4 * f)) continue;
        const nr = res(nu);
        if (nr.n < cur.n) { u = nu; cur = nr; ok = true; break; }
      }
      if (!ok) break;
    }
    return cur.n <= 1e-5 ? { u, e: cur.e } : null;
  }

  /** Löst A·x = b (3×3, Gauß mit Spaltenpivot); null bei Singularität. */
  static _gauss(A, b) {
    const n = 3, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
    }
    const x = [0, 0, 0];
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }

  /** Gleichgewicht suchen; bei Überschreitung der Traglast Grenzzustand beim größten erreichbaren Lastfaktor. */
  _rechne() {
    let sol = this._loese(1), lam = 1;
    this.ueberlast = false;
    if (!sol) {
      this.ueberlast = true;
      let lo = 0, hi = 1, best = this._loese(0);
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2, s = this._loese(mid);
        if (s) { lo = mid; best = s; } else hi = mid;
      }
      sol = best; lam = lo;
    }
    this.lambda = lam;                         // erreichter Anteil der Beanspruchung (1 = voll)
    [this.t0, this.ty, this.tz] = sol.u;
    const A = this.q.A, pl = sol.e.P.A + sol.e.M.A;
    this.plastAnteil = Math.min(1, Math.max(0, pl / A));   // Flächenanteil, der fließt
    this.epsMax = Math.max(...this.q.randpunkte(180).map(p => Math.abs(this.trial(p.y, p.z)))) / this.fyd; // max |ε|/ε_y
    this.zustand = this.plastAnteil < 1e-6 ? "elastisch" : this.plastAnteil > 0.995 ? "voll durchplastiziert" : "teilplastisch";
  }

  /** E·ε (ungedeckelt) am Punkt [N/mm²] */
  trial(y, z) { return this.t0 + this.ty * y + this.tz * z; }

  /** Spannung am Punkt (y, z) [N/mm²], auf ±fyd begrenzt */
  sigma(y, z) { return Math.max(-this.fyd, Math.min(this.fyd, this.trial(y, z))); }

  get koeff() { return { a0: this.t0, by: this.ty, bz: this.tz }; }

  extremwerte() {
    let min = { wert: Infinity, y: 0, z: 0 }, max = { wert: -Infinity, y: 0, z: 0 };
    for (const p of this.q.randpunkte(360)) {
      const s = this.sigma(p.y, p.z);
      if (s > max.wert) max = { wert: s, y: p.y, z: p.z };
      if (s < min.wert) min = { wert: s, y: p.y, z: p.z };
    }
    return { min, max };
  }

  /** Dehnungsnulllinie (Trial = 0), gleiche Konstruktion wie bei Spannung. */
  nulllinie() { return Spannung.prototype.nulllinie.call(this); }
}
