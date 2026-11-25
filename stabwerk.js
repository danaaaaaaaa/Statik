"use strict";

/**
 * stabwerk.js - Ebene Stabwerke nach der Direkten Steifigkeitsmethode (Theorie I. Ordnung, linear-elastisch).
 *
 * Koordinaten global: X nach rechts, Z nach unten (wie bei den Querschnitten), Längen in m, Kräfte in kN, Momente in kNm.
 * Stab lokal: x' von Anfang (i) nach Ende (j), z' = x' um 90° in Richtung +Z gedreht (bei waagerechtem Stab nach unten).
 * Drehungen positiv im Uhrzeigersinn (von x nach z).
 *
 * Schnittgrößen:  N > 0 Zug,  M > 0 Zug auf der z'-Seite (bei waagerechtem Stab: Zug unten),  V = dM/dx.
 * Klassen: Lineare (Gauß-Löser), StabElement (ein Stab), Stabwerk (System, Berechnung, Ergebnisse).
 */

/** Kleine Hilfsklasse für lineare Gleichungssysteme. */
class Lineare {
  /** Löst A·x = b (Gauß mit Spaltenpivot). Gibt null zurück, wenn die Matrix (numerisch) singulär ist. */
  static loese(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    let skala = 0;
    for (let i = 0; i < n; i++) skala = Math.max(skala, Math.abs(A[i][i]));
    if (skala === 0) return n === 0 ? [] : null;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-11 * skala) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const k = M[r][c] / M[c][c];
        if (k !== 0) for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
      }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }
}

/** Ein gerader Stab mit Biege- und Dehnsteifigkeit, Momentengelenken und Lasten. */
class StabElement {
  /**
   * @param {Object} s   Stabdaten {i, j, A [cm²], I [cm⁴], gel}  (i, j: Knotennummern ab 1)
   * @param {Array}  kn  Knotenliste [{x, z}]
   * @param {number} E   Elastizitätsmodul [N/mm²]
   */
  constructor(s, kn, E, nr) {
    this.nr = nr; this.i = s.i - 1; this.j = s.j - 1;
    const a = kn[this.i], b = kn[this.j];
    this.dx = b.x - a.x; this.dz = b.z - a.z;
    this.L = Math.hypot(this.dx, this.dz);
    this.c = this.dx / this.L; this.s = this.dz / this.L;
    this.EA = E * s.A * 0.1;            // N/mm² · cm² -> kN
    this.EI = E * s.I * 1e-5;           // N/mm² · cm⁴ -> kNm²
    this.gelAnfang = s.gel === "anfang" || s.gel === "beide";
    this.gelEnde = s.gel === "ende" || s.gel === "beide";
    this.strecken = [];                 // {qx, qz, a, b} lokal [kN/m], belastet von a bis b [m]
    this.einzel = [];                   // {a, Px, Pz} lokal [m, kN]
  }

  /** Last (Vektor in globaler Richtung oder lokal) in lokale Komponenten umrechnen. */
  _lokal(richtung, w) {
    const { c, s } = this;
    if (richtung === "lokal") return { x: 0, z: w };
    if (richtung === "Z" || richtung === "Zproj") { const k = richtung === "Zproj" ? Math.abs(c) : 1; return { x: w * k * s, z: w * k * c }; }
    return { x: w * c, z: -w * s };     // "X"
  }
  /** Gleichstreckenlast von a bis b (ohne Angabe: ganzer Stab). */
  addStrecke(q, richtung, a = 0, b = this.L) { const v = this._lokal(richtung, q); this.strecken.push({ qx: v.x, qz: v.z, a, b }); }
  addEinzel(F, a, richtung) { const v = this._lokal(richtung === "Zproj" ? "Z" : richtung, F); this.einzel.push({ a, Px: v.x, Pz: v.z }); }

  /** Lokale 6×6-Steifigkeitsmatrix [u_i, w_i, θ_i, u_j, w_j, θ_j] (Euler-Bernoulli). */
  _kLokal() {
    const L = this.L, a = this.EA / L, e = this.EI / L ** 3;
    return [
      [a, 0, 0, -a, 0, 0],
      [0, 12 * e, 6 * e * L, 0, -12 * e, 6 * e * L],
      [0, 6 * e * L, 4 * e * L * L, 0, -6 * e * L, 2 * e * L * L],
      [-a, 0, 0, a, 0, 0],
      [0, -12 * e, -6 * e * L, 0, 12 * e, -6 * e * L],
      [0, 6 * e * L, 2 * e * L * L, 0, -6 * e * L, 4 * e * L * L],
    ];
  }

  /** Volleinspannkräfte (Kräfte der festgehaltenen Knoten auf den Stab) infolge aller Stablasten. */
  _f0Lokal() {
    const L = this.L, f = [0, 0, 0, 0, 0, 0];
    // Teilstreckenlast: Integration der Einzellast-Formeln (Polynome bis Grad 3) mit 3-Punkt-Gauß, exakt
    const GP = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]];
    for (const { qx, qz, a, b } of this.strecken) {
      const h = (b - a) / 2, m = (a + b) / 2;
      for (const [t, wg] of GP) {
        const x = m + h * t, d = L - x, dx = wg * h;         // dx = Gewicht · Länge des Bereichs
        f[0] -= qx * d / L * dx; f[3] -= qx * x / L * dx;
        f[1] -= qz * d * d * (3 * x + d) / L ** 3 * dx; f[4] -= qz * x * x * (x + 3 * d) / L ** 3 * dx;
        f[2] -= qz * x * d * d / (L * L) * dx;          f[5] += qz * x * x * d / (L * L) * dx;
      }
    }
    for (const { a, Px, Pz } of this.einzel) {
      const b = L - a;
      f[0] -= Px * b / L; f[3] -= Px * a / L;
      f[1] -= Pz * b * b * (3 * a + b) / L ** 3; f[4] -= Pz * a * a * (a + 3 * b) / L ** 3;
      f[2] -= Pz * a * b * b / (L * L);        f[5] += Pz * a * a * b / (L * L);
    }
    return f;
  }

  /** Momentengelenke durch statische Kondensation einarbeiten. */
  vorbereiten() {
    this.k0 = this._kLokal(); this.f00 = this._f0Lokal();
    let k = this.k0.map(r => [...r]), f = [...this.f00];
    this.frei = [];                      // freigegebene Drehfreiheitsgrade
    if (this.gelAnfang) this.frei.push(2);
    if (this.gelEnde) this.frei.push(5);
    for (const r of this.frei) {
      const kr = k.map(row => row[r]), krr = k[r][r], fr = f[r];
      k = k.map((row, a) => row.map((v, b) => v - kr[a] * kr[b] / krr));
      f = f.map((v, a) => v - kr[a] * fr / krr);
    }
    this.k = k; this.f0 = f;
    const c = this.c, s = this.s;       // Transformation global -> lokal
    this.T = Array.from({ length: 6 }, () => Array(6).fill(0));
    for (const o of [0, 3]) {
      this.T[o][o] = c; this.T[o][o + 1] = s; this.T[o + 1][o] = -s; this.T[o + 1][o + 1] = c; this.T[o + 2][o + 2] = 1;
    }
  }

  /** Globale Steifigkeitsmatrix Tᵀ·k·T */
  kGlobal() { return StabElement._mul(StabElement._tr(this.T), StabElement._mul(this.k, this.T)); }
  /** Äquivalente Knotenlasten (global) = −Tᵀ·f0 */
  knotenlasten() { return StabElement._tr(this.T).map(r => -r.reduce((a, v, i) => a + v * this.f0[i], 0)); }

  static _mul(A, B) { return A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0))); }
  static _tr(A) { return A[0].map((_, j) => A.map(r => r[j])); }

  /** Verschiebungen auswerten: d = globale Stabendverschiebungen (6). Berechnet Endkräfte und Verformung. */
  auswerten(dg) {
    const T = this.T, dl = T.map(r => r.reduce((s, v, i) => s + v * dg[i], 0));
    // freigegebene Enddrehungen aus der Gleichgewichtsbedingung (Moment = 0) zurückrechnen
    const R = this.frei;
    if (R.length) {
      const N = [0, 1, 2, 3, 4, 5].filter(i => !R.includes(i));
      const A = R.map(r => R.map(c => this.k0[r][c]));
      const b = R.map(r => -(N.reduce((s, c) => s + this.k0[r][c] * dl[c], 0) + this.f00[r]));
      const th = Lineare.loese(A, b) || R.map(() => 0);
      R.forEach((r, n) => { dl[r] = th[n]; });
    }
    this.dl = dl;
    // Endkräfte auf den Stab (lokal): k·d + f0 (mit Originalmatrizen, freigegebene Momente werden dadurch ~0)
    this.fl = this.k0.map((row, a) => row.reduce((s, v, b) => s + v * dl[b], 0) + this.f00[a]);
    for (const r of R) this.fl[r] = 0;
    // globale Endkräfte
    this.fg = StabElement._tr(T).map(r => r.reduce((s, v, i) => s + v * this.fl[i], 0));
    this._verformung();
  }

  /** Schnittgrößen an der Stelle x; links = true: Wert unmittelbar links von einer Einzellast. */
  schnitt(x, links = false) {
    const [Ni, Vi, Mi] = this.fl;
    let N = Ni, V = Vi, M = Mi;          // N und V hier zunächst als Summe der Kräfte links vom Schnitt
    let Fx = Ni, Fz = Vi, Mm = Mi;
    for (const { qx, qz, a, b } of this.strecken) {
      const l = Math.max(0, Math.min(x, b) - a);          // belastete Länge links vom Schnitt
      Fx += qx * l; Fz += qz * l; Mm -= qz * l * (x - a - l / 2);
    }
    Mm -= Vi * x;
    for (const { a, Px, Pz } of this.einzel) {
      if (links ? a < x - 1e-12 : a <= x + 1e-12) { Fx += Px; Fz += Pz; Mm -= Pz * (x - a); }
    }
    return { x, N: -Fx, V: -Fz, M: Mm };
  }

  /** Stützstellen der Schnittgrößenlinie (mit Sprüngen an Einzellasten). */
  verlauf(n = 40) {
    const L = this.L, xs = new Set();
    for (let k = 0; k <= n; k++) xs.add(+(L * k / n).toFixed(9));
    const pts = [];
    const sprung = this.einzel.map(e => e.a).filter(a => a > 1e-9 && a < L - 1e-9);
    sprung.forEach(a => xs.add(+a.toFixed(9)));
    // Anfang und Ende von Teilstreckenlasten (Knicke im Verlauf, unabhängig vom Lastwert)
    this.strecken.forEach(q => [q.a, q.b].forEach(x => { if (x > 1e-9 && x < L - 1e-9) xs.add(+x.toFixed(9)); }));
    [...xs].sort((a, b) => a - b).forEach(x => {
      if (sprung.some(a => Math.abs(a - x) < 1e-9)) { pts.push(this.schnitt(x, true)); pts.push(this.schnitt(x, false)); }
      else pts.push(this.schnitt(x));
    });
    return pts;
  }

  /** Biegelinie durch zweifache Integration von w'' = −M/EI (Ausgleich der Restabweichung linear). */
  _verformung() {
    const n = 120, L = this.L, h = L / n, dl = this.dl, EI = this.EI;
    const M = Array.from({ length: n + 1 }, (_, k) => this.schnitt(k * h).M);
    const th = [dl[2]], w = [dl[1]];
    for (let k = 0; k < n; k++) {
      th.push(th[k] - h * (M[k] + M[k + 1]) / (2 * EI));
      w.push(w[k] + h * (th[k] + th[k + 1]) / 2);
    }
    const drift = dl[4] - w[n];
    this.verf = w.map((wk, k) => {
      const x = k * h, wl = wk + drift * x / L, u = dl[0] + (dl[3] - dl[0]) * x / L;
      const sehne = dl[1] + (dl[4] - dl[1]) * x / L;
      return { x, w: wl, u, f: wl - sehne, dU: u * this.c - wl * this.s, dW: u * this.s + wl * this.c };
    });
  }
}

/** Das System: Knoten, Stäbe, Lager, Lasten; Berechnung der Verformungen, Auflagerkräfte und Schnittgrößen. */
class Stabwerk {
  /**
   * @param {Object} m  {E, knoten:[{x,z,lager}], staebe:[{i,j,A,I,gel}], knotenlasten:[{k,Fx,Fz,M}],
   *                     strecken:[{s,q,richtung}], einzel:[{s,F,a,richtung}]}
   */
  constructor(m) { this.m = m; }

  /** Gehaltene Freiheitsgrade eines Knotens (0 = X, 1 = Z, 2 = Drehung): Flags hx, hz, hphi oder Altformat 'lager'. */
  static gehalten(k) {
    if ("hx" in k || "hz" in k || "hphi" in k) return [[k.hx, 0], [k.hz, 1], [k.hphi, 2]].filter(p => p[0]).map(p => p[1]);
    return ({ fest: [0, 1], rolleZ: [1], rolleX: [0], einsp: [0, 1, 2] })[k.lager] || [];
  }

  /**
   * Grad der statischen Unbestimmtheit (Abzählkriterium): n = 3·s + r − 3·k − g
   * s Stäbe, r Auflagerreaktionen, k Knoten (nur an Stäben), g Gelenkbedingungen
   * (je Knoten: Anzahl gelenkiger Stabenden; sind alle Stabenden gelenkig und der Knoten nicht drehfest gelagert, eines weniger).
   * n < 0: Mechanismus; n = 0 statisch bestimmt (bei geeigneter Lagerung); n > 0 statisch unbestimmt.
   */
  static unbestimmtheit(m) {
    const knoten = new Set();
    m.staebe.forEach(s => { knoten.add(s.i); knoten.add(s.j); });
    let r = 0, g = 0;
    for (const nr of knoten) {
      const k = m.knoten[nr - 1]; if (!k) continue;
      r += Stabwerk.gehalten(k).length;
      let anzahl = 0, gelenke = 0;
      for (const s of m.staebe) {
        if (s.i === nr) { anzahl++; if (s.gel === "anfang" || s.gel === "beide") gelenke++; }
        if (s.j === nr) { anzahl++; if (s.gel === "ende" || s.gel === "beide") gelenke++; }
      }
      g += gelenke === anzahl && anzahl > 0 && !k.hphi && k.lager !== "einsp" ? gelenke - 1 : gelenke;
    }
    // Federn an Knoten zählen wie Lagerreaktionen (je Federrichtung eine); Bettung wird nicht abgezählt
    for (const f of m.federn || []) { if (knoten.has(f.k)) r += (f.cx > 0 ? 1 : 0) + (f.cz > 0 ? 1 : 0); }
    const s = m.staebe.length, k = knoten.size;
    const bettung = (m.bettung || []).some(b => b.kx > 0 || b.kz > 0);
    return { n: 3 * s + r - 3 * k - g, s, k, r, g, bettung };
  }

  /** Eingaben prüfen; gibt Fehlertext oder null zurück. */
  pruefe() {
    const m = this.m, nK = m.knoten.length, ok = Number.isFinite;
    if (nK < 2) return "Mindestens zwei Knoten angeben.";
    if (!m.staebe.length) return "Mindestens einen Stab angeben.";
    if (!(m.E > 0)) return "E-Modul muss größer als null sein.";
    for (const [n, k] of m.knoten.entries()) if (!ok(k.x) || !ok(k.z)) return `Knoten ${n + 1}: Koordinaten unvollständig.`;
    const ganz = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;
    for (const [n, s] of m.staebe.entries()) {
      if (!ganz(s.i, nK) || !ganz(s.j, nK)) return `Stab ${n + 1}: Knotennummern müssen zwischen 1 und ${nK} liegen.`;
      if (s.i === s.j) return `Stab ${n + 1}: Anfang und Ende sind derselbe Knoten.`;
      if (!(s.A > 0) || !(s.I > 0)) return `Stab ${n + 1}: A und I müssen größer als null sein.`;
      const a = m.knoten[s.i - 1], b = m.knoten[s.j - 1];
      if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-9) return `Stab ${n + 1} hat die Länge null.`;
    }
    for (const [n, f] of (m.federn || []).entries()) {
      if (!ganz(f.k, nK)) return `Feder ${n + 1}: Knotennummer ungültig.`;
      if (!(f.cx >= 0) || !(f.cz >= 0)) return `Feder ${n + 1}: Federsteifigkeiten müssen vorhanden und ≥ 0 sein.`;
    }
    for (const [n, b] of (m.bettung || []).entries()) {
      if (!ganz(b.s, m.staebe.length)) return `Bettung ${n + 1}: Stabnummer ungültig.`;
      if (!(b.kx >= 0) || !(b.kz >= 0)) return `Bettung ${n + 1}: Bettungssteifigkeiten müssen vorhanden und ≥ 0 sein.`;
    }
    for (const [n, l] of m.knotenlasten.entries()) {
      if (!ganz(l.k, nK)) return `Knotenlast ${n + 1}: Knotennummer ungültig.`;
      if (![l.Fx, l.Fz, l.M].every(ok)) return `Knotenlast ${n + 1}: Werte unvollständig.`;
    }
    const nS = m.staebe.length;
    for (const [n, l] of m.strecken.entries()) {
      if (!ganz(l.s, nS)) return `Streckenlast ${n + 1}: Stabnummer ungültig.`;
      if (!ok(l.q)) return `Streckenlast ${n + 1}: Wert unvollständig.`;
      const st = m.staebe[l.s - 1], p = m.knoten[st.i - 1], r = m.knoten[st.j - 1], L = Math.hypot(r.x - p.x, r.z - p.z);
      const a = Number.isFinite(l.a) ? l.a : 0, b = Number.isFinite(l.b) ? l.b : L;
      if (a < 0 || b > L + 1e-9 || b <= a) return `Streckenlast ${n + 1}: es muss 0 ≤ von < bis ≤ ${L.toFixed(2)} m (Stablänge) gelten.`;
    }
    for (const [n, l] of m.einzel.entries()) {
      if (!ganz(l.s, nS)) return `Einzellast ${n + 1}: Stabnummer ungültig.`;
      if (!ok(l.F) || !ok(l.a)) return `Einzellast ${n + 1}: Werte unvollständig.`;
      const s = m.staebe[l.s - 1], a = m.knoten[s.i - 1], b = m.knoten[s.j - 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (l.a < 0 || l.a > L + 1e-9) return `Einzellast ${n + 1}: Abstand a muss zwischen 0 und ${L.toFixed(2)} m (Stablänge) liegen.`;
    }
    return null;
  }

  /**
   * Berechnung; wirft bei instabilem System einen Error.
   * Gevoutete Stäbe (Eigenschaft seg) werden intern in Teilstäbe mit konstantem Querschnitt zerlegt.
   */
  berechne() {
    const fehler = this.pruefe(); if (fehler) throw new Error(fehler);
    const v = Voute.zerlege(this.m);
    if (!v) return this._rechne();
    return v.zusammenfassen(new Stabwerk(v.modell)._rechne());
  }

  /** Berechnung am Modell ohne gevoutete Stäbe. */
  _rechne() {
    const m = this.m, nK = m.knoten.length, n = 3 * nK;
    const els = m.staebe.map((s, nr) => new StabElement(s, m.knoten, s.E > 0 ? s.E : m.E, nr));
    for (const l of m.strecken) {
      const e = els[l.s - 1];
      e.addStrecke(l.q, l.richtung, Number.isFinite(l.a) ? l.a : 0, Number.isFinite(l.b) ? Math.min(l.b, e.L) : e.L);
    }
    for (const l of m.einzel) els[l.s - 1].addEinzel(l.F, Math.min(l.a, els[l.s - 1].L), l.richtung);

    const K = Array.from({ length: n }, () => Array(n).fill(0)), F = Array(n).fill(0);
    const Fext = Array(n).fill(0);
    for (const l of m.knotenlasten) { const o = 3 * (l.k - 1); Fext[o] += l.Fx; Fext[o + 1] += l.Fz; Fext[o + 2] += l.M; }
    F.forEach((_, i) => { F[i] = Fext[i]; });
    for (const e of els) {
      e.vorbereiten();
      const dof = [3 * e.i, 3 * e.i + 1, 3 * e.i + 2, 3 * e.j, 3 * e.j + 1, 3 * e.j + 2];
      const kg = e.kGlobal(), fe = e.knotenlasten();
      dof.forEach((a, p) => { F[a] += fe[p]; dof.forEach((b, q) => { K[a][b] += kg[p][q]; }); });
    }
    // Federn an Knoten (Steifigkeitsmatrix 2×2 in globalen Richtungen X, Z)
    const fed = (m.federn || []).map(f => ({ k: f.k, kxx: f.kxx ?? f.cx ?? 0, kxz: f.kxz ?? 0, kzz: f.kzz ?? f.cz ?? 0 }));
    for (const f of fed) {
      const o = 3 * (f.k - 1);
      K[o][o] += f.kxx; K[o][o + 1] += f.kxz; K[o + 1][o] += f.kxz; K[o + 1][o + 1] += f.kzz;
    }
    // Lagerbedingungen
    const fest = Array(n).fill(false);
    const bind = k => Stabwerk.gehalten(k);
    m.knoten.forEach((k, i) => bind(k).forEach(d => { fest[3 * i + d] = true; }));
    // Drehfreiheitsgrade ohne jede Steifigkeit (Knoten nur mit Gelenkstäben): kleine Hilfsfeder, damit die Matrix lösbar bleibt
    let kmax = 0; for (let i = 0; i < n; i++) kmax = Math.max(kmax, K[i][i]);
    for (let i = 2; i < n; i += 3) if (K[i][i] < 1e-12 * kmax) K[i][i] += 1e-6 * kmax * 1e-3;
    const fr = [...Array(n).keys()].filter(i => !fest[i]);
    const D = Array(n).fill(0);
    if (fr.length) {
      const x = Lineare.loese(fr.map(a => fr.map(b => K[a][b])), fr.map(a => F[a]));
      if (!x) throw new Error("Das System ist nicht stabil (kinematisch verschieblich). Lager oder Stäbe ergänzen bzw. Gelenke prüfen.");
      fr.forEach((a, p) => { D[a] = x[p]; });
    }
    // Stabergebnisse
    els.forEach(e => {
      const dof = [3 * e.i, 3 * e.i + 1, 3 * e.i + 2, 3 * e.j, 3 * e.j + 1, 3 * e.j + 2];
      e.auswerten(dof.map(a => D[a]));
    });
    // Auflagerkräfte: Summe der Stabendkräfte auf die Knoten minus äußere Knotenlasten
    const Rg = Array(n).fill(0);
    for (const e of els) {
      const dof = [3 * e.i, 3 * e.i + 1, 3 * e.i + 2, 3 * e.j, 3 * e.j + 1, 3 * e.j + 2];
      dof.forEach((a, p) => { Rg[a] += e.fg[p]; });
    }
    const reaktionen = [];
    const federKnoten = new Set(fed.filter(f => f.kxx || f.kzz || f.kxz).map(f => f.k - 1));
    m.knoten.forEach((k, i) => {
      if (!bind(k).length && !federKnoten.has(i)) return;
      const r = { k: i + 1, Rx: 0, Rz: 0, M: 0 };
      const hat = d => fest[3 * i + d];
      if (hat(0)) r.Rx = Rg[3 * i] - Fext[3 * i];
      if (hat(1)) r.Rz = Rg[3 * i + 1] - Fext[3 * i + 1];
      if (hat(2)) r.M = Rg[3 * i + 2] - Fext[3 * i + 2];
      // Federkräfte auf das System: −K·d
      for (const f of fed) if (f.k - 1 === i) {
        r.Rx -= f.kxx * D[3 * i] + f.kxz * D[3 * i + 1]; r.Rz -= f.kxz * D[3 * i] + f.kzz * D[3 * i + 1];
      }
      reaktionen.push(r);
    });
    // Gleichgewichtskontrolle der Lasten (global, ohne Momente)
    let sx = 0, sz = 0;
    for (const l of m.knotenlasten) { sx += l.Fx; sz += l.Fz; }
    for (const e of els) { for (const q of e.strecken) { const ll = q.b - q.a; sx += (q.qx * e.c - q.qz * e.s) * ll; sz += (q.qx * e.s + q.qz * e.c) * ll; }
      for (const p of e.einzel) { sx += p.Px * e.c - p.Pz * e.s; sz += p.Px * e.s + p.Pz * e.c; } }
    const rx = reaktionen.reduce((a, r) => a + r.Rx, 0), rz = reaktionen.reduce((a, r) => a + r.Rz, 0);

    const verschiebungen = m.knoten.map((k, i) => ({ k: i + 1, u: D[3 * i], w: D[3 * i + 1], phi: D[3 * i + 2] }));
    const staebe = els.map(e => {
      const v = e.verlauf(), ext = {};
      for (const g of ["N", "V", "M"]) {
        let mx = v[0], mn = v[0];
        v.forEach(p => { if (p[g] > mx[g]) mx = p; if (p[g] < mn[g]) mn = p; });
        ext[g] = { max: mx[g], xmax: mx.x, min: mn[g], xmin: mn.x };
      }
      let fmax = 0; e.verf.forEach(p => { if (Math.abs(p.f) > Math.abs(fmax)) fmax = p.f; });
      return { nr: e.nr + 1, el: e, L: e.L, verlauf: v, ext, verf: e.verf, fmax };
    });
    return { verschiebungen, reaktionen, staebe, residuum: { x: sx + rx, z: sz + rz } };
  }
}


/**
 * Gevoutete Stäbe: Ein Stab mit seg = [{A, I}, ...] (gleich lange Abschnitte, Werte je Abschnitt) wird in
 * Teilstäbe mit konstantem Querschnitt zerlegt (Zwischenknoten am Stab, ohne Lager). Lasten werden auf die
 * Teilstäbe verteilt; die Ergebnisse werden wieder zu einem Stab zusammengesetzt.
 */
class Voute {
  /** Erzeugt das zerlegte Modell oder null, wenn kein Stab gevoutet ist. */
  static zerlege(m) {
    const bettungen = (m.bettung || []).filter(b => b.kx > 0 || b.kz > 0);
    if (!m.staebe.some(s => s.seg && s.seg.length > 1) && !bettungen.length) return null;
    const knoten = m.knoten.map(k => ({ ...k })), staebe = [], abb = [];       // abb: je Originalstab {erster, anzahl, L}
    const fed = (m.federn || []).map(f => ({ k: f.k, kxx: f.cx || 0, kxz: 0, kzz: f.cz || 0 }));   // Federn an Knoten
    const bettAnteil = new Map();                                              // Bettungsanteil an den Originalknoten
    const addFeder = (k, kxx, kxz, kzz) => {
      const f = fed.find(z => z.k === k && z.bett);
      if (f) { f.kxx += kxx; f.kxz += kxz; f.kzz += kzz; } else fed.push({ k, kxx, kxz, kzz, bett: true });
      if (k <= m.knoten.length) {
        const a = bettAnteil.get(k) || { kxx: 0, kxz: 0, kzz: 0 };
        a.kxx += kxx; a.kxz += kxz; a.kzz += kzz; bettAnteil.set(k, a);
      }
    };
    m.staebe.forEach((s, nr) => {
      const a = m.knoten[s.i - 1], b = m.knoten[s.j - 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      let seg = s.seg && s.seg.length > 1 ? s.seg : [{ A: s.A, I: s.I }];
      // Bettung: Stab in Abschnitte mit Einzelfedern (Einflusslänge) teilen; Abschnittslänge ≲ ¼ der Systemlänge l_e = (4EI/k)^¼
      const bt = bettungen.filter(z => z.s === nr + 1);
      let kg = null;
      if (bt.length) {
        const c = (b.x - a.x) / L, sn = (b.z - a.z) / L; kg = { kxx: 0, kxz: 0, kzz: 0 };
        for (const z of bt) {
          if (z.bezug === "global") { kg.kxx += z.kx; kg.kzz += z.kz; }
          else { kg.kxx += z.kx * c * c + z.kz * sn * sn; kg.kzz += z.kx * sn * sn + z.kz * c * c; kg.kxz += (z.kx - z.kz) * c * sn; }
        }
        const EI = (s.E > 0 ? s.E : m.E) * Math.min(...seg.map(q => q.I)) * 1e-5, kq = Math.max(kg.kxx, kg.kzz, 1e-9);
        const le = Math.pow(4 * EI / kq, 0.25), M = seg.length;
        const Nb = Math.min(160, Math.max(12, Math.ceil(L / Math.min(le / 4, L / 12))));
        const N = Math.ceil(Nb / M) * M;
        seg = Array.from({ length: N }, (_, k) => seg[Math.floor(k * M / N)]);
      }
      const N = seg.length;
      abb.push({ erster: staebe.length, anzahl: N, L });
      let von = s.i;
      seg.forEach((q, k) => {
        let bis = s.j;
        if (k < N - 1) { knoten.push({ x: a.x + (b.x - a.x) * (k + 1) / N, z: a.z + (b.z - a.z) * (k + 1) / N }); bis = knoten.length; }
        if (kg) {                                           // Einflusslänge h/2 je Abschnittsende
          const h2 = L / N / 2;
          addFeder(von, kg.kxx * h2, kg.kxz * h2, kg.kzz * h2); addFeder(bis, kg.kxx * h2, kg.kxz * h2, kg.kzz * h2);
        }
        const gel = (k === 0 && (s.gel === "anfang" || s.gel === "beide") ? 1 : 0) + (k === N - 1 && (s.gel === "ende" || s.gel === "beide") ? 2 : 0);
        staebe.push({ i: von, j: bis, A: q.A, I: q.I, E: s.E, gel: ["-", "anfang", "ende", "beide"][gel] });
        von = bis;
      });
    });
    const strecken = [], einzel = [];
    for (const l of m.strecken) {
      const o = abb[l.s - 1], h = o.L / o.anzahl, a = Number.isFinite(l.a) ? l.a : 0, b = Number.isFinite(l.b) ? Math.min(l.b, o.L) : o.L;
      for (let k = 0; k < o.anzahl; k++) {
        const a0 = Math.max(a, k * h), b0 = Math.min(b, (k + 1) * h);
        if (b0 - a0 > 1e-9) strecken.push({ ...l, s: o.erster + k + 1, a: a0 - k * h, b: b0 - k * h });
      }
    }
    for (const l of m.einzel) {
      const o = abb[l.s - 1], h = o.L / o.anzahl, k = Math.min(o.anzahl - 1, Math.floor(l.a / h + 1e-9));
      einzel.push({ ...l, s: o.erster + k + 1, a: l.a - k * h });
    }
    return { modell: { ...m, knoten, staebe, strecken, einzel, federn: fed, bettung: [] }, zusammenfassen: erg => Voute.zusammenfassen(m, abb, erg, bettAnteil) };
  }

  /** Ergebnisse der Teilstäbe zu Ergebnissen der Originalstäbe zusammensetzen (Knotenergebnisse nur der Originalknoten). */
  static zusammenfassen(m, abb, erg, bettAnteil) {
    const nK = m.knoten.length;
    const staebe = abb.map((o, n) => {
      const teile = erg.staebe.slice(o.erster, o.erster + o.anzahl);
      if (o.anzahl === 1) return { ...teile[0], nr: n + 1 };
      const h = o.L / o.anzahl, verlauf = [], verf = [];
      teile.forEach((t, k) => {
        t.verlauf.forEach((p, i) => { if (k === 0 || i > 0) verlauf.push({ ...p, x: p.x + k * h }); });
        t.verf.forEach((p, i) => { if (k === 0 || i > 0) verf.push({ ...p, x: p.x + k * h }); });
      });
      // Durchbiegung gegenüber der Sehne des ganzen Stabs neu bestimmen
      const w0 = verf[0].w, w1 = verf[verf.length - 1].w;
      verf.forEach(p => { p.f = p.w - (w0 + (w1 - w0) * p.x / o.L); });
      const ext = {};
      for (const g of ["N", "V", "M"]) {
        let mx = verlauf[0], mn = verlauf[0];
        verlauf.forEach(p => { if (p[g] > mx[g]) mx = p; if (p[g] < mn[g]) mn = p; });
        ext[g] = { max: mx[g], xmax: mx.x, min: mn[g], xmin: mn.x };
      }
      let fmax = 0; verf.forEach(p => { if (Math.abs(p.f) > Math.abs(fmax)) fmax = p.f; });
      const el = Object.assign(Object.create(Object.getPrototypeOf(teile[0].el)), teile[0].el, { L: o.L });
      return { nr: n + 1, el, L: o.L, verlauf, ext, verf, fmax };
    });
    // Auflagerreaktionen: nur Originalknoten mit Lager oder Feder; Bettungsanteil herausrechnen
    const verschiebungen = erg.verschiebungen.slice(0, nK);
    const hat = new Set((m.federn || []).filter(f => f.cx > 0 || f.cz > 0).map(f => f.k));
    const reaktionen = erg.reaktionen.filter(r => r.k <= nK && (Stabwerk.gehalten(m.knoten[r.k - 1]).length || hat.has(r.k))).map(r => {
      const a = bettAnteil.get(r.k), d = verschiebungen[r.k - 1];
      return a ? { ...r, Rx: r.Rx + a.kxx * d.u + a.kxz * d.w, Rz: r.Rz + a.kxz * d.u + a.kzz * d.w } : r;
    });
    return { ...erg, staebe, verschiebungen, reaktionen };
  }
}
