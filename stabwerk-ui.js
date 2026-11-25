"use strict";

/**
 * stabwerk-ui.js - Oberfläche des Bereichs "Statik" (ebene Stabwerke).
 * Klassen: ZeilenEditor (Tabelle zur Eingabe von Listen), StabwerkZeichnung (System, Lasten, Diagramme),
 * StatikSeite (Eingaben sammeln, rechnen, Ergebnisse anzeigen). Die Rechnung steht in stabwerk.js.
 */

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
  constructor(box, spalten, neu, bei, addText, optionen = {}) {
    this.box = box; this.spalten = spalten; this.neu = neu; this.bei = bei; this.addText = addText; this.zeilen = [];
    this.optionen = optionen;          // {feld(zeile, schluessel): nach Änderung eines Feldes, vorLoeschen(n): vor dem Löschen, minZeilen: Mindestanzahl}
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
        if (sp.haken) {
          e = document.createElement("input"); e.type = "checkbox"; e.checked = !!z[sp.k];
          e.addEventListener("input", () => { z[sp.k] = e.checked; this.bei(); });
          c.appendChild(e); c.className = "sw-haken";
          continue;
        }
        if (sp.opt) {
          e = document.createElement("select");
          for (const [w, text] of Object.entries(typeof sp.opt === "function" ? sp.opt() : sp.opt)) e.add(new Option(text, w));
          e.value = z[sp.k];
          if (sp.kurz) e.className = "sw-kurz";
          e.title = e.selectedOptions[0] ? e.selectedOptions[0].text : "";   // voller Text als Tooltip
        } else if (sp.text) {
          e = document.createElement("input"); e.type = "text"; e.value = z[sp.k] || ""; e.className = "sw-text";
        } else {
          e = document.createElement("input"); e.type = "number"; e.step = "any"; if (sp.platz) e.placeholder = sp.platz;   // leer = Platzhalter
          e.value = Number.isFinite(z[sp.k]) ? z[sp.k] : "";
        }
        if (sp.sperre && sp.sperre(z)) e.disabled = true;   // berechnete Werte nicht editierbar
        e.addEventListener("input", () => {
          z[sp.k] = sp.opt || sp.text ? e.value : parseFloat(e.value);
          if (this.optionen.feld) this.optionen.feld(z, sp.k);
          this.bei();
        });
        c.appendChild(e);
      }
      const x = tr.insertCell(), b = document.createElement("button");
      b.type = "button"; b.className = "sw-x"; b.textContent = "×"; b.title = "Zeile löschen";
      b.disabled = this.zeilen.length <= (this.optionen.minZeilen || 0);
      b.addEventListener("click", () => {
        if (this.optionen.vorLoeschen) this.optionen.vorLoeschen(n);
        this.zeilen.splice(n, 1); this.baue(); this.bei();
      });
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
  constructor(canvas) {
    this.cv = canvas; this.treffer = []; this.maus = null; this.letzte = null;
    // Mausabfrage: beim Überfahren (bzw. Antippen) der Zustandslinien die Werte anzeigen
    const pos = e => { const r = canvas.getBoundingClientRect(); this.maus = { x: e.clientX - r.left, y: e.clientY - r.top }; this.neu(); };
    canvas.addEventListener("pointermove", pos);
    canvas.addEventListener("pointerdown", pos);
    canvas.addEventListener("pointerleave", () => { this.maus = null; this.neu(); });
  }

  /** Letzte Zeichnung wiederholen (Mausanzeige aktualisieren). */
  neu() { if (this.letzte) this.zeichne(...this.letzte); }

  /**
   * @param {Object} m Modell (knoten, staebe, Lasten)
   * @param {Object|null} erg Ergebnis von Stabwerk.berechne()
   * @param {string} art 'system' | 'N' | 'V' | 'M' | 'verf'
   * @param {number} ueh Überhöhung der Verformung (0 = automatisch)
   * @returns {string} Hinweistext (Maßstab)
   */
  zeichne(m, erg, art, ueh) {
    this.letzte = [m, erg, art, ueh]; this.treffer = [];
    const { g, w, h } = canvasVorbereiten(this.cv);
    const kn = m.knoten.filter(k => Number.isFinite(k.x) && Number.isFinite(k.z));
    if (!w || !h || kn.length === 0) return "";
    const nx0 = Math.min(...kn.map(k => k.x)), nx1 = Math.max(...kn.map(k => k.x));
    const nz0 = Math.min(...kn.map(k => k.z)), nz1 = Math.max(...kn.map(k => k.z));
    const ausd = Math.max(nx1 - nx0, nz1 - nz0, 1);
    // Weltkoordinaten der Diagramm- bzw. Verformungslinie vorab bestimmen, damit sie in den Ausschnitt passen
    const extra = this._extra(erg, art, ausd, ueh);
    const xs = [nx0, nx1, ...extra.map(p => p[0])], zs = [nz0, nz1, ...extra.map(p => p[1])];
    const x0 = Math.min(...xs), z0 = Math.min(...zs);
    const rand = 84;                                           // Platz für Lasten (Pfeile bis 64 px), Lager und Beschriftung
    const bw = Math.max(Math.max(...xs) - x0, 0.5), bh = Math.max(Math.max(...zs) - z0, 0.5);
    const sk = Math.min((w - 2 * rand) / bw, (h - 2 * rand) / bh, 400);
    const ox = (w - (Math.max(...xs) - x0) * sk) / 2, oy = (h - (Math.max(...zs) - z0) * sk) / 2;
    this.sk = sk;
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
      const vt = m.staebe[n].voute;                          // Voute: Breite der Darstellung ~ Querschnittshöhe
      if (vt) {
        const lp = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / lp, ny = (x2 - x1) / lp, hm = Math.max(vt.h0, vt.h1);
        const b0 = 3 + 9 * vt.h0 / hm, b1 = 3 + 9 * vt.h1 / hm;
        g.fillStyle = art === "verf" ? "#e6e6e6" : "#9aa5b1"; g.strokeStyle = "#555"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x1 + nx * b0, y1 + ny * b0); g.lineTo(x2 + nx * b1, y2 + ny * b1); g.lineTo(x2 - nx * b1, y2 - ny * b1); g.lineTo(x1 - nx * b0, y1 - ny * b0); g.closePath(); g.fill(); g.stroke();
      }
      if (art === "system") { g.fillStyle = "#1f4e9a"; g.textAlign = "center"; g.fillText(`S${n + 1}`, (x1 + x2) / 2 + 10 * (y1 - y2) / (Math.hypot(x2 - x1, y2 - y1) || 1) * -1, (y1 + y2) / 2 + 14 * ((x2 - x1) / (Math.hypot(x2 - x1, y2 - y1) || 1))); }
      // Gelenke
      const ges = m.staebe[n].gel;
      const kreis = (x, y) => { g.fillStyle = "#fff"; g.strokeStyle = "#222"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); g.stroke(); };
      const l = Math.hypot(x2 - x1, y2 - y1) || 1, ex = (x2 - x1) / l * 11, ey = (y2 - y1) / l * 11;
      if (ges === "anfang" || ges === "beide") kreis(x1 + ex, y1 + ey);
      if (ges === "ende" || ges === "beide") kreis(x2 - ex, y2 - ey);
    });
    this._lager(g, m, P);
    this._federn(g, m, stab, P);
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
    this._achsen(g, w, h);
    if (this.maus && this.treffer.length) this._tooltip(g, w, h);
    return text;
  }

  /** Weltpunkte [x, z] der Schnittgrößenlinie bzw. der verformten Lage (für den Bildausschnitt); legt Maßstäbe fest. */
  _extra(erg, art, ausd, ueh) {
    this.kd = 0; this.fv = 0;
    if (!erg || art === "system") return [];
    const pts = [];
    if (art === "verf") {
      let mx = 0;
      erg.staebe.forEach(s => s.verf.forEach(p => { mx = Math.max(mx, Math.hypot(p.dU, p.dW)); }));
      if (mx < 1e-12) return [];
      this.fv = ueh > 0 ? ueh : 0.08 * ausd / mx;
      for (const s of erg.staebe) { const e = s.el, a = this._knoten[e.i]; s.verf.forEach(p => pts.push([a.x + e.c * p.x + p.dU * this.fv, a.z + e.s * p.x + p.dW * this.fv])); }
      return pts;
    }
    let mx = 0;
    const sets = erg.min ? [erg, erg.min] : [erg];
    sets.forEach(E => E.staebe.forEach(s => s.verlauf.forEach(p => { mx = Math.max(mx, Math.abs(p[art])); })));
    if (mx < 1e-9) return [];
    this.kd = 0.15 * ausd / mx;                                 // Länge in m je Einheit der Schnittgröße
    for (const E of sets) for (const s of E.staebe) {
      const e = s.el, a = this._knoten[e.i];
      s.verlauf.forEach(p => pts.push([a.x + e.c * p.x - e.s * p[art] * this.kd, a.z + e.s * p.x + e.c * p[art] * this.kd]));
    }
    return pts;
  }

  /** Kleines Koordinatensystem (X nach rechts, Z nach unten) unten rechts */
  _achsen(g, w, h) {
    const x = 16, y = 14, l = 26;
    this._pfeil(g, x, y, x + l, y, "#555"); this._pfeil(g, x, y, x, y + l, "#555");
    g.fillStyle = "#555"; g.font = "11px system-ui, sans-serif"; g.textAlign = "left";
    g.fillText("X", x + l + 3, y + 4); g.textAlign = "center"; g.fillText("Z", x, y + l + 12);
  }

  /** Lagersymbol nach gehaltenen Richtungen: X+Z gelenkig, nur Z / nur X Rolle, mit φ Einspannung; darunter die Kurzbezeichnung. */
  /** Kennung der Einwirkung (z. B. " (Q1)") für die Lastbeschriftung */
  _id(l) { return this.ids && this.ids[l.ew - 1] ? ` (${this.ids[l.ew - 1]})` : ""; }

  _lager(g, m, P) {
    g.strokeStyle = "#444"; g.fillStyle = "#e8eaee"; g.lineWidth = 1.5;
    for (const k of m.knoten) {
      if (!Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;
      const hx = !!k.hx, hz = !!k.hz, hp = !!k.hphi;
      if (!hx && !hz && !hp) continue;
      const [x, y] = P(k.x, k.z);
      g.save(); g.translate(x, y);
      if (hx && !hz && !hp) g.rotate(Math.PI / 2);             // nur X gehalten: Symbol seitlich (Lager links vom Knoten)
      g.beginPath();
      let unten = 16;
      if (hp) { g.rect(-10, 0, 20, 8); unten = 10; }          // Einspannung (ggf. mit Gleitlager)
      else { g.moveTo(0, 0); g.lineTo(-9, 14); g.lineTo(9, 14); g.closePath(); }
      g.fill(); g.stroke();
      if (!hp && hx !== hz || hp && !(hx && hz)) {            // verschieblich: Rollen
        g.beginPath(); g.arc(-4, unten + 3, 3, 0, 7); g.arc(4, unten + 3, 3, 0, 7); g.stroke();
      }
      g.restore();
      g.fillStyle = "#555"; g.font = "10px system-ui, sans-serif"; g.textAlign = "center";
      g.fillText([hx && "x", hz && "z", hp && "φ"].filter(Boolean).join(" "), x + (hx && !hz && !hp ? -26 : 0), y + (hx && !hz && !hp ? 4 : 32));
      g.fillStyle = "#e8eaee"; g.font = "12px system-ui, sans-serif";
    }
  }

  /** Zickzack-Feder von (x1,y1) nach (x2,y2) mit Fußstrich am Ende. */
  _feder(g, x1, y1, x2, y2) {
    const l = Math.hypot(x2 - x1, y2 - y1); if (l < 4) return;
    const ux = (x2 - x1) / l, uy = (y2 - y1) / l, nx = -uy, ny = ux, z = 4, br = 4;
    g.beginPath(); g.moveTo(x1, y1);
    g.lineTo(x1 + ux * l * 0.2, y1 + uy * l * 0.2);
    for (let i = 0; i < z; i++) {
      const t = 0.2 + 0.6 * (i + 0.5) / z, s = i % 2 ? -br : br;
      g.lineTo(x1 + ux * l * t + nx * s, y1 + uy * l * t + ny * s);
    }
    g.lineTo(x1 + ux * l * 0.8, y1 + uy * l * 0.8); g.lineTo(x2, y2); g.stroke();
    g.beginPath(); g.moveTo(x2 + nx * 7, y2 + ny * 7); g.lineTo(x2 - nx * 7, y2 - ny * 7); g.stroke();
  }

  /** Federn an Knoten (c_x nach links, c_z nach unten) und Bettung der Stäbe (Federreihe auf der z'-Seite bzw. nach unten). */
  _federn(g, m, stab, P) {
    g.strokeStyle = "#00897b"; g.lineWidth = 1.5; g.fillStyle = "#00897b"; g.font = "10px system-ui, sans-serif";
    for (const f of m.federn || []) {
      const k = m.knoten[f.k - 1]; if (!k || !Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;
      const [x, y] = P(k.x, k.z);
      if (f.cz > 0) { this._feder(g, x, y + 4, x, y + 34); g.textAlign = "left"; g.fillText(`c_z ${f.cz}`, x + 8, y + 36); }
      if (f.cx > 0) { this._feder(g, x - 4, y, x - 34, y); g.textAlign = "right"; g.fillText(`c_x ${f.cx}`, x - 36, y - 6); }
    }
    for (const b of m.bettung || []) {
      const st = stab[b.s - 1]; if (!st || !(b.kz > 0 || b.kx > 0)) continue;
      const [x1, y1] = P(st.a.x, st.a.z), [x2, y2] = P(st.b.x, st.b.z), lp = Math.hypot(x2 - x1, y2 - y1) || 1;
      const dx = b.bezug === "global" ? 0 : -(y2 - y1) / lp, dz = b.bezug === "global" ? 1 : (x2 - x1) / lp;
      const n = Math.max(3, Math.min(14, Math.round(lp / 26)));
      for (let i = 0; i <= n; i++) { const t = i / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t; this._feder(g, x + dx * 4, y + dz * 4, x + dx * 22, y + dz * 22); }
      g.textAlign = "center"; g.fillText(`Bettung k_z ${b.kz}${b.kx > 0 ? `, k_x ${b.kx}` : ""} kN/m²`, (x1 + x2) / 2 + dx * 34, (y1 + y2) / 2 + dz * 34);
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

  /**
   * Lasten maßstäblich: die Pfeillänge ist proportional zur Last (Streckenlasten in kN/m und Einzel-/Knotenkräfte in kN
   * haben je einen eigenen Maßstab; größte Last = 64 px). Eigengewicht (automatisch) wird grau gezeichnet.
   */
  _lasten(g, m, stab, P, sk) {
    const FARBE = "#d35400", EG = "#7f8c8d", MAXL = 64;
    const ab = v => (Number.isFinite(v) ? Math.abs(v) : 0);
    const qmax = Math.max(1e-9, ...m.strecken.map(l => ab(l.q)));
    const fmax = Math.max(1e-9, ...m.einzel.map(l => ab(l.F)), ...m.knotenlasten.flatMap(l => [ab(l.Fx), ab(l.Fz)]));
    const lq = q => Math.max(8, MAXL * ab(q) / qmax), lf = F => Math.max(10, MAXL * ab(F) / fmax);
    const richt = (st, r) => {            // Einheitsvektor der Lastrichtung (global, Z nach unten)
      if (r === "X") return [1, 0];
      if (r === "lokal") return [-(st.b.z - st.a.z) / st.L, (st.b.x - st.a.x) / st.L];
      return [0, 1];
    };
    for (const l of m.strecken) {
      const st = stab[l.s - 1]; if (!st || !Number.isFinite(l.q) || l.q === 0) continue;
      const f = l.eg ? EG : FARBE, LEN = lq(l.q);
      const [dx, dz] = richt(st, l.richtung), sg = Math.sign(l.q);
      const n = Math.max(2, Math.min(10, Math.round(st.L * Math.max(0.05, Math.min(1, (Number.isFinite(l.b) ? l.b : st.L) - (l.a || 0)) / st.L) * sk / 28)));
      const pts = [], t0 = Math.max(0, Number.isFinite(l.a) ? l.a / st.L : 0), t1 = Math.min(1, Number.isFinite(l.b) ? l.b / st.L : 1);
      if (!(t1 > t0)) continue;
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * i / n;
        const [x, y] = P(st.a.x + (st.b.x - st.a.x) * t, st.a.z + (st.b.z - st.a.z) * t);
        this._pfeil(g, x - dx * sg * LEN, y - dz * sg * LEN, x, y, f); pts.push([x - dx * sg * LEN, y - dz * sg * LEN]);
      }
      g.strokeStyle = f; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke();
      g.fillStyle = f; g.textAlign = "center"; g.fillText(`${fmt(l.q, 2)} kN/m${l.eg ? " (EG)" : this._id(l)}`, (pts[0][0] + pts[n][0]) / 2, (pts[0][1] + pts[n][1]) / 2 - 5);
    }
    for (const l of m.einzel) {
      const st = stab[l.s - 1]; if (!st || !Number.isFinite(l.F) || l.F === 0 || !Number.isFinite(l.a)) continue;
      const [dx, dz] = richt(st, l.richtung), sg = Math.sign(l.F), t = Math.min(1, l.a / st.L), LEN = lf(l.F);
      const [x, y] = P(st.a.x + (st.b.x - st.a.x) * t, st.a.z + (st.b.z - st.a.z) * t);
      this._pfeil(g, x - dx * sg * LEN, y - dz * sg * LEN, x, y, FARBE);
      g.fillStyle = FARBE; g.textAlign = "center"; g.fillText(`${l.F} kN${this._id(l)}`, x - dx * sg * LEN, y - dz * sg * LEN - 5);
    }
    for (const l of m.knotenlasten) {
      const k = m.knoten[l.k - 1]; if (!k || !Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;
      const [x, y] = P(k.x, k.z), f = FARBE;
      if (l.Fx) { const s = Math.sign(l.Fx), L = lf(l.Fx); this._pfeil(g, x - s * L, y, x, y, f); g.fillStyle = f; g.textAlign = "center"; g.fillText(`${l.Fx} kN${this._id(l)}`, x - s * L, y - 6); }
      if (l.Fz) { const s = Math.sign(l.Fz), L = lf(l.Fz); this._pfeil(g, x, y - s * L, x, y, f); g.fillStyle = f; g.textAlign = "left"; g.fillText(`${l.Fz} kN${this._id(l)}`, x + 5, y - s * L); }
      if (l.M) { g.strokeStyle = f; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, 14, l.M > 0 ? 0.3 : 2 * Math.PI - 0.3, l.M > 0 ? 4.6 : 1.7, l.M < 0); g.stroke(); g.fillStyle = f; g.textAlign = "left"; g.fillText(`${l.M} kNm${this._id(l)}`, x + 16, y + 16); }
    }
    // Maßstab unten links: Länge eines 64-px-Pfeils
    const hh = g.canvas.getBoundingClientRect().height;
    g.fillStyle = "#555"; g.strokeStyle = "#555"; g.lineWidth = 1; g.textAlign = "left";
    g.beginPath(); g.moveTo(10, hh - 14); g.lineTo(10 + MAXL, hh - 14); g.stroke();
    const t = [m.strecken.length ? `${fmt(qmax, 2)} kN/m` : "", (m.einzel.length || m.knotenlasten.length) ? `${fmt(fmax, 2)} kN` : ""].filter(Boolean).join(" bzw. ");
    if (t) g.fillText(`Lastmaßstab: ${MAXL} px ≙ ${t}`, 10 + MAXL + 6, hh - 10);
  }

  /** Schnittgrößenfläche N, V oder M (bei Umhüllenden: Maximum und Minimum); positive Werte auf der z'-Seite des Stabs. */
  _diagramm(g, erg, art, P) {
    const env = !!erg.min, sets = env ? [erg, erg.min] : [erg];
    let mx = 0;
    sets.forEach(E => E.staebe.forEach(s => s.verlauf.forEach(p => { mx = Math.max(mx, Math.abs(p[art])); })));
    if (mx < 1e-9) return `Alle ${art}-Werte sind null.`;
    const einheit = art === "M" ? "kNm" : "kN";
    const farbe = { N: "#2e7d32", V: "#1565c0", M: "#c0392b" }[art];
    this._einheit = einheit; this._mx = mx;
    const marken = [];
    // Bei Umhüllenden: Maximalwerte aus der Max-Linie, Minimalwerte aus der Min-Linie
    sets.forEach((E, i) => marken.push(...this._flaeche(g, E, art, P, farbe, env ? (i === 0 ? "max" : "min") : "beide", env ? (i === 0 ? "max" : "min") : "")));
    // globales Maximum und Minimum über das ganze System
    const gmax = marken.reduce((a, m) => (m.w > a.w ? m : a), marken[0]);
    const gmin = marken.reduce((a, m) => (m.w < a.w ? m : a), marken[0]);
    this._beschrifte(g, marken, [gmax, gmin]);
    const ort = m => `Stab ${m.stab}, x = ${fmt(m.x, 2)} m`, z = v => fmt(Math.abs(v) < 5e-7 ? 0 : v, 1);
    return `${art} in ${einheit}${env ? " (Umhüllende)" : ""}: Maximum ${z(gmax.w)} (${ort(gmax)}), Minimum ${z(gmin.w)} (${ort(gmin)}). Positive Werte liegen auf der z'-Seite des Stabs (bei waagerechten Stäben unten)${art === "M" ? "; M ist auf der Zugseite aufgetragen" : ""}. Mit der Maus über die Linie fahren zeigt die Werte.`;
  }

  /**
   * Eine gefüllte Schnittgrößenfläche über allen Stäben. Liefert die Extremstellen (Stabenden und lokale
   * Maxima/Minima im Stabinneren, per Parabel verfeinert) und registriert die Fläche für die Mausabfrage.
   * @param {string} modus 'max' | 'min' | 'beide': welche lokalen Extrema gesucht werden
   * @param {string} name Bezeichnung des Satzes für die Anzeige (z. B. "Maximum")
   */
  _flaeche(g, erg, art, P, farbe, modus, name) {
    const marken = [], sk = this.sk, kd = this.kd;
    const eps = 0.005 * this._mx;                                // Mindest-Ausprägung eines lokalen Extremums
    for (const s of erg.staebe) {
      const e = s.el, nx = -e.s, nz = e.c, k0 = this._knoten[e.i];
      const pos = s.verlauf.map(p => {
        const [bx, by] = P(k0.x + e.c * p.x, k0.z + e.s * p.x), [tx, ty] = P(k0.x + e.c * p.x + nx * p[art] * kd, k0.z + e.s * p.x + nz * p[art] * kd);
        return { bx, by, tx, ty, w: p[art], x: p.x };
      });
      g.fillStyle = farbe + "33"; g.strokeStyle = farbe; g.lineWidth = 1.5;
      g.beginPath(); pos.forEach((p, i) => i ? g.lineTo(p.bx, p.by) : g.moveTo(p.bx, p.by));
      for (let i = pos.length - 1; i >= 0; i--) g.lineTo(pos[i].tx, pos[i].ty);
      g.closePath(); g.fill();
      g.beginPath(); pos.forEach((p, i) => i ? g.lineTo(p.tx, p.ty) : g.moveTo(p.tx, p.ty)); g.stroke();

      // Extremstellen: Stabanfang, Stabende, lokale Extrema im Inneren
      const punkt = (x, w) => {
        const [bx, by] = P(k0.x + e.c * x, k0.z + e.s * x), [tx, ty] = P(k0.x + e.c * x + nx * w * kd, k0.z + e.s * x + nz * w * kd);
        return { bx, by, tx, ty, w, x, stab: s.nr, nx, nz };
      };
      const n = pos.length;
      marken.push(punkt(pos[0].x, pos[0].w), punkt(pos[n - 1].x, pos[n - 1].w));
      for (let i = 1; i < n - 1; i++) {
        const a = pos[i - 1].w, b = pos[i].w, c = pos[i + 1].w;
        const istMax = modus !== "min" && b > a && b >= c && b - Math.min(a, c) > 0 && b - Math.min(pos[0].w, pos[n - 1].w) > eps;
        const istMin = modus !== "max" && b < a && b <= c && Math.max(pos[0].w, pos[n - 1].w) - b > eps;
        if (!istMax && !istMin) continue;
        const den = a - 2 * b + c; let dx = 0;
        if (Math.abs(den) > 1e-12) dx = Math.max(-1, Math.min(1, 0.5 * (a - c) / den));
        const wv = b - 0.25 * (a - c) * dx, h = (pos[i + 1].x - pos[i - 1].x) / 2;
        marken.push(punkt(pos[i].x + dx * h, wv));
      }
      // Mausabfrage: Fläche zwischen Stabachse und Linie
      const L = Math.hypot(pos[n - 1].bx - pos[0].bx, pos[n - 1].by - pos[0].by) || 1;
      const ux = (pos[n - 1].bx - pos[0].bx) / L, uy = (pos[n - 1].by - pos[0].by) / L;
      this.treffer.push({
        art: "diag", nr: s.nr, name, einheit: this._einheit,
        wert: x => this._interp(pos, x, "w"),
        test: (mx, my) => {
          const rx = mx - pos[0].bx, ry = my - pos[0].by, along = rx * ux + ry * uy, perp = rx * nx + ry * nz;
          const lm = pos[n - 1].x - pos[0].x; if (lm <= 0) return null;
          const t = along / L; if (t < -0.03 || t > 1.03) return null;
          const x = pos[0].x + Math.max(0, Math.min(1, t)) * lm, w = this._interp(pos, x, "w"), off = w * kd * sk;
          if (perp < Math.min(0, off) - 8 || perp > Math.max(0, off) + 8) return null;
          const [cx, cy] = P(k0.x + e.c * x + nx * w * kd, k0.z + e.s * x + nz * w * kd), [bx, by] = P(k0.x + e.c * x, k0.z + e.s * x);
          return { d: Math.abs(perp - off), x, pt: [cx, cy], fuss: [bx, by] };
        },
      });
    }
    return marken;
  }

  /** Lineare Interpolation einer Größe entlang der Stützstellen (sortiert nach x). */
  _interp(arr, x, key) {
    for (let i = 0; i < arr.length - 1; i++) {
      if (x <= arr[i + 1].x + 1e-12) {
        const d = arr[i + 1].x - arr[i].x, t = d > 1e-12 ? (x - arr[i].x) / d : 0;
        return arr[i][key] + (arr[i + 1][key] - arr[i][key]) * Math.max(0, Math.min(1, t));
      }
    }
    return arr[arr.length - 1][key];
  }

  /** Zahlenwerte an den Extremstellen; globales Maximum und Minimum (fett) haben Vorrang, nahe Beschriftungen entfallen. */
  _beschrifte(g, marken, global) {
    const gesehen = [];
    const rang = [...global, ...[...marken].sort((a, b) => Math.abs(b.w) - Math.abs(a.w))];
    g.textAlign = "center";
    for (const p of rang) {
      if (Math.abs(p.w) < 1e-6 || gesehen.some(q => Math.hypot(q[0] - p.tx, q[1] - p.ty) < 34)) continue;
      gesehen.push([p.tx, p.ty]);
      const fett = global.includes(p), sg = Math.sign(p.w || 1);
      g.fillStyle = "#111"; g.font = `${fett ? "bold " : ""}12px system-ui, sans-serif`;
      if (fett) { g.beginPath(); g.arc(p.tx, p.ty, 3.5, 0, 7); g.fill(); }
      g.fillText(fmt(p.w, 1), p.tx + p.nx * 11 * sg, p.ty + p.nz * 11 * sg + 4);
    }
    g.font = "12px system-ui, sans-serif";
  }

  /** Verformte Lage der Stäbe, größte Knotenverschiebung, Mausabfrage. */
  _verformung(g, erg, stab, P, sk, ausd, ueh) {
    const f = this.fv;
    if (!f) return "Keine Verformung.";
    g.strokeStyle = "#8e24aa"; g.lineWidth = 2.5;
    for (const s of erg.staebe) {
      const e = s.el, a = this._knoten[e.i];
      const pts = s.verf.map(p => ({ xy: P(a.x + e.c * p.x + p.dU * f, a.z + e.s * p.x + p.dW * f), x: p.x, u: p.dU * 1000, w: p.dW * 1000, f: p.f * 1000 }));
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p.xy) : g.moveTo(...p.xy)); g.stroke();
      this.treffer.push({
        art: "verf", nr: s.nr,
        wert: x => ({ u: this._interp(pts, x, "u"), w: this._interp(pts, x, "w"), f: this._interp(pts, x, "f") }),
        test: (mx, my) => {
          let best = null;
          for (let i = 0; i < pts.length - 1; i++) {
            const [x1, y1] = pts[i].xy, [x2, y2] = pts[i + 1].xy, dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / l2)), d = Math.hypot(mx - (x1 + t * dx), my - (y1 + t * dy));
            if (d <= 10 && (!best || d < best.d)) best = { d, x: pts[i].x + t * (pts[i + 1].x - pts[i].x), pt: [x1 + t * dx, y1 + t * dy] };
          }
          return best;
        },
      });
    }
    // Größte Knotenverschiebung beschriften
    let k = erg.verschiebungen[0];
    erg.verschiebungen.forEach(v => { if (Math.hypot(v.u, v.w) > Math.hypot(k.u, k.w)) k = v; });
    return `Verformte Lage (violett), ${ueh > 0 ? "" : "automatisch "}${fmt(f, 0)}-fach überhöht; größte Knotenverschiebung ${fmt(Math.hypot(k.u, k.w) * 1000, 2)} mm (Knoten ${k.k}). Mit der Maus über die Linie fahren zeigt die Werte.`;
  }

  /** Werte am Mauszeiger: Marke auf der Linie und Textfeld. */
  _tooltip(g, w, h) {
    let best = null, bt = null;
    for (const t of this.treffer) {
      const r = t.test(this.maus.x, this.maus.y);
      if (r && (!best || r.d < best.d)) { best = r; bt = t; }
    }
    if (!best) return;
    const zeilen = [];
    if (bt.art === "diag") {
      const alle = this.treffer.filter(t => t.art === "diag" && t.nr === bt.nr);
      zeilen.push(`Stab ${bt.nr}, x = ${fmt(best.x, 2)} m`);
      alle.forEach(t => zeilen.push(`${t.name ? t.name + ": " : ""}${fmt(t.wert(best.x), 2)} ${t.einheit}`));
      if (best.fuss) { g.strokeStyle = "#555"; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(...best.fuss); g.lineTo(...best.pt); g.stroke(); g.setLineDash([]); }
    } else {
      const v = bt.wert(best.x);
      zeilen.push(`Stab ${bt.nr}, x = ${fmt(best.x, 2)} m`, `u_x = ${fmt(v.u, 2)} mm`, `u_z = ${fmt(v.w, 2)} mm`, `Durchbiegung zur Sehne = ${fmt(v.f, 2)} mm`);
    }
    g.fillStyle = "#111"; g.beginPath(); g.arc(best.pt[0], best.pt[1], 4, 0, 7); g.fill();
    g.font = "12px system-ui, sans-serif";
    const bw = Math.max(...zeilen.map(z => g.measureText(z).width)) + 14, bh = zeilen.length * 16 + 8;
    const bx = Math.min(Math.max(4, best.pt[0] + 12), w - bw - 4), by = Math.min(Math.max(4, best.pt[1] + 12), h - bh - 4);
    g.fillStyle = "rgba(255,255,255,.96)"; g.strokeStyle = "#555"; g.lineWidth = 1;
    g.fillRect(bx, by, bw, bh); g.strokeRect(bx, by, bw, bh);
    g.fillStyle = "#111"; g.textAlign = "left";
    zeilen.forEach((z, i) => g.fillText(z, bx + 7, by + 18 + i * 16));
  }
}


/** Seite "Statik": Eingabe, Einwirkungen und Kombinationen, Berechnung, Anzeige. */
class StatikSeite {
  constructor() {
    this.zeichnung = new StabwerkZeichnung(document.getElementById("sw-canvas"));
    const bei = () => this.aktualisiere();
    const ew = () => ({ k: "ew", l: "Einw.", kurz: true, opt: () => this._ewOptionen() });
    this.edKnoten = new ZeilenEditor(document.getElementById("sw-knoten"),
      [{ k: "x", l: "X [m]" }, { k: "z", l: "Z [m]" }, { k: "hx", l: "hält X", haken: true },
       { k: "hz", l: "hält Z", haken: true }, { k: "hphi", l: "hält φ", haken: true }],
      z => ({ x: z.length ? z[z.length - 1].x + 3 : 0, z: z.length ? z[z.length - 1].z : 0, hx: false, hz: false, hphi: false }), bei, "Knoten");
    this.edStaebe = new ZeilenEditor(document.getElementById("sw-staebe"),
      [{ k: "i", l: "von" }, { k: "j", l: "nach" },
       { k: "q", l: "Quersch.", kurz: true, opt: () => this._qsOptionen() },
       { k: "qe", l: "Ende", kurz: true, opt: () => this._qsOptionen("= Anfang"), sperre: z => !(Number(z.q) > 0) },
       { k: "A", l: "A [cm²]", sperre: z => Number(z.q) > 0 }, { k: "I", l: "I [cm⁴]", sperre: z => Number(z.q) > 0 },
       { k: "gel", l: "Gelenk", kurz: true, opt: { "-": "–", anfang: "Anfang", ende: "Ende", beide: "beide" } }],
      z => ({ i: z.length ? z[z.length - 1].j : 1, j: (z.length ? z[z.length - 1].j : 1) + 1, q: z.length ? z[z.length - 1].q : "1", qe: "0", A: 53.8, I: 8356, gel: "-" }), bei, "Stab");
    this.qsListe = new QuerschnittsListe(document.getElementById("sw-qs"), () => { this.edStaebe.baue(); this.aktualisiere(); }, n => this._qsLoeschen(n));
    this.edEW = new ZeilenEditor(document.getElementById("sw-ew"),
      [{ k: "name", l: "Name", text: true }, { k: "art", l: "Art", opt: EW_ARTEN },
       { k: "kat", l: "Kat.", opt: () => Object.fromEntries(Object.entries(EW_KATEGORIEN).map(([k, v]) => [k, v.text])) },
       { k: "psi0", l: "ψ₀" }, { k: "psi1", l: "ψ₁" }, { k: "psi2", l: "ψ₂" }],
      () => StatikSeite.neueEinwirkung(), bei, "Einwirkung",
      { minZeilen: 1, feld: (z, k) => this._ewFeld(z, k), vorLoeschen: n => this._ewLoeschen(n) });
    this.edFed = new ZeilenEditor(document.getElementById("sw-fed"),
      [{ k: "k", l: "Knoten" }, { k: "cx", l: "c<sub>x</sub> [kN/m]" }, { k: "cz", l: "c<sub>z</sub> [kN/m]" }],
      () => ({ k: 1, cx: 0, cz: 10000 }), bei, "Feder");
    this.edBett = new ZeilenEditor(document.getElementById("sw-bett"),
      [{ k: "s", l: "Stab" }, { k: "kx", l: "k<sub>x</sub> [kN/m²]" }, { k: "kz", l: "k<sub>z</sub> [kN/m²]" },
       { k: "bezug", l: "Bezug", kurz: true, opt: { lokal: "lokal (x′, z′)", global: "global (X, Z)" } }],
      () => ({ s: 1, kx: 0, kz: 20000, bezug: "lokal" }), bei, "Bettung");
    this.edKL = new ZeilenEditor(document.getElementById("sw-kl"),
      [{ k: "k", l: "Knoten" }, { k: "Fx", l: "Fx [kN]" }, { k: "Fz", l: "Fz [kN]" }, { k: "M", l: "M [kNm]" }, ew()],
      () => ({ k: 1, Fx: 0, Fz: 0, M: 0, ew: "1" }), bei, "Knotenlast");
    this.edStr = new ZeilenEditor(document.getElementById("sw-str"),
      [{ k: "s", l: "Stab" }, { k: "q", l: "q [kN/m]" }, { k: "a", l: "von [m]" }, { k: "b", l: "bis [m]", platz: "Ende" },
       { k: "richtung", l: "Richtung", opt: RICHTUNGEN }, ew()],
      () => ({ s: 1, q: 10, a: 0, b: NaN, richtung: "Z", ew: "1" }), bei, "Streckenlast");
    this.edEin = new ZeilenEditor(document.getElementById("sw-ein"),
      [{ k: "s", l: "Stab" }, { k: "F", l: "F [kN]" }, { k: "a", l: "a [m]" }, { k: "richtung", l: "Richtung", opt: RICHTUNGEN }, ew()],
      () => ({ s: 1, F: 10, a: 1, richtung: "Z", ew: "1" }), bei, "Einzellast");

    // Teilsicherheitsbeiwerte
    const sel = document.getElementById("sw-nach");
    Object.entries(TSB_VORBELEGUNG).forEach(([k, v]) => sel.add(new Option(v.text, k)));
    sel.addEventListener("input", () => { this._tsbSetzen(sel.value); this.aktualisiere(); });
    document.getElementById("sw-tsb-reset").addEventListener("click", () => { this._tsbSetzen(sel.value); this.aktualisiere(); });
    const typ = document.getElementById("sw-komb-typ");
    Object.entries(KOMBI_TYPEN).forEach(([k, v]) => typ.add(new Option(v, k)));
    typ.value = "gzt";
    typ.addEventListener("input", () => { document.getElementById("sw-komb-nr").value = "env"; this.aktualisiere(); });
    ["sw-E", "sw-gam", "sw-eg", "sw-art", "sw-ueh", "sw-komb-nr", "sw-gGs", "sw-gGi", "sw-gQ", "sw-gA"].forEach(id => document.getElementById(id).addEventListener("input", bei));
    document.getElementById("sw-beispiel").addEventListener("click", () => { this.lade(StatikSeite.BEISPIEL()); this.aktualisiere(); });
    document.getElementById("sw-leer").addEventListener("click", () => { this.lade({ E: 210000, knoten: [], staebe: [], querschnitte: [QuerschnittsListe.neu()], knotenlasten: [], strecken: [], einzel: [], gruppen: [StatikSeite.neueEinwirkung("G")] }); this.aktualisiere(); });
    window.addEventListener("resize", () => { if (document.getElementById("tab-statik").classList.contains("aktiv")) this.aktualisiere(); });

    // Speicherplätze (benennbar): je Platz ein vollständiges Modell
    const anzahl = 6;
    this.speicher = { slots: Array(anzahl).fill(null), namen: Array(anzahl).fill(""), aktiv: 0 };
    let start = null;
    try {
      const d = JSON.parse(localStorage.getItem("statik-slots-1") || "null");
      if (d && Array.isArray(d.slots)) { this.speicher = { slots: d.slots.slice(0, anzahl), namen: (d.namen || []).slice(0, anzahl), aktiv: d.aktiv || 0 }; }
      else start = JSON.parse(localStorage.getItem("statik-modell-4"));        // Übernahme des früheren Einzelspeichers
    } catch (e) { start = null; }
    while (this.speicher.slots.length < anzahl) this.speicher.slots.push(null);
    while (this.speicher.namen.length < anzahl) this.speicher.namen.push("");
    this.leiste = new SlotLeiste(document.getElementById("sw-slots"), anzahl, {
      namen: this.speicher.namen, beiWechsel: i => this._slotWechsel(i), beiName: () => this._speichern(),
    });
    const gespeichert = this.speicher.slots[this.speicher.aktiv];
    start = gespeichert || start;
    this.lade(start && start.knoten && start.gruppen ? start : StatikSeite.BEISPIEL());

    // Rückgängig / Wiederherstellen
    this.verlauf = new Verlauf({
      holen: () => JSON.stringify(this.modell()),
      setzen: t => { this.lade(JSON.parse(t)); this.aktualisiere(); },
      undo: document.getElementById("sw-undo"), redo: document.getElementById("sw-redo"),
    });

    // Übernahme der Schnittgrößen in Stahlbau / Massivbau
    ["sw-ue-stab", "sw-ue-stelle", "sw-ue-x"].forEach(id => document.getElementById(id).addEventListener("input", () => this._ueAnzeige()));
    document.getElementById("sw-ue-sta").addEventListener("click", () => this._uebernehmen("stahlbau"));
    document.getElementById("sw-ue-mas").addEventListener("click", () => this._uebernehmen("massivbau"));
    this.aktualisiere();
  }

  /** Aktuelles Modell im aktiven Speicherplatz ablegen und alle Plätze sichern. */
  _speichern() {
    const sp = this.speicher;
    try { localStorage.setItem("statik-slots-1", JSON.stringify(sp)); } catch (e) { /* Speicher nicht verfügbar */ }
    this.leiste.anzeige(sp.aktiv, sp.slots.map(Boolean));
  }

  /** Zu Speicherplatz i wechseln; ein leerer Platz startet als Kopie des aktuellen Systems. */
  _slotWechsel(i) {
    const sp = this.speicher; if (i === sp.aktiv) return;
    const kopie = JSON.parse(JSON.stringify(sp.slots[i] || sp.slots[sp.aktiv] || this.modell()));
    sp.aktiv = i; this.lade(kopie); this.verlauf.neu(); this.aktualisiere();
  }

  /** Neue Einwirkung mit Vorbelegung nach DIN EN 1990/NA. */
  static neueEinwirkung(art = "Q") {
    const kat = art === "Q" ? "B" : "-", p = EW_KATEGORIEN[kat].psi;
    return { name: art === "G" ? "Eigengewicht, Ausbau" : "Nutzlast", art, kat, psi0: p[0], psi1: p[1], psi2: p[2] };
  }

  /** Beispiel: Rahmen mit Eigenlast, Nutzlast und Wind. */
  static BEISPIEL() {
    const w = (name, kat) => ({ name, art: "Q", kat, psi0: EW_KATEGORIEN[kat].psi[0], psi1: EW_KATEGORIEN[kat].psi[1], psi2: EW_KATEGORIEN[kat].psi[2] });
    return {
      E: 210000,
      knoten: [{ x: 0, z: 3, hx: true, hz: true, hphi: false }, { x: 0, z: 0, hx: false, hz: false, hphi: false },
               { x: 6, z: 0, hx: false, hz: false, hphi: false }, { x: 6, z: 3, hx: false, hz: true, hphi: false }],
      querschnitte: [QuerschnittsListe.neu()],
      staebe: [1, 2, 3].map(n => ({ i: n, j: n + 1, q: "1", A: 53.8, I: 8356, gel: "-" })),
      gruppen: [StatikSeite.neueEinwirkung("G"), w("Nutzlast Büro", "B"), w("Wind", "W")],
      knotenlasten: [{ k: 2, Fx: 10, Fz: 0, M: 0, ew: "3" }],
      strecken: [{ s: 2, q: 12, a: 0, b: NaN, richtung: "Z", ew: "1" }, { s: 2, q: 8, a: 1.5, b: 4.5, richtung: "Z", ew: "2" }], einzel: [],
      tsb: "strgeo",
    };
  }

  /* ---------- Querschnitte ---------- */

  /** Auswahlliste für die Stäbe: 0 = manuell (A, I, globales E), sonst Q1, Q2 ... */
  _qsOptionen(null0 = "manuell") {
    const o = { 0: null0 };
    this.qsListe.liste.forEach((q, n) => { o[String(n + 1)] = this.qsListe.name(n); });
    return o;
  }

  /** Beim Löschen eines Querschnitts die Verweise der Stäbe anpassen (gelöscht -> manuell). */
  _qsLoeschen(n) {
    this.edStaebe.zeilen.forEach(s => ['q', 'qe'].forEach(f => { const v = Number(s[f]) || 0; s[f] = String(v === n + 1 ? 0 : v > n + 1 ? v - 1 : v); }));
  }

  /** Stäbe mit Querschnitt: A, I, E aus Querschnitt und Material; liefert Modellkopie für die Berechnung. */
  _aufloesen(m) {
    let geaendert = false;
    const eg = [];                                               // automatische Eigengewichtslasten
    const gi = m.gruppen.findIndex(g => g.art === "G") + 1;      // Einwirkung für das Eigengewicht: erste ständige
    if (m.eg && !gi) throw new Error("Eigengewicht: Es ist keine ständige Einwirkung (Art G) vorhanden.");
    const egLast = (n, A, gam) => { if (m.eg && A > 0 && gam > 0) eg.push({ s: n + 1, q: +(A * 1e-4 * gam).toFixed(4), a: 0, b: NaN, richtung: "Z", ew: gi, eg: true }); };
    const staebe = m.staebe.map((s, n) => {
      const q = Number(s.q) || 0; if (!q) { egLast(n, Number(s.A), m.gam); return { ...s }; }
      const k = QuerschnittsListe.kennwerte(this.qsListe.liste[q - 1] || { typ: "" });
      if (k.fehler) throw new Error(`Stab ${n + 1}, Querschnitt Q${q}: ${k.fehler}.`);
      const A = +k.A.toFixed(2), I = +k.I.toFixed(1);       // gerundete Anzeige
      if (s.A !== A || s.I !== I) { s.A = A; s.I = I; geaendert = true; }
      // Voute: anderer Querschnitt am Stabende -> linear veränderlich (Teilstäbe im Rechenkern)
      const qe = Number(s.qe) || 0;
      s.voute = null;
      if (qe && qe !== q) {
        const q1 = this.qsListe.liste[qe - 1], k1 = QuerschnittsListe.kennwerte(q1 || { typ: "" });
        if (k1.fehler) throw new Error(`Stab ${n + 1}, Querschnitt Q${qe}: ${k1.fehler}.`);
        if (k1.E !== k.E) throw new Error(`Stab ${n + 1}: Voute – Material an Anfang und Ende muss denselben E-Modul haben.`);
        const v = QuerschnittsListe.voute(this.qsListe.liste[q - 1], q1);
        if (v.fehler) throw new Error(`Stab ${n + 1}: ${v.fehler}.`);
        s.voute = { h0: v.h0, h1: v.h1 };
        egLast(n, (k.A + k1.A) / 2, k.gamma);                // Voute: mittlere Fläche (Trapez, Gesamtgewicht exakt)
        return { ...s, A: k.A, I: k.I, E: k.E, seg: v.seg };
      }
      egLast(n, k.A, k.gamma);
      return { ...s, A: k.A, I: k.I, E: k.E };
    });
    if (geaendert) this.edStaebe.baue();     // angezeigte A- und I-Werte aktualisieren
    return { ...m, staebe, strecken: [...m.strecken, ...eg] };
  }

  /* ---------- Einwirkungen ---------- */

  /** Kurzbezeichnungen G1, Q1, Q2 ... der Einwirkungen */
  _ids() {
    const z = {};
    return this.edEW.zeilen.map(g => { z[g.art] = (z[g.art] || 0) + 1; return g.art + z[g.art]; });
  }

  _ewOptionen() {
    const ids = this._ids();
    return Object.fromEntries(this.edEW.zeilen.map((g, i) => [String(i + 1), `${i + 1}: ${ids[i]}`]));
  }

  /** Änderung eines Feldes der Einwirkungstabelle: Art/Kategorie setzen die Kombinationsbeiwerte vor. */
  _ewFeld(z, k) {
    if (k === "art") z.kat = z.art === "Q" ? (z.kat === "-" ? "B" : z.kat) : "-";
    if (k === "art" || k === "kat") {
      const p = EW_KATEGORIEN[z.kat].psi; [z.psi0, z.psi1, z.psi2] = p;
      this.edEW.baue();
    }
    [this.edKL, this.edStr, this.edEin].forEach(e => e.baue());   // Auswahl der Einwirkungen aktualisieren
  }

  /** Beim Löschen einer Einwirkung die Zuordnung der Lasten anpassen. */
  _ewLoeschen(n) {
    const nr = n + 1;
    for (const e of [this.edKL, this.edStr, this.edEin]) {
      e.zeilen.forEach(l => { const v = Number(l.ew); l.ew = String(v === nr ? 1 : v > nr ? v - 1 : v); });
      setTimeout(() => e.baue(), 0);
    }
  }

  _tsbSetzen(nach) {
    const t = TSB_VORBELEGUNG[nach];
    document.getElementById("sw-gGs").value = t.gGsup; document.getElementById("sw-gGi").value = t.gGinf;
    document.getElementById("sw-gQ").value = t.gQ; document.getElementById("sw-gA").value = t.gA;
  }

  lade(m) {
    // Altformat (Lagerart als Text) in gehaltene Richtungen umwandeln
    m.knoten.forEach(k => {
      if ("lager" in k) {
        const d = Stabwerk.gehalten(k); k.hx = d.includes(0); k.hz = d.includes(1); k.hphi = d.includes(2); delete k.lager;
      }
    });
    if (!m.gruppen || !m.gruppen.length) m.gruppen = [StatikSeite.neueEinwirkung("G")];
    [...m.knotenlasten, ...m.strecken, ...m.einzel].forEach(l => { l.ew = String(l.ew || 1); });
    document.getElementById("sw-E").value = m.E;
    document.getElementById("sw-eg").checked = !!m.eg; document.getElementById("sw-gam").value = Number.isFinite(m.gam) ? m.gam : 78.5;
    this.qsListe.setze(m.querschnitte && m.querschnitte.length ? m.querschnitte : [QuerschnittsListe.neu()]);
    m.staebe.forEach(s => { s.q = String(s.q || 0); s.qe = String(s.qe || 0); });
    this.edEW.setze(m.gruppen);
    this.edKnoten.setze(m.knoten); this.edStaebe.setze(m.staebe); this.edKL.setze(m.knotenlasten);
    this.edFed.setze(m.federn || []); this.edBett.setze(m.bettung || []);
    this.edStr.setze(m.strecken); this.edEin.setze(m.einzel);
    document.getElementById("sw-nach").value = m.tsb || "strgeo";
    this._tsbSetzen(m.tsb || "strgeo");
    if (m.tsbWerte) { const w = m.tsbWerte; ["gGs", "gGi", "gQ", "gA"].forEach((k, i) => { document.getElementById("sw-" + k).value = w[i]; }); }
  }

  /** Gesamtmodell für Speicherung und Berechnung (ew als Zahl). */
  modell() {
    const nr = l => ({ ...l, ew: Number(l.ew) || 1 });
    return {
      E: zahl("sw-E"), eg: document.getElementById("sw-eg").checked, gam: zahl("sw-gam"), querschnitte: this.qsListe.liste, knoten: this.edKnoten.zeilen, staebe: this.edStaebe.zeilen,
      federn: this.edFed.zeilen, bettung: this.edBett.zeilen, knotenlasten: this.edKL.zeilen.map(nr), strecken: this.edStr.zeilen.map(nr), einzel: this.edEin.zeilen.map(nr),
      gruppen: this.edEW.zeilen, tsb: document.getElementById("sw-nach").value,
      tsbWerte: ["sw-gGs", "sw-gGi", "sw-gQ", "sw-gA"].map(zahl),
    };
  }

  zeige() { this.aktualisiere(); }

  /** Kombination wählen, rechnen und anzeigen. */
  aktualisiere() {
    const m = this.modell(), box = document.getElementById("sw-ergebnis"), art = document.getElementById("sw-art").value;
    this.speicher.slots[this.speicher.aktiv] = JSON.parse(JSON.stringify(m)); this._speichern();
    this._unbestimmtheit(m);
    this._bettung = m.bettung;
    const ids = this._ids();
    this.zeichnung.ids = ids; this.zeichnung._knoten = m.knoten;
    let mr = m, fehler0 = null;
    try { mr = this._aufloesen(m); } catch (e) { fehler0 = e.message; }
    let erg = null, fehler = null, info = "", kombis = [], env = null, typ = document.getElementById("sw-komb-typ").value;
    try {
      if (fehler0) throw new Error(fehler0);
      const nG = m.gruppen.length;
      for (const l of [...m.knotenlasten, ...m.strecken, ...m.einzel]) if (l.ew < 1 || l.ew > nG) throw new Error("Einer Last ist eine nicht vorhandene Einwirkung zugeordnet.");
      const [gGs, gGi, gQ, gA] = m.tsbWerte;
      if (![gGs, gGi, gQ, gA].every(Number.isFinite)) throw new Error("Teilsicherheitsbeiwerte unvollständig.");
      if (m.gruppen.some(g => ![g.psi0, g.psi1, g.psi2].every(Number.isFinite))) throw new Error("Kombinationsbeiwerte unvollständig.");
      const lr = new LastfallRechner(mr, nG);
      kombis = new Kombinationen(m.gruppen, { gGsup: gGs, gGinf: gGi, gQ, gA }, lr.aktiv).erzeuge(typ);
      const ergs = kombis.map(k => lr.kombination(k.faktoren));
      // Auswahl der Kombination aktualisieren
      const nrSel = document.getElementById("sw-komb-nr"), alt = nrSel.value;
      nrSel.replaceChildren(new Option(kombis.length > 1 ? `Umhüllende (${kombis.length} Kombinationen)` : "Einzige Kombination", "env"));
      kombis.forEach((k, i) => nrSel.add(new Option(k.name, String(i))));
      nrSel.value = [...nrSel.options].some(o => o.value === alt) ? alt : "env";
      nrSel.disabled = kombis.length < 2;
      if (nrSel.value === "env" && kombis.length > 1) {
        env = Superposition.umhuelle(ergs, kombis.map(k => k.name));
        if (art === "verf") {                                    // Verformungsbild: Kombination mit der größten Knotenverschiebung
          let best = 0, mx = -1;
          ergs.forEach((e, i) => { const v = Math.max(...e.verschiebungen.map(d => Math.hypot(d.u, d.w))); if (v > mx) { mx = v; best = i; } });
          erg = ergs[best]; info = `Verformung der maßgebenden Kombination ${kombis[best].name}. `;
        } else { erg = env.max; erg.min = env.min; }
      } else {
        const i = nrSel.value === "env" ? 0 : Number(nrSel.value);
        erg = ergs[i]; info = kombis[i].name + ". ";
      }
    } catch (e) { fehler = e.message; }
    this._erg = fehler ? null : erg;
    this._ueStaebe(m);
    document.getElementById("sw-hinweis").textContent = info + this.zeichnung.zeichne(fehler0 ? m : { ...m, strecken: mr.strecken }, erg, art, zahl("sw-ueh"));
    document.getElementById("sw-komb-info").innerHTML = this._ewInfo(m, ids, typ);
    box.innerHTML = fehler ? `<span class="fehler">${fehler}</span>` : (env && erg === env.max ? this._tabellenEnv(env, typ) : this._tabellen(erg, typ));
    if (!fehler && kombis.length) box.innerHTML += this._kombiListe(kombis);
    this._ueAnzeige();
    if (this.verlauf) this.verlauf.merke();
  }

  /* ---------- Übernahme der Schnittgrößen in die Bemessung ---------- */

  /** Stabauswahl der Übernahme aktualisieren (Auswahl bleibt erhalten). */
  _ueStaebe(m) {
    const sel = document.getElementById("sw-ue-stab"), alt = sel.value;
    sel.replaceChildren(...m.staebe.map((_, n) => new Option(`Stab ${n + 1}`, String(n))));
    if ([...sel.options].some(o => o.value === alt)) sel.value = alt;
  }

  /** Maßgebende Schnittgrößen am gewählten Stab und an der gewählten Stelle (bei Umhüllenden Extremwerte). */
  _ueWerte() {
    const erg = this._erg; if (!erg) return null;
    const n = Number(document.getElementById("sw-ue-stab").value), stelle = document.getElementById("sw-ue-stelle").value;
    const saetze = (erg.min ? [erg, erg.min] : [erg]).map(E => E.staebe[n] && E.staebe[n].verlauf).filter(Boolean);
    if (!saetze.length) return null;
    const alle = saetze.flatMap(v => v), L = saetze[0][saetze[0].length - 1].x;
    const wahl = (liste, f) => liste.reduce((b, p) => (f(p) > f(b) ? p : b));
    let p;
    if (stelle === "maxM") p = wahl(alle, q => q.M);
    else if (stelle === "minM") p = wahl(alle, q => -q.M);
    else if (stelle === "maxV") p = wahl(alle, q => Math.abs(q.V));
    else {
      const x = stelle === "anfang" ? 0 : stelle === "ende" ? L : Math.max(0, Math.min(L, zahl("sw-ue-x")));
      const nah = alle.filter(q => Math.abs(q.x - x) < 1e-6);
      // Stelle liegt auf einem Stützpunkt: Satz mit dem größten |M| wählen, sonst linear interpolieren
      if (nah.length) p = wahl(nah, q => Math.abs(q.M));
      else {
        const v = saetze.map(vl => { let i = vl.findIndex(q => q.x >= x); i = Math.max(1, i); const a = vl[i - 1], b = vl[i], t = (x - a.x) / ((b.x - a.x) || 1); return { x, N: a.N + (b.N - a.N) * t, V: a.V + (b.V - a.V) * t, M: a.M + (b.M - a.M) * t }; });
        p = wahl(v, q => Math.abs(q.M));
      }
    }
    return { n, x: p.x, N: p.N, V: p.V, M: p.M };
  }

  _ueAnzeige() {
    const w = this._ueWerte(), box = document.getElementById("sw-ue-werte");
    document.getElementById("sw-ue-x").disabled = document.getElementById("sw-ue-stelle").value !== "x";
    box.innerHTML = w ? `Stab ${w.n + 1}, x = ${fmt(w.x, 2)} m: N = <b>${fmt(w.N, 2)}</b> kN, V = <b>${fmt(w.V, 2)}</b> kN, M = <b>${fmt(w.M, 2)}</b> kNm` : "Keine Ergebnisse vorhanden.";
    document.getElementById("sw-ue-sta").disabled = document.getElementById("sw-ue-mas").disabled = !w;
  }

  /** Werte in die Eingabefelder der Bemessung schreiben und die Seite öffnen. */
  _uebernehmen(ziel) {
    const w = this._ueWerte(); if (!w) return;
    const setze = (id, v) => { const e = document.getElementById(id); e.value = String(+v.toFixed(3)); e.dispatchEvent(new Event("input", { bubbles: true })); };
    if (ziel === "stahlbau") { setze("in-N", w.N); setze("in-Vz", w.V); setze("in-My", w.M); }
    else { setze("sb-N", w.N); setze("sb-V", Math.abs(w.V)); setze("sb-M", w.M); }
    location.hash = "#" + ziel;
  }

  /** Grad der statischen Unbestimmtheit anzeigen. */
  _unbestimmtheit(m) {
    const box = document.getElementById("sw-unbest");
    if (!m.staebe.length) { box.innerHTML = ""; return; }
    const u = Stabwerk.unbestimmtheit(m);
    const text = u.bettung ? `n = ${u.n} ohne Bettung (die Bettung stützt die Stäbe zusätzlich elastisch über die Länge)`
      : u.n < 0 ? `<span class="fehler">n = ${u.n}: Das System ist kinematisch verschieblich (Mechanismus).</span>`
      : u.n === 0 ? "n = 0: statisch bestimmt" : `n = ${u.n}: ${u.n}-fach statisch unbestimmt`;
    box.innerHTML = `<b>Statische Unbestimmtheit:</b> ${text} <span class="hinweis">(Abzählkriterium n = 3·s + r − 3·k − g mit s = ${u.s} Stäbe, r = ${u.r} Lagerreaktionen (Federn an Knoten eingerechnet), k = ${u.k} Knoten, g = ${u.g} Gelenkbedingungen; notwendige, nicht hinreichende Bedingung)</span>`;
  }

  _ewInfo(m, ids, typ) {
    const t = KOMBI_TYPEN[typ];
    return `<span class="hinweis">Einwirkungen: ${m.gruppen.map((g, i) => `${ids[i]} = ${g.name || "–"}`).join("; ")}. Anzeige: ${t}.</span>`;
  }

  /** Auswahlliste der verwendeten Kombinationen (einklappbar) */
  _kombiListe(k) {
    return `<details><summary>Kombinationen (${k.length})</summary><ul>${k.map(x => `<li>${x.name}</li>`).join("")}</ul></details>`;
  }

  _titel(typ) {
    return typ === "gzt" || typ === "gztA" ? "Bemessungswerte (GZT)" : typ === "roh" ? "Werte (unfaktoriert)" : "Gebrauchstauglichkeit (GZG)";
  }

  /** Tabellen für eine einzelne Kombination */
  _tabellen(erg, typ) {
    let h = `<h3>Auflagerkräfte – ${this._titel(typ)}</h3><table><tr><th>Knoten</th><th>R<sub>x</sub> [kN]</th><th>R<sub>z</sub> [kN]</th><th>M [kNm]</th></tr>`;
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
    h += "</table><p class=\"hinweis\">f<sub>max</sub> = größte Durchbiegung gegenüber der Sehne des verformten Stabs.</p>";
    // Bettungskräfte (Federkraft je Länge = k · Verschiebung)
    for (const b of this._bettung || []) {
      const s = erg.staebe[b.s - 1]; if (!s) continue;
      const lok = b.bezug !== "global";
      let mz = { v: 0, x: 0 }, mx = { v: 0, x: 0 };
      for (const p of s.verf) {
        const qz = b.kz * (lok ? p.w : p.dW), qx = b.kx * (lok ? p.u : p.dU);
        if (Math.abs(qz) > Math.abs(mz.v)) mz = { v: qz, x: p.x };
        if (Math.abs(qx) > Math.abs(mx.v)) mx = { v: qx, x: p.x };
      }
      h += `<p class="hinweis">Bettung Stab ${b.s}: größte Bettungskraft ${lok ? "q<sub>z′</sub>" : "q<sub>Z</sub>"} = ${fmt(mz.v, 2)} kN/m bei x = ${fmt(mz.x, 2)} m${b.kx > 0 ? `; ${lok ? "q<sub>x′</sub>" : "q<sub>X</sub>"} = ${fmt(mx.v, 2)} kN/m` : ""} (positiv = Feder wirkt entgegen der Verschiebung).</p>`;
    }
    return h;
  }

  /** Tabellen für die Umhüllende: Minimum/Maximum mit maßgebender Kombination (K-Nummer) */
  _tabellenEnv(env, typ) {
    const mm = (o, d, f = 1) => `${fmt(o.min * f, d)} (K${o.kMin + 1}) / ${fmt(o.max * f, d)} (K${o.kMax + 1})`;
    let h = `<h3>Auflagerkräfte – Umhüllende, ${this._titel(typ)}</h3><table><tr><th>Knoten</th><th>R<sub>x</sub> min / max [kN]</th><th>R<sub>z</sub> min / max [kN]</th><th>M min / max [kNm]</th></tr>`;
    for (const r of env.reakt) h += `<tr><td>${r.k}</td><td>${mm(r.Rx, 2)}</td><td>${mm(r.Rz, 2)}</td><td>${mm(r.M, 2)}</td></tr>`;
    h += "</table><h3>Knotenverformungen (Umhüllende)</h3><table><tr><th>Knoten</th><th>u min / max [mm]</th><th>w min / max [mm]</th><th>φ min / max [mrad]</th></tr>";
    for (const v of env.versch) h += `<tr><td>${v.k}</td><td>${mm(v.u, 2, 1000)}</td><td>${mm(v.w, 2, 1000)}</td><td>${mm(v.phi, 3, 1000)}</td></tr>`;
    h += `</table><h3>${typ === "gzt" || typ === "gztA" ? "Bemessungsschnittgrößen" : "Schnittgrößen"} je Stab (Umhüllende)</h3>`;
    h += "<table><tr><th>Stab</th><th>N min / max [kN]</th><th>V min / max [kN]</th><th>M min / max [kNm]</th><th>f<sub>max</sub> [mm]</th></tr>";
    for (const s of env.ext) {
      h += `<tr><td>${s.nr}</td><td>${mm(s.N, 1)}</td><td>${mm(s.V, 1)}</td><td>${mm(s.M, 1)}</td><td>${fmt(s.f.w * 1000, 2)} (K${s.f.k + 1})</td></tr>`;
    }
    return h + "</table><p class=\"hinweis\">K = maßgebende Kombination (Liste unten). Werte sind nicht gleichzeitig wirkende Extremwerte; zusammengehörige Schnittgrößen erhält man über die Wahl einer Einzelkombination.</p>";
  }
}
