"use strict";

/**
 * lastfaelle.js - Einwirkungen, Kombinationen (GZT/GZG) und Überlagerung der Stabwerksergebnisse.
 *
 * Grundlage: DIN EN 1990 mit NA (DE): Grundkombination (6.10), außergewöhnliche Kombination (6.11b),
 * charakteristische (6.14b), häufige (6.15b) und quasi-ständige (6.16b) Kombination.
 * Das Stabwerk wird linear gerechnet: Jede Einwirkung wird einmal gelöst, jede Kombination ist eine
 * Linearkombination dieser Ergebnisse (Superposition). Faktoren und Tabellenwerte vor Verwendung an der Norm prüfen.
 */

/** Kategorien veränderlicher Einwirkungen mit Kombinationsbeiwerten [ψ0, ψ1, ψ2] (DIN EN 1990/NA, Tab. NA.A.1.1) */
const EW_KATEGORIEN = {
  "-":   { text: "ohne (ψ = 1)", psi: [1, 1, 1] },
  A:     { text: "A Wohnen", psi: [0.7, 0.5, 0.3] },
  B:     { text: "B Büro", psi: [0.7, 0.5, 0.3] },
  C:     { text: "C Versammlung", psi: [0.7, 0.7, 0.6] },
  D:     { text: "D Verkauf", psi: [0.7, 0.7, 0.6] },
  E:     { text: "E Lager", psi: [1.0, 0.9, 0.8] },
  F:     { text: "F Verkehr ≤30 kN", psi: [0.7, 0.7, 0.6] },
  G:     { text: "G Verkehr 30–160 kN", psi: [0.7, 0.5, 0.3] },
  H:     { text: "H Dach", psi: [0, 0, 0] },
  S1:    { text: "S1 Schnee ≤NN+1000", psi: [0.5, 0.2, 0] },
  S2:    { text: "S2 Schnee >NN+1000", psi: [0.7, 0.5, 0.2] },
  W:     { text: "W Wind", psi: [0.6, 0.2, 0] },
  T:     { text: "T Temperatur", psi: [0.6, 0.5, 0] },
};

/** Art der Einwirkung */
const EW_ARTEN = { G: "G ständig", Q: "Q veränderlich", A: "A außergewöhnlich" };

/** Teilsicherheitsbeiwerte (DIN EN 1990/NA, Tab. NA.A.1.2(A) EQU und NA.A.1.2(B) STR/GEO). */
const TSB_VORBELEGUNG = {
  strgeo: { text: "STR/GEO (Grundkombination)", gGsup: 1.35, gGinf: 1.0, gQ: 1.5, gA: 1.0 },
  equ:    { text: "EQU (Lagesicherheit)",       gGsup: 1.10, gGinf: 0.9, gQ: 1.5, gA: 1.0 },
};

/** Kombinationsarten: Schlüssel -> Anzeigename */
const KOMBI_TYPEN = {
  roh: "Alle Lasten unfaktoriert",
  gzt: "GZT Grundkombination (6.10)",
  gztA: "GZT außergewöhnlich (6.11b)",
  gzgChar: "GZG charakteristisch (6.14b)",
  gzgHaeufig: "GZG häufig (6.15b)",
  gzgQuasi: "GZG quasi-ständig (6.16b)",
};

/** Erzeugt die maßgebenden Kombinationen aus den Einwirkungen. */
class Kombinationen {
  /**
   * @param {Array} gruppen [{name, art:'G'|'Q'|'A', psi0, psi1, psi2}]
   * @param {{gGsup:number, gGinf:number, gQ:number, gA:number}} tsb
   * @param {Set<number>} aktiv Indizes (0-basiert) der Einwirkungen, die Lasten enthalten
   */
  constructor(gruppen, tsb, aktiv) {
    this.g = gruppen; this.t = tsb; this.aktiv = aktiv;
    // Kurzbezeichnung G1, Q1, Q2, A1 ...
    const zaehler = {};
    this.id = gruppen.map(x => { zaehler[x.art] = (zaehler[x.art] || 0) + 1; return x.art + zaehler[x.art]; });
  }

  _idx(art) { return this.g.map((x, i) => (x.art === art && this.aktiv.has(i) ? i : -1)).filter(i => i >= 0); }

  /** Alle Teilmengen einer Indexliste */
  static teilmengen(liste) {
    const out = [];
    for (let m = 0; m < (1 << liste.length); m++) out.push(liste.filter((_, b) => m & (1 << b)));
    return out;
  }

  /** G-Varianten: jede ständige Einwirkung ungünstig (sup) oder günstig (inf); ab 4 Einwirkungen einheitlich. */
  _gVarianten(supFaktor, infFaktor) {
    const G = this._idx("G"), f = this.g.map(() => 0);
    const stufen = G.length <= 3 ? Kombinationen.teilmengen(G) : [[], G];       // Menge der "günstigen" Einwirkungen
    return stufen.map(guenstig => {
      const v = [...f]; G.forEach(i => { v[i] = guenstig.includes(i) ? infFaktor : supFaktor; }); return v;
    });
  }

  /**
   * @param {string} typ Schlüssel aus KOMBI_TYPEN
   * @returns {Array<{faktoren:number[], name:string}>}
   */
  erzeuge(typ) {
    const n = this.g.length, t = this.t, Q = this._idx("Q"), A = this._idx("A");
    let liste = [];
    const add = f => liste.push(f);
    if (typ === "roh") add(this.g.map((_, i) => (this.aktiv.has(i) ? 1 : 0)));

    if (typ === "gzt" || typ === "gzgChar" || typ === "gzgHaeufig" || typ === "gzgQuasi") {
      const gzt = typ === "gzt";
      const gv = gzt ? this._gVarianten(t.gGsup, t.gGinf) : this._gVarianten(1, 1);
      for (const S of Kombinationen.teilmengen(Q)) {
        // Leiteinwirkung festlegen (bei quasi-ständig gibt es keine)
        const leiter = typ === "gzgQuasi" ? [null] : (S.length ? S : [null]);
        for (const l of leiter) {
          const q = this.g.map(() => 0);
          for (const i of S) {
            const p = this.g[i];
            if (typ === "gzt") q[i] = t.gQ * (i === l ? 1 : p.psi0);
            else if (typ === "gzgChar") q[i] = i === l ? 1 : p.psi0;
            else if (typ === "gzgHaeufig") q[i] = i === l ? p.psi1 : p.psi2;
            else q[i] = p.psi2;
          }
          for (const g of gv) add(g.map((x, i) => x + q[i]));
        }
      }
    }
    if (typ === "gztA") {
      const gv = this._gVarianten(1, 1)[0];
      for (const a of (A.length ? A : [null])) for (const l of [null, ...Q]) {
        const f = [...gv];
        if (a !== null) f[a] = t.gA;
        for (const i of Q) f[i] = i === l ? this.g[i].psi1 : this.g[i].psi2;
        add(f);
      }
    }

    // Doppelte Kombinationen entfernen, benennen
    const gesehen = new Set(), aus = [];
    for (const f of liste) {
      const key = f.map(x => +x.toFixed(6)).join("|");
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      aus.push({ faktoren: f, name: this._name(f, aus.length + 1) });
    }
    return aus;
  }

  _name(f, nr) {
    const zahl = x => (+x.toFixed(3)).toString().replace(".", ",");
    const teile = f.map((x, i) => (Math.abs(x) > 1e-12 ? `${zahl(x)}·${this.id[i]}` : null)).filter(Boolean);
    return `K${nr}: ${teile.length ? teile.join(" + ") : "0"}`;
  }
}

/** Überlagerung (Linearkombination) und Umhüllende von Stabwerksergebnissen. */
class Superposition {
  /** Ergebnis = Σ f_j · Ergebnis_j (gleiche Struktur wie Stabwerk.berechne()). */
  static kombiniere(ergs, f) {
    const b = ergs[0], sum = (fn) => ergs.reduce((s, e, j) => s + f[j] * fn(e), 0);
    return {
      verschiebungen: b.verschiebungen.map((v, i) => ({ k: v.k, u: sum(e => e.verschiebungen[i].u), w: sum(e => e.verschiebungen[i].w), phi: sum(e => e.verschiebungen[i].phi) })),
      reaktionen: b.reaktionen.map((r, i) => ({ k: r.k, Rx: sum(e => e.reaktionen[i].Rx), Rz: sum(e => e.reaktionen[i].Rz), M: sum(e => e.reaktionen[i].M) })),
      residuum: { x: sum(e => e.residuum.x), z: sum(e => e.residuum.z) },
      staebe: b.staebe.map((s, si) => {
        const verlauf = s.verlauf.map((p, k) => ({ x: p.x, N: sum(e => e.staebe[si].verlauf[k].N), V: sum(e => e.staebe[si].verlauf[k].V), M: sum(e => e.staebe[si].verlauf[k].M) }));
        const verf = s.verf.map((p, k) => {
          const w = key => sum(e => e.staebe[si].verf[k][key]);
          return { x: p.x, w: w("w"), u: w("u"), f: w("f"), dU: w("dU"), dW: w("dW") };
        });
        let fmax = 0; verf.forEach(p => { if (Math.abs(p.f) > Math.abs(fmax)) fmax = p.f; });
        return { nr: s.nr, el: s.el, L: s.L, verlauf, verf, fmax, ext: Superposition.extremwerte(verlauf) };
      }),
    };
  }

  static extremwerte(v) {
    const ext = {};
    for (const g of ["N", "V", "M"]) {
      let mx = v[0], mn = v[0];
      v.forEach(p => { if (p[g] > mx[g]) mx = p; if (p[g] < mn[g]) mn = p; });
      ext[g] = { max: mx[g], xmax: mx.x, min: mn[g], xmin: mn.x };
    }
    return ext;
  }

  /**
   * Umhüllende über mehrere Kombinationen.
   * @returns {{max:Object, min:Object, ext:Array, reakt:Array, versch:Array, namen:string[]}}
   *  max/min: ergebnisähnliche Objekte (punktweise Maxima/Minima von N, V, M); ext: Extremwerte je Stab mit Kombinationsnummer
   */
  static umhuelle(ergs, namen) {
    const b = ergs[0];
    const punktweise = pick => ({
      verschiebungen: b.verschiebungen, reaktionen: b.reaktionen, residuum: b.residuum,
      staebe: b.staebe.map((s, si) => ({
        nr: s.nr, el: s.el, L: s.L, verf: s.verf, fmax: s.fmax,
        verlauf: s.verlauf.map((p, k) => ({ x: p.x, ...Object.fromEntries(["N", "V", "M"].map(g => [g, pick(...ergs.map(e => e.staebe[si].verlauf[k][g]))])) })),
      })),
    });
    const max = punktweise(Math.max), min = punktweise(Math.min);
    max.staebe.forEach(s => { s.ext = Superposition.extremwerte(s.verlauf); });
    min.staebe.forEach(s => { s.ext = Superposition.extremwerte(s.verlauf); });
    // Extremwerte je Stab mit maßgebender Kombination
    const ext = b.staebe.map((s, si) => {
      const o = { nr: s.nr, L: s.L };
      for (const g of ["N", "V", "M"]) {
        let hi = { w: -Infinity, k: 0, x: 0 }, lo = { w: Infinity, k: 0, x: 0 };
        ergs.forEach((e, k) => { const x = e.staebe[si].ext[g]; if (x.max > hi.w) hi = { w: x.max, k, x: x.xmax }; if (x.min < lo.w) lo = { w: x.min, k, x: x.xmin }; });
        o[g] = { max: hi.w, kMax: hi.k, min: lo.w, kMin: lo.k };
      }
      let f = { w: 0, k: 0 };
      ergs.forEach((e, k) => { if (Math.abs(e.staebe[si].fmax) > Math.abs(f.w)) f = { w: e.staebe[si].fmax, k }; });
      o.f = f;
      return o;
    });
    const reakt = b.reaktionen.map((r, i) => {
      const o = { k: r.k };
      for (const g of ["Rx", "Rz", "M"]) {
        const w = ergs.map(e => e.reaktionen[i][g]);
        o[g] = { max: Math.max(...w), kMax: w.indexOf(Math.max(...w)), min: Math.min(...w), kMin: w.indexOf(Math.min(...w)) };
      }
      return o;
    });
    const versch = b.verschiebungen.map((v, i) => {
      const o = { k: v.k };
      for (const g of ["u", "w", "phi"]) {
        const w = ergs.map(e => e.verschiebungen[i][g]);
        o[g] = { max: Math.max(...w), kMax: w.indexOf(Math.max(...w)), min: Math.min(...w), kMin: w.indexOf(Math.min(...w)) };
      }
      return o;
    });
    return { max, min, ext, reakt, versch, namen };
  }
}

/** Rechnet jede Einwirkung einzeln (Superpositionsbasis) und liefert Kombinationsergebnisse. */
class LastfallRechner {
  /** @param {Object} modell Stabwerksmodell, Lasten mit Feld ew (Nr. der Einwirkung, 1-basiert) */
  constructor(modell, nGruppen) {
    this.m = modell; this.n = nGruppen;
    // Einwirkungen mit mindestens einer Last (ungleich null)
    this.aktiv = new Set();
    const merk = (ew, wert) => { if (wert && ew >= 1 && ew <= nGruppen) this.aktiv.add(ew - 1); };
    modell.knotenlasten.forEach(l => merk(l.ew, l.Fx || l.Fz || l.M));
    modell.strecken.forEach(l => merk(l.ew, l.q));
    modell.einzel.forEach(l => merk(l.ew, l.F));
    this.einzeln = [];
    for (let g = 0; g < nGruppen; g++) this.einzeln.push(this.aktiv.has(g) ? new Stabwerk(this._modell(g)).berechne() : null);
    // Ersatz für unbelegte Einwirkungen: Nullergebnis (ein belegtes dient als Strukturvorlage)
    this.vorlage = this.einzeln.find(Boolean) || new Stabwerk(this._modell(-1)).berechne();
    this.einzeln = this.einzeln.map(e => e || Superposition.kombiniere([this.vorlage], [0]));
  }

  /** Modell, in dem nur die Lasten der Einwirkung g (0-basiert) wirken; alle anderen Lasten mit Wert 0 (gleiche Stützstellen). */
  _modell(g) {
    const m = this.m, an = l => (l.ew - 1 === g ? 1 : 0);
    return {
      ...m,
      knotenlasten: m.knotenlasten.map(l => ({ ...l, Fx: l.Fx * an(l), Fz: l.Fz * an(l), M: l.M * an(l) })),
      strecken: m.strecken.map(l => ({ ...l, q: l.q * an(l) })),
      einzel: m.einzel.map(l => ({ ...l, F: l.F * an(l) })),
    };
  }

  /** Ergebnis einer Kombination (Faktoren je Einwirkung) */
  kombination(faktoren) { return Superposition.kombiniere(this.einzeln, faktoren); }
}
