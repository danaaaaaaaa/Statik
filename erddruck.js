/**
 * Lastermittlung: Erddruck auf eine lotrechte Wand (ebenes Problem, je m Wandlänge).
 *
 *  - Erddruckbeiwerte nach Coulomb/Müller-Breslau (horizontale Komponente, Wand lotrecht), wie in DIN 4085 für
 *    ebene Gleitflächen; je Schicht automatisch aus φ', δ und Geländeneigung β oder vom Anwender vorgegeben.
 *  - Erddruckarten: aktiv, erhöht aktiv (Mittel aus aktiv und Ruhedruck), Ruhedruck, passiv; frei wählbarer Faktor.
 *  - Schichtweise Wichten, Kohäsion, Wandreibung; Auflast und Grundwasser.
 * Intern: m, kN, kN/m², Winkel in Grad (Eingabe) bzw. rad (Rechnung).
 */

const GRAD = Math.PI / 180;
const GAMMA_W = 10;            // Wichte des Wassers [kN/m³]

/** Erddruckbeiwerte (horizontale Komponente) für lotrechte Wand. Rückgabe NaN, wenn die Formel nicht definiert ist. */
class Erddruckbeiwerte {
  /** Aktiv (Coulomb): K_agh = cos²φ / [1 + √(sin(φ+δ)·sin(φ−β)/(cosδ·cosβ))]² */
  static aktiv(phi, delta, beta) {
    const f = Math.sin(phi + delta) * Math.sin(phi - beta) / (Math.cos(delta) * Math.cos(beta));
    if (f < 0 || beta > phi) return NaN;
    return Math.cos(phi) ** 2 / (1 + Math.sqrt(f)) ** 2;
  }

  /** Ruhedruck (Jaky), bei ansteigendem Gelände: K_0 = (1 − sinφ)·(1 + sinβ) */
  static ruhe(phi, beta) { return (1 - Math.sin(phi)) * (1 + Math.sin(beta)); }

  /** Passiv (Coulomb, ebene Gleitfläche): K_pgh = cos²φ / [1 − √(sin(φ+δ)·sin(φ+β)/(cosδ·cosβ))]² */
  static passiv(phi, delta, beta) {
    const w = Math.sqrt(Math.sin(phi + delta) * Math.sin(phi + beta) / (Math.cos(delta) * Math.cos(beta)));
    if (!(w < 1)) return NaN;
    return Math.cos(phi) ** 2 / (1 - w) ** 2;
  }
}

/** Erddruckberechnung für einen geschichteten Boden. */
class Erddruck {
  /**
   * @param {{art:string, faktor:number, p:number, beta:number, gw:number, wasser:boolean,
   *          schichten:Array<{name:string,d:number,g:number,gs:number,phi:number,c:number,delta:number,ka:number,k0:number,kp:number}>}} m
   *   art: "aktiv" | "erhoeht" | "ruhe" | "passiv"; p: Auflast [kN/m²]; beta: Geländeneigung [°];
   *   gw: Grundwasser, Tiefe unter Geländeoberkante [m] (NaN = kein Grundwasser); ka/k0/kp: vorgegebene Beiwerte (NaN = berechnen)
   */
  constructor(m) { this.m = m; }

  /** Beiwerte je Schicht: automatisch oder vorgegeben. */
  beiwerte() {
    const b = this.m.beta * GRAD;
    return this.m.schichten.map(s => {
      const phi = s.phi * GRAD, del = s.delta * GRAD;
      const auto = {
        ka: phi === 0 ? 1 : Erddruckbeiwerte.aktiv(phi, del, b),
        k0: phi === 0 ? 1 : Erddruckbeiwerte.ruhe(phi, b),
        kp: phi === 0 ? 1 : Erddruckbeiwerte.passiv(phi, del, b),
      };
      const pick = (u, a) => (Number.isFinite(u) && u > 0 ? u : a);
      return { auto, ka: pick(s.ka, auto.ka), k0: pick(s.k0, auto.k0), kp: pick(s.kp, auto.kp) };
    });
  }

  /** Prüfung der Eingaben; liefert einen Fehlertext oder null. */
  pruefe() {
    const m = this.m;
    if (!m.schichten.length) return "Bitte mindestens eine Schicht eingeben.";
    if (!(m.beta >= 0 && m.beta < 90) || !(m.p >= 0)) return "Geländeneigung (0…90°) und Auflast (≥ 0) prüfen.";
    if (!(m.faktor > 0)) return "Der Faktor muss größer 0 sein.";
    for (const [n, s] of m.schichten.entries()) {
      const nr = `Schicht ${n + 1}`;
      if (!(s.d > 0)) return `${nr}: Die Dicke muss größer 0 sein.`;
      if (!(s.g > 0)) return `${nr}: Die Wichte γ muss größer 0 sein.`;
      if (!(s.phi >= 0 && s.phi < 60)) return `${nr}: Reibungswinkel φ′ zwischen 0° und 60° eingeben.`;
      if (!(s.c >= 0)) return `${nr}: Kohäsion c′ ≥ 0 eingeben.`;
      if (!(s.delta >= 0 && s.delta <= s.phi)) return `${nr}: Wandreibungswinkel δ muss zwischen 0° und φ′ liegen.`;
    }
    const k = this.beiwerte();
    for (const [n, s] of m.schichten.entries()) {
      if (m.art !== "ruhe" && m.art !== "passiv" && !Number.isFinite(k[n].ka)) return `Schicht ${n + 1}: K<sub>agh</sub> nicht berechenbar (Geländeneigung β größer als φ′?). Beiwert manuell eingeben.`;
      if (m.art === "passiv" && !Number.isFinite(k[n].kp)) return `Schicht ${n + 1}: K<sub>pgh</sub> nicht berechenbar. Beiwert manuell eingeben.`;
    }
    return null;
  }

  /** Berechnung: Spannungsverlauf, Stücke (lineare Abschnitte), Resultierende. */
  berechne() {
    const fehler = this.pruefe(); if (fehler) return { fehler };
    const m = this.m, K = this.beiwerte(), gw = Number.isFinite(m.gw) && m.gw >= 0 ? m.gw : Infinity;
    const H = m.schichten.reduce((a, s) => a + s.d, 0), hinweise = [];

    // Segmente (an Schichtgrenzen und Grundwasserspiegel geteilt) mit effektiver vertikaler Spannung σ'v
    const seg = [];
    let z = 0, sv = m.p;
    m.schichten.forEach((s, i) => {
      const grenzen = [z, ...(gw > z + 1e-9 && gw < z + s.d - 1e-9 ? [gw] : []), z + s.d];
      const gs = s.gs > 0 ? s.gs : Math.max(s.g - GAMMA_W, 1);
      for (let j = 0; j < grenzen.length - 1; j++) {
        const z1 = grenzen[j], z2 = grenzen[j + 1], gam = (z1 + z2) / 2 >= gw ? gs : s.g;
        seg.push({ i, z1, z2, gam, sv1: sv, sv2: sv + gam * (z2 - z1) });
        sv += gam * (z2 - z1);
      }
      z += s.d;
    });

    // Erddruckspannungen je Segment; bei aktivem Druck Nulldurchgang (Zugzone) berücksichtigen
    const f = m.faktor, art = m.art, stuecke = [];
    let zug = false;                                   // Zugzone (negativer aktiver Erddruck) vorhanden?
    seg.forEach(sg => {
      const s = m.schichten[sg.i], k = K[sg.i], c = s.c;
      const fa = v => k.ka * v - 2 * c * Math.sqrt(k.ka), fp = v => k.kp * v + 2 * c * Math.sqrt(k.kp), f0 = v => k.k0 * v;
      const e = v => f * (art === "aktiv" ? Math.max(0, fa(v)) : art === "ruhe" ? f0(v) : art === "passiv" ? fp(v)
        : 0.5 * (Math.max(0, fa(v)) + f0(v)));
      let teile = [[sg.z1, sg.z2, sg.sv1, sg.sv2]];
      if ((art === "aktiv" || art === "erhoeht") && fa(sg.sv1) < -1e-9) zug = true;
      if ((art === "aktiv" || art === "erhoeht") && c > 0 && (fa(sg.sv1) < 0) !== (fa(sg.sv2) < 0)) {
        const svN = 2 * c * Math.sqrt(k.ka) / k.ka, zN = sg.z1 + (svN - sg.sv1) / sg.gam;
        teile = [[sg.z1, zN, sg.sv1, svN], [zN, sg.z2, svN, sg.sv2]];
      }
      for (const [z1, z2, v1, v2] of teile) stuecke.push({ i: sg.i, z1, z2, sv1: v1, sv2: v2, e1: e(v1), e2: e(v2), gam: sg.gam });
    });
    if (zug)
      hinweise.push("Bei Kohäsion entsteht oben eine Zugzone: der aktive Erddruck wird dort zu null gesetzt (kein Zug an der Wand).");

    // Resultierende: Eh = Σ Trapezflächen, Angriffshöhe über Wandfuß aus dem Moment
    let Eh = 0, Mfuss = 0, Ev = 0;
    for (const t of stuecke) {
      const dz = t.z2 - t.z1, E = (t.e1 + t.e2) / 2 * dz;
      const zc = (t.e1 + t.e2) > 1e-12 ? t.z1 + dz * (t.e1 + 2 * t.e2) / (3 * (t.e1 + t.e2)) : t.z1 + dz / 2;
      t.E = E; t.zc = zc; Eh += E; Mfuss += E * (H - zc);
      if (art === "aktiv" || art === "passiv") Ev += E * Math.tan(m.schichten[t.i].delta * GRAD);
    }
    // Wasserdruck (hydrostatisch, getrennt ausgewiesen)
    const hw = Math.max(0, H - gw), W = 0.5 * GAMMA_W * hw * hw, ezW = hw / 3;
    if (art === "passiv") hinweise.push("Passiver Erddruck: Coulomb mit ebener Gleitfläche überschätzt K<sub>p</sub> bei δ<sub>p</sub> &gt; φ′/3 (DIN 4085: gekrümmte Gleitfläche). Für Nachweise Beiwerte prüfen oder manuell vorgeben und die zur Mobilisierung nötige Verschiebung beachten.");
    if (art === "erhoeht") hinweise.push("Erhöhter aktiver Erddruck: e = 0,5·(e<sub>a</sub> + e<sub>0</sub>); Wandreibung wird nicht angesetzt (E<sub>v</sub> = 0).");
    if (art === "ruhe") hinweise.push("Ruhedruck: Wandreibung wird nicht angesetzt (E<sub>v</sub> = 0); Kohäsion bleibt unberücksichtigt.");
    if (m.beta > 0) hinweise.push("Geländeneigung β wirkt nur über die Beiwerte; die Auflast p wird als gleichmäßig verteilt auf der Geländeoberfläche angesetzt.");

    const erg = { fehler: null, H, K, stuecke, Eh, Ev, ez: Eh > 1e-12 ? Mfuss / Eh : 0, W, ezW, hw, gw, hinweise };
    erg.eMax = Math.max(1e-9, ...stuecke.map(t => Math.max(t.e1, t.e2)));
    erg.uMax = GAMMA_W * hw;
    return erg;
  }

  /** Werte in der Tiefe z (für die Mausabfrage): σ'v, e_h, Wasserdruck und Schicht. */
  static werteBei(erg, z) {
    const t = erg.stuecke.find(s => z >= s.z1 - 1e-9 && z <= s.z2 + 1e-9);
    if (!t) return null;
    const r = t.z2 > t.z1 ? (z - t.z1) / (t.z2 - t.z1) : 0;
    return { z, i: t.i, sv: t.sv1 + (t.sv2 - t.sv1) * r, e: t.e1 + (t.e2 - t.e1) * r, u: GAMMA_W * Math.max(0, z - erg.gw) };
  }
}
