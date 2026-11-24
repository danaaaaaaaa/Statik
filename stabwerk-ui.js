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
          e = document.createElement("input"); e.type = "number"; e.step = "any";
          e.value = Number.isFinite(z[sp.k]) ? z[sp.k] : "";
        }
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
    const nx0 = Math.min(...kn.map(k => k.x)), nx1 = Math.max(...kn.map(k => k.x));
    const nz0 = Math.min(...kn.map(k => k.z)), nz1 = Math.max(...kn.map(k => k.z));
    const ausd = Math.max(nx1 - nx0, nz1 - nz0, 1);
    // Weltkoordinaten der Diagramm- bzw. Verformungslinie vorab bestimmen, damit sie in den Ausschnitt passen
    const extra = this._extra(erg, art, ausd, ueh);
    const xs = [nx0, nx1, ...extra.map(p => p[0])], zs = [nz0, nz1, ...extra.map(p => p[1])];
    const x0 = Math.min(...xs), z0 = Math.min(...zs);
    const rand = 62;                                           // Platz für Lasten, Lager und Beschriftung
    const bw = Math.max(Math.max(...xs) - x0, 0.5), bh = Math.max(Math.max(...zs) - z0, 0.5);
    const sk = Math.min((w - 2 * rand) / bw, (h - 2 * rand) / bh, 400);
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
    this._achsen(g, w, h);
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
      g.fillStyle = f; g.textAlign = "center"; g.fillText(`${l.q} kN/m${this._id(l)}`, (pts[0][0] + pts[n][0]) / 2, (pts[0][1] + pts[n][1]) / 2 - 5);
    }
    for (const l of m.einzel) {
      const st = stab[l.s - 1]; if (!st || !Number.isFinite(l.F) || l.F === 0 || !Number.isFinite(l.a)) continue;
      const [dx, dz] = richt(st, l.richtung), sg = Math.sign(l.F), t = Math.min(1, l.a / st.L);
      const [x, y] = P(st.a.x + (st.b.x - st.a.x) * t, st.a.z + (st.b.z - st.a.z) * t);
      this._pfeil(g, x - dx * sg * 36, y - dz * sg * 36, x, y, f);
      g.fillStyle = f; g.textAlign = "center"; g.fillText(`${l.F} kN${this._id(l)}`, x - dx * sg * 36, y - dz * sg * 36 - 5);
    }
    for (const l of m.knotenlasten) {
      const k = m.knoten[l.k - 1]; if (!k || !Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;
      const [x, y] = P(k.x, k.z);
      if (l.Fx) { const s = Math.sign(l.Fx); this._pfeil(g, x - s * 40, y, x, y, f); g.fillStyle = f; g.textAlign = "center"; g.fillText(`${l.Fx} kN${this._id(l)}`, x - s * 40, y - 6); }
      if (l.Fz) { const s = Math.sign(l.Fz); this._pfeil(g, x, y - s * 40, x, y, f); g.fillStyle = f; g.textAlign = "left"; g.fillText(`${l.Fz} kN${this._id(l)}`, x + 5, y + 0 - s * 40); }
      if (l.M) { g.strokeStyle = f; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, 14, l.M > 0 ? 0.3 : 2 * Math.PI - 0.3, l.M > 0 ? 4.6 : 1.7, l.M < 0); g.stroke(); g.fillStyle = f; g.textAlign = "left"; g.fillText(`${l.M} kNm${this._id(l)}`, x + 16, y + 16); }
    }
  }

  /** Schnittgrößenfläche N, V oder M (bei Umhüllenden: Maximum und Minimum); positive Werte auf der z'-Seite des Stabs. */
  _diagramm(g, erg, art, P) {
    const sets = erg.min ? [erg, erg.min] : [erg];
    let mx = 0;
    sets.forEach(E => E.staebe.forEach(s => s.verlauf.forEach(p => { mx = Math.max(mx, Math.abs(p[art])); })));
    if (mx < 1e-9) return `Alle ${art}-Werte sind null.`;
    const einheit = art === "M" ? "kNm" : "kN";
    const farbe = { N: "#2e7d32", V: "#1565c0", M: "#c0392b" }[art];
    sets.forEach(E => this._flaeche(g, E, art, P, farbe));
    return `${art} in ${einheit}; größter Betrag ${fmt(mx, 1)} ${einheit}${erg.min ? " (Umhüllende: Maximum und Minimum)" : ""}. Positive Werte liegen auf der z'-Seite des Stabs (bei waagerechten Stäben unten)${art === "M" ? "; M ist auf der Zugseite aufgetragen" : ""}.`;
  }

  /** Eine gefüllte Schnittgrößenfläche über allen Stäben samt Beschriftung. */
  _flaeche(g, erg, art, P, farbe) {
    for (const s of erg.staebe) {
      const e = s.el, nx = -e.s, nz = e.c;                       // Normale z'
      const k0 = this._knoten[e.i];
      const pos = s.verlauf.map(p => {
        const [bx, by] = P(k0.x + e.c * p.x, k0.z + e.s * p.x), [tx, ty] = P(k0.x + e.c * p.x + nx * p[art] * this.kd, k0.z + e.s * p.x + nz * p[art] * this.kd);
        return { bx, by, tx, ty, w: p[art] };
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
  }

  _verformung(g, erg, stab, P, sk, ausd, ueh) {
    const f = this.fv;
    if (!f) return "Keine Verformung.";
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
      [{ k: "i", l: "von" }, { k: "j", l: "nach" }, { k: "A", l: "A [cm²]" }, { k: "I", l: "I [cm⁴]" },
       { k: "gel", l: "Gelenk", opt: { "-": "–", anfang: "Anfang", ende: "Ende", beide: "beide" } }],
      z => ({ i: z.length ? z[z.length - 1].j : 1, j: (z.length ? z[z.length - 1].j : 1) + 1, A: 53.8, I: 8356, gel: "-" }), bei, "Stab");
    this.edEW = new ZeilenEditor(document.getElementById("sw-ew"),
      [{ k: "name", l: "Name", text: true }, { k: "art", l: "Art", opt: EW_ARTEN },
       { k: "kat", l: "Kat.", opt: () => Object.fromEntries(Object.entries(EW_KATEGORIEN).map(([k, v]) => [k, v.text])) },
       { k: "psi0", l: "ψ₀" }, { k: "psi1", l: "ψ₁" }, { k: "psi2", l: "ψ₂" }],
      () => StatikSeite.neueEinwirkung(), bei, "Einwirkung",
      { minZeilen: 1, feld: (z, k) => this._ewFeld(z, k), vorLoeschen: n => this._ewLoeschen(n) });
    this.edKL = new ZeilenEditor(document.getElementById("sw-kl"),
      [{ k: "k", l: "Knoten" }, { k: "Fx", l: "Fx [kN]" }, { k: "Fz", l: "Fz [kN]" }, { k: "M", l: "M [kNm]" }, ew()],
      () => ({ k: 1, Fx: 0, Fz: 0, M: 0, ew: "1" }), bei, "Knotenlast");
    this.edStr = new ZeilenEditor(document.getElementById("sw-str"),
      [{ k: "s", l: "Stab" }, { k: "q", l: "q [kN/m]" }, { k: "richtung", l: "Richtung", opt: RICHTUNGEN }, ew()],
      () => ({ s: 1, q: 10, richtung: "Z", ew: "1" }), bei, "Streckenlast");
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
    ["sw-E", "sw-art", "sw-ueh", "sw-komb-nr", "sw-gGs", "sw-gGi", "sw-gQ", "sw-gA"].forEach(id => document.getElementById(id).addEventListener("input", bei));
    document.getElementById("sw-beispiel").addEventListener("click", () => { this.lade(StatikSeite.BEISPIEL()); this.aktualisiere(); });
    document.getElementById("sw-leer").addEventListener("click", () => { this.lade({ E: 210000, knoten: [], staebe: [], knotenlasten: [], strecken: [], einzel: [], gruppen: [StatikSeite.neueEinwirkung("G")] }); this.aktualisiere(); });
    window.addEventListener("resize", () => { if (document.getElementById("tab-statik").classList.contains("aktiv")) this.aktualisiere(); });

    let start = null;
    try { start = JSON.parse(localStorage.getItem("statik-modell-2")); } catch (e) { start = null; }
    this.lade(start && start.knoten && start.gruppen ? start : StatikSeite.BEISPIEL());
    this.aktualisiere();
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
      staebe: [{ i: 1, j: 2, A: 53.8, I: 8356, gel: "-" }, { i: 2, j: 3, A: 53.8, I: 8356, gel: "-" }, { i: 3, j: 4, A: 53.8, I: 8356, gel: "-" }],
      gruppen: [StatikSeite.neueEinwirkung("G"), w("Nutzlast Büro", "B"), w("Wind", "W")],
      knotenlasten: [{ k: 2, Fx: 10, Fz: 0, M: 0, ew: "3" }],
      strecken: [{ s: 2, q: 12, richtung: "Z", ew: "1" }, { s: 2, q: 8, richtung: "Z", ew: "2" }], einzel: [],
      tsb: "strgeo",
    };
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
    this.edEW.setze(m.gruppen);
    this.edKnoten.setze(m.knoten); this.edStaebe.setze(m.staebe); this.edKL.setze(m.knotenlasten);
    this.edStr.setze(m.strecken); this.edEin.setze(m.einzel);
    document.getElementById("sw-nach").value = m.tsb || "strgeo";
    this._tsbSetzen(m.tsb || "strgeo");
    if (m.tsbWerte) { const w = m.tsbWerte; ["gGs", "gGi", "gQ", "gA"].forEach((k, i) => { document.getElementById("sw-" + k).value = w[i]; }); }
  }

  /** Gesamtmodell für Speicherung und Berechnung (ew als Zahl). */
  modell() {
    const nr = l => ({ ...l, ew: Number(l.ew) || 1 });
    return {
      E: zahl("sw-E"), knoten: this.edKnoten.zeilen, staebe: this.edStaebe.zeilen,
      knotenlasten: this.edKL.zeilen.map(nr), strecken: this.edStr.zeilen.map(nr), einzel: this.edEin.zeilen.map(nr),
      gruppen: this.edEW.zeilen, tsb: document.getElementById("sw-nach").value,
      tsbWerte: ["sw-gGs", "sw-gGi", "sw-gQ", "sw-gA"].map(zahl),
    };
  }

  zeige() { this.aktualisiere(); }

  /** Kombination wählen, rechnen und anzeigen. */
  aktualisiere() {
    const m = this.modell(), box = document.getElementById("sw-ergebnis"), art = document.getElementById("sw-art").value;
    try { localStorage.setItem("statik-modell-2", JSON.stringify(m)); } catch (e) { /* Speicher nicht verfügbar */ }
    this._unbestimmtheit(m);
    const ids = this._ids();
    this.zeichnung.ids = ids; this.zeichnung._knoten = m.knoten;
    let erg = null, fehler = null, info = "", kombis = [], env = null, typ = document.getElementById("sw-komb-typ").value;
    try {
      const nG = m.gruppen.length;
      for (const l of [...m.knotenlasten, ...m.strecken, ...m.einzel]) if (l.ew < 1 || l.ew > nG) throw new Error("Einer Last ist eine nicht vorhandene Einwirkung zugeordnet.");
      const [gGs, gGi, gQ, gA] = m.tsbWerte;
      if (![gGs, gGi, gQ, gA].every(Number.isFinite)) throw new Error("Teilsicherheitsbeiwerte unvollständig.");
      if (m.gruppen.some(g => ![g.psi0, g.psi1, g.psi2].every(Number.isFinite))) throw new Error("Kombinationsbeiwerte unvollständig.");
      const lr = new LastfallRechner(m, nG);
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
    document.getElementById("sw-hinweis").textContent = info + this.zeichnung.zeichne(m, erg, art, zahl("sw-ueh"));
    document.getElementById("sw-komb-info").innerHTML = this._ewInfo(m, ids, typ);
    box.innerHTML = fehler ? `<span class="fehler">${fehler}</span>` : (env && erg === env.max ? this._tabellenEnv(env, typ) : this._tabellen(erg, typ));
    if (!fehler && kombis.length) box.innerHTML += this._kombiListe(kombis);
  }

  /** Grad der statischen Unbestimmtheit anzeigen. */
  _unbestimmtheit(m) {
    const box = document.getElementById("sw-unbest");
    if (!m.staebe.length) { box.innerHTML = ""; return; }
    const u = Stabwerk.unbestimmtheit(m);
    const text = u.n < 0 ? `<span class="fehler">n = ${u.n}: Das System ist kinematisch verschieblich (Mechanismus).</span>`
      : u.n === 0 ? "n = 0: statisch bestimmt" : `n = ${u.n}: ${u.n}-fach statisch unbestimmt`;
    box.innerHTML = `<b>Statische Unbestimmtheit:</b> ${text} <span class="hinweis">(Abzählkriterium n = 3·s + r − 3·k − g mit s = ${u.s} Stäbe, r = ${u.r} Lagerreaktionen, k = ${u.k} Knoten, g = ${u.g} Gelenkbedingungen; notwendige, nicht hinreichende Bedingung)</span>`;
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
    return h + "</table><p class=\"hinweis\">f<sub>max</sub> = größte Durchbiegung gegenüber der Sehne des verformten Stabs.</p>";
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
