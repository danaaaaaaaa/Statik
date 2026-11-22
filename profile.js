"use strict";

/**
 * profile.js - Gewalzte Stahlprofile (Normreihen) als Querschnitte.
 *
 * Die Profile werden aus den Katalogabmessungen als Polygon mit Ausrundungen aufgebaut,
 * Fläche, Trägheits- und Widerstandsmomente ergeben sich daraus (keine Tabellenwerte hinterlegt).
 *
 * Inhalt:
 *  - Datentabellen   : IPE, HEA, HEB, HEM, UPN, Hohlprofile
 *  - Walzprofil      : Basisklasse (Auswahlliste, Abmessungen)
 *  - IProfil / IPE / HEA / HEB / HEM : I- und H-Profile mit Parallelflanschen
 *  - UProfil / UPN   : U-Profile mit geneigten Flanschen (8 %)
 *  - Hohlprofil / Rundrohr / Quadratrohr / Rechteckrohr
 *  - Registrierung in QUERSCHNITTE
 *
 * Voraussetzung: querschnitte.js wurde vorher geladen.
 */

/* ======================= Datentabellen ======================= */

/** Zeilen: [Bezeichnung, h, b, t_w, t_f, r] in mm (r = Ausrundung zwischen Steg und Flansch). */
const TAB_IPE = [
  ["IPE 80", 80, 46, 3.8, 5.2, 5], ["IPE 100", 100, 55, 4.1, 5.7, 7], ["IPE 120", 120, 64, 4.4, 6.3, 7],
  ["IPE 140", 140, 73, 4.7, 6.9, 7], ["IPE 160", 160, 82, 5, 7.4, 9], ["IPE 180", 180, 91, 5.3, 8, 9],
  ["IPE 200", 200, 100, 5.6, 8.5, 12], ["IPE 220", 220, 110, 5.9, 9.2, 12], ["IPE 240", 240, 120, 6.2, 9.8, 15],
  ["IPE 270", 270, 135, 6.6, 10.2, 15], ["IPE 300", 300, 150, 7.1, 10.7, 15], ["IPE 330", 330, 160, 7.5, 11.5, 18],
  ["IPE 360", 360, 170, 8, 12.7, 18], ["IPE 400", 400, 180, 8.6, 13.5, 21], ["IPE 450", 450, 190, 9.4, 14.6, 21],
  ["IPE 500", 500, 200, 10.2, 16, 21], ["IPE 550", 550, 210, 11.1, 17.2, 24], ["IPE 600", 600, 220, 12, 19, 24],
];

const TAB_HEA = [
  ["HEA 100", 96, 100, 5, 8, 12], ["HEA 120", 114, 120, 5, 8, 12], ["HEA 140", 133, 140, 5.5, 8.5, 12],
  ["HEA 160", 152, 160, 6, 9, 15], ["HEA 180", 171, 180, 6, 9.5, 15], ["HEA 200", 190, 200, 6.5, 10, 18],
  ["HEA 220", 210, 220, 7, 11, 18], ["HEA 240", 230, 240, 7.5, 12, 21], ["HEA 260", 250, 260, 7.5, 12.5, 24],
  ["HEA 280", 270, 280, 8, 13, 24], ["HEA 300", 290, 300, 8.5, 14, 27], ["HEA 320", 310, 300, 9, 15.5, 27],
  ["HEA 340", 330, 300, 9.5, 16.5, 27], ["HEA 360", 350, 300, 10, 17.5, 27], ["HEA 400", 390, 300, 11, 19, 27],
  ["HEA 450", 440, 300, 11.5, 21, 27], ["HEA 500", 490, 300, 12, 23, 27], ["HEA 550", 540, 300, 12.5, 24, 27],
  ["HEA 600", 590, 300, 13, 25, 27], ["HEA 650", 640, 300, 13.5, 26, 27], ["HEA 700", 690, 300, 14.5, 27, 27],
  ["HEA 800", 790, 300, 15, 28, 30], ["HEA 900", 890, 300, 16, 30, 30], ["HEA 1000", 990, 300, 16.5, 31, 30],
];

const TAB_HEB = [
  ["HEB 100", 100, 100, 6, 10, 12], ["HEB 120", 120, 120, 6.5, 11, 12], ["HEB 140", 140, 140, 7, 12, 12],
  ["HEB 160", 160, 160, 8, 13, 15], ["HEB 180", 180, 180, 8.5, 14, 15], ["HEB 200", 200, 200, 9, 15, 18],
  ["HEB 220", 220, 220, 9.5, 16, 18], ["HEB 240", 240, 240, 10, 17, 21], ["HEB 260", 260, 260, 10, 17.5, 24],
  ["HEB 280", 280, 280, 10.5, 18, 24], ["HEB 300", 300, 300, 11, 19, 27], ["HEB 320", 320, 300, 11.5, 20.5, 27],
  ["HEB 340", 340, 300, 12, 21.5, 27], ["HEB 360", 360, 300, 12.5, 22.5, 27], ["HEB 400", 400, 300, 13.5, 24, 27],
  ["HEB 450", 450, 300, 14, 26, 27], ["HEB 500", 500, 300, 14.5, 28, 27], ["HEB 550", 550, 300, 15, 29, 27],
  ["HEB 600", 600, 300, 15.5, 30, 27], ["HEB 650", 650, 300, 16, 31, 27], ["HEB 700", 700, 300, 17, 32, 27],
  ["HEB 800", 800, 300, 17.5, 33, 30], ["HEB 900", 900, 300, 18.5, 35, 30], ["HEB 1000", 1000, 300, 19, 36, 30],
];

const TAB_HEM = [
  ["HEM 100", 120, 106, 12, 20, 12], ["HEM 120", 140, 126, 12.5, 21, 12], ["HEM 140", 160, 146, 13, 22, 12],
  ["HEM 160", 180, 166, 14, 23, 15], ["HEM 180", 200, 186, 14.5, 24, 15], ["HEM 200", 220, 206, 15, 25, 18],
  ["HEM 220", 240, 226, 15.5, 26, 18], ["HEM 240", 270, 248, 18, 32, 21], ["HEM 260", 290, 268, 18, 32.5, 24],
  ["HEM 280", 310, 288, 18.5, 33, 24], ["HEM 300", 340, 310, 21, 39, 27], ["HEM 320", 359, 309, 21, 40, 27],
  ["HEM 340", 377, 309, 21, 40, 27], ["HEM 360", 395, 308, 21, 40, 27], ["HEM 400", 432, 307, 21, 40, 27],
  ["HEM 450", 478, 307, 21, 40, 27], ["HEM 500", 524, 306, 21, 40, 27], ["HEM 550", 572, 306, 21, 40, 27],
  ["HEM 600", 620, 305, 21, 40, 27], ["HEM 650", 668, 305, 21, 40, 27], ["HEM 700", 716, 304, 21, 40, 27],
  ["HEM 800", 814, 303, 21, 40, 30], ["HEM 900", 910, 302, 21, 40, 30], ["HEM 1000", 1008, 302, 21, 40, 30],
];

/** U-Profile (DIN 1026): [Bezeichnung, h, b, t_w, t_f, r1]; t_f gilt im Abstand b/2 vom Flanschende, r2 = r1/2. */
const TAB_UPN = [
  ["UPN 80", 80, 45, 6, 8, 8], ["UPN 100", 100, 50, 6, 8.5, 8.5], ["UPN 120", 120, 55, 7, 9, 9],
  ["UPN 140", 140, 60, 7, 10, 10], ["UPN 160", 160, 65, 7.5, 10.5, 10.5], ["UPN 180", 180, 70, 8, 11, 11],
  ["UPN 200", 200, 75, 8.5, 11.5, 11.5], ["UPN 220", 220, 80, 9, 12.5, 12.5], ["UPN 240", 240, 85, 9.5, 13, 13],
  ["UPN 260", 260, 90, 10, 14, 14], ["UPN 280", 280, 95, 10, 15, 15], ["UPN 300", 300, 100, 10, 16, 16],
  ["UPN 320", 320, 100, 14, 17.5, 17.5], ["UPN 350", 350, 100, 14, 16, 16], ["UPN 380", 380, 102, 13.5, 16, 16],
  ["UPN 400", 400, 110, 14, 18, 18],
];

/** Rundrohre: [Außendurchmesser d, Wanddicke t] in mm. */
const TAB_CHS = [
  [33.7, 3.2], [42.4, 3.2], [48.3, 3.2], [48.3, 5], [60.3, 3.2], [60.3, 5], [76.1, 3.2], [76.1, 5],
  [88.9, 4], [88.9, 6.3], [114.3, 4], [114.3, 6.3], [139.7, 5], [139.7, 8], [168.3, 5], [168.3, 8],
  [193.7, 6.3], [193.7, 10], [219.1, 6.3], [219.1, 10], [244.5, 8], [244.5, 12.5], [273, 8], [273, 12.5],
  [323.9, 8], [323.9, 12.5], [355.6, 10], [355.6, 16], [406.4, 10], [406.4, 16], [457, 12.5], [508, 12.5], [508, 16],
];

/** Quadratische Hohlprofile: [Seitenlänge, Wanddicke] in mm. */
const TAB_SHS = [
  [40, 3], [40, 4], [50, 4], [50, 5], [60, 4], [60, 5], [70, 5], [80, 4], [80, 5], [80, 6.3], [90, 5],
  [100, 4], [100, 5], [100, 6.3], [100, 8], [120, 5], [120, 6.3], [120, 8], [140, 6.3], [140, 8], [140, 10],
  [150, 6.3], [150, 8], [150, 10], [160, 8], [160, 10], [180, 8], [180, 10], [200, 8], [200, 10], [200, 12.5],
  [220, 10], [250, 10], [250, 12.5], [250, 16], [300, 10], [300, 12.5], [300, 16], [350, 12.5], [350, 16],
  [400, 12.5], [400, 16],
];

/** Rechteckige Hohlprofile: [Höhe h, Breite b, Wanddicke t] in mm. */
const TAB_RHS = [
  [50, 30, 3], [60, 40, 4], [80, 40, 4], [100, 50, 4], [100, 60, 5], [120, 60, 5], [120, 80, 5],
  [140, 80, 5], [140, 80, 6.3], [150, 100, 6.3], [160, 80, 6.3], [180, 100, 6.3], [200, 100, 6.3], [200, 100, 8],
  [200, 120, 8], [250, 150, 8], [250, 150, 10], [260, 140, 10], [300, 200, 8], [300, 200, 10], [300, 200, 12.5],
  [400, 200, 10], [400, 200, 12.5], [400, 300, 12.5], [500, 300, 12.5], [500, 300, 16],
];

/** Zahl mit Dezimalkomma als Text (für Profilbezeichnungen). */
const kommaText = x => String(x).replace(".", ",");

/* ======================= Walzprofile mit Tabelle ======================= */

/** Basisklasse für Profile, die über eine Auswahlliste gewählt werden. */
class Walzprofil extends Querschnitt {
  static get gruppe() { return "Walzprofile"; }
  /** Datentabelle der Reihe (in Unterklassen überschreiben). */
  static get tabelle() { throw new Error("nicht implementiert"); }
  /** Voreingestellte Profilbezeichnung. */
  static get standard() { return this.tabelle[0][0]; }
  static get felder() {
    return [{ id: "profil", label: "Profil", optionen: this.tabelle.map(r => r[0]), wert: this.standard }];
  }

  /** Abmessungen des gewählten Profils (null, wenn unbekannt). */
  abm() {
    const r = this.constructor.tabelle.find(z => z[0] === this.w.profil);
    return r ? { h: r[1], b: r[2], tw: r[3], tf: r[4], r: r[5] } : null;
  }
  pruefe() { return this.abm() ? null : "Unbekanntes Profil: " + this.w.profil; }
}

/** I- und H-Profile mit parallelen Flanschen (gemeinsame Geometrie von IPE, HEA, HEB, HEM). */
class IProfil extends Walzprofil {
  erzeugeTeile() {
    const { h, b, tw, tf, r } = this.abm();
    const x1 = b / 2 - tw / 2, x2 = b / 2 + tw / 2; // Stegflächen
    // Umriss mit ausgerundeten Hohlkehlen (r) zwischen Steg und Flanschen
    return [new PolygonTeil(Geometrie.runde([
      { y: 0, z: 0 }, { y: b, z: 0 }, { y: b, z: tf },
      { y: x2, z: tf, r }, { y: x2, z: h - tf, r },
      { y: b, z: h - tf }, { y: b, z: h }, { y: 0, z: h }, { y: 0, z: h - tf },
      { y: x1, z: h - tf, r }, { y: x1, z: tf, r }, { y: 0, z: tf },
    ]))];
  }
  // Flanschüberstand c = (b - t_w - 2r)/2, Stegmaß c = h - 2 t_f - 2r
  klassen(fy) {
    const { h, b, tw, tf, r } = this.abm();
    return Klassifizierung.iProfil((b - tw - 2 * r) / 2, tf, h - 2 * tf - 2 * r, tw, Klassifizierung.eps(fy));
  }
  // gewalzt: A_v,z = A - 2 b t_f + (t_w + 2r) t_f, mindestens η h_w t_w (η = 1,0 nach NA DE); A_v,y = A - h_w t_w
  schubflaechen() {
    const { h, b, tw, tf, r } = this.abm(), hw = h - 2 * tf;
    return {
      z: Math.max(this.A - 2 * b * tf + (tw + 2 * r) * tf, hw * tw),
      y: this.A - hw * tw,
      hinweis: "Gewalzter I-Querschnitt: A<sub>v</sub> nach EN 1993-1-1, 6.2.6(3) a), η = 1,0.",
    };
  }
  nachweisdaten() { const { h, b, tw, tf } = this.abm(); return { art: "I", b, h, tf, tw }; }
}

class IPE extends IProfil {
  static get titel() { return "IPE"; }
  static get tabelle() { return TAB_IPE; }
  static get standard() { return "IPE 300"; }
}
class HEA extends IProfil {
  static get titel() { return "HEA"; }
  static get tabelle() { return TAB_HEA; }
  static get standard() { return "HEA 200"; }
}
class HEB extends IProfil {
  static get titel() { return "HEB"; }
  static get tabelle() { return TAB_HEB; }
  static get standard() { return "HEB 200"; }
}
class HEM extends IProfil {
  static get titel() { return "HEM"; }
  static get tabelle() { return TAB_HEM; }
  static get standard() { return "HEM 200"; }
}

/** U-Profile mit geneigten Flanschinnenflächen (8 %), Steg links, Flansche zeigen nach rechts. */
class UProfil extends Walzprofil {
  static get NEIGUNG() { return 0.08; }

  erzeugeTeile() {
    const { h, b, tw, tf, r } = this.abm();
    const n = UProfil.NEIGUNG;
    const tr = tf + n * (b / 2 - tw); // Flanschdicke am Steg
    const tt = tf - n * (b / 2);      // Flanschdicke am Flanschende
    return [new PolygonTeil(Geometrie.runde([
      { y: 0, z: 0 }, { y: b, z: 0 },
      { y: b, z: tt, r: r / 2 }, { y: tw, z: tr, r },
      { y: tw, z: h - tr, r }, { y: b, z: h - tt, r: r / 2 },
      { y: b, z: h }, { y: 0, z: h },
    ]))];
  }
  // Flanschüberstand c = b - t_w - r, Stegmaß c = h - 2 t_f - 2r
  klassen(fy) {
    const { h, b, tw, tf, r } = this.abm();
    return Klassifizierung.iProfil(b - tw - r, tf, h - 2 * tf - 2 * r, tw, Klassifizierung.eps(fy));
  }
  // gewalzt: A_v,z = A - 2 b t_f + (t_w + r) t_f (mindestens h_w t_w); A_v,y wie bei I-Profilen angesetzt
  schubflaechen() {
    const { h, b, tw, tf, r } = this.abm(), hw = h - 2 * tf;
    return {
      z: Math.max(this.A - 2 * b * tf + (tw + r) * tf, hw * tw),
      y: this.A - hw * tw,
      hinweis: "U-Profil: A<sub>v,z</sub> nach EN 1993-1-1, 6.2.6(3) b); A<sub>v,y</sub> wie bei I-Profilen angesetzt. Schubmittelpunkt nicht berücksichtigt.",
    };
  }
  nachweisdaten() { const { h, b, tw, tf } = this.abm(); return { art: "U", b, h, tf, tw }; }
}

class UPN extends UProfil {
  static get titel() { return "UPN"; }
  static get tabelle() { return TAB_UPN; }
  static get standard() { return "UPN 200"; }
}

/* ======================= Hohlprofile ======================= */

/** Rundrohr nach Normreihe (Geometrie und Nachweise wie Rohr). */
class Rundrohr extends Rohr {
  static get titel() { return "Rundrohr (CHS)"; }
  static get gruppe() { return "Walzprofile"; }
  static bez([d, t]) { return `CHS ${kommaText(d)} × ${kommaText(t)}`; }
  static get felder() {
    return [{ id: "profil", label: "Rohr Ø × t [mm]", optionen: TAB_CHS.map(r => Rundrohr.bez(r)), wert: Rundrohr.bez([168.3, 5]) }];
  }
  constructor(werte) {
    const r = TAB_CHS.find(x => Rundrohr.bez(x) === werte.profil);
    super({ ...werte, d: r ? r[0] : 0, t: r ? r[1] : 0 });
  }
  pruefe() { return this.w.d > 0 ? super.pruefe() : "Unbekanntes Rohrprofil."; }
}

/**
 * Quadratische und rechteckige Hohlprofile mit ausgerundeten Ecken.
 * Eckradius außen nach EN 10219 (kaltgefertigt): 2t (t ≤ 6), 2,5t (6 < t ≤ 10), 3t (t > 10); innen r_o − t.
 */
class Hohlprofil extends Querschnitt {
  static get gruppe() { return "Walzprofile"; }
  /** Liste der Profile [h, b, t] (in Unterklassen überschreiben). */
  static get liste() { throw new Error("nicht implementiert"); }
  static bez([h, b, t]) { return `${h === b ? "SHS" : "RHS"} ${kommaText(h)}×${kommaText(b)}×${kommaText(t)}`; }
  static get felder() {
    return [{ id: "profil", label: "Profil h × b × t [mm]", optionen: this.liste.map(r => this.bez(r)), wert: this.bez(this.standard) }];
  }
  static get standard() { return this.liste[0]; }

  constructor(werte) {
    const K = new.target;
    const r = K.liste.find(x => K.bez(x) === werte.profil);
    super({ ...werte, h: r ? r[0] : 0, b: r ? r[1] : 0, t: r ? r[2] : 0 });
  }
  pruefe() { return this.w.h > 0 ? null : "Unbekanntes Hohlprofil."; }

  /** Außenradius der Ecken. */
  get ra() { const t = this.w.t; return t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t; }

  erzeugeTeile() {
    const { h, b, t } = this.w, ra = this.ra, ri = ra - t;
    const aussen = Geometrie.runde([{ y: 0, z: 0, r: ra }, { y: b, z: 0, r: ra }, { y: b, z: h, r: ra }, { y: 0, z: h, r: ra }]);
    const innen = Geometrie.runde([{ y: t, z: t, r: ri }, { y: b - t, z: t, r: ri }, { y: b - t, z: h - t, r: ri }, { y: t, z: h - t, r: ri }]);
    return [new PolygonTeil(aussen), new PolygonTeil(innen, -1)];
  }
  // gerade Wandbreite nach EN 1993-1-1, Tab. 5.2: c = b - 3t bzw. h - 3t
  klassen(fy) {
    const { h, b, t } = this.w;
    return Klassifizierung.hohlkasten(b - 3 * t, h - 3 * t, t, Klassifizierung.eps(fy));
  }
  // gewalzte Hohlprofile: A_v = A·h/(b+h) bzw. A·b/(b+h)
  schubflaechen() {
    const { h, b } = this.w;
    return { z: this.A * h / (b + h), y: this.A * b / (b + h), hinweis: "Hohlprofil: A<sub>v</sub> = A·h/(b+h) bzw. A·b/(b+h)." };
  }
  nachweisdaten() { const { h, b, t } = this.w; return { art: "RHS", b, h, t }; }
}

class Quadratrohr extends Hohlprofil {
  static get titel() { return "Quadratrohr (SHS)"; }
  static get liste() { return TAB_SHS.map(([a, t]) => [a, a, t]); }
  static get standard() { return [100, 100, 5]; }
}

class Rechteckrohr extends Hohlprofil {
  static get titel() { return "Rechteckrohr (RHS)"; }
  static get liste() { return TAB_RHS; }
  static get standard() { return [200, 100, 8]; }
}

/* ======================= Registrierung ======================= */

Object.assign(QUERSCHNITTE, {
  ipe: IPE, hea: HEA, heb: HEB, hem: HEM, upn: UPN,
  chs: Rundrohr, shs: Quadratrohr, rhs: Rechteckrohr,
});
