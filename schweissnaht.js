/**
 * Schweißnahtnachweise im Stahlbau nach DIN EN 1993-1-8 (Kehlnähte: richtungsbezogenes und vereinfachtes Verfahren;
 * durchgeschweißte Stumpfnähte: Nachweis wie das Grundmaterial).
 * Einheiten: mm, kN, N/mm².
 */

/** Korrelationsbeiwert β_w und Zugfestigkeit f_u je Stahlgüte (EN 1993-1-8, Tab. 4.1; EN 10025-2) */
const SCHWEISS_WERTE = {
  S235: { fu: 360, bw: 0.80 }, S275: { fu: 430, bw: 0.85 }, S355: { fu: 490, bw: 0.90 },
  S420: { fu: 520, bw: 1.00 }, S460: { fu: 540, bw: 1.00 },
};

class Schweissnaht {
  /**
   * @param {{art:string,a:number,l:number,n:number,krater:boolean,Fl:number,Fn:number,Fq:number}} e Eingaben
   *   art: "kehl" | "stumpf"; a: Nahtdicke (Kehlnaht) bzw. Blechdicke (Stumpfnaht) [mm]; l: Nahtlänge [mm]; n: Anzahl der Nähte;
   *   krater: Endkrater abziehen (l_eff = l − 2a); Fl: Längskraft; Fn: Normalkraft senkrecht zur Anschlussfläche;
   *   Fq: Querkraft in der Anschlussfläche quer zur Naht [kN]
   * @param {string} guete Stahlgüte; @param {number} fy Streckgrenze; @param {number} gM0; @param {number} gM2
   */
  constructor(e, guete, fy, gM0, gM2) { this.e = e; this.guete = guete; this.fy = fy; this.gM0 = gM0; this.gM2 = gM2; }

  berechne() {
    const e = this.e, w = SCHWEISS_WERTE[this.guete];
    if (!w) return { fehler: "Für diese Stahlgüte liegen keine Schweißwerte vor." };
    if (!(e.a > 0) || !(e.l > 0) || !(e.n >= 1)) return { fehler: "Nahtdicke, Nahtlänge und Anzahl der Nähte müssen größer 0 sein." };
    const hinweise = [];
    const lEff = e.art === "kehl" && e.krater ? e.l - 2 * e.a : e.l;
    if (!(lEff > 0)) return { fehler: "Die wirksame Nahtlänge ist nicht positiv (Endkrater größer als die Naht)." };
    const Fl = Math.abs(e.Fl) * 1e3, Fn = Math.abs(e.Fn) * 1e3, Fq = Math.abs(e.Fq) * 1e3;   // [N]
    const F = Math.abs(Fn) + Math.abs(Fq);                                                  // Querkomponenten (ungünstigste Naht)
    const A = e.n * e.a * lEff;                                                              // Σ a·l [mm²]
    const r = { fehler: null, art: e.art, lEff, A, w, hinweise };

    if (e.art === "kehl") {
      if (e.a < 3) hinweise.push("a &lt; 3 mm: Mindestnahtdicke nach EN 1993-1-8, 4.5.2 unterschritten.");
      if (lEff < Math.max(30, 6 * e.a)) hinweise.push("l<sub>eff</sub> &lt; max(30 mm; 6a): Naht gilt nach EN 1993-1-8, 4.5.1 als nicht tragend.");
      if (lEff > 150 * e.a) hinweise.push("l<sub>eff</sub> &gt; 150a (Überlappstoß): Abminderung β<sub>Lw</sub> nach EN 1993-1-8, 4.11 beachten – hier nicht berücksichtigt.");
      // Richtungsbezogenes Verfahren (4.5.3.2): Nahtfläche im Kehlschnitt (45°), σ⊥ = τ⊥ aus den Querkräften
      const s = F / (Math.SQRT2 * A), tl = Fl / A;
      const sv = Math.sqrt(s * s + 3 * (s * s + tl * tl));                                  // √(σ⊥² + 3(τ⊥² + τ∥²))
      const R1 = w.fu / (w.bw * this.gM2), R2 = 0.9 * w.fu / this.gM2;                   // σ⊥ ≤ 0,9·f_u/γ_M2 (EN 1993-1-8, Gl. 4.1)
      r.richtung = { sigma: s, tauQ: s, tauL: tl, sv, R1, R2, aus1: sv / R1, aus2: s / R2 };
      // Vereinfachtes Verfahren (4.5.3.3): Resultierende je Längeneinheit gegen F_w,Rd = f_vw,d·a
      const fw = Math.sqrt(Fl * Fl + F * F) / (e.n * lEff), fvw = w.fu / Math.sqrt(3) / (w.bw * this.gM2);
      r.einfach = { fw, fvw, FwRd: fvw * e.a, aus: fw / (fvw * e.a) };
      r.aus = Math.max(r.richtung.aus1, r.richtung.aus2, r.einfach.aus <= 0 ? 0 : 0);        // maßgebend: richtungsbezogen
      r.ausEinfach = r.einfach.aus;
    } else {
      // durchgeschweißte Stumpfnaht: wie Grundmaterial (EN 1993-1-8, 4.7.1), Bezug f_y/γ_M0
      const sig = Fn / A, tauQ = Fq / A, tauL = Fl / A, sv = Math.sqrt(sig * sig + 3 * (tauQ * tauQ + tauL * tauL));
      r.stumpf = { sig, tauQ, tauL, sv, R: this.fy / this.gM0, aus: sv / (this.fy / this.gM0) };
      r.aus = r.stumpf.aus; r.ausEinfach = null;
      hinweise.push("Stumpfnaht: Nachweis wie das Grundmaterial (volle Durchschweißung, Nahtgüte und Prüfung vorausgesetzt).");
    }
    return r;
  }
}

/** HTML-Ausgabe des Schweißnahtnachweises. */
class SchweissnahtAnzeige {
  static html(r, e, guete) {
    if (r.fehler) return `<span class="fehler">${r.fehler}</span>`;
    const ok = v => (v <= 1 + 1e-9 ? '<span class="ok">✓</span>' : '<span class="fehler">✗</span>');
    const z = (t, v, u = "") => `<tr><td>${t}</td><td>${v}</td><td>${u}</td></tr>`;
    let h = `<table>${z("Stahlgüte, f<sub>u</sub>, β<sub>w</sub>", `${guete}, ${r.w.fu}, ${fmt(r.w.bw, 2)}`, "N/mm²")}` +
            z("wirksame Nahtlänge l<sub>eff</sub>, Σ a·l", `${fmt(r.lEff, 0)}, ${fmt(r.A, 0)}`, "mm, mm²");
    if (r.art === "kehl") {
      const d = r.richtung, v = r.einfach;
      h += "</table><h3>Richtungsbezogenes Verfahren (EN 1993-1-8, 4.5.3.2)</h3><table>" +
        z("σ<sub>⊥</sub> = τ<sub>⊥</sub> = (|F<sub>n</sub>| + |F<sub>q</sub>|)/(√2·Σ a·l)", fmt(d.sigma, 1), "N/mm²") +
        z("τ<sub>∥</sub> = F<sub>l</sub>/Σ a·l", fmt(d.tauL, 1), "N/mm²") +
        z("σ<sub>v</sub> = √(σ<sub>⊥</sub>² + 3(τ<sub>⊥</sub>² + τ<sub>∥</sub>²)) ≤ f<sub>u</sub>/(β<sub>w</sub>·γ<sub>M2</sub>) = " + fmt(d.R1, 1), `<b>${fmt(d.sv, 1)}</b>`, `${fmt(d.aus1 * 100, 0)} % ${ok(d.aus1)}`) +
        z("σ<sub>⊥</sub> ≤ 0,9·f<sub>u</sub>/γ<sub>M2</sub> = " + fmt(d.R2, 1), fmt(d.sigma, 1), `${fmt(d.aus2 * 100, 0)} % ${ok(d.aus2)}`) +
        "</table><h3>Vereinfachtes Verfahren (EN 1993-1-8, 4.5.3.3)</h3><table>" +
        z("F<sub>w,Ed</sub> = √(F<sub>l</sub>² + F<sub>⊥</sub>²)/(n·l<sub>eff</sub>)", fmt(v.fw, 1), "N/mm") +
        z("f<sub>vw,d</sub> = f<sub>u</sub>/√3/(β<sub>w</sub>·γ<sub>M2</sub>)", fmt(v.fvw, 1), "N/mm²") +
        z("F<sub>w,Rd</sub> = f<sub>vw,d</sub>·a", fmt(v.FwRd, 1), "N/mm") +
        z("Ausnutzung F<sub>w,Ed</sub>/F<sub>w,Rd</sub>", `<b>${fmt(v.aus * 100, 0)} %</b>`, ok(v.aus));
    } else {
      const s = r.stumpf;
      h += "</table><h3>Durchgeschweißte Stumpfnaht (EN 1993-1-8, 4.7.1)</h3><table>" +
        z("σ = F<sub>n</sub>/(n·t·l)", fmt(s.sig, 1), "N/mm²") + z("τ<sub>q</sub>, τ<sub>l</sub>", `${fmt(s.tauQ, 1)}, ${fmt(s.tauL, 1)}`, "N/mm²") +
        z("σ<sub>v</sub> = √(σ² + 3(τ<sub>q</sub>² + τ<sub>l</sub>²)) ≤ f<sub>y</sub>/γ<sub>M0</sub> = " + fmt(s.R, 1), `<b>${fmt(s.sv, 1)}</b>`, `${fmt(s.aus * 100, 0)} % ${ok(s.aus)}`);
    }
    h += "</table>";
    if (r.hinweise.length) h += "<ul>" + r.hinweise.map(t => `<li>${t}</li>`).join("") + "</ul>";
    return h;
  }
}

/** Eingaben und Ausgabe des Bereichs „Schweißnähte“ auf der Stahlbau-Seite. */
class SchweissnahtSeite {
  constructor() {
    this.skizze = new SchweissnahtSkizze(document.getElementById("sn-skizze"));
    window.addEventListener("resize", () => { if (this.letzte) this.skizze.zeichne(...this.letzte); });
    this.ids = ["sn-art", "sn-a", "sn-l", "sn-n", "sn-kr", "sn-Fl", "sn-Fn", "sn-Fq", "sn-gm2"];
    this.ids.forEach(id => document.getElementById(id).addEventListener("input", () => { this._speichern(); this.aktualisiere(); }));
    ["st-guete", "st-gm0"].forEach(id => document.getElementById(id).addEventListener("input", () => this.aktualisiere()));
    try {
      const d = JSON.parse(localStorage.getItem("schweissnaht-1") || "null");
      if (d) for (const id of this.ids) { const el = document.getElementById(id); if (id in d) { if (el.type === "checkbox") el.checked = !!d[id]; else el.value = d[id]; } }
    } catch (e) { /* Speicher nicht verfügbar */ }
    this.aktualisiere();
  }

  _speichern() {
    const d = {}; for (const id of this.ids) { const el = document.getElementById(id); d[id] = el.type === "checkbox" ? el.checked : el.value; }
    try { localStorage.setItem("schweissnaht-1", JSON.stringify(d)); } catch (e) { /* ignorieren */ }
  }

  aktualisiere() {
    const art = document.getElementById("sn-art").value, guete = document.getElementById("st-guete").value;
    const fy = (STAHLGUETEN.find(s => s[0] === guete) || [0, 0])[1], gm0 = zahl("st-gm0") > 0 ? zahl("st-gm0") : 1;
    const e = { art, a: zahl("sn-a"), l: zahl("sn-l"), n: zahl("sn-n"), krater: document.getElementById("sn-kr").checked, Fl: zahl("sn-Fl"), Fn: zahl("sn-Fn"), Fq: zahl("sn-Fq") };
    document.getElementById("sn-lbl-a").textContent = art === "kehl" ? "Nahtdicke a [mm]" : "Blechdicke t [mm]";
    document.getElementById("sn-kr-zeile").style.display = art === "kehl" ? "" : "none";
    this.letzte = [art, e]; this.skizze.zeichne(art, e);
    const gm2 = zahl("sn-gm2") > 0 ? zahl("sn-gm2") : 1.25;
    document.getElementById("sn-ergebnis").innerHTML = SchweissnahtAnzeige.html(new Schweissnaht(e, guete, fy, gm0, gm2).berechne(), e, guete);
  }
}

/**
 * Skizze zur Schweißnaht: links T-Stoß in Schrägansicht mit den drei Kraftrichtungen
 * (F_n senkrecht zur Anschlussfläche, F_q quer zur Naht, F_l parallel zur Naht), rechts der Kehlnahtquerschnitt
 * mit den Nahtspannungen σ⊥, τ⊥, τ∥ in der Kehlnahtfläche. Kräfte mit Wert 0 werden gestrichelt/grau gezeichnet.
 */
class SchweissnahtSkizze {
  constructor(canvas) { this.cv = canvas; }

  /** Pfeil mit Spitze */
  _pfeil(g, x1, y1, x2, y2, farbe, aktiv = true) {
    g.strokeStyle = g.fillStyle = aktiv ? farbe : "#aaa"; g.lineWidth = 2.2; g.setLineDash(aktiv ? [] : [4, 3]);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4)); g.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4)); g.closePath(); g.fill();
  }

  /** Prisma: Polygon (x,y nach oben) um die Tiefe z0…z1 in Schrägansicht ausgezogen */
  _prisma(g, pts, P, z1, fuell, rand) {
    const vorn = pts.map(p => P(p[0], p[1], 0)), hinten = pts.map(p => P(p[0], p[1], z1));
    g.fillStyle = fuell; g.strokeStyle = rand; g.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {                         // Seitenflächen
      const j = (i + 1) % pts.length;
      g.beginPath(); g.moveTo(...vorn[i]); g.lineTo(...vorn[j]); g.lineTo(...hinten[j]); g.lineTo(...hinten[i]); g.closePath(); g.fill(); g.stroke();
    }
    g.beginPath(); vorn.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fill(); g.stroke();   // Vorderseite
  }

  /** @param {string} art "kehl" | "stumpf"; @param {{Fl:number,Fn:number,Fq:number}} e */
  zeichne(art, e) {
    const { g, w, h } = canvasVorbereiten(this.cv);
    if (w < 120 || h < 80) return;
    const zeigeInset = art === "kehl" && w >= 360, pw = zeigeInset ? w * 0.62 : w;
    const k = Math.min(pw / 300, h / 230, 1.4);                      // Maßstab der Schrägansicht
    const B = 130, tb = 14, Hh = 80, tw = 12, Z = 70, s = 16, wx0 = (B - tw) / 2, wx1 = wx0 + tw;
    const ox = (pw - (B + Z * 0.6) * k) / 2 + 6, oy = h - 26 - 6;
    const P = (x, y, z) => [ox + (x + 0.6 * z) * k, oy - (y + 0.35 * z + 0) * k - 0];
    g.font = "12px system-ui, sans-serif"; g.textAlign = "left";
    // Bauteile
    this._prisma(g, [[0, 0], [B, 0], [B, tb], [0, tb]], P, Z, "#dfe5ec", "#667");
    this._prisma(g, [[wx0, tb], [wx1, tb], [wx1, tb + Hh], [wx0, tb + Hh]], P, Z, "#cfd8e3", "#667");
    const naht = art === "kehl"
      ? [[[wx0, tb], [wx0 - s, tb], [wx0, tb + s]], [[wx1, tb], [wx1 + s, tb], [wx1, tb + s]]]
      : [[[wx0, tb], [wx0 - s, tb], [wx0 - 3, tb + s], [wx0, tb + s]], [[wx1, tb], [wx1 + s, tb], [wx1 + 3, tb + s], [wx1, tb + s]]];
    naht.forEach(p => this._prisma(g, p, P, Z, "#f0b429", "#8a5a00"));
    // Kräfte
    const aktiv = v => Math.abs(v) > 1e-9, cx = (wx0 + wx1) / 2, top = tb + Hh;
    const Fn = P(cx, top, Z / 2);
    this._pfeil(g, Fn[0], Fn[1], Fn[0], Fn[1] - 44 * k - 8, "#1565c0", aktiv(e.Fn));
    const q0 = P(wx1, top - 14, Z / 2);
    this._pfeil(g, q0[0], q0[1], q0[0] + 52 * k + 8, q0[1], "#2e7d32", aktiv(e.Fq));
    const l0 = P(B - 14, tb, 6), l1 = P(B - 14, tb, Z - 4);
    this._pfeil(g, l0[0], l0[1] - 4, l1[0], l1[1] - 4, "#c0392b", aktiv(e.Fl));
    g.textAlign = "left";
    g.fillStyle = aktiv(e.Fn) ? "#1565c0" : "#999"; g.fillText("F_n  ⟂ Anschlussfläche", Fn[0] + 8, Fn[1] - 38 * k - 8);
    g.fillStyle = aktiv(e.Fq) ? "#2e7d32" : "#999"; g.fillText("F_q  quer zur Naht", q0[0] + 6, q0[1] - 8 * k - 4);
    g.fillStyle = aktiv(e.Fl) ? "#c0392b" : "#999"; const lm = P(B - 14, tb, Z * 0.55); g.fillText("F_l  ∥ Naht", lm[0] + 8, lm[1] + 12);
    // Nahtrichtung
    g.strokeStyle = "#555"; g.fillStyle = "#555"; g.setLineDash([5, 3]); g.lineWidth = 1;
    const n0 = P(-10, 0, 0), n1 = P(-10, 0, Z + 16); g.beginPath(); g.moveTo(...n0); g.lineTo(...n1); g.stroke(); g.setLineDash([]);
    g.fillText("Nahtrichtung (l)", n1[0] - 20, n1[1] - 6);
    g.fillText(art === "kehl" ? "Doppelkehlnaht" : "Stumpfnaht (K-Naht)", 8, h - 8);

    if (!zeigeInset) return;
    // Kehlnahtquerschnitt mit Nahtspannungen: Wurzel R, Schenkel L, Kehlschnitt ⟂ zur Hypotenuse
    const L = Math.min(100, (w - pw) * 0.5, h * 0.4), rx = pw + (w - pw - L) / 2 - 6, ry = h * 0.62;
    g.fillStyle = "#e9edf2"; g.strokeStyle = "#667"; g.lineWidth = 1;
    g.fillRect(rx - 14, ry - L - 24, 14, L + 24); g.strokeRect(rx - 14, ry - L - 24, 14, L + 24);     // Steg
    g.fillRect(rx - 14, ry, L + 40, 14); g.strokeRect(rx - 14, ry, L + 40, 14);                          // Gurt
    g.fillStyle = "#f0b429"; g.strokeStyle = "#8a5a00"; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + L, ry); g.lineTo(rx, ry - L); g.closePath(); g.fill(); g.stroke();
    const mx = rx + L / 2, my = ry - L / 2, dk = L / 4;
    g.strokeStyle = "#333"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(rx, ry); g.lineTo(mx, my); g.stroke();           // Kehlschnitt (Dicke a)
    g.fillStyle = "#333"; g.textAlign = "left"; g.fillText("a", rx + L * 0.12, ry - L * 0.38);
    const ar = L * 0.42, v = Math.SQRT1_2;
    this._pfeil(g, mx, my, mx + v * ar, my + v * ar, "#1565c0");                        // σ⊥: senkrecht zur Kehlfläche
    this._pfeil(g, mx, my, mx - v * ar * 0.9, my - v * ar * 0.9, "#2e7d32");            // τ⊥: in der Kehlfläche, quer zur Naht
    g.strokeStyle = "#c0392b"; g.fillStyle = "#c0392b"; g.lineWidth = 2;                     // τ∥: aus der Zeichenebene (Punkt im Kreis)
    g.beginPath(); g.arc(mx + 22, my - 4, 7, 0, 7); g.stroke(); g.beginPath(); g.arc(mx + 22, my - 4, 2.2, 0, 7); g.fill();
    g.textAlign = "left"; g.font = "12px system-ui, sans-serif";
    g.fillStyle = "#1565c0"; g.fillText("σ⊥", mx + v * ar + 4, my + v * ar + 12);
    g.fillStyle = "#2e7d32"; g.fillText("τ⊥", mx - v * ar * 0.9 - 6, my - v * ar * 0.9 - 6);
    g.fillStyle = "#c0392b"; g.fillText("τ∥", mx + 32, my - 6);
    g.fillStyle = "#555"; g.textAlign = "center"; g.fillText("Kehlnahtquerschnitt", rx + L / 2, ry + 34);
  }
}
