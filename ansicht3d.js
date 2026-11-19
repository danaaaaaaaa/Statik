"use strict";

/**
 * ansicht3d.js - 3D-Darstellung des Spannungsverlaufs (reines Canvas, ohne Bibliothek).
 *
 * Aufbau der Szene:
 *  - Grundfläche: der Querschnitt (grau) in der Ebene Z = 0
 *  - Spannungsfläche: der Querschnitt, in Richtung Z um sigma * k angehoben und
 *    nach Spannung eingefärbt (Zug rot, Druck blau)
 *  - Weltkoordinaten: X = y, Y = -z (oben ist oben), Z = Spannung
 * Bedienung: Ziehen = drehen, Mausrad = zoomen.
 */
class Ansicht3D {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext("2d");
    this.azimut = -35 * Math.PI / 180;
    this.elev = 25 * Math.PI / 180;
    this.zoom = 1;
    this.q = null; this.sp = null; this.punkte = [];
    this._ereignisse();
    if (window.ResizeObserver) new ResizeObserver(() => this.zeichne()).observe(canvas);
  }

  /** Blickrichtung setzen (Winkel in Grad). */
  setzeAnsicht(azGrad, elGrad) {
    this.azimut = azGrad * Math.PI / 180;
    this.elev = elGrad * Math.PI / 180;
    this.zeichne();
  }

  /** Zoom um den Faktor f ändern (für die Touch-Knöpfe). */
  zoomen(f) {
    this.zoom = Math.max(0.3, Math.min(5, this.zoom * f));
    this.zeichne();
  }

  /** Neue Daten übernehmen und neu zeichnen. */
  setzeDaten(q, sp, punkte) {
    this.q = q; this.sp = sp; this.punkte = punkte;
    this._vorbereiten();
    this.zeichne();
  }

  /** Zellen, Extremwerte und Skalierung vorberechnen. */
  _vorbereiten() {
    const { q, sp } = this;
    this.zellen = q.zellen(60, 60).map(c => ({ ...c, s: sp.sigma(c.y, c.z) }));
    this.ext = sp.extremwerte();
    this.maxAbs = Math.max(Math.abs(this.ext.min.wert), Math.abs(this.ext.max.wert));
    this.ym = (q.ymin + q.ymax) / 2;
    this.zm = (q.zmin + q.zmax) / 2;
    this.ausdehnung = Math.max(q.ymax - q.ymin, q.zmax - q.zmin);
    // Höhenskala: größte Spannung entspricht 60 % der Querschnittsabmessung
    this.k = this.maxAbs > 1e-9 ? 0.6 * this.ausdehnung / this.maxAbs : 0;
    this.nl = sp.nulllinie();
  }

  /* ---------- Projektion ---------- */

  /** Dreht einen Weltpunkt in Bildschirmrichtung (ohne Verschiebung/Skalierung). */
  _dreh(X, Y, Z) {
    const ca = Math.cos(this.azimut), sa = Math.sin(this.azimut);
    const ce = Math.cos(this.elev), se = Math.sin(this.elev);
    const x1 = X * ca + Z * sa;
    const z1 = -X * sa + Z * ca;
    return { x: x1, y: Y * ce - z1 * se, t: Y * se + z1 * ce }; // t = Tiefe (größer = näher)
  }

  _projiziere(X, Y, Z) {
    const d = this._dreh(X, Y, Z);
    return { x: this.cx + this.s * d.x, y: this.cy - this.s * d.y, t: d.t };
  }

  /** Querschnittspunkt (y, z) mit Spannung sig -> Bildschirmpunkt */
  _p(y, z, sig) {
    return this._projiziere(y - this.ym, -(z - this.zm), sig * this.k);
  }

  /** Farbe nach Spannung: Zug rot, Druck blau, 0 weiß. */
  _farbe(sig) {
    if (this.maxAbs < 1e-9) return "rgb(225,225,225)";
    const t = Math.max(-1, Math.min(1, sig / this.maxAbs));
    const g = Math.round(255 * (1 - 0.85 * Math.abs(t)));
    return t >= 0 ? `rgb(255,${g},${g})` : `rgb(${g},${g},255)`;
  }

  /* ---------- Zeichnen ---------- */

  zeichne() {
    const cv = this.cv, dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w === 0 || h === 0) return; // Tab nicht sichtbar
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!this.q) return;

    this.cx = w / 2; this.cy = h / 2;
    this.s = Math.min(w, h) * 0.40 / this.ausdehnung * this.zoom;

    this._zeichneFlaechen(g);
    this._zeichneKonturen(g);
    this._zeichneNulllinie(g);
    this._zeichneMarken(g);
    this._zeichneLegende(g, w, h);
    this._zeichneAchsen(g, h);
  }

  /** Grund- und Spannungsfläche als sortierte Vierecke (Painter-Algorithmus). */
  _zeichneFlaechen(g) {
    const quads = [];
    for (const c of this.zellen) {
      const y0 = c.y - c.dy / 2, y1 = c.y + c.dy / 2, z0 = c.z - c.dz / 2, z1 = c.z + c.dz / 2;
      const ecken = [[y0, z0], [y1, z0], [y1, z1], [y0, z1]];
      const basis = ecken.map(([y, z]) => this._p(y, z, 0));
      const flaeche = ecken.map(([y, z]) => this._p(y, z, this.sp.sigma(y, z)));
      quads.push({ pts: basis, t: basis.reduce((a, p) => a + p.t, 0) / 4, f: "#c9ced6" });
      quads.push({ pts: flaeche, t: flaeche.reduce((a, p) => a + p.t, 0) / 4, f: this._farbe(c.s) });
    }
    quads.sort((a, b) => a.t - b.t); // von hinten nach vorn
    g.lineWidth = 0.6;
    for (const qd of quads) {
      g.beginPath();
      g.moveTo(qd.pts[0].x, qd.pts[0].y);
      for (let i = 1; i < 4; i++) g.lineTo(qd.pts[i].x, qd.pts[i].y);
      g.closePath();
      g.fillStyle = qd.f; g.strokeStyle = qd.f;
      g.fill(); g.stroke();
    }
  }

  /** Senkrechte Linien von den Randpunkten zur Spannungsfläche. */
  _zeichneKonturen(g) {
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1;
    g.beginPath();
    for (const p of this.q.randpunkte(72)) {
      const a = this._p(p.y, p.z, 0), b = this._p(p.y, p.z, this.sp.sigma(p.y, p.z));
      g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
    }
    g.stroke();
  }

  /** Spannungsnulllinie (grün gestrichelt). */
  _zeichneNulllinie(g) {
    if (!this.nl) return;
    const a = this._p(this.nl[0].y, this.nl[0].z, 0), b = this._p(this.nl[1].y, this.nl[1].z, 0);
    g.save();
    g.setLineDash([7, 4]); g.strokeStyle = "#1b7f3b"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.restore();
  }

  /** Beschriftete Marken: Extremwerte und vom Nutzer gesetzte Punkte. */
  _zeichneMarken(g) {
    g.font = "12px system-ui, sans-serif";
    const marke = (y, z, text, farbe) => {
      const sig = this.sp.sigma(y, z);
      const a = this._p(y, z, 0), b = this._p(y, z, sig);
      g.strokeStyle = farbe; g.lineWidth = 2;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.fillStyle = farbe;
      for (const p of [a, b]) { g.beginPath(); g.arc(p.x, p.y, 3.5, 0, 2 * Math.PI); g.fill(); }
      g.lineWidth = 3; g.strokeStyle = "#fff"; g.strokeText(text, b.x + 6, b.y - 6);
      g.fillStyle = "#111"; g.fillText(text, b.x + 6, b.y - 6);
    };
    if (this.maxAbs > 1e-9) {
      marke(this.ext.max.y, this.ext.max.z, `max ${fmt(this.ext.max.wert)}`, "#b00020");
      marke(this.ext.min.y, this.ext.min.z, `min ${fmt(this.ext.min.wert)}`, "#1f4e9a");
    }
    this.punkte.forEach((p, i) => marke(p.y, p.z, `P${i + 1}: ${fmt(this.sp.sigma(p.y, p.z))}`, "#222"));
  }

  /** Farbskala rechts oben. */
  _zeichneLegende(g, w) {
    const x = w - 46, y = 34, hh = 130;
    const grad = g.createLinearGradient(0, y, 0, y + hh);
    grad.addColorStop(0, "rgb(255,38,38)"); grad.addColorStop(0.5, "rgb(255,255,255)"); grad.addColorStop(1, "rgb(38,38,255)");
    g.fillStyle = grad; g.fillRect(x, y, 14, hh);
    g.strokeStyle = "#666"; g.lineWidth = 1; g.strokeRect(x, y, 14, hh);
    g.font = "11px system-ui, sans-serif"; g.fillStyle = "#222"; g.textAlign = "right";
    g.fillText("σ [N/mm²]", x + 14, y - 18);
    g.fillText("Zug " + fmt(this.maxAbs), x + 14, y - 6);
    g.fillText("Druck −" + fmt(this.maxAbs), x + 14, y + hh + 14);
    g.textAlign = "left";
  }

  /** Kleines Achsenkreuz links unten. */
  _zeichneAchsen(g, h) {
    const ox = 50, oy = h - 45, L = 32;
    const achsen = [["y", 1, 0, 0, "#c0392b"], ["z", 0, -1, 0, "#2874a6"], ["σ", 0, 0, 1, "#1b7f3b"]];
    g.font = "12px system-ui, sans-serif"; g.lineWidth = 2;
    for (const [n, X, Y, Z, f] of achsen) {
      const d = this._dreh(X, Y, Z);
      const ex = ox + L * d.x, ey = oy - L * d.y;
      g.strokeStyle = f; g.fillStyle = f;
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(ex, ey); g.stroke();
      g.fillText(n, ex + 3, ey - 3);
    }
  }

  /* ---------- Maus / Touch ---------- */

  _ereignisse() {
    let ziehen = false, lx = 0, ly = 0;
    this.cv.addEventListener("pointerdown", e => {
      ziehen = true; lx = e.clientX; ly = e.clientY;
      this.cv.setPointerCapture(e.pointerId);
    });
    this.cv.addEventListener("pointermove", e => {
      if (!ziehen) return;
      this.azimut += (e.clientX - lx) * 0.01;
      this.elev = Math.max(-1.55, Math.min(1.55, this.elev + (e.clientY - ly) * 0.01));
      lx = e.clientX; ly = e.clientY;
      this.zeichne();
    });
    const ende = () => { ziehen = false; };
    this.cv.addEventListener("pointerup", ende);
    this.cv.addEventListener("pointercancel", ende);
    this.cv.addEventListener("wheel", e => {
      e.preventDefault();
      this.zoom = Math.max(0.3, Math.min(5, this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      this.zeichne();
    }, { passive: false });
  }
}
