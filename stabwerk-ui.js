"use strict";

/**
 * stabwerk-ui.js - Oberfläche des Bereichs "Statik" (ebene Stabwerke).
 * Klassen: ZeilenEditor (Tabelle zur Eingabe von Listen), StabwerkZeichnung (System, Lasten, Diagramme),
 * StatikSeite (Eingaben sammeln, rechnen, Ergebnisse anzeigen). Die Rechnung steht in stabwerk.js.
 */

/** Lagerarten: Schlüssel -> Anzeigename */
const LAGER = { frei: "frei", fest: "gelenkig fest", rolleZ: "Rolle (Z gehalten)", rolleX: "Rolle (X gehalten)", einsp: "Einspannung" };
const RICHTUNGEN = { lokal: "lokal z'", Z: "global Z (je Länge)", Zproj: "global Z (Projektion)", X: "global X" };

/** Editierbare Tabelle für eine Liste gleichartiger Einträge. */
class ZeilenEditor {
  /**
   * @param {HTMLElement} box Container
   * @param {Array} spalten [{k:Schlüssel, l:Beschriftung, opt?:{wert:text}, schritt?}] (ohne opt: Zahl)
   * @param {Function} neu liefert eine neue Zeile (bekommt die bisherigen Zeilen)
   * @param {Function} bei Änderung
   * @param {string} addText Beschriftung des Hinzufügen-Knopfs
   */
  constructor(box, spalten, neu, bei, addText) {
    this.box = box; this.spalten = spalten; this.neu = neu; this.bei = bei; this.addText = addText; this.zeilen = [];
  }

  setze(zeilen) { this.zeilen = zeilen; this.baue(); }

  baue() {
    const t = document.createElement("table"); t.className = "sw-tab";
    t.innerHTML = "<tr><th>Nr</th>" + this.spalten.map(s => `<th>${s.l}</th>`).join("") + "<th></th></tr>";
    this.zeilen.forEach((z, n) => {
      const tr = t.insertRow();
      tr.insertCell().textContent = n + 1;
      for (const sp of this.spalten) {
        const c = tr.insertCell();
        let e;
        if (sp.opt) {
          e = document.createElement("select");
          for (const [w, text] of Object.entries(sp.opt)) e.add(new Option(text, w));
          e.value = z[sp.k];
        } else {
          e = document.createElement("input"); e.type = "number"; e.step = "any";
          e.value = Number.isFinite(z[sp.k]) ? z[sp.k] : "";
        }
        e.addEventListener("input", () => { z[sp.k] = sp.opt ? e.value : parseFloat(e.value); this.bei(); });
        c.appendChild(e);
      }
      const x = tr.insertCell(), b = document.createElement("button");
      b.type = "button"; b.className = "sw-x"; b.textContent = "×"; b.title = "Zeile löschen";
      b.addEventListener("click", () => { this.zeilen.splice(n, 1); this.baue(); this.bei(); });
      x.appendChild(b);
    });
    const add = document.createElement("button");
    add.type = "button"; add.className = "sw-add"; add.textContent = "+ " + this.addText;
    add.addEventListener("click", () => { this.zeilen.push(this.neu(this.zeilen)); this.baue(); this.bei(); });
    this.box.replaceChildren(t, add);
  }
}

/** Zeichnung des Systems mit Lasten und wahlweise Schnittgrößen- oder Verformungsbild. */
class StabwerkZeichnung {
  constructor(canvas) { this.cv = canvas; }

  /**
   * @param {Object} m Modell (knoten, staebe, Lasten)
   * @param {Object|null} erg Ergebnis von Stabwerk.berechne()
   * @param {string} art 'system' | 'N' | 'V' | 'M' | 'verf'
   * @param {number} ueh Überhöhung der Verformung (0 = automatisch)
   * @returns {string} Hinweistext (Maßstab)
   */
  zeichne(m, erg, art, ueh) {
    const { g, w, h } = canvasVorbereiten(this.cv);
    const kn = m.knoten.filter(k => Number.isFinite(k.x) && Number.isFinite(k.z));
    if (!w || !h || kn.length === 0) return "";
    const xs = kn.map(k => k.x), zs = kn.map(k => k.z);
    const x0 = Math.min(...xs), z0 = Math.min(...zs);
    const ausd = Math.max(Math.max(...xs) - x0, Math.max(...zs) - z0, 1);
    const rand = 56;
    const sk = Math.min((w - 2 * rand) / Math.max(Math.max(...xs) - x0, 0.5), (h - 2 * rand) / Math.max(Math.max(...zs) - z0, 0.5), 400);
    const ox = (w - (Math.max(...xs) - x0) * sk) / 2, oy = (h - (Math.max(...zs) - z0) * sk) / 2;
    const P = (x, z) => [ox + (x - x0) * sk, oy + (z - z0) * sk];
    const stab = m.staebe.map(s => {
      const a = m.knoten[s.i - 1], b = m.knoten[s.j - 1];
      return a && b && [a, b].every(k => Number.isFinite(k.x) && Number.isFinite(k.z)) ? { a, b, L: Math.hypot(b.x - a.x, b.z - a.z) } : null;
    });
    g.font = "12px system-ui, sans-serif"; g.lineJoin = "round";

    // Stäbe (bei Verformung hellgrau)
    stab.forEach((s, n) => {
      if (!s || s.L < 1e-9) return;
      const [x1, y1] = P(s.a.x, s.a.z), [x2, y2] = P(s.b.x, s.b.z);
      g.strokeStyle = art === "verf" ? "#bbb" : "#222"; g.lineWidth = art === "verf" ? 1.5 : 3;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      if (art === "system") { g.fillStyle = "#1f4e9a"; g.textAlign = "center"; g.fillText(`S${n + 1}`, (x1 + x2) / 2 + 10 * (y1 - y2) / (Math.hypot(x2 - x1, y2 - y1) || 1) * -1, (y1 + y2) / 2 + 14 * ((x2 - x1) / (Math.hypot(x2 - x1, y2 - y1) || 1))); }
      // Gelenke
      const ges = m.staebe[n].gel;
      const kreis = (x, y) => { g.fillStyle = "#fff"; g.strokeStyle = "#222"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); g.stroke(); };
      const l = Math.hypot(x2 - x1, y2 - y1) || 1, ex = (x2 - x1) / l * 11, ey = (y2 - y1) / l * 11;
      if (ges === "anfang" || ges === "beide") kreis(x1 + ex, y1 + ey);
      if (ges === "ende" || ges === "beide") kreis(x2 - ex, y2 - ey);
    });
    this._lager(g, m, P);
    this._lasten(g, m, stab, P, sk);

    let text = "";
    if (erg && art !== "system") {
      if (art === "verf") text = this._verformung(g, erg, stab, P, sk, ausd, ueh);
      else text = this._diagramm(g, erg, art, P);
    }
    // Knoten zuletzt, damit sie über den Stäben liegen
    m.knoten.forEach((k, n) => {
      if (!Number.isFinite(k.x) || !Number.isFinite(k.z)) return;
      const [x, y] = P(k.x, k.z);
      g.fillStyle = "#222"; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
      g.fillStyle = "#c0392b"; g.textAlign = "left"; g.fillText(n + 1, x + 6, y - 6);
    });
    return text;
  }

  _lager(g, m, P) {
    g.strokeStyle = "#444"; g.fillStyle = "#e8eaee"; g.lineWidth = 1.5;
    for (const k of m.knoten) {
      if (!Number.isFinite(k.x) || !Number.isFinite(k.z) || k.lager === "frei") continue;
      const [x, y] = P(k.x, k.z);
      g.beginPath();
      if (k.lager === "einsp") { g.rect(x - 9, y, 18, 8); g.moveTo(x - 9, y); g.lineTo(x + 9, y); }
      else { g.moveTo(x, y); g.lineTo(x - 9, y + 14); g.lineTo(x + 9, y + 14); g.closePath(); }
      g.fill(); g.stroke();
      if (k.lager === "rolleZ" || k.lager === "rolleX") {
        g.beginPath(); g.arc(x - 4, y + 18, 3, 0, 7); g.arc(x + 4, y + 18, 3, 0, 7); g.stroke();
      }
    }
  }

  /** Pfeil von (x1,y1) nach (x2,y2) */
  _pfeil(g, x1, y1, x2, y2, f) {
    const l = Math.hypot(x2 - x1, y2 - y1); if (l < 1) return;
    const ux = (x2 - x1) / l, uy = (y2 - y1) / l;
    g.strokeStyle = g.fillStyle = f; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 8 * ux + 3.5 * uy, y2 - 8 * uy - 3.5 * ux); g.lineTo(x2 - 8 * ux - 3.5 * uy, y2 - 8 * uy + 3.5 * ux); g.closePath(); g.fill();
  }

  _lasten(g, m, stab, P, sk) {
    const f = "#d35400", LEN = 30;
    const richt = (st, r) => {            // Einheitsvektor der Lastrichtung (global, Z nach unten)
      if (r === "X") return [1, 0];
      if (r === "lokal") return [-(st.b.z - st.a.z) / st.L, (st.b.x - st.a.x) / st.L];
      return [0, 1];
    };
    for (const l of m.strecken) {
      const st = stab[l.s - 1]; if (!st || !Number.isFinite(l.q) || l.q === 0) continue;
      const [dx, dz] = richt(st, l.richtung), sg = Math.sign(l.q);
      const n = Math.max(3, Math.min(10, Math.round(st.L * sk / 28)));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const [x, y] = P(st.a.x + (st.b.x - st.a.x) * i / n, st.a.z + (st.b.z - st.a.z) * i / n);
        this._pfeil(g, x - dx * sg * LEN, y - dz * sg * LEN, x, y, f); pts.push([x - dx * sg * LEN, y - dz * sg * LEN]);
      }
      g.strokeStyle = f; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke();
      g.fillStyle = f; g.textAlign = "center"; g.fillText(`${l.q} kN/m`, (pts[0][0] + pts[n][0]) / 2, (pts[0][1] + pts[n][1]) / 2 - 5);
    }
    for (const l of m.einzel) {
      const st = stab[l.s - 1]; if (!st || !Number.isFinite(l.F) || l.F === 0 || !Number.isFinite(l.a)) continue;
      const [dx, dz] = richt(st, l.richtung), sg = Math.sign(l.F), t = Math.min(1, l.a / st.L);
      const [x, y] = P(st.a.x + (st.b.x - st.a.x) * t, st.a.z + (st.b.z - st.a.z) * t);
      this._pfeil(g, x - dx * sg * 36, y - dz * sg * 36, x, y, f);
      g.fillStyle = f; g.textAlign = "center"; g.fillText(`${l.F} kN`, x - dx * sg * 36, y - dz * sg * 36 - 5);
    }
    for (const l of m.knotenlasten) {
      const k = m.knoten[l.k - 1]; if (!k || !Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;
      const [x, y] = P(k.x, k.z);
      if (l.Fx) { const s = Math.sign(l.Fx); this._pfeil(g, x - s * 40, y, x, y, f); g.fillStyle = f; g.textAlign = "center"; g.fillText(`${l.Fx} kN`, x - s * 40, y - 6); }
      if (l.Fz) { const s = Math.sign(l.Fz); this._pfeil(g, x, y - s * 40, x, y, f); g.fillStyle = f; g.textAlign = "left"; g.fillText(`${l.Fz} kN`, x + 5, y - s * 40); }
      if (l.M) { g.strokeStyle = f; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, 14, l.M > 0 ? 0.3 : 2 * Math.PI - 0.3, l.M > 0 ? 4.6 : 1.7, l.M < 0); g.stroke(); g.fillStyle = f; g.textAlign = "left"; g.fillText(`${l.M} kNm`, x + 16, y + 16); }
    }
  }

  /** Schnittgrößenfläche N, V oder M; positive Werte auf der z'-Seite des Stabs (M: Zugseite). */
  _diagramm(g, erg, art, P) {
    let mx = 0;
    erg.staebe.forEach(s => s.verlauf.forEach(p => { mx = Math.max(mx, Math.abs(p[art])); }));
    if (mx < 1e-9) return `Alle ${art}-Werte sind null.`;
    const sc = 70 / mx, einheit = art === "M" ? "kNm" : "kN";
    const farbe = { N: "#2e7d32", V: "#1565c0", M: "#c0392b" }[art];
    for (const s of erg.staebe) {
      const e = s.el, nx = -e.s, nz = e.c;                       // Normale z'
      const k0 = this._knoten[e.i], base = x => ({ X: k0.x + e.c * x, Z: k0.z + e.s * x });
      const pos = s.verlauf.map(p => {
        const b = base(p.x), [bx, by] = P(b.X, b.Z);
        return { bx, by, tx: bx + nx * p[art] * sc, ty: by + nz * p[art] * sc, w: p[art] };
      });
      g.fillStyle = farbe + "33"; g.strokeStyle = farbe; g.lineWidth = 1.5;
      g.beginPath(); pos.forEach((p, i) => i ? g.lineTo(p.bx, p.by) : g.moveTo(p.bx, p.by));
      for (let i = pos.length - 1; i >= 0; i--) g.lineTo(pos[i].tx, pos[i].ty);
      g.closePath(); g.fill();
      g.beginPath(); pos.forEach((p, i) => i ? g.lineTo(p.tx, p.ty) : g.moveTo(p.tx, p.ty)); g.stroke();
      // Beschriftung: Anfang, Ende, Extremwert
      const marks = [pos[0], pos[pos.length - 1]];
      let ext = pos[0]; pos.forEach(p => { if (Math.abs(p.w) > Math.abs(ext.w)) ext = p; });
      marks.push(ext);
      g.fillStyle = "#111"; g.textAlign = "center";
      const gesehen = [];
      for (const p of marks) {
        if (Math.abs(p.w) < 1e-6 || gesehen.some(q => Math.hypot(q[0] - p.tx, q[1] - p.ty) < 28)) continue;
        gesehen.push([p.tx, p.ty]);
        g.fillText(fmt(p.w, 1), p.tx + nx * 10 * Math.sign(p.w || 1), p.ty + nz * 10 * Math.sign(p.w || 1) + 4);
      }
    }
    return `${art} in ${einheit}; größter Betrag ${fmt(mx, 1)} ${einheit}. Positive Werte liegen auf der z'-Seite des Stabs (bei waagerechten Stäben unten)${art === "M" ? "; M ist auf der Zugseite aufgetragen" : ""}.`;
  }

  _verformung(g, erg, stab, P, sk, ausd, ueh) {
    let mx = 0;
    erg.staebe.forEach(s => s.verf.forEach(p => { mx = Math.max(mx, Math.hypot(p.dU, p.dW)); }));
    if (mx < 1e-12) return "Keine Verformung.";
    const f = ueh > 0 ? ueh : 0.08 * ausd / mx;
    g.strokeStyle = "#8e24aa"; g.lineWidth = 2.5;
    for (const s of erg.staebe) {
      const e = s.el, a = this._knoten[e.i];
      g.beginPath();
      s.verf.forEach((p, i) => {
        const [x, y] = P(a.x + e.c * p.x + p.dU * f, a.z + e.s * p.x + p.dW * f);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
    }
    // Größte Knotenverschiebung beschriften
    let k = erg.verschiebungen[0];
    erg.verschiebungen.forEach(v => { if (Math.hypot(v.u, v.w) > Math.hypot(k.u, k.w)) k = v; });
    return `Verformte Lage (violett), ${ueh > 0 ? "" : "automatisch "}${fmt(f, 0)}-fach überhöht; größte Knotenverschiebung ${fmt(Math.hypot(k.u, k.w) * 1000, 2)} mm (Knoten ${k.k}).`;
  }
}

/** Seite "Statik": Eingabe, Berechnung, Anzeige. */
class StatikSeite {
  constructor() {
    this.zeichnung = new StabwerkZeichnung(document.getElementById("sw-canvas"));
    const bei = () => this.aktualisiere();
    const nr = (z, k) => z.length ? z[z.length - 1][k] : 1;
    this.edKnoten = new ZeilenEditor(document.getElementById("sw-knoten"),
      [{ k: "x", l: "X [m]" }, { k: "z", l: "Z [m]" }, { k: "lager", l: "Lager", opt: LAGER }],
      z => ({ x: z.length ? z[z.length - 1].x + 3 : 0, z: z.length ? z[z.length - 1].z : 0, lager: "frei" }), bei, "Knoten");
    this.edStaebe = new ZeilenEditor(document.getElementById("sw-staebe"),
      [{ k: "i", l: "von" }, { k: "j", l: "nach" }, { k: "A", l: "A [cm²]" }, { k: "I", l: "I [cm⁴]" },
       { k: "gel", l: "Gelenk", opt: { "-": "–", anfang: "Anfang", ende: "Ende", beide: "beide" } }],
      z => ({ i: z.length ? z[z.length - 1].j : 1, j: (z.length ? z[z.length - 1].j : 1) + 1, A: 53.8, I: 8356, gel: "-" }), bei, "Stab");
    this.edKL = new ZeilenEditor(document.getElementById("sw-kl"),
      [{ k: "k", l: "Knoten" }, { k: "Fx", l: "Fx [kN]" }, { k: "Fz", l: "Fz [kN]" }, { k: "M", l: "M [kNm]" }],
      () => ({ k: 1, Fx: 0, Fz: 0, M: 0 }), bei, "Knotenlast");
    this.edStr = new ZeilenEditor(document.getElementById("sw-str"),
      [{ k: "s", l: "Stab" }, { k: "q", l: "q [kN/m]" }, { k: "richtung", l: "Richtung", opt: RICHTUNGEN }],
      () => ({ s: 1, q: 10, richtung: "Z" }), bei, "Streckenlast");
    this.edEin = new ZeilenEditor(document.getElementById("sw-ein"),
      [{ k: "s", l: "Stab" }, { k: "F", l: "F [kN]" }, { k: "a", l: "a [m]" }, { k: "richtung", l: "Richtung", opt: RICHTUNGEN }],
      () => ({ s: 1, F: 10, a: 1, richtung: "Z" }), bei, "Einzellast");
    ["sw-E", "sw-art", "sw-ueh"].forEach(id => document.getElementById(id).addEventListener("input", bei));
    document.getElementById("sw-beispiel").addEventListener("click", () => { this.lade(StatikSeite.BEISPIEL()); this.aktualisiere(); });
    document.getElementById("sw-leer").addEventListener("click", () => { this.lade({ E: 210000, knoten: [], staebe: [], knotenlasten: [], strecken: [], einzel: [] }); this.aktualisiere(); });
    window.addEventListener("resize", () => { if (document.getElementById("tab-statik").classList.contains("aktiv")) this.aktualisiere(); });

    let start = null;
    try { start = JSON.parse(localStorage.getItem("statik-modell")); } catch (e) { start = null; }
    this.lade(start && start.knoten ? start : StatikSeite.BEISPIEL());
    this.aktualisiere();
  }

  /** Beispiel: Rahmen mit Streckenlast auf dem Riegel und Horizontallast am Rahmeneck. */
  static BEISPIEL() {
    return {
      E: 210000,
      knoten: [{ x: 0, z: 3, lager: "fest" }, { x: 0, z: 0, lager: "frei" }, { x: 6, z: 0, lager: "frei" }, { x: 6, z: 3, lager: "rolleZ" }],
      staebe: [{ i: 1, j: 2, A: 53.8, I: 8356, gel: "-" }, { i: 2, j: 3, A: 53.8, I: 8356, gel: "-" }, { i: 3, j: 4, A: 53.8, I: 8356, gel: "-" }],
      knotenlasten: [{ k: 2, Fx: 10, Fz: 0, M: 0 }],
      strecken: [{ s: 2, q: 20, richtung: "Z" }], einzel: [],
    };
  }

  lade(m) {
    document.getElementById("sw-E").value = m.E;
    this.edKnoten.setze(m.knoten); this.edStaebe.setze(m.staebe); this.edKL.setze(m.knotenlasten);
    this.edStr.setze(m.strecken); this.edEin.setze(m.einzel);
  }

  modell() {
    return {
      E: zahl("sw-E"), knoten: this.edKnoten.zeilen, staebe: this.edStaebe.zeilen,
      knotenlasten: this.edKL.zeilen, strecken: this.edStr.zeilen, einzel: this.edEin.zeilen,
    };
  }

  zeige() { this.aktualisiere(); }

  aktualisiere() {
    const m = this.modell(), box = document.getElementById("sw-ergebnis"), art = document.getElementById("sw-art").value;
    try { localStorage.setItem("statik-modell", JSON.stringify(m)); } catch (e) { /* Speicher nicht verfügbar */ }
    let erg = null, fehler = null;
    try { erg = new Stabwerk(m).berechne(); } catch (e) { fehler = e.message; }
    this.zeichnung._knoten = m.knoten;
    document.getElementById("sw-hinweis").textContent = this.zeichnung.zeichne(m, erg, art, zahl("sw-ueh"));
    box.innerHTML = fehler ? `<span class="fehler">${fehler}</span>` : this._tabellen(erg);
  }

  _tabellen(erg) {
    let h = "<h3>Auflagerkräfte</h3><table><tr><th>Knoten</th><th>R<sub>x</sub> [kN]</th><th>R<sub>z</sub> [kN]</th><th>M [kNm]</th></tr>";
    for (const r of erg.reaktionen) h += `<tr><td>${r.k}</td><td>${fmt(r.Rx, 2)}</td><td>${fmt(r.Rz, 2)}</td><td>${fmt(r.M, 2)}</td></tr>`;
    h += "</table>";
    const rest = Math.max(Math.abs(erg.residuum.x), Math.abs(erg.residuum.z));
    h += `<p class="hinweis">Kontrolle ΣF (Lasten + Auflager): ${rest < 1e-6 ? "<span class=\"ok\">✓</span>" : "<span class=\"fehler\">✗</span>"} (Rest ${fmt(rest, 6)} kN). Auflagerkräfte wirken auf das System in +X (rechts) und +Z (unten).</p>`;
    h += "<h3>Knotenverformungen</h3><table><tr><th>Knoten</th><th>u [mm]</th><th>w [mm]</th><th>φ [mrad]</th></tr>";
    for (const v of erg.verschiebungen) h += `<tr><td>${v.k}</td><td>${fmt(v.u * 1000, 2)}</td><td>${fmt(v.w * 1000, 2)}</td><td>${fmt(v.phi * 1000, 3)}</td></tr>`;
    h += "</table><h3>Extremwerte je Stab</h3>";
    h += "<table><tr><th>Stab</th><th>L [m]</th><th>N min / max [kN]</th><th>V min / max [kN]</th><th>M min / max [kNm]</th><th>f<sub>max</sub> [mm]</th></tr>";
    for (const s of erg.staebe) {
      const e = s.ext;
      h += `<tr><td>${s.nr}</td><td>${fmt(s.L, 2)}</td><td>${fmt(e.N.min, 1)} / ${fmt(e.N.max, 1)}</td><td>${fmt(e.V.min, 1)} / ${fmt(e.V.max, 1)}</td><td>${fmt(e.M.min, 1)} / ${fmt(e.M.max, 1)}</td><td>${fmt(s.fmax * 1000, 2)}</td></tr>`;
    }
    return h + "</table><p class=\"hinweis\">f<sub>max</sub> = größte Durchbiegung gegenüber der Sehne des verformten Stabs.</p>";
  }
}
