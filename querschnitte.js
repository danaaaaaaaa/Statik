"use strict";

/**
 * querschnitte.js - Querschnittsklassen für Spannungs-, Querschnittswert- und Tragfähigkeitsberechnung.
 *
 * Lokales Koordinatensystem beim Aufbau: Ursprung links oben, y nach rechts, z nach UNTEN.
 * Nach außen (Spannungen, 3D) gelten Schwerpunktkoordinaten (Ursprung im Schwerpunkt).
 * Jeder Querschnitt setzt sich aus Teilflächen zusammen (positiv = Material, negativ = Aussparung).
 * Alle Querschnitte besitzen mindestens eine Symmetrieachse parallel zu y oder z; die Schwerachsen
 * sind damit Hauptachsen (Deviationsmoment Iyz = 0).
 * Einheiten: mm, mm², mm³, mm⁴.
 *
 * Inhalt:
 *  - Geometrie       : Polygon-Hilfsfunktionen (Kennwerte, Beschneiden, Ausrundungen)
 *  - Teilflaeche     : RechteckTeil, KreisTeil, PolygonTeil
 *  - Klassifizierung : Querschnittsklassen nach EN 1993-1-1, Tab. 5.2
 *  - Querschnitt     : Basisklasse (Kennwerte, plastisches Widerstandsmoment, Raster)
 *  - Parametrische Querschnitte (Rechteck, T, Doppel-T, Kasten, Kreis, Rohr)
 *  - QUERSCHNITTE    : Register (profile.js ergänzt die Walzprofile)
 */

/* ======================= Polygon-Geometrie ======================= */

class Geometrie {
  /** Fläche, Schwerpunkt und Eigenträgheitsmomente eines Polygons (Trapezformeln). */
  static kennwerte(p) {
    let a = 0, sy = 0, sz = 0, iyy = 0, izz = 0;
    for (let i = 0; i < p.length; i++) {
      const u = p[i], v = p[(i + 1) % p.length];
      const c = u.y * v.z - v.y * u.z;                    // Kreuzprodukt der Eckpunkte
      a += c;
      sy += (u.y + v.y) * c;
      sz += (u.z + v.z) * c;
      iyy += (u.z * u.z + u.z * v.z + v.z * v.z) * c;     // ∫ z² dA (bezogen auf den Ursprung)
      izz += (u.y * u.y + u.y * v.y + v.y * v.y) * c;     // ∫ y² dA (bezogen auf den Ursprung)
    }
    const As = a / 2, A = Math.abs(As), s = As < 0 ? -1 : 1; // s = Umlaufsinn
    if (A < 1e-12) return { A: 0, y: 0, z: 0, Iy: 0, Iz: 0 };
    const cy = sy / (6 * As), cz = sz / (6 * As);
    return { A, y: cy, z: cz, Iy: s * iyy / 12 - A * cz * cz, Iz: s * izz / 12 - A * cy * cy };
  }

  /** Beschneidet ein Polygon auf den Bereich "Koordinate achse <= g" (Sutherland-Hodgman). */
  static beschneide(p, achse, g) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const fa = a[achse] - g, fb = b[achse] - g;
      if (fa <= 0) out.push(a);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
        const t = fa / (fa - fb);
        out.push({ y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) });
      }
    }
    return out;
  }

  /**
   * Anteil des Polygons mit Koordinate < g (achse = 'z': oberhalb einer waagerechten Linie,
   * achse = 'y': links einer senkrechten Linie).
   * @returns {{A:number, S:number}} Fläche A und statisches Moment S = ∫ (g - Koordinate) dA bezogen auf g
   */
  static anteil(p, achse, g) {
    const q = this.beschneide(p, achse, g);
    if (q.length < 3) return { A: 0, S: 0 };
    const k = this.kennwerte(q);
    return { A: k.A, S: k.A * (g - k[achse]) };
  }

  /**
   * Rundet die Ecken eines Polygons mit Kreisbögen aus.
   * @param {Array} ecken Eckpunkte {y, z, r} (r > 0: Ausrundungsradius an dieser Ecke)
   * @param {number} n Segmente je Bogen
   * @returns {Array} Punkte {y, z} des ausgerundeten Polygons
   */
  static runde(ecken, n = 12) {
    const out = [], m = ecken.length;
    const einheit = (A, B) => {
      const dy = B.y - A.y, dz = B.z - A.z, l = Math.hypot(dy, dz);
      return { y: dy / l, z: dz / l };
    };
    for (let i = 0; i < m; i++) {
      const P = ecken[i], V = ecken[(i + m - 1) % m], N = ecken[(i + 1) % m];
      if (!(P.r > 0)) { out.push({ y: P.y, z: P.z }); continue; }
      const a = einheit(P, V), b = einheit(P, N);                         // Richtungen zu den Nachbarn
      const phi = Math.acos(Math.max(-1, Math.min(1, a.y * b.y + a.z * b.z))); // Öffnungswinkel
      const t = P.r / Math.tan(phi / 2);                                  // Tangentenlänge
      const e = { y: a.y + b.y, z: a.z + b.z }, le = Math.hypot(e.y, e.z);
      const dm = P.r / Math.sin(phi / 2);                                 // Abstand Eckpunkt - Bogenmittelpunkt
      const C = { y: P.y + e.y / le * dm, z: P.z + e.z / le * dm };       // Bogenmittelpunkt
      const T1 = { y: P.y + a.y * t, z: P.z + a.z * t };
      const T2 = { y: P.y + b.y * t, z: P.z + b.z * t };
      const w1 = Math.atan2(T1.z - C.z, T1.y - C.y);
      let dw = Math.atan2(T2.z - C.z, T2.y - C.y) - w1;
      while (dw > Math.PI) dw -= 2 * Math.PI;
      while (dw < -Math.PI) dw += 2 * Math.PI;
      for (let k = 0; k <= n; k++) {
        const w = w1 + dw * k / n;
        out.push({ y: C.y + P.r * Math.cos(w), z: C.z + P.r * Math.sin(w) });
      }
    }
    return out;
  }
}

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

  /** Anteil mit Koordinate < g (siehe Geometrie.anteil), hier über die Randpunkte berechnet. */
  anteil(achse, g) {
    return Geometrie.anteil(this.randpunkte(720), achse, g);
  }
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
}

/** Beliebige Teilfläche, begrenzt durch ein Polygon (z. B. Walzprofil mit Ausrundungen). */
class PolygonTeil extends Teilflaeche {
  /** @param {Array} punkte Eckpunkte {y, z} im lokalen Koordinatensystem */
  constructor(punkte, vz = 1) {
    super(vz);
    this.p = punkte;
    this.k = Geometrie.kennwerte(punkte);
  }
  flaeche() { return this.k.A; }
  schwerpunkt() { return { y: this.k.y, z: this.k.z }; }
  iEigenY() { return this.k.Iy; }
  iEigenZ() { return this.k.Iz; }
  randpunkte() { return this.p; }
  /** Punkt-in-Polygon-Test (Strahlverfahren). */
  enthaelt(y, z) {
    const p = this.p;
    let innen = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i].z > z) !== (p[j].z > z) &&
          y < (p[j].y - p[i].y) * (z - p[i].z) / (p[j].z - p[i].z) + p[i].y) innen = !innen;
    }
    return innen;
  }
}

/* ======================= Querschnittsklassen (EN 1993-1-1, Tab. 5.2) ======================= */

class Klassifizierung {
  /** ε = √(235 / f_y) */
  static eps(fy) { return Math.sqrt(235 / fy); }

  // Grenzwerte c/t für Klasse 1, 2, 3 als Vielfache von ε
  static get AUSSTEHEND() { return [9, 10, 14]; }       // gedrückter, einseitig gestützter Flansch (gewalzt/geschweißt)
  static get STEG_BIEGUNG() { return [72, 83, 124]; }   // Steg bzw. Wand unter reiner Biegung
  static get INNEN_DRUCK() { return [33, 38, 42]; }     // beidseitig gestützter Teil unter gleichmäßigem Druck
  static get ROHR() { return [50, 70, 90]; }            // Kreisrohr: d/t gegen Vielfache von ε²

  /** Einzelnachweis: Verhältnis c/t gegen die Grenzwerte -> Klasse 1 bis 4. */
  static teil(ct, grenzen, eps) {
    let klasse = 4;
    for (let i = 0; i < 3; i++) if (ct <= grenzen[i] * eps) { klasse = i + 1; break; }
    return { ct, klasse };
  }

  /** Fasst Einzelnachweise zusammen: maßgebend ist die ungünstigste Klasse. */
  static fasse(teile) {
    return { klasse: Math.max(...teile.map(t => t.klasse)), teile };
  }

  /** Vollquerschnitte (Rechteck, Kreis): keine Beulgefahr, Klasse 1. */
  static vollquerschnitt() {
    const k = { klasse: 1, teile: [], hinweis: "Vollquerschnitt (keine Beulgefahr)" };
    return { biegungY: k, biegungZ: k, druck: k };
  }

  /**
   * I-/H- und U-Querschnitte.
   * @param {number} cf Flanschüberstand (c), tf Flanschdicke, d Stegmaß (c), tw Stegdicke
   * Biegung um z: konservativ nur der Flansch (Druckgrenzwerte).
   */
  static iProfil(cf, tf, d, tw, eps) {
    const fl = this.teil(cf / tf, this.AUSSTEHEND, eps);
    const stB = this.teil(d / tw, this.STEG_BIEGUNG, eps);
    const stD = this.teil(d / tw, this.INNEN_DRUCK, eps);
    return {
      biegungY: this.fasse([{ name: "Flansch", ...fl }, { name: "Steg", ...stB }]),
      biegungZ: this.fasse([{ name: "Flansch", ...fl }]),
      druck: this.fasse([{ name: "Flansch", ...fl }, { name: "Steg", ...stD }]),
    };
  }

  /** Rechteck-Hohlquerschnitte: cb, ch = gerade Wandbreiten (Breite b bzw. Höhe h), t = Wanddicke. */
  static hohlkasten(cb, ch, t, eps) {
    const druckB = this.teil(cb / t, this.INNEN_DRUCK, eps);  // Wand der Breite b unter Druck
    const druckH = this.teil(ch / t, this.INNEN_DRUCK, eps);  // Wand der Höhe h unter Druck
    const biegB = this.teil(cb / t, this.STEG_BIEGUNG, eps);  // Wand der Breite b unter Biegung
    const biegH = this.teil(ch / t, this.STEG_BIEGUNG, eps);  // Wand der Höhe h unter Biegung
    return {
      biegungY: this.fasse([{ name: "Gurt (Breite)", ...druckB }, { name: "Steg (Höhe)", ...biegH }]),
      biegungZ: this.fasse([{ name: "Gurt (Höhe)", ...druckH }, { name: "Steg (Breite)", ...biegB }]),
      druck: this.fasse([{ name: "Wand (Breite)", ...druckB }, { name: "Wand (Höhe)", ...druckH }]),
    };
  }

  /** Kreisrohr: Verhältnis d/t. */
  static rohr(d, t, eps) {
    const k = this.fasse([{ name: "Rohr d/t", ...this.teil(d / t, this.ROHR, eps * eps) }]);
    return { biegungY: k, biegungZ: k, druck: k };
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
  /** Gruppe in der Auswahlliste. */
  static get gruppe() { return "Parametrische Querschnitte"; }
  /**
   * Eingabefelder (in Unterklassen überschreiben):
   * {id, label, wert} für Zahlenfelder, zusätzlich {optionen: [...]} für eine Auswahlliste.
   */
  static get felder() { return []; }

  /** Plausibilitätsprüfung; gibt Fehlertext oder null zurück. */
  pruefe() {
    for (const f of this.constructor.felder) {
      if (f.optionen) continue; // Auswahlfelder prüfen die Unterklassen selbst
      if (!(this.w[f.id] > 0)) return `${f.label} muss größer 0 sein.`;
    }
    return null;
  }

  /** Teilflächen aufbauen (in Unterklassen überschreiben). */
  erzeugeTeile() { throw new Error("nicht implementiert"); }

  /** Querschnittsklassen nach EN 1993-1-1 (null = nicht ermittelbar; in Unterklassen überschreiben). */
  klassen(fy) { return null; }

  /** Schubflächen {z, y, hinweis} in mm² nach EN 1993-1-1, 6.2.6(3) (null = nicht ermittelbar). */
  schubflaechen() { return null; }

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
  get Wely() { return Math.min(this.Wyo, this.Wyu); }   // elastisches Widerstandsmoment (kleinerer Wert)
  get Welz() { return this.Wz; }
  get iy() { return Math.sqrt(this.Iy / this.A); }      // Trägheitsradius
  get iz() { return Math.sqrt(this.Iz / this.A); }
  get Ip() { return this.Iy + this.Iz; }                // polares Flächenmoment
  get masse() { return this.A * 7850e-6; }              // Masse je Meter für Stahl (7850 kg/m³) in kg/m
  get Wply() { return this.plastisch("y").W; }          // plastisches Widerstandsmoment um y
  get Wplz() { return this.plastisch("z").W; }          // plastisches Widerstandsmoment um z

  /** Statisches Moment der Fläche oberhalb der Schwerachse (maßgebend für Schubspannungen). */
  get Sy() {
    let s = 0;
    for (const t of this.teile) s += t.vz * t.anteil("z", this.zs).S;
    return s;
  }

  /**
   * Plastische Nulllinie und plastisches Widerstandsmoment (reine Biegung, N = 0).
   * Die plastische Nulllinie teilt die Fläche in zwei gleich große Hälften.
   * @param {string} achse 'y' = Biegung um y (waagerechte Nulllinie), 'z' = Biegung um z (senkrechte Nulllinie)
   * @returns {{W:number, lage:number}} W in mm³, lage = Abstand der Nulllinie vom Schwerpunkt in mm
   */
  plastisch(achse) {
    if (!this._plCache) this._plCache = {};
    if (this._plCache[achse]) return this._plCache[achse];

    const ko = achse === "y" ? "z" : "y";                    // Koordinate, in der geschnitten wird
    const off = ko === "z" ? this.zs : this.ys;              // Schwerpunktlage (lokal)
    const lo = (ko === "z" ? this.zmin : this.ymin) + off;   // Grenzen in lokalen Koordinaten
    const hi = (ko === "z" ? this.zmax : this.ymax) + off;

    // Fläche A und statisches Moment S aller Teile mit Koordinate < g
    const bis = g => {
      let A = 0, S = 0;
      for (const t of this.teile) { const r = t.anteil(ko, g); A += t.vz * r.A; S += t.vz * r.S; }
      return { A, S };
    };

    // Nulllinie so bestimmen, dass beide Hälften gleich groß sind (Intervallhalbierung)
    const halbe = bis(hi + 1).A / 2;
    let a = lo, b = hi;
    for (let i = 0; i < 60; i++) {
      const m = (a + b) / 2;
      if (bis(m).A < halbe) a = m; else b = m;
    }
    const g = (a + b) / 2;

    // W_pl = Moment der einen Hälfte + Moment der anderen Hälfte (jeweils um die Nulllinie)
    const eine = bis(g).S;
    let andere = 0;
    for (const t of this.teile) {
      const c = t.schwerpunkt()[ko];
      andere += t.vz * (t.flaeche() * (c - g) + t.anteil(ko, g).S);
    }
    this._plCache[achse] = { W: eine + andere, lage: g - off };
    return this._plCache[achse];
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

  /** Raster mit etwa `ziel` Zellen innerhalb der Fläche (feiner bei dünnwandigen Profilen). */
  zellenAuto(ziel = 2500) {
    const s = Math.sqrt(this.A / ziel); // Zellkantenlänge
    const ny = Math.min(240, Math.max(30, Math.ceil(this.breite / s)));
    const nz = Math.min(240, Math.max(30, Math.ceil(this.hoehe / s)));
    return this.zellen(ny, nz);
  }
}

/* ======================= Parametrische Querschnitte ======================= */

class Rechteck extends Querschnitt {
  static get titel() { return "Rechteck"; }
  static get felder() {
    return [
      { id: "b", label: "Breite b [mm]", wert: 200 },
      { id: "h", label: "Höhe h [mm]", wert: 400 },
    ];
  }
  erzeugeTeile() { return [new RechteckTeil(0, 0, this.w.b, this.w.h)]; }
  klassen() { return Klassifizierung.vollquerschnitt(); }
  schubflaechen() { return { z: this.A, y: this.A, hinweis: "Rechteck: A<sub>v</sub> vereinfacht = A." }; }
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
  // geschweißter T-Querschnitt: A_v = t_w (h - t_f/2), Querkraft in Flanschrichtung nicht angegeben
  schubflaechen() {
    const { hf, bw, h } = this.w;
    return { z: bw * (h - hf / 2), y: null, hinweis: "T-Querschnitt: A<sub>v,z</sub> = t<sub>w</sub>·(h − t<sub>f</sub>/2) (geschweißt)." };
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
  // geschweißter Doppel-T (ohne Schweißnaht): Flanschüberstand c = (b - t_w)/2, Stegmaß d = h - 2 t_f
  klassen(fy) {
    const { b, h, tf, tw } = this.w;
    return Klassifizierung.iProfil((b - tw) / 2, tf, h - 2 * tf, tw, Klassifizierung.eps(fy));
  }
  // geschweißt: A_v,z = η·Σ h_w t_w (η = 1,0 nach NA DE), A_v,y = A − Σ h_w t_w
  schubflaechen() {
    const { h, tf, tw } = this.w, hw = h - 2 * tf;
    return { z: hw * tw, y: this.A - hw * tw, hinweis: "Geschweißter Doppel-T: A<sub>v,z</sub> = h<sub>w</sub>·t<sub>w</sub> (η = 1,0)." };
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
  // scharfkantiger (geschweißter) Kasten: lichte Wandbreiten b - 2t bzw. h - 2t
  klassen(fy) {
    const { b, h, t } = this.w;
    return Klassifizierung.hohlkasten(b - 2 * t, h - 2 * t, t, Klassifizierung.eps(fy));
  }
  schubflaechen() {
    const { h, t } = this.w, hw = h - 2 * t;
    return { z: 2 * hw * t, y: this.A - 2 * hw * t, hinweis: "Geschweißter Kasten: A<sub>v</sub> nach EN 1993-1-1, 6.2.6(3) d), e)." };
  }
}

class Kreis extends Querschnitt {
  static get titel() { return "Kreis"; }
  static get felder() { return [{ id: "d", label: "Durchmesser d [mm]", wert: 300 }]; }
  erzeugeTeile() { return [new KreisTeil(this.w.d / 2, this.w.d / 2, this.w.d)]; }
  klassen() { return Klassifizierung.vollquerschnitt(); }
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
  klassen(fy) { return Klassifizierung.rohr(this.w.d, this.w.t, Klassifizierung.eps(fy)); }
  schubflaechen() { return { z: 2 * this.A / Math.PI, y: 2 * this.A / Math.PI, hinweis: "Rohr: A<sub>v</sub> = 2A/π." }; }
}

/** Register aller Querschnitte (Schlüssel -> Klasse). Neue Querschnitte hier oder in profile.js ergänzen. */
const QUERSCHNITTE = {
  rechteck: Rechteck,
  tquerschnitt: TQuerschnitt,
  doppelt: DoppelT,
  kasten: Kasten,
  kreis: Kreis,
  rohr: Rohr,
};
