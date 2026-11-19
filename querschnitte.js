"use strict";

/**
 * querschnitte.js - Querschnittsklassen für die elastische Spannungsberechnung.
 *
 * Lokales Koordinatensystem beim Aufbau: Ursprung links oben, y nach rechts, z nach UNTEN.
 * Nach außen (Spannungen, 3D) gelten Schwerpunktkoordinaten (Ursprung im Schwerpunkt).
 * Jeder Querschnitt setzt sich aus Teilflächen zusammen (positiv = Material,
 * negativ = Aussparung). Alle Querschnitte sind symmetrisch zur vertikalen Achse
 * (deshalb ist das Deviationsmoment Iyz = 0).
 * Einheiten: mm, mm², mm⁴.
 */

/* ======================= Teilflächen ======================= */

/** Abstrakte Basisklasse einer Teilfläche. */
class Teilflaeche {
  constructor(vorzeichen = 1) {
    this.vz = vorzeichen; // +1 = Material, -1 = Aussparung
  }
  flaeche() { throw new Error("nicht implementiert"); }
  schwerpunkt() { throw new Error("nicht implementiert"); }
  iEigenY() { throw new Error("nicht implementiert"); } // um die eigene horizontale Achse
  iEigenZ() { throw new Error("nicht implementiert"); } // um die eigene vertikale Achse
  enthaelt(y, z) { throw new Error("nicht implementiert"); }
  randpunkte(n) { throw new Error("nicht implementiert"); }
  /** Statisches Moment des Anteils oberhalb der Grenze zg (lokales z, nach unten) bezogen auf zg. */
  momentOberhalb(zg) { throw new Error("nicht implementiert"); }
}

/** Rechteckige Teilfläche, (y, z) = linke obere Ecke. */
class RechteckTeil extends Teilflaeche {
  constructor(y, z, b, h, vz = 1) {
    super(vz);
    this.y = y; this.z = z; this.b = b; this.h = h;
  }
  flaeche() { return this.b * this.h; }
  schwerpunkt() { return { y: this.y + this.b / 2, z: this.z + this.h / 2 }; }
  iEigenY() { return this.b * this.h ** 3 / 12; }
  iEigenZ() { return this.h * this.b ** 3 / 12; }
  enthaelt(y, z) {
    return y >= this.y && y <= this.y + this.b && z >= this.z && z <= this.z + this.h;
  }
  randpunkte() {
    const { y, z, b, h } = this;
    return [{ y, z }, { y: y + b, z }, { y: y + b, z: z + h }, { y, z: z + h }];
  }
  momentOberhalb(zg) {
    const hh = Math.min(Math.max(zg - this.z, 0), this.h); // Höhe des Anteils oberhalb zg
    return this.b * hh * (zg - (this.z + hh / 2));
  }
}

/** Kreisförmige Teilfläche, (cy, cz) = Mittelpunkt, d = Durchmesser. */
class KreisTeil extends Teilflaeche {
  constructor(cy, cz, d, vz = 1) {
    super(vz);
    this.cy = cy; this.cz = cz; this.d = d;
  }
  flaeche() { return Math.PI * this.d ** 2 / 4; }
  schwerpunkt() { return { y: this.cy, z: this.cz }; }
  iEigenY() { return Math.PI * this.d ** 4 / 64; }
  iEigenZ() { return Math.PI * this.d ** 4 / 64; }
  enthaelt(y, z) { return (y - this.cy) ** 2 + (z - this.cz) ** 2 <= (this.d / 2) ** 2; }
  randpunkte(n = 72) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const w = 2 * Math.PI * i / n;
      p.push({ y: this.cy + this.d / 2 * Math.cos(w), z: this.cz + this.d / 2 * Math.sin(w) });
    }
    return p;
  }
  /** Numerische Integration in dünnen Streifen (Fehler vernachlässigbar). */
  momentOberhalb(zg) {
    const r = this.d / 2, z0 = this.cz - r, z1 = Math.min(zg, this.cz + r);
    if (z1 <= z0) return 0;
    const n = 2000, dz = (z1 - z0) / n;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const zm = z0 + (i + 0.5) * dz;
      const breite = 2 * Math.sqrt(Math.max(0, r * r - (zm - this.cz) ** 2));
      s += breite * dz * (zg - zm);
    }
    return s;
  }
}

/* ======================= Basisklasse Querschnitt ======================= */

class Querschnitt {
  /** @param {Object} werte Maße gemäß static felder, z. B. {b: 200, h: 400} */
  constructor(werte) {
    this.w = werte;
    const fehler = this.pruefe();
    if (fehler) throw new Error(fehler);
    this.teile = this.erzeugeTeile();
    this._kennwerte();
  }

  /** Anzeigename (in Unterklassen überschreiben). */
  static get titel() { return "Querschnitt"; }
  /** Eingabefelder {id, label, wert} (in Unterklassen überschreiben). */
  static get felder() { return []; }

  /** Plausibilitätsprüfung; gibt Fehlertext oder null zurück. */
  pruefe() {
    for (const f of this.constructor.felder) {
      if (!(this.w[f.id] > 0)) return `${f.label} muss größer 0 sein.`;
    }
    return null;
  }

  /** Teilflächen aufbauen (in Unterklassen überschreiben). */
  erzeugeTeile() { throw new Error("nicht implementiert"); }

  /** Fläche, Schwerpunkt, Trägheitsmomente und Umrandung berechnen. */
  _kennwerte() {
    let A = 0, Sy = 0, Sz = 0;
    for (const t of this.teile) {
      const a = t.vz * t.flaeche(), c = t.schwerpunkt();
      A += a; Sy += a * c.z; Sz += a * c.y;
    }
    this.A = A;
    this.ys = Sz / A; // Schwerpunkt in lokalen Koordinaten (von links)
    this.zs = Sy / A; // Schwerpunkt in lokalen Koordinaten (von oben)

    // Trägheitsmomente um die Schwerachsen (Steiner-Anteile)
    let Iy = 0, Iz = 0;
    for (const t of this.teile) {
      const a = t.flaeche(), c = t.schwerpunkt();
      Iy += t.vz * (t.iEigenY() + a * (c.z - this.zs) ** 2);
      Iz += t.vz * (t.iEigenZ() + a * (c.y - this.ys) ** 2);
    }
    this.Iy = Iy; this.Iz = Iz;

    // Umrandungsrechteck in Schwerpunktkoordinaten (aus den Materialteilen)
    const pts = this.randpunkte(72);
    this.ymin = Math.min(...pts.map(p => p.y)); this.ymax = Math.max(...pts.map(p => p.y));
    this.zmin = Math.min(...pts.map(p => p.z)); this.zmax = Math.max(...pts.map(p => p.z));
  }

  /* ---------- abgeleitete Querschnittswerte (mm, mm², mm³, mm⁴) ---------- */
  get breite() { return this.ymax - this.ymin; }
  get hoehe() { return this.zmax - this.zmin; }
  get Wyo() { return this.Iy / Math.abs(this.zmin); }   // oben
  get Wyu() { return this.Iy / this.zmax; }             // unten
  get Wz() { return this.Iz / Math.max(Math.abs(this.ymin), this.ymax); }
  get iy() { return Math.sqrt(this.Iy / this.A); }      // Trägheitsradius
  get iz() { return Math.sqrt(this.Iz / this.A); }
  get Ip() { return this.Iy + this.Iz; }                // polares Flächenmoment
  /** Statisches Moment der Fläche oberhalb der Schwerachse (maßgebend für Schubspannungen). */
  get Sy() {
    let s = 0;
    for (const t of this.teile) s += t.vz * t.momentOberhalb(this.zs);
    return s;
  }

  /** Punkt (Schwerpunktkoordinaten) im Querschnitt? */
  enthaelt(y, z) {
    const yl = y + this.ys, zl = z + this.zs;
    let s = 0;
    for (const t of this.teile) if (t.enthaelt(yl, zl)) s += t.vz;
    return s > 0.5;
  }

  /** Randpunkte der Materialteile in Schwerpunktkoordinaten (dort liegen die Extremwerte). */
  randpunkte(n = 72) {
    const out = [];
    for (const t of this.teile) {
      if (t.vz < 0) continue;
      for (const p of t.randpunkte(n)) out.push({ y: p.y - this.ys, z: p.z - this.zs });
    }
    return out;
  }

  /** Raster aus Zellen innerhalb des Querschnitts (für die farbige Darstellung). */
  zellen(ny = 60, nz = 60) {
    const dy = (this.ymax - this.ymin) / ny, dz = (this.zmax - this.zmin) / nz;
    const out = [];
    for (let i = 0; i < ny; i++) {
      for (let j = 0; j < nz; j++) {
        const y = this.ymin + (i + 0.5) * dy, z = this.zmin + (j + 0.5) * dz;
        if (this.enthaelt(y, z)) out.push({ y, z, dy, dz });
      }
    }
    return out;
  }
}

/* ======================= Konkrete Querschnitte ======================= */

class Rechteck extends Querschnitt {
  static get titel() { return "Rechteck"; }
  static get felder() {
    return [
      { id: "b", label: "Breite b [mm]", wert: 200 },
      { id: "h", label: "Höhe h [mm]", wert: 400 },
    ];
  }
  erzeugeTeile() { return [new RechteckTeil(0, 0, this.w.b, this.w.h)]; }
}

class TQuerschnitt extends Querschnitt {
  static get titel() { return "T-Querschnitt / Plattenbalken"; }
  static get felder() {
    return [
      { id: "bf", label: "Gurtbreite b_f [mm]", wert: 600 },
      { id: "hf", label: "Gurtdicke h_f [mm]", wert: 100 },
      { id: "bw", label: "Stegbreite b_w [mm]", wert: 200 },
      { id: "h", label: "Gesamthöhe h [mm]", wert: 400 },
    ];
  }
  pruefe() {
    const f = super.pruefe(); if (f) return f;
    const { bf, hf, bw, h } = this.w;
    if (bw > bf) return "Stegbreite darf nicht größer als die Gurtbreite sein.";
    if (hf >= h) return "Gurtdicke muss kleiner als die Gesamthöhe sein.";
    return null;
  }
  erzeugeTeile() {
    const { bf, hf, bw, h } = this.w;
    return [new RechteckTeil(0, 0, bf, hf), new RechteckTeil((bf - bw) / 2, hf, bw, h - hf)];
  }
}

class DoppelT extends Querschnitt {
  static get titel() { return "Doppel-T (symmetrisch)"; }
  static get felder() {
    return [
      { id: "b", label: "Flanschbreite b [mm]", wert: 150 },
      { id: "h", label: "Höhe h [mm]", wert: 300 },
      { id: "tf", label: "Flanschdicke t_f [mm]", wert: 10 },
      { id: "tw", label: "Stegdicke t_w [mm]", wert: 7 },
    ];
  }
  pruefe() {
    const f = super.pruefe(); if (f) return f;
    const { b, h, tf, tw } = this.w;
    if (tw >= b) return "Stegdicke muss kleiner als die Flanschbreite sein.";
    if (2 * tf >= h) return "Zwei Flanschdicken müssen kleiner als die Höhe sein.";
    return null;
  }
  erzeugeTeile() {
    const { b, h, tf, tw } = this.w;
    return [
      new RechteckTeil(0, 0, b, tf),
      new RechteckTeil((b - tw) / 2, tf, tw, h - 2 * tf),
      new RechteckTeil(0, h - tf, b, tf),
    ];
  }
}

class Kasten extends Querschnitt {
  static get titel() { return "Hohlkasten (Rechteck-Hohlprofil)"; }
  static get felder() {
    return [
      { id: "b", label: "Breite b [mm]", wert: 200 },
      { id: "h", label: "Höhe h [mm]", wert: 300 },
      { id: "t", label: "Wanddicke t [mm]", wert: 12 },
    ];
  }
  pruefe() {
    const f = super.pruefe(); if (f) return f;
    const { b, h, t } = this.w;
    if (2 * t >= b || 2 * t >= h) return "Wanddicke ist zu groß für die Außenmaße.";
    return null;
  }
  erzeugeTeile() {
    const { b, h, t } = this.w;
    return [new RechteckTeil(0, 0, b, h), new RechteckTeil(t, t, b - 2 * t, h - 2 * t, -1)];
  }
}

class Kreis extends Querschnitt {
  static get titel() { return "Kreis"; }
  static get felder() { return [{ id: "d", label: "Durchmesser d [mm]", wert: 300 }]; }
  erzeugeTeile() { return [new KreisTeil(this.w.d / 2, this.w.d / 2, this.w.d)]; }
}

class Rohr extends Querschnitt {
  static get titel() { return "Rohr (Kreisring)"; }
  static get felder() {
    return [
      { id: "d", label: "Außendurchmesser d [mm]", wert: 300 },
      { id: "t", label: "Wanddicke t [mm]", wert: 10 },
    ];
  }
  pruefe() {
    const f = super.pruefe(); if (f) return f;
    if (2 * this.w.t >= this.w.d) return "Wanddicke ist zu groß für den Durchmesser.";
    return null;
  }
  erzeugeTeile() {
    const { d, t } = this.w;
    return [new KreisTeil(d / 2, d / 2, d), new KreisTeil(d / 2, d / 2, d - 2 * t, -1)];
  }
}

/** Register aller Querschnitte (Schlüssel -> Klasse). Neue Querschnitte hier ergänzen. */
const QUERSCHNITTE = {
  rechteck: Rechteck,
  tquerschnitt: TQuerschnitt,
  doppelt: DoppelT,
  kasten: Kasten,
  kreis: Kreis,
  rohr: Rohr,
};
