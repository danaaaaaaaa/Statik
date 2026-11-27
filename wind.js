"use strict";

/**
 * wind.js - Windlasten nach DIN EN 1991-1-4 mit Nationalem Anhang (Deutschland)
 *
 *   Windkalk      Rechenkern: Basisdruck, Böengeschwindigkeitsdruck q_p(z), Außendruckbeiwerte, Zonenmaße
 *   WindZeichnung Darstellung: q_p-Profil mit Höhenstaffelung und Grundriss mit Druckzonen
 *   WindSeite     Eingabemaske, Speicherplätze, Rückgängig/Wiederherstellen, Ergebnistabellen
 *
 * Umfang: Gebäude mit rechteckigem Grundriss, lotrechte Wände (Zonen A-E) und Flachdach (Zonen F-I).
 * Positive Werte = Druck auf die Fläche, negative = Sog.
 */

/** Windzonen nach NA: Basiswindgeschwindigkeit v_b,0 [m/s] und Basisgeschwindigkeitsdruck q_b [kN/m²] */
const WINDZONEN = { 1: { v: 22.5, q: 0.32 }, 2: { v: 25.0, q: 0.39 }, 3: { v: 27.5, q: 0.47 }, 4: { v: 30.0, q: 0.56 } };

/**
 * Böengeschwindigkeitsprofile q_p(z) = f·q_b·(z/10)^n · NN_mod (NA, Tabelle NA.B.2 / Anhang NA.B).
 * Je Profil Abschnitte {bis [m], f, n}: für z <= bis gilt q_p = f·q_b (konstant, n = 0) bzw. f·q_b·(z/10)^n.
 * abs = true: f ist ein absoluter Druck [kN/m²] (Inseln der Nordsee, unabhängig von der Windzone).
 */
const WINDPROFILE = {
  binnen: { text: "Binnenland (Mischprofil Geländekategorie II–III)", abschn: [{ bis: 7, f: 1.5, n: 0 }, { bis: 50, f: 1.7, n: 0.37 }, { bis: 300, f: 2.1, n: 0.24 }] },
  kueste: { text: "Küstennahe Gebiete, Inseln der Ostsee (Mischprofil)", abschn: [{ bis: 4, f: 1.8, n: 0 }, { bis: 50, f: 2.3, n: 0.27 }, { bis: 300, f: 2.6, n: 0.19 }] },
  nordsee: { text: "Inseln der Nordsee (nur Windzone 4)", abs: true, abschn: [{ bis: 2, f: 1.1, n: 0 }, { bis: 300, f: 1.5, n: 0.19 }] },
  I: { text: "Geländekategorie I (offene See, Seen)", abschn: [{ bis: 2, f: 1.9, n: 0 }, { bis: 300, f: 2.6, n: 0.19 }] },
  II: { text: "Geländekategorie II (offenes Gelände)", abschn: [{ bis: 4, f: 1.7, n: 0 }, { bis: 300, f: 2.1, n: 0.24 }] },
  III: { text: "Geländekategorie III (Vorstadt, Industrie)", abschn: [{ bis: 8, f: 1.5, n: 0 }, { bis: 300, f: 1.6, n: 0.31 }] },
  IV: { text: "Geländekategorie IV (Stadtgebiet)", abschn: [{ bis: 16, f: 1.3, n: 0 }, { bis: 300, f: 1.1, n: 0.40 }] },
};

/** Vereinfachtes Verfahren für h <= 25 m (Tabelle NA.B.3): q_p in kN/m² je Windzone 1..4 und Höhenbereich (<=10, <=18, <=25 m) */
const WIND_EINFACH = {
  binnen: [[0.50, 0.65, 0.80, 0.95], [0.65, 0.80, 0.95, 1.15], [0.75, 0.90, 1.10, 1.30]],
  kueste: [[null, 0.85, 1.05, 1.25], [null, 1.00, 1.20, 1.40], [null, 1.10, 1.30, 1.55]],
};

/**
 * Außendruckbeiwerte c_pe,10 / c_pe,1 lotrechter Wände (Tabelle 7.1 bzw. NA.1), Stützstellen h/d = 5, 1, 0,25 (dazwischen linear).
 * Je Zone [c_pe,10, c_pe,1].
 */
const CPE_WAND = {
  hd: [5, 1, 0.25],
  A: [[-1.4, -1.7], [-1.2, -1.4], [-1.2, -1.4]],
  B: [[-0.8, -1.1], [-0.8, -1.1], [-0.8, -1.1]],
  C: [[-0.5, -0.7], [-0.5, -0.5], [-0.5, -0.5]],
  D: [[0.8, 1.0], [0.8, 1.0], [0.7, 1.0]],
  E: [[-0.7, -0.7], [-0.5, -0.5], [-0.3, -0.5]],
};

/** Flachdach (Tabelle 7.2): Stützstellen h_p/h = 0 (scharfkantig), 0,025, 0,05, 0,10 (Attika); Zonen F, G, H, I (I: ±0,2) */
const CPE_FLACH = {
  hp: [0, 0.025, 0.05, 0.10],
  F: [[-1.8, -2.5], [-1.6, -2.2], [-1.4, -2.0], [-1.2, -1.8]],
  G: [[-1.2, -2.0], [-1.1, -1.8], [-0.9, -1.6], [-0.8, -1.4]],
  H: [[-0.7, -1.2], [-0.7, -1.2], [-0.7, -1.2], [-0.7, -1.2]],
};

/** Innendruckbeiwerte ohne dominante Öffnung (NA): Überdruck innen / Unterdruck innen */
const CPI = { plus: 0.2, minus: -0.3 };

class Windkalk {
  /** Lineare Interpolation in einer Stützstellentabelle (xs fallend oder steigend), Randwerte werden gehalten. */
  static interp(xs, ys, x) {
    const n = xs.length, auf = xs[0] < xs[n - 1];
    if (auf ? x <= xs[0] : x >= xs[0]) return ys[0];
    if (auf ? x >= xs[n - 1] : x <= xs[n - 1]) return ys[n - 1];
    for (let i = 0; i < n - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      if (auf ? (x >= a && x <= b) : (x <= a && x >= b)) return ys[i] + (ys[i + 1] - ys[i]) * (x - a) / (b - a);
    }
    return ys[n - 1];
  }

  /** Höhenfaktor NN_mod für Standorte über 800 m ü. NN; NaN über 1100 m (besondere Überlegungen nötig). */
  static nnMod(nn) {
    if (!(nn > 800)) return 1;
    if (nn <= 1100) return 0.2 + nn / 1000;
    return NaN;
  }

  /**
   * Böengeschwindigkeitsdruck q_p(z) [kN/m²] nach dem genauen Verfahren (Profilformeln).
   * @param {{zone:number, gel:string, nn:number}} m @param {number} z Höhe über Gelände [m]
   */
  static qpGenau(m, z) {
    const p = WINDPROFILE[m.gel], nn = Windkalk.nnMod(m.nn);
    if (!p) return NaN;
    const qb = p.abs ? 1 : WINDZONEN[m.zone].q;
    const a = p.abschn.find(s => z <= s.bis) || p.abschn[p.abschn.length - 1];
    return a.f * qb * (a.n ? Math.pow(z / 10, a.n) : 1) * nn;
  }

  /** Vereinfachter Wert nach Tabelle NA.B.3 für Gebäudehöhe h <= 25 m (konstant über die Höhe); null, wenn nicht anwendbar. */
  static qpEinfach(m, h) {
    const t = WIND_EINFACH[m.gel]; if (!t) return null;
    const i = h <= 10 ? 0 : h <= 18 ? 1 : h <= 25 ? 2 : -1;
    return i < 0 ? null : t[i][m.zone - 1] * Windkalk.nnMod(m.nn);
  }

  /** Prüfung der Eingaben; liefert Fehlertext oder null. */
  static pruefe(m) {
    if (!(m.h > 0 && m.b > 0 && m.d > 0)) return "Höhe h, Breite b und Tiefe d müssen größer als 0 sein.";
    if (!(m.zone >= 1 && m.zone <= 4)) return "Windzone 1 bis 4 wählen.";
    if (!(m.nn >= 0)) return "Geländehöhe über NN darf nicht negativ sein.";
    if (m.nn > 1100) return "Über 1100 m ü. NN sind nach NA besondere Überlegungen erforderlich – keine Berechnung.";
    if (m.gel === "nordsee" && m.zone !== 4) return "Inseln der Nordsee: Profil gilt nur für Windzone 4.";
    if (m.verf === "einfach") {
      if (!WIND_EINFACH[m.gel]) return "Das vereinfachte Verfahren gilt nur für Binnenland und Küste/Ostsee-Inseln.";
      if (m.h + (m.dach === "attika" ? m.hp : 0) > 25) return "Vereinfachtes Verfahren nur für Gebäudehöhen bis 25 m.";
      if (m.gel === "kueste" && m.zone < 2) return "Küstenprofil (vereinfacht) gilt nur für die Windzonen 2 bis 4.";
    }
    if (m.dach === "attika" && !(m.hp >= 0)) return "Attikahöhe h_p muss ≥ 0 sein.";
    return null;
  }

  /** q_p an der Bezugshöhe ze (genau) bzw. konstanter Wert für das ganze Gebäude (vereinfacht). */
  static qp(m, ze) { return m.verf === "einfach" ? Windkalk.qpEinfach(m, m.h + (m.dach === "attika" ? m.hp : 0)) : Windkalk.qpGenau(m, ze); }

  /**
   * Staffelung der Bezugshöhe für die luvseitige Wand D (Bild 7.4): Streifen {von, bis, ze}.
   * h <= b: ein Streifen (ze = h); b < h <= 2b: unten ze = b, oben ze = h; h > 2b: unten ze = b, Mitte ze = h − b (Streifenoberkante), oben ze = h.
   */
  static streifen(h, b) {
    if (h <= b) return [{ von: 0, bis: h, ze: h }];
    if (h <= 2 * b) return [{ von: 0, bis: b, ze: b }, { von: b, bis: h, ze: h }];
    return [{ von: 0, bis: b, ze: b }, { von: b, bis: h - b, ze: h - b }, { von: h - b, bis: h, ze: h }];
  }

  /** Breiten der Wandzonen A, B, C entlang der Tiefe d (Bild 7.5): e = min(b, 2h). */
  static wandZonen(b, h, d) {
    const e = Math.min(b, 2 * h);
    if (e >= 5 * d) return { e, A: d, B: 0, C: 0 };
    if (e >= d) return { e, A: e / 5, B: d - e / 5, C: 0 };
    return { e, A: e / 5, B: 4 * e / 5, C: d - e };
  }

  /** Außendruckbeiwerte der Wandzonen für h/d: { A:[c10,c1], ... }. */
  static cpeWand(hd) {
    const r = {};
    for (const z of "ABCDE") r[z] = [0, 1].map(k => Windkalk.interp(CPE_WAND.hd, CPE_WAND[z].map(v => v[k]), hd));
    return r;
  }

  /** Außendruckbeiwerte Flachdach für h_p/h (0 = scharfkantig). */
  static cpeFlach(hph) {
    const r = {};
    for (const z of "FGH") r[z] = [0, 1].map(k => Windkalk.interp(CPE_FLACH.hp, CPE_FLACH[z].map(v => v[k]), hph));
    r.I = [-0.2, -0.2]; r.IP = [0.2, 0.2];                   // Zone I: ±0,2 (Sog und Druck gesondert ausweisen)
    return r;
  }

  /** Zonenmaße des Flachdachs (Bild 7.6) für Wind quer zur Breite b: e = min(b, 2h). */
  static dachZonen(b, h, d) {
    const e = Math.min(b, 2 * h);
    const aF = e / 4, tF = e / 10, bH = e / 2 - tF;
    const F = 2 * Math.min(aF, b / 2) * Math.min(tF, d), G = Math.max(0, b - 2 * aF) * Math.min(tF, d);
    const H = b * Math.max(0, Math.min(bH, d - tF)), I = Math.max(0, b * d - F - G - H);
    return { e, aF, tF, bH, AF: F, AG: G, AH: H, AI: I };
  }

  /** Gesamtberechnung. @returns {{fehler?:string}|object} */
  static berechne(m) {
    const fehler = Windkalk.pruefe(m); if (fehler) return { fehler };
    const hges = m.h + (m.dach === "attika" ? m.hp : 0);
    const qpH = Windkalk.qp(m, m.h), qpD = Windkalk.qp(m, hges);
    const hd = m.h / m.d, e = Math.min(m.b, 2 * m.h);
    const innen = m.innen;
    // Nettodruck (ungünstigster Innendruck): Sog außen + Überdruck innen bzw. Druck außen + Unterdruck innen
    const netto = (cpe, q) => !innen ? q * cpe : cpe < 0 ? q * (cpe - CPI.plus) : q * (cpe - CPI.minus);

    const strD = Windkalk.streifen(m.h, m.b).map(s => ({ ...s, q: Windkalk.qp(m, s.ze) }));
    const zon = Windkalk.wandZonen(m.b, m.h, m.d), cw = Windkalk.cpeWand(hd);
    const wand = [];
    for (const z of "ABCDE") {
      if ((z === "B" && zon.B <= 0) || (z === "C" && zon.C <= 0)) continue;
      // Druckzone D: Staffelung; Sogzonen: q_p(h)
      const reihe = z === "D" ? strD : [{ von: 0, bis: m.h, ze: m.h, q: qpH }];
      for (const s of reihe) wand.push({ zone: z, breite: z === "A" ? zon.A : z === "B" ? zon.B : z === "C" ? zon.C : m.b, von: s.von, bis: s.bis, q: s.q,
        cpe10: cw[z][0], cpe1: cw[z][1], w10: s.q * cw[z][0], w1: s.q * cw[z][1], wn: netto(cw[z][0], s.q), wn1: netto(cw[z][1], s.q) });
    }
    let dach = null;
    if (m.dach !== "keins") {
      const cf = Windkalk.cpeFlach(m.dach === "attika" ? Math.max(0, m.hp) / m.h : 0), dz = Windkalk.dachZonen(m.b, m.h, m.d);
      dach = { dz, zeilen: ["F", "G", "H", "I", "IP"].map(z => ({
        zone: z === "IP" ? "I (Druck)" : z === "I" ? "I (Sog)" : z, flaeche: { F: dz.AF, G: dz.AG, H: dz.AH, I: dz.AI, IP: dz.AI }[z], cpe10: cf[z][0], cpe1: cf[z][1],
        w10: qpD * cf[z][0], w1: qpD * cf[z][1], wn: netto(cf[z][0], qpD), wn1: netto(cf[z][1], qpD) })) };
    }
    // Resultierende Windkraft auf die Wandflächen (Luv D + Lee E, Wind in Richtung d): F_w = Σ w·A (nur Hinweis, ohne Reibung)
    const FD = strD.reduce((s, t) => s + t.q * Windkalk.interp(CPE_WAND.hd, CPE_WAND.D.map(v => v[0]), hd) * (t.bis - t.von) * m.b, 0);
    const FE = qpH * cw.E[0] * m.h * m.b;
    return { qpH, qpD, hd, e, zon, strD, wand, dach, FD, FE, Fw: FD - FE, qb: WINDZONEN[m.zone].q, vb: WINDZONEN[m.zone].v, nnMod: Windkalk.nnMod(m.nn) };
  }
}

/** Zeichnung: links q_p(z)-Profil mit Staffelung, rechts Grundriss mit Druckzonen. */
class WindZeichnung {
  constructor(cvProfil, cvPlan) { this.cp = cvProfil; this.cg = cvPlan; this.letzte = null; }

  neu() { if (this.letzte) this.zeichne(...this.letzte); }

  zeichne(m, erg) {
    this.letzte = [m, erg];
    this._profil(m, erg);
    this._plan(m, erg);
  }

  /** Profil: q_p über der Höhe (Kurve), Gebäudehöhe, gestaffelte Ansätze der Wand D. */
  _profil(m, erg) {
    const { g, w, h } = canvasVorbereiten(this.cp);
    if (!erg || erg.fehler || w < 80 || h < 80) return;
    const l = 46, r = 14, o = 16, u = 34;
    const hmax = (m.h + (m.dach === "attika" ? m.hp : 0)) * 1.15;
    const zs = Array.from({ length: 61 }, (_, i) => hmax * i / 60);
    const qs = zs.map(z => Windkalk.qp(m, Math.max(z, 0.5)));
    const qmax = Math.max(...qs, ...erg.strD.map(s => s.q)) * 1.08;
    const X = q => l + (w - l - r) * q / qmax, Y = z => h - u - (h - u - o) * z / hmax;
    g.font = "11px sans-serif"; g.strokeStyle = "#999"; g.fillStyle = "#555"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(l, o); g.lineTo(l, h - u); g.lineTo(w - r, h - u); g.stroke();
    g.textAlign = "right";
    for (let k = 0; k <= 4; k++) { const z = hmax * k / 4; g.fillText(fmt(z, hmax < 10 ? 1 : 0), l - 4, Y(z) + 4); g.beginPath(); g.moveTo(l - 3, Y(z)); g.lineTo(l, Y(z)); g.stroke(); }
    g.textAlign = "center";
    for (let k = 0; k <= 4; k++) { const q = qmax * k / 4; g.fillText(fmt(q, 2), X(q), h - u + 14); }
    g.fillText("q_p [kN/m²]", (l + w - r) / 2, h - 6);
    g.save(); g.translate(11, (o + h - u) / 2); g.rotate(-Math.PI / 2); g.fillText("Höhe z [m]", 0, 0); g.restore();
    // Kurve q_p(z)
    g.strokeStyle = "#1f4e79"; g.lineWidth = 2; g.beginPath();
    zs.forEach((z, i) => i ? g.lineTo(X(qs[i]), Y(z)) : g.moveTo(X(qs[i]), Y(z))); g.stroke();
    // Gebäudehöhe und Staffelung der Luvwand D (Stufen)
    g.setLineDash([4, 3]); g.strokeStyle = "#888"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(l, Y(m.h)); g.lineTo(w - r, Y(m.h)); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(211,84,0,.18)"; g.strokeStyle = "#d35400"; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(l, Y(0));
    for (const s of erg.strD) { g.lineTo(X(s.q), Y(s.von)); g.lineTo(X(s.q), Y(s.bis)); }
    g.lineTo(l, Y(m.h)); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#d35400"; g.textAlign = "left";
    for (const s of erg.strD) g.fillText(`${fmt(s.q, 2)}`, X(s.q) + 4, Y((s.von + s.bis) / 2) + 4);
    g.fillStyle = "#555"; g.fillText(`h = ${fmt(m.h, 1)} m`, l + 6, Y(m.h) - 4);
  }

  /** Grundriss mit Wandzonen (farbige Kanten) und Dachzonen (Flächen); Wind von links. */
  _plan(m, erg) {
    const { g, w, h } = canvasVorbereiten(this.cg);
    if (!erg || erg.fehler || w < 80 || h < 80) return;
    const rand = 46, sk = Math.min((w - 2 * rand - 24) / m.d, (h - 2 * rand) / m.b);
    const bw = m.d * sk, bh = m.b * sk, x0 = (w - bw) / 2 + 12, y0 = (h - bh) / 2;
    const FARBE = { A: "#c0392b", B: "#e67e22", C: "#f1c40f", D: "#2e86c1", E: "#8e44ad", F: "#c0392b", G: "#e67e22", H: "#f1c40f", I: "#bdc3c7" };
    g.font = "11px sans-serif";
    // Dachzonen (Draufsicht)
    if (erg.dach) {
      const dz = erg.dach.dz, aF = Math.min(dz.aF, m.b / 2), tF = Math.min(dz.tF, m.d), xH = Math.min(dz.e / 2, m.d);
      const rect = (x, y, bx, by, c) => { g.fillStyle = c; g.fillRect(x0 + x * sk, y0 + y * sk, bx * sk, by * sk); };
      rect(0, 0, m.d, m.b, FARBE.I);
      rect(tF, 0, xH - tF, m.b, FARBE.H);
      rect(0, 0, tF, m.b, FARBE.G);
      rect(0, 0, tF, aF, FARBE.F); rect(0, m.b - aF, tF, aF, FARBE.F);
      g.fillStyle = "#222"; g.textAlign = "center";
      g.fillText("F", x0 + tF * sk / 2, y0 + aF * sk / 2 + 4);
      if (tF * sk > 8) g.fillText("G", x0 + tF * sk / 2, y0 + bh / 2 + 4);
      g.fillText("H", x0 + (tF + xH) / 2 * sk, y0 + bh / 2 + 4);
      if (xH < m.d) g.fillText("I", x0 + (xH + m.d) / 2 * sk, y0 + bh / 2 + 4);
    } else { g.fillStyle = "#f4f6f8"; g.fillRect(x0, y0, bw, bh); }
    g.strokeStyle = "#444"; g.lineWidth = 1; g.strokeRect(x0, y0, bw, bh);
    // Wandzonen als dicke Kanten
    const zon = erg.zon; g.lineWidth = 6; g.lineCap = "butt";
    const kante = (x1, y1, x2, y2, c) => { g.strokeStyle = c; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    for (const yy of [y0 - 5, y0 + bh + 5]) {
      let x = 0;
      for (const [z, bz] of [["A", zon.A], ["B", zon.B], ["C", zon.C]]) {
        if (bz <= 0) continue; kante(x0 + x * sk, yy, x0 + (x + bz) * sk, yy, FARBE[z]);
        if (yy < y0) { g.fillStyle = "#222"; g.textAlign = "center"; g.fillText(`${z} ${fmt(bz, 1)} m`, x0 + (x + bz / 2) * sk, y0 - 12); }
        x += bz;
      }
    }
    kante(x0 - 5, y0, x0 - 5, y0 + bh, FARBE.D); kante(x0 + bw + 5, y0, x0 + bw + 5, y0 + bh, FARBE.E);
    g.fillStyle = "#222"; g.textAlign = "right"; g.fillText("D", x0 - 12, y0 + bh / 2 + 4); g.textAlign = "left"; g.fillText("E", x0 + bw + 12, y0 + bh / 2 + 4);
    // Windpfeil
    g.strokeStyle = g.fillStyle = "#1f4e79"; g.lineWidth = 2;
    const ay = y0 + bh + 24; g.beginPath(); g.moveTo(x0 - 34, ay); g.lineTo(x0 + 6, ay); g.stroke();
    g.beginPath(); g.moveTo(x0 + 12, ay); g.lineTo(x0 + 4, ay - 4); g.lineTo(x0 + 4, ay + 4); g.closePath(); g.fill();
    g.textAlign = "left"; g.fillText("Wind", x0 + 18, ay + 4);
    g.fillStyle = "#555"; g.textAlign = "center"; g.fillText(`d = ${fmt(m.d, 1)} m`, x0 + bw / 2, y0 + bh + 40 > h ? h - 2 : y0 + bh + 40);
    g.save(); g.translate(x0 - 26, y0 + bh / 2); g.rotate(-Math.PI / 2); g.fillText(`b = ${fmt(m.b, 1)} m`, 0, 0); g.restore();
  }
}

/** Seite „Lastermittlung › Wind“ */
class WindSeite {
  static FELDER = ["wi-zone", "wi-gel", "wi-verf", "wi-nn", "wi-h", "wi-b", "wi-d", "wi-dach", "wi-hp", "wi-innen", "wi-z"];

  constructor() {
    this.zeichnung = new WindZeichnung(document.getElementById("wi-profil"), document.getElementById("wi-plan"));
    WindSeite.FELDER.forEach(id => document.getElementById(id).addEventListener("input", () => this.aktualisiere()));
    document.getElementById("wi-beispiel").addEventListener("click", () => { this.lade(WindSeite.BEISPIEL()); this.aktualisiere(); });
    window.addEventListener("resize", () => { if (document.getElementById("tab-wind").classList.contains("aktiv")) this.aktualisiere(); });
    this.speicher = new ModellSpeicher(document.getElementById("wi-slots"), "wind-slots-1", 6, {
      holen: () => this.modell(),
      setzen: m => { this.lade(m); if (this.verlauf) this.verlauf.neu(); this.aktualisiere(); },
    });
    const start = this.speicher.start();
    this.lade(start && start.h ? start : WindSeite.BEISPIEL());
    this.verlauf = new Verlauf({
      holen: () => JSON.stringify(this.modell()),
      setzen: t => { this.lade(JSON.parse(t)); this.aktualisiere(); },
    });
    this.aktualisiere();
  }

  static BEISPIEL() { return { zone: 2, gel: "binnen", verf: "genau", nn: 0, h: 12, b: 20, d: 10, dach: "flach", hp: 0.5, innen: true, z: 10 }; }

  lade(m) {
    const s = (id, v) => { document.getElementById(id).value = v; };
    s("wi-zone", m.zone); s("wi-gel", m.gel); s("wi-verf", m.verf); s("wi-nn", m.nn); s("wi-h", m.h); s("wi-b", m.b); s("wi-d", m.d);
    s("wi-dach", m.dach); s("wi-hp", m.hp); s("wi-z", m.z);
    document.getElementById("wi-innen").checked = !!m.innen;
  }

  modell() {
    const v = id => { const x = parseFloat(document.getElementById(id).value); return Number.isFinite(x) ? x : NaN; };
    return { zone: v("wi-zone"), gel: document.getElementById("wi-gel").value, verf: document.getElementById("wi-verf").value, nn: v("wi-nn") || 0,
      h: v("wi-h"), b: v("wi-b"), d: v("wi-d"), dach: document.getElementById("wi-dach").value, hp: v("wi-hp") || 0,
      innen: document.getElementById("wi-innen").checked, z: v("wi-z") };
  }

  zeige() { Kopfleiste.setze(this.verlauf); this.aktualisiere(); }

  aktualisiere() {
    const m = this.modell(), box = document.getElementById("wi-ergebnis");
    document.getElementById("wi-hp-label").hidden = m.dach !== "attika";
    if (this.speicher) this.speicher.sichern();
    const erg = Windkalk.berechne(m);
    this.zeichnung.zeichne(m, erg);
    box.innerHTML = erg.fehler ? `<span class="fehler">${erg.fehler}</span>` : this._html(m, erg);
    if (this.verlauf) this.verlauf.merke();
  }

  _html(m, e) {
    const f = (v, d = 2) => fmt(v, d);
    let h = `<h3>Geschwindigkeitsdruck ${infoBtn("windQp")}</h3><table>`;
    h += `<tr><td>Windzone ${m.zone}: v<sub>b,0</sub> / q<sub>b</sub></td><td>${f(e.vb, 1)} m/s / ${f(e.qb, 2)}</td><td>kN/m²</td></tr>`;
    if (e.nnMod !== 1) h += `<tr><td>Höhenfaktor NN<sub>mod</sub></td><td>${f(e.nnMod, 3)}</td><td></td></tr>`;
    h += `<tr><td>${m.verf === "einfach" ? "q<sub>p</sub> vereinfacht (Tab. NA.B.3), für das ganze Gebäude" : "q<sub>p</sub>(z<sub>e</sub> = h = " + f(m.h, 1) + " m)"}</td><td><b>${f(e.qpH, 3)}</b></td><td>kN/m²</td></tr>`;
    if (m.dach === "attika") h += `<tr><td>q<sub>p</sub>(z<sub>e</sub> = h + h<sub>p</sub> = ${f(m.h + m.hp, 2)} m) für das Dach</td><td>${f(e.qpD, 3)}</td><td>kN/m²</td></tr>`;
    if (m.z > 0) { const q = Windkalk.qp(m, m.z); h += `<tr><td>q<sub>p</sub> in beliebiger Höhe z = ${f(m.z, 1)} m</td><td>${f(q, 3)}</td><td>kN/m²</td></tr>`; }
    h += "</table>";

    h += `<h3>Lotrechte Wände ${infoBtn("windWand")}</h3><p class="hinweis">h/d = ${f(e.hd, 2)}; e = min(b; 2h) = ${f(e.e, 2)} m. Positiv = Druck, negativ = Sog. Spalte „netto“: ${m.innen ? "mit ungünstigstem Innendruck (c<sub>pi</sub> = +0,2 / −0,3)" : "ohne Innendruck"}.</p>`;
    h += "<table><tr><th>Zone</th><th>Breite [m]</th><th>Höhe [m]</th><th>q<sub>p</sub></th><th>c<sub>pe,10</sub></th><th>w<sub>e,10</sub></th><th>netto</th><th>c<sub>pe,1</sub></th><th>w<sub>e,1</sub></th></tr>";
    for (const r of e.wand) h += `<tr><td><b>${r.zone}</b></td><td>${f(r.breite, 2)}</td><td>${f(r.von, 1)}–${f(r.bis, 1)}</td><td>${f(r.q, 3)}</td><td>${f(r.cpe10, 2)}</td><td><b>${f(r.w10, 3)}</b></td><td>${f(r.wn, 3)}</td><td>${f(r.cpe1, 2)}</td><td>${f(r.w1, 3)}</td></tr>`;
    h += `</table><p class="hinweis">Alle Drücke w in kN/m². Gesamtkraft in Windrichtung aus D und E (ohne Dach, Reibung): F<sub>w</sub> = ${f(e.Fw, 1)} kN (D: ${f(e.FD, 1)}, E: ${f(-e.FE, 1)}) – gilt für Wind in Richtung d, Anströmbreite b = ${f(m.b, 1)} m. Linienlast auf die Wand: w·Einflussbreite.</p>`;

    if (e.dach) {
      h += `<h3>Flachdach ${m.dach === "attika" ? `mit Attika (h<sub>p</sub>/h = ${f(m.hp / m.h, 3)})` : "scharfkantig"} ${infoBtn("windDach")}</h3>`;
      h += `<p class="hinweis">Zonen für Wind quer zu b: Randstreifen e/10 = ${f(e.dach.dz.tF, 2)} m, F-Länge e/4 = ${f(e.dach.dz.aF, 2)} m, H-Tiefe bis e/2 = ${f(e.dach.dz.e / 2, 2)} m.</p>`;
      h += "<table><tr><th>Zone</th><th>Fläche [m²]</th><th>c<sub>pe,10</sub></th><th>w<sub>e,10</sub></th><th>netto</th><th>c<sub>pe,1</sub></th><th>w<sub>e,1</sub></th></tr>";
      for (const r of e.dach.zeilen) h += `<tr><td><b>${r.zone}</b></td><td>${f(r.flaeche, 1)}</td><td>${f(r.cpe10, 2)}</td><td><b>${f(r.w10, 3)}</b></td><td>${f(r.wn, 3)}</td><td>${f(r.cpe1, 2)}</td><td>${f(r.w1, 3)}</td></tr>`;
      h += "</table>";
    }
    const hinw = [];
    if (e.hd > 5) hinw.push("h/d > 5: Gesamtwindlast nach DIN EN 1991-1-4/NA, 7.6 bis 7.9 ermitteln; die Tabellenwerte gelten bis h/d = 5.");
    if (m.h > 25 && m.verf === "genau") hinw.push("h > 25 m: Prüfung, ob die Schwingungsempfindlichkeit (Böenreaktionsfaktor) zu untersuchen ist.");
    hinw.push("Nicht enthalten: geneigte Dächer, Vordächer, freistehende Wände/Schilder, Reibung, Kraftbeiwerte von Bauteilen, dominante Öffnungen, Schwingungsuntersuchung.");
    return h + "<ul>" + hinw.map(t => `<li>${t}</li>`).join("") + "</ul>";
  }
}
