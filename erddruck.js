/**
 * Lastermittlung: Erddruck auf eine (ggf. geneigte) Wand (ebenes Problem, je m Wandlänge).
 *
 *  - Erddruckbeiwerte nach Coulomb/Müller-Breslau (horizontale Komponente, K_agh bzw. K_pgh) mit Wandneigung α,
 *    Wandreibung δ und Geländeneigung β; je Schicht automatisch oder vom Anwender vorgegeben.
 *  - Erddruckarten: aktiv, erhöht aktiv (Mittel aus aktiv und Ruhedruck), Ruhedruck, passiv; frei wählbarer Faktor.
 *  - Mindesterddruck (Vergleichsrechnung mit Mindest-φ′, c′ = 0), schichtweise Wichten, Kohäsion, Auflast, Grundwasser.
 *  - Zusätze (nur aktiv/erhöht): Verdichtungserddruck (Ingold), Linienlasten, Streifenlasten
 *    (Gleitflächen-/Ersatzlastverfahren, vereinfacht).
 * Vorzeichen Wandneigung: α > 0 = Wandkopf vom Boden weg geneigt, α < 0 = zum Boden hin (wie in der Formel für K_agh).
 * Intern: m, kN, kN/m², Winkel in Grad (Eingabe) bzw. rad (Rechnung).
 */

const GRAD = Math.PI / 180;
const GAMMA_W = 10;            // Wichte des Wassers [kN/m³]

/** Erddruckbeiwerte (horizontale Komponente). Rückgabe NaN, wenn die Formel nicht definiert ist. */
class Erddruckbeiwerte {
  /** Aktiv (Coulomb, allgemein): K_agh = cos²(φ−α) / { cos²α · [1 + √(sin(φ+δ)·sin(φ−β) / (cos(α+δ)·cos(α−β)))]² } */
  static aktiv(phi, delta, beta, alpha = 0) {
    const nenn = Math.cos(alpha + delta) * Math.cos(alpha - beta);
    const f = Math.sin(phi + delta) * Math.sin(phi - beta) / nenn;
    if (!(f >= 0) || beta > phi || !(nenn > 0)) return NaN;
    return Math.cos(phi - alpha) ** 2 / (Math.cos(alpha) ** 2 * (1 + Math.sqrt(f)) ** 2);
  }

  /** Ruhedruck (Jaky), bei ansteigendem Gelände: K_0 = (1 − sinφ)·(1 + sinβ); Wandneigung bleibt unberücksichtigt */
  static ruhe(phi, beta) { return (1 - Math.sin(phi)) * (1 + Math.sin(beta)); }

  /** Passiv (Coulomb, ebene Gleitfläche): K_pgh = cos²(φ+α) / { cos²α · [1 − √(sin(φ+δ)·sin(φ+β) / (cos(α−δ)·cos(α−β)))]² } */
  static passiv(phi, delta, beta, alpha = 0) {
    const nenn = Math.cos(alpha - delta) * Math.cos(alpha - beta);
    const w = Math.sqrt(Math.sin(phi + delta) * Math.sin(phi + beta) / nenn);
    if (!(w < 1) || !(nenn > 0)) return NaN;
    return Math.cos(phi + alpha) ** 2 / (Math.cos(alpha) ** 2 * (1 - w) ** 2);
  }

  /**
   * Passiv, gekrümmte Gleitflächen nach Pregl/Sokolowski (DIN 4085:2017, Gl. 41-43, Tabelle 3):
   *   K_pgh (Bodeneigengewicht), K_pph (großflächige Auflast), K_pch (Kohäsion) = cos(δp+α)·K_p,0·i·g·t
   * Winkel im Bogenmaß; DIN-Vorzeichen: δp = −δ (Wandreibung beim Erdwiderstand negativ), α wie beim aktiven Druck, β > 0 = steigendes Gelände.
   * Grundwerte K_p,0 (α = β = δp = 0): Rankine-Wert tan²(45°+φ/2) für Eigengewicht und Auflast, 2·tan(45°+φ/2) für Kohäsion
   * (die Gleichungen 35-37 der Norm lagen nicht vor; die Werte folgen aus dem Sonderfall der glatten, lotrechten Wand).
   * @returns {{g:number, p:number, c:number}}
   */
  static passivPregl(phi, delta, beta, alpha = 0) {
    if (phi <= 0) return { g: 1, p: 1, c: 2 };
    const dp = -delta, t = Math.tan(phi), kp0 = Math.tan(Math.PI / 4 + phi / 2) ** 2;
    // Wandreibung i
    const ipg = dp <= 0 ? (1 - 0.53 * dp) ** (0.26 + 5.96 * phi) : (1 + 0.41 * dp) ** -7.13;
    const ipp = dp <= 0 ? (1 - 1.33 * dp) ** (0.08 + 2.37 * phi) : (1 - 0.72 * dp) ** 2.81;
    const ipc = dp <= 0 ? ipp : (1 + 4.46 * dp * t) ** (-1.14 + 0.57 * phi);
    // Geländeneigung g
    const gpg = beta <= 0 ? (1 + 0.73 * beta) ** 2.89 : (1 + 0.35 * beta) ** (0.42 + 8.15 * phi);
    const gpp = beta <= 0 ? (1 + 1.16 * beta) ** 1.57 : (1 + 3.84 * beta) ** (0.98 * phi);
    const gpc = beta <= 0 ? (1 + 0.001 * beta * t) ** (205.4 + 2232 * phi) : Math.exp(2 * beta * t);
    // Wandneigung t
    const tpg = alpha <= 0 ? (1 + 0.72 * alpha * t) ** (-3.51 + 1.03 * phi) : (1 - 0.0012 * alpha * t) ** (2910 - 1958 * phi);
    const tpp = Math.exp(-2 * alpha * t) / Math.cos(alpha);
    const cs = Math.cos(dp + alpha);
    return { g: cs * kp0 * ipg * gpg * tpg, p: cs * kp0 * ipp * gpp * tpp, c: cs * 2 * Math.sqrt(kp0) * ipc * gpc * tpp };
  }

  /**
   * Ebene Gleitfläche des Wandgewichtskeils (aktiv): Winkel ϑ_a der Gleitfläche gegen die Horizontale [rad].
   * Der Keil mit der größten Erddruckkraft wird numerisch gesucht (Gleichgewicht W + R + E = 0).
   */
  static gleitwinkel(phi, delta, alpha, beta) {
    let bestTh = Math.PI / 4 + phi / 2, best = -Infinity;
    for (let th = 0.5 * GRAD; th < 89.9 * GRAD; th += 0.05 * GRAD) {
      const k = Erddruckbeiwerte._keil(phi, delta, alpha, beta, th);
      if (k && k.F > best) { best = k.F; bestTh = th; }
    }
    return bestTh;
  }

  /** Keilgleichgewicht (h = 1, γ = 1): Horizontalkraft F auf die Wand, nur wenn Normalkräfte positiv sind. */
  static _keil(phi, delta, alpha, beta, th) {
    const a = -alpha, L = 1 / Math.cos(a), T = [L * Math.sin(a), 1];
    const t = (1 - T[0] * Math.tan(beta)) / (Math.sin(th) - Math.cos(th) * Math.tan(beta));
    if (!(t > 0)) return null;
    const G = [t * Math.cos(th), t * Math.sin(th)];
    if (G[0] < T[0] - 1e-9) return null;
    const W = Math.abs(T[0] * G[1] - G[0] * T[1]) / 2;
    const r = [-Math.sin(th) + Math.tan(phi) * Math.cos(th), Math.cos(th) + Math.tan(phi) * Math.sin(th)];
    const f = [Math.cos(a) + Math.tan(delta) * Math.sin(a), -Math.sin(a) + Math.tan(delta) * Math.cos(a)];
    const det = r[0] * f[1] - r[1] * f[0];
    const N = -W * f[0] / det, P = r[0] * W / det;
    return N < 0 || P < 0 ? null : { F: P * f[0] };
  }

  /** Horizontale Erddruckkraft je Einheit lotrechter Last auf der Geländeoberfläche (Gleitfläche ϑ vorgegeben). */
  static lastbeiwert(phi, delta, alpha, theta) {
    const a = -alpha;
    const r = [-Math.sin(theta) + Math.tan(phi) * Math.cos(theta), Math.cos(theta) + Math.tan(phi) * Math.sin(theta)];
    const f = [Math.cos(a) + Math.tan(delta) * Math.sin(a), -Math.sin(a) + Math.tan(delta) * Math.cos(a)];
    const det = r[0] * f[1] - r[1] * f[0], P = r[0] / det;
    return P * f[0];
  }
}

/** Erddruckberechnung für einen geschichteten Boden. */
class Erddruck {
  /**
   * @param {{art:string, faktor:number, p:number, beta:number, alpha:number, phimin:number, verd:number, gw:number, wasser:boolean,
   *          linien:Array<{Q:number,a:number}>, streifen:Array<{q:number,a:number,b:number}>,
   *          schichten:Array<{name:string,d:number,g:number,gs:number,phi:number,c:number,delta:number,ka:number,k0:number,kp:number}>}} m
   *   art: "aktiv" | "erhoeht" | "ruhe" | "passiv"; p: Auflast [kN/m²]; beta: Geländeneigung [°]; alpha: Wandneigung [°];
   *   phimin: Mindest-φ′ für den Mindesterddruck [°] (0/NaN = aus); verd: Walzenlast P′ [kN/m] (0 = aus);
   *   gw: Grundwasser, Tiefe unter Geländeoberkante [m] (NaN = kein Grundwasser); ka/k0/kp: vorgegebene Beiwerte (NaN = berechnen)
   */
  constructor(m) {
    // Wandreibung als Anteil von φ′ (DIN-4085-Auswahl): überschreibt δ je Schicht, sonst gelten die Eingaben
    const an = m.deltaAnteil;
    this.m = Number.isFinite(an) && an >= 0 ? { ...m, schichten: m.schichten.map(s => ({ ...s, delta: an * s.phi })) } : m;
  }

  /** Mobilisierungsgrad ρ des Erdwiderstands (0…1) aus Verschiebung s und Bruchverschiebung s_B = sbRel·H (Parabelansatz) */
  mobilisierung(H) {
    const s = this.m.mobS, sb = (this.m.mobSb || 0) / 100 * H * 100;   // s in cm, s_B in % von H (H in m → cm)
    if (!(s > 0) || !(sb > 0)) return 1;
    return s >= sb ? 1 : 1 - (1 - s / sb) ** 2;
  }

  /** Teilt ein Stück [z1, z2, v1, v2] in n gleiche Teile. */
  _teilen([z1, z2, v1, v2], n) {
    return Array.from({ length: n }, (_, q) => [z1 + (z2 - z1) * q / n, z1 + (z2 - z1) * (q + 1) / n, v1 + (v2 - v1) * q / n, v1 + (v2 - v1) * (q + 1) / n]);
  }

  _aktivZusatz() { return this.m.art === "aktiv" || this.m.art === "erhoeht"; }
  _linien() { return (this.m.linien || []).filter(l => l.Q > 0); }
  _streifen() { return (this.m.streifen || []).filter(s => s.q > 0 && s.b > 0); }
  _phimin() { return this.m.phimin > 0 ? this.m.phimin : 0; }

  /** Beiwerte je Schicht: automatisch oder vorgegeben (plus Mindesterddruck-Beiwert). */
  beiwerte() {
    const b = this.m.beta * GRAD, al = (this.m.alpha || 0) * GRAD, pm = this._phimin();
    return this.m.schichten.map(s => {
      const phi = s.phi * GRAD, del = s.delta * GRAD;
      const kurv = this.m.gleit === "gekruemmt", pr = kurv ? Erddruckbeiwerte.passivPregl(phi, del, b, al) : null;
      const auto = {
        ka: phi === 0 ? 1 : Erddruckbeiwerte.aktiv(phi, del, b, al),
        k0: phi === 0 ? 1 : Erddruckbeiwerte.ruhe(phi, b),
        kp: phi === 0 ? 1 : (kurv ? pr.g : Erddruckbeiwerte.passiv(phi, del, b, al)),
      };
      // Auflast- und Kohäsionsbeiwert des Erdwiderstands: gekrümmt nach Pregl/Sokolowski, sonst Coulomb/Rankine-Form
      const kpp = kurv ? pr.p : null, kpc = kurv ? pr.c : null;
      const pick = (u, a) => (Number.isFinite(u) && u > 0 ? u : a);
      let kmin = 0;
      if (pm > 0) { const k = Erddruckbeiwerte.aktiv(pm * GRAD, Math.min(del, pm * GRAD), b, al); kmin = Number.isFinite(k) ? k : 0; }
      const kpv = pick(s.kp, auto.kp), eigen = !(Number.isFinite(s.kp) && s.kp > 0);     // manuell vorgegebenes K_p gilt für alle Anteile
      return { auto, ka: pick(s.ka, auto.ka), k0: pick(s.k0, auto.k0), kp: kpv, kpp: kurv && eigen ? kpp : kpv, kpc: kurv && eigen ? kpc : 2 * Math.sqrt(kpv), kmin };
    });
  }

  /**
   * Ersetzt `stuecke` durch eine neue Erddruckfigur: e(z) = c·shape(z) + zusatz(Schicht), wobei c so gewählt wird, dass der Anteil
   * c·shape(z) die Kraft E ergibt (Trapezregel über die Teilstücke). Die Segmente `seg` (Schicht-/Wassergrenzen) bleiben als Teilung erhalten;
   * `knicke` sind zusätzliche Teilungsstellen, `n` die Zahl der Unterteilungen je Segment (für gekrümmte Figuren).
   */
  _neuFigur(stuecke, seg, shape, E, { knicke = [], n = 1, zusatz = () => 0 } = {}) {
    const roh = [];
    for (const sg of seg) {
      const kn = [sg.z1, ...knicke.filter(k => k > sg.z1 + 1e-9 && k < sg.z2 - 1e-9), sg.z2];
      const sv = z => sg.sv1 + (sg.sv2 - sg.sv1) * (z - sg.z1) / (sg.z2 - sg.z1);
      for (let j = 0; j < kn.length - 1; j++)
        for (let q = 0; q < n; q++) {
          const za = kn[j] + (kn[j + 1] - kn[j]) * q / n, zb = kn[j] + (kn[j + 1] - kn[j]) * (q + 1) / n;
          roh.push({ i: sg.i, z1: za, z2: zb, sv1: sv(za), sv2: sv(zb), e1: shape(za), e2: shape(zb), gam: sg.gam });
        }
    }
    const A = roh.reduce((a, t) => a + (t.e1 + t.e2) / 2 * (t.z2 - t.z1), 0), c = A > 1e-12 ? E / A : 0;
    for (const t of roh) { t.e1 = c * t.e1 + zusatz(t.i); t.e2 = c * t.e2 + zusatz(t.i); }
    stuecke.splice(0, stuecke.length, ...roh);
    return c;
  }

  /**
   * Erddruckumlagerung des aktiven Erddrucks aus Bodeneigengewicht (DIN 4085:2017, Tab. C.1); die Kraft E_agh bleibt erhalten:
   *   b) Parallelverschiebung: oben Dreieck bis 0,5·H, darunter Rechteck (e = 0,67·e^a bei Dreiecksausgangsfigur)
   *   c) Drehung um den Wandkopf bzw. d) Durchbiegung: Rechteck (e = 0,5·e^a bei Dreiecksausgangsfigur)
   * Gleichmäßige Auflast p bleibt unverändert (e = K_a·p) und wird nicht umgelagert.
   */
  _umlagern(stuecke, seg, K, H, wand, hinweise) {
    const m = this.m, f = m.faktor, p = m.p || 0, eP = i => f * K[i].ka * p;
    let Eg = 0;
    for (const t of stuecke) Eg += ((t.e1 + t.e2) / 2 - eP(t.i)) * (t.z2 - t.z1);
    Eg = Math.max(Eg, 0);
    const trap = wand === "b";
    const c = this._neuFigur(stuecke, seg, trap ? z => Math.min(1, z / (0.5 * H)) : () => 1, Eg, { knicke: trap ? [0.5 * H] : [], zusatz: eP });
    const text = { b: "b) Parallele Wandbewegung: Dreieck über die obere Hälfte, darunter konstant (E<sub>agh</sub><sup>b</sup> = E<sub>agh</sub><sup>a</sup>)", c: "c) Drehung um den Wandkopf: konstante Verteilung über die Wandhöhe (E<sub>agh</sub><sup>c</sup> = E<sub>agh</sub><sup>a</sup>)", d: "d) Durchbiegung: konstante Verteilung über die Wandhöhe (E<sub>agh</sub><sup>d</sup> ≈ E<sub>agh</sub><sup>a</sup>, Resultierende bei 0,5·h)" }[wand];
    hinweise.push(`Erddruckumlagerung nach DIN 4085:2017, Tab. C.1 – ${text}; die Kraft aus Bodeneigengewicht bleibt gleich, e<sub>max</sub> = ${fmt(c, 1)} kN/m². Auflast p nicht umgelagert.`);
  }

  /**
   * Erdwiderstand bei Wandbewegung a) oder c) (DIN 4085:2017, Tab. D.1, Bezug: Parallelverschiebung b) mit der Dreieckskraft E^b):
   *   a) Drehung um den Fuß: E^a = k·E^b mit ½ ≤ k ≤ ⅔ (Eingabe), Resultierende bei 0,5·h über dem Fuß → symmetrisches Dreieck (null an Kopf und Fuß, Spitze bei 0,5·h, Bild D.1 a)
   *   c) Drehung um den Kopf: E^c = ⅔·E^b, Resultierende bei 0,2·h über dem Fuß → Verteilung e ∝ z³ (Schwerpunkt 0,2·h über dem Fuß)
   */
  _umlagernPassiv(stuecke, seg, H, wand, hinweise) {
    const m = this.m;
    const Eb = stuecke.reduce((a, t) => a + (t.e1 + t.e2) / 2 * (t.z2 - t.z1), 0);
    const k = wand === "c" ? 2 / 3 : Math.min(2 / 3, Math.max(0.5, Number.isFinite(m.paf) ? m.paf : 0.5));
    const shape = wand === "c" ? z => (z / H) ** 3 : z => 1 - Math.abs(1 - 2 * z / H);   // c) e ∝ z³; a) symmetrisches Dreieck
    this._neuFigur(stuecke, seg, shape, k * Eb, { n: wand === "c" ? 10 : 1, knicke: wand === "c" ? [] : [0.5 * H] });
    hinweise.push(wand === "c"
      ? "Wandbewegung c) Drehung um den Wandkopf (Tab. D.1): E<sub>pgh</sub><sup>c</sup> ≈ ⅔·E<sub>pgh</sub><sup>b</sup>, Resultierende 0,2·h über dem Fuß (hier e ∝ z³ angesetzt)."
      : `Wandbewegung a) Drehung um den Wandfuß (Tab. D.1): E<sub>pgh</sub><sup>a</sup> = ${fmt(k, 3)}·E<sub>pgh</sub><sup>b</sup> (zulässig ½ bis ⅔), Resultierende 0,5·h über dem Fuß (Dreieck mit Spitze bei 0,5·h, null an Kopf und Fuß nach Bild D.1 a); δ<sub>p,mittel</sub> = ¾·δ<sub>p,min</sub> für E<sub>pgv</sub>.`);
    hinweise.push("Verteilung nach Tab. D.1: Kraft und Angriffshöhe stimmen, bei c) ist die Kurvenform (e ∝ z³) eine Näherung. Abminderung gilt für den gesamten Erdwiderstand.");
    if (m.dichte > 0 && m.dichte <= 1) {
      const sh = wand === "c" ? -0.05 * m.dichte + 0.09 : -0.08 * m.dichte + 0.12;
      hinweise.push(`Erforderliche Wandbewegung (Tab. D.1, D = ${fmt(m.dichte, 2)}): s<sub>p</sub>/h = ${fmt(sh, 3)} → s<sub>p</sub> = ${fmt(sh * H * 100, 1)} cm (Streuung ± 20 %); als Bruchverschiebung s<sub>B</sub> ≈ ${fmt(sh * 100, 1)} % von H eintragbar.`);
    }
  }

  /** Prüfung der Eingaben; liefert einen Fehlertext oder null. */
  pruefe() {
    const m = this.m;
    if (!m.schichten.length) return "Bitte mindestens eine Schicht eingeben.";
    if (!(m.beta >= 0 && m.beta < 90) || !(m.p >= 0)) return "Geländeneigung (0…90°) und Auflast (≥ 0) prüfen.";
    if (!(m.alpha === undefined || (m.alpha > -45 && m.alpha < 60))) return "Wandneigung α zwischen −45° und 60° eingeben.";
    if (!(m.faktor > 0)) return "Der Faktor muss größer 0 sein.";
    if (m.phimin > 0 && !(m.phimin < 60)) return "Mindest-φ′ zwischen 0° und 60° eingeben (leer = ohne Mindesterddruck).";
    if (!(!m.verd || m.verd >= 0)) return "Walzenlast P′ ≥ 0 eingeben.";
    for (const [n, l] of (m.linien || []).entries()) if (!(l.Q >= 0 && l.a > 0)) return `Linienlast ${n + 1}: Q ≥ 0 und Abstand a > 0 eingeben.`;
    for (const [n, s] of (m.streifen || []).entries()) if (!(s.q >= 0 && s.a >= 0 && s.b > 0)) return `Streifenlast ${n + 1}: q ≥ 0, Abstand a ≥ 0 und Breite b > 0 eingeben.`;
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
      if (m.art !== "ruhe" && m.art !== "passiv" && !Number.isFinite(k[n].ka)) return `Schicht ${n + 1}: K<sub>agh</sub> nicht berechenbar (β größer als φ′ oder Wandneigung zu groß?). Beiwert manuell eingeben.`;
      if (m.art === "passiv" && !Number.isFinite(k[n].kp)) return `Schicht ${n + 1}: K<sub>pgh</sub> nicht berechenbar. Beiwert manuell eingeben.`;
    }
    return null;
  }

  /** Berechnung: Spannungsverlauf, Stücke (lineare Abschnitte), Zusätze, Resultierende. */
  berechne() {
    const fehler = this.pruefe(); if (fehler) return { fehler };
    const m = this.m, K = this.beiwerte(), gw = Number.isFinite(m.gw) && m.gw >= 0 ? m.gw : Infinity;
    const H = m.schichten.reduce((a, s) => a + s.d, 0), hinweise = [], al = (m.alpha || 0) * GRAD;

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

    // Erddruckspannungen je Segment; bei aktivem Druck Nulldurchgang (Zugzone) bzw. Mindesterddruck berücksichtigen
    const f = m.faktor, art = m.art, stuecke = [], mitMin = this._phimin() > 0, rho = art === "passiv" ? this.mobilisierung(H) : 1;
    // Mobilisierter Erdwiderstand nach Vogt (RE-ING Teil 2, Abschn. 5, 2.3): K_mob(z) = K0 + (Kp − K0)·(v/z)/(α + v/z), v(z) = s_h·(1 − z/H)
    const vogt = art === "passiv" && m.mobart === "vogt" && m.mobS > 0, sh = (m.mobS || 0) / 100, aV = m.vogtA > 0 ? m.vogtA : 0.02;
    const rz = z => {
      if (!vogt) return rho;
      if (z <= 1e-9) return 1;
      const q = sh * Math.max(0, 1 - z / H) / z;           // v(z)/z
      return q / (aV + q);
    };
    let zug = false, minMass = false;
    seg.forEach(sg => {
      const s = m.schichten[sg.i], k = K[sg.i], c = s.c;
      const fa = v => k.ka * v - 2 * c * Math.sqrt(k.ka), fm = v => k.kmin * v, fp = v => k.kp * (v - m.p) + k.kpp * m.p + c * k.kpc,   // Eigengewicht / Auflast / Kohäsion getrennt (Pregl/Sokolowski)
             f0 = v => k.k0 * v;
      const ea = v => Math.max(fa(v), fm(v), 0);          // aktiv: nie kleiner als Mindesterddruck bzw. null
      const e = (v, z) => f * (art === "aktiv" ? ea(v) : art === "ruhe" ? f0(v) : art === "passiv" ? f0(v) + rz(z) * (fp(v) - f0(v)) : 0.5 * (ea(v) + f0(v)));
      let teile = [[sg.z1, sg.z2, sg.sv1, sg.sv2]];
      if (art === "aktiv" || art === "erhoeht") {
        if (fa(sg.sv1) < fm(sg.sv1) - 1e-9) { if (k.kmin > 0 && fm(sg.sv1) > fa(sg.sv1)) minMass = true; if (fa(sg.sv1) < -1e-9 && !(k.kmin > 0)) zug = true; }
        const d1 = fa(sg.sv1) - fm(sg.sv1), d2 = fa(sg.sv2) - fm(sg.sv2);
        if (c > 0 && (d1 < 0) !== (d2 < 0) && k.ka > k.kmin) {
          const svN = 2 * c * Math.sqrt(k.ka) / (k.ka - k.kmin), zN = sg.z1 + (svN - sg.sv1) / sg.gam;
          teile = [[sg.z1, zN, sg.sv1, svN], [zN, sg.z2, svN, sg.sv2]];
        }
      }
      if (vogt) teile = this._teilen(teile[0], 16);     // z-abhängige Mobilisierung: Segment fein unterteilen
      for (const [z1, z2, v1, v2] of teile) stuecke.push({ i: sg.i, z1, z2, sv1: v1, sv2: v2, e1: e(v1, z1), e2: e(v2, z2), gam: sg.gam });
    });
    if (zug)
      hinweise.push("Bei Kohäsion entsteht oben eine Zugzone: der aktive Erddruck wird dort zu null gesetzt (kein Zug an der Wand).");
    if (minMass)
      hinweise.push(`Mindesterddruck maßgebend (Vergleichsrechnung mit φ′ = ${fmt(this._phimin(), 1)}°, c′ = 0): in Bereichen mit Kohäsion wird der Erddruck nach unten begrenzt.`);

    // Art der Wandbewegung (DIN 4085:2017, Tab. C.1 aktiv / D.1 passiv): Erddruckumlagerung
    const wand = m.wand;
    if (art === "aktiv" && ["b", "c", "d"].includes(wand)) this._umlagern(stuecke, seg, K, H, wand, hinweise);
    if (art === "passiv" && !vogt && (wand === "a" || wand === "c")) this._umlagernPassiv(stuecke, seg, H, wand, hinweise);

    // Resultierende (Boden + Auflast): Eh = Σ Trapezflächen, Angriffshöhe über Wandfuß aus dem Moment
    let Eh = 0, Mfuss = 0, Ev = 0;
    for (const t of stuecke) {
      const dz = t.z2 - t.z1, E = (t.e1 + t.e2) / 2 * dz;
      const zc = (t.e1 + t.e2) > 1e-12 ? t.z1 + dz * (t.e1 + 2 * t.e2) / (3 * (t.e1 + t.e2)) : t.z1 + dz / 2;
      t.E = E; t.zc = zc; Eh += E; Mfuss += E * (H - zc);
      const dl = m.schichten[t.i].delta * GRAD;
      if (art === "aktiv") Ev += E * Math.tan(al + dl);               // + = abwärts auf die Wand
      if (art === "passiv") Ev += E * Math.tan(al - (m.wand === "a" ? 0.75 : 1) * dl);   // Wandbewegung a): δp,mittel = ¾·δp,min
    }
    // Wasserdruck (hydrostatisch, getrennt ausgewiesen)
    const hw = Math.max(0, H - gw), W = 0.5 * GAMMA_W * hw * hw, ezW = hw / 3;

    const erg = { fehler: null, H, K, stuecke, Eh, Ev, ez: Eh > 1e-12 ? Mfuss / Eh : 0, W, ezW, hw, gw, hinweise, zusaetze: [] };
    this._zusaetze(erg);

    if (vogt) hinweise.push(`Mobilisierter Erdwiderstand nach Vogt (RE-ING Teil 2, 2.3): K<sub>mob</sub>(z) = K<sub>0</sub> + (K<sub>p</sub> − K<sub>0</sub>)·(v/z)/(α + v/z), v(z) = s<sub>h</sub>·(1 − z/H) (starre Wand, Fußpunktdrehung), s<sub>h</sub> = ${fmt(m.mobS, 2)} cm (s<sub>h</sub>/h = ${fmt(sh / H, 4)}), α = ${fmt(aV, 3)}. Die Wandbewegungsart-Umlagerung entfällt. Hinweis: RE-ING setzt δ = −⅔·φ′ an, ab φ′ ≥ 30° K<sub>p</sub> mit gekrümmter Gleitfläche.`);
    if (art === "passiv" && !vogt && rho < 1) hinweise.push(`Mobilisierter Erdwiderstand: ρ = ${fmt(rho, 3)} (s = ${fmt(m.mobS, 1)} cm, s<sub>B</sub> = ${fmt(m.mobSb, 1)} % von H); e = e<sub>0</sub> + ρ·(e<sub>p</sub> − e<sub>0</sub>) (Parabelansatz, Näherung; Alternative: Ansatz nach Vogt/RE-ING).`);
    if (art === "passiv" && m.gleit === "gekruemmt") hinweise.push("Passiv mit gekrümmten Gleitflächen nach Pregl/Sokolowski (DIN 4085:2017, Gl. 41–43, Tab. 3), δ<sub>p</sub> = −δ; K<sub>p,0</sub> = tan²(45°+φ′/2) bzw. 2·tan(45°+φ′/2) für Kohäsion (Gl. 35–37 der Norm nicht geprüft).");
    if (art === "passiv" && m.gleit !== "gekruemmt") hinweise.push("Passiver Erddruck: Coulomb mit ebener Gleitfläche überschätzt K<sub>p</sub> bei δ<sub>p</sub> &gt; φ′/3 (DIN 4085: gekrümmte Gleitfläche). Für Nachweise Beiwerte prüfen oder manuell vorgeben und die zur Mobilisierung nötige Verschiebung beachten.");
    if (art === "erhoeht") hinweise.push("Erhöhter aktiver Erddruck: e = 0,5·(e<sub>a</sub> + e<sub>0</sub>); Wandreibung wird nicht angesetzt (E<sub>v</sub> = 0).");
    if (art === "ruhe") hinweise.push("Ruhedruck: Wandreibung und Wandneigung werden nicht angesetzt (E<sub>v</sub> = 0); Kohäsion bleibt unberücksichtigt.");
    if (m.beta > 0) hinweise.push("Geländeneigung β wirkt nur über die Beiwerte; die Auflast p wird als gleichmäßig verteilt auf der Geländeoberfläche angesetzt.");
    if ((m.alpha || 0) !== 0) hinweise.push(`Wandneigung α = ${fmt(m.alpha, 1)}° (${m.alpha > 0 ? "Wandkopf vom Boden weg" : "Wandkopf zum Boden hin"} geneigt): Tiefen z und Wandhöhe H sind lotrecht gemessen, e<sub>h</sub> ist die horizontale Komponente je m lotrechter Tiefe, E<sub>v</sub> = E<sub>h</sub>·tan(α ± δ).`);
    if (!this._aktivZusatz() && (m.verd > 0 || this._linien().length || this._streifen().length))
      hinweise.push("Verdichtungserddruck, Linien- und Streifenlasten werden nur bei aktivem bzw. erhöht aktivem Erddruck angesetzt.");
    return erg;
  }

  /** Zusatzfiguren (Verdichtung, Linien-, Streifenlasten), Profil auf feinem Raster und Gesamtresultierende. */
  _zusaetze(erg) {
    const m = this.m, H = erg.H, al = (m.alpha || 0) * GRAD, st = erg.stuecke;
    const e0 = z => { const t = st.find(s => z >= s.z1 - 1e-9 && z <= s.z2 + 1e-9); if (!t) return 0; const r = t.z2 > t.z1 ? (z - t.z1) / (t.z2 - t.z1) : 0; return t.e1 + (t.e2 - t.e1) * r; };
    const defs = [];                       // {name, typ, f(z, e0), knicke:[z]}
    if (this._aktivZusatz()) {
      const s1 = m.schichten[0], phi = s1.phi * GRAD, del = s1.delta * GRAD, be = m.beta * GRAD;
      if (m.verd > 0) {
        // Ingold: σ_hc = √(2·P′·γ/π); z_c = σ_hc/(K_a·γ); z_e = σ_hc/(K_p·γ) (Rankine, Schicht 1)
        const g = s1.g, kaR = Math.tan(Math.PI / 4 - phi / 2) ** 2, kpR = Math.tan(Math.PI / 4 + phi / 2) ** 2;
        const shc = Math.sqrt(2 * m.verd * g / Math.PI), zc = shc / (kaR * g), ze = shc / (kpR * g);
        const ec = z => z < ze ? kpR * g * z : z < zc ? shc : kaR * g * z;
        defs.push({ name: "Verdichtung (Ingold)", typ: "verd", knicke: [ze, zc], f: (z, b) => Math.max(0, ec(z) - b), info: { shc, zc, ze } });
        if (zc > H) erg.hinweise.push(`Verdichtungserddruck: Einflusstiefe z<sub>c</sub> = ${fmt(zc, 2)} m reicht bis unter den Wandfuß; es wird nur der Anteil bis H angesetzt.`);
      }
      const lin = this._linien(), str = this._streifen();
      if (lin.length || str.length) {
        const th = Erddruckbeiwerte.gleitwinkel(phi, del, al, be), kq = Erddruckbeiwerte.lastbeiwert(phi, del, al, th);
        const tF = Math.tan(phi), tT = Math.tan(th);
        erg.last = { th, kq, phi: s1.phi, delta: s1.delta };
        lin.forEach((l, n) => {
          const zo = l.a * tF, zu = l.a * tT, e = l.Q * kq / (l.a * (tT - tF));
          defs.push({ name: `Linienlast ${n + 1}`, typ: "linie", knicke: [zo, zu], f: z => z >= zo && z <= zu ? e : 0, info: { E: l.Q * kq, zo, zu } });
          if (zu > H) erg.hinweise.push(`Linienlast ${n + 1}: Die Lastausbreitung reicht bis ${fmt(zu, 2)} m, unter den Wandfuß (H = ${fmt(H, 2)} m); nur der Anteil bis H wird angesetzt.`);
        });
        str.forEach((s, n) => {
          const c0 = s.q * kq / (tT - tF), a1 = Math.max(s.a, 1e-6), a2 = s.a + s.b;
          defs.push({ name: `Streifenlast ${n + 1}`, typ: "streifen", knicke: [a1 * tF, a1 * tT, a2 * tF, a2 * tT], info: { E: s.q * s.b * kq },
            f: z => { const ob = tF > 0 ? Math.min(a2, z / tF) : a2, un = Math.max(a1, z / tT); return ob > un ? c0 * Math.log(ob / un) : 0; } });
          if (a2 * tT > H) erg.hinweise.push(`Streifenlast ${n + 1}: Die Lastausbreitung reicht bis ${fmt(a2 * tT, 2)} m, unter den Wandfuß; nur der Anteil bis H wird angesetzt.`);
        });
      }
    }

    // Raster: feine Teilung plus Knickpunkte (doppelt, um Sprünge abzubilden)
    const zs = new Set([0, H]), n = 300;
    for (let i = 1; i < n; i++) zs.add(H * i / n);
    const knick = [...st.flatMap(t => [t.z1, t.z2]), ...defs.flatMap(d => d.knicke)];
    for (const k of knick) if (k > 1e-6 && k < H - 1e-6) { zs.add(k - 1e-6); zs.add(k + 1e-6); }
    const zl = [...zs].filter(v => v >= 0 && v <= H).sort((a, b) => a - b);
    erg.profil = zl.map(zz => {
      const b = e0(zz); let cum = b; const zus = defs.map(d => { const v = d.f(zz, b); cum += v; return v; });
      return { z: zz, e0: b, zus, tot: cum };
    });
    // Resultierende je Zusatz (Trapezregel auf dem Raster)
    let E = erg.Eh, M = erg.Eh * erg.ez, Ev = erg.Ev;
    const del1 = m.schichten[0].delta * GRAD;
    defs.forEach((d, k) => {
      let Ek = 0, Mk = 0, emax = 0;
      for (let i = 0; i + 1 < erg.profil.length; i++) {
        const p = erg.profil[i], q = erg.profil[i + 1], dz = q.z - p.z, a = p.zus[k], b = q.zus[k];
        Ek += (a + b) / 2 * dz; Mk += (a * (H - p.z) + b * (H - q.z)) / 2 * dz; emax = Math.max(emax, a, b);
      }
      erg.zusaetze.push({ name: d.name, typ: d.typ, E: Ek, ez: Ek > 1e-12 ? Mk / Ek : 0, eMax: emax, info: d.info });
      E += Ek; M += Mk; if (m.art === "aktiv") Ev += Ek * Math.tan(al + del1);
    });
    erg.EhGes = E; erg.ezGes = E > 1e-12 ? M / E : 0; erg.EvGes = Ev;
    erg.eMax = Math.max(1e-9, ...erg.profil.map(p => p.tot));
    erg.uMax = GAMMA_W * erg.hw;
  }

  /** Werte in der Tiefe z (für die Mausabfrage): σ'v, e_h (Boden), Zusätze, Summe, Wasserdruck und Schicht. */
  static werteBei(erg, z) {
    const t = erg.stuecke.find(s => z >= s.z1 - 1e-9 && z <= s.z2 + 1e-9);
    if (!t) return null;
    const r = t.z2 > t.z1 ? (z - t.z1) / (t.z2 - t.z1) : 0, e = t.e1 + (t.e2 - t.e1) * r;
    const P = erg.profil || []; let zus = (erg.zusaetze || []).map(() => 0);
    for (let i = 0; i + 1 < P.length; i++) if (z >= P[i].z && z <= P[i + 1].z && P[i + 1].z > P[i].z) {
      const q = (z - P[i].z) / (P[i + 1].z - P[i].z); zus = P[i].zus.map((v, k) => v + (P[i + 1].zus[k] - v) * q); break;
    }
    return { z, i: t.i, sv: t.sv1 + (t.sv2 - t.sv1) * r, e, zus, etot: e + zus.reduce((a, b) => a + b, 0), u: GAMMA_W * Math.max(0, z - erg.gw) };
  }
}
