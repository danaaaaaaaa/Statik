/**
 * Seite "Lastermittlung": Eingabe der Bodenschichten, Berechnung des Erddrucks und grafische Darstellung
 * (Schichtenprofil und Erddruckverlauf mit Werten beim Überfahren/Antippen).
 */

/** Farben der Schichten im Schichtenprofil */
const ZUSFARBEN = ["#8e24aa", "#ef6c00", "#00838f", "#6d4c41", "#558b2f"];
const SCHICHTFARBEN = ["#ecdcb0", "#cfd9bd", "#dcc7b3", "#c7d3e2", "#e8d3d3", "#d6d6d6", "#e2e2b8", "#cbe3dc"];

/** Zeichnung von Schichtenprofil und Erddruckverlauf (Canvas). */
class ErddruckZeichnung {
  constructor(canvas) {
    this.cv = canvas; this.maus = null; this.letzte = null;
    const pos = e => { const r = canvas.getBoundingClientRect(); this.maus = { x: e.clientX - r.left, y: e.clientY - r.top }; this.neu(); };
    canvas.addEventListener("pointermove", pos);
    canvas.addEventListener("pointerdown", pos);
    canvas.addEventListener("pointerleave", () => { this.maus = null; this.neu(); });
  }

  neu() { if (this.letzte) this.zeichne(...this.letzte); }

  /** Pfeil von (x1,y1) nach (x2,y2) */
  _pfeil(g, x1, y1, x2, y2) {
    const a = Math.atan2(y2 - y1, x2 - x1), l = 7;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - l * Math.cos(a - 0.4), y2 - l * Math.sin(a - 0.4));
    g.lineTo(x2 - l * Math.cos(a + 0.4), y2 - l * Math.sin(a + 0.4)); g.closePath(); g.fill();
  }

  /**
   * @param {Object} m Eingabemodell; @param {Object} erg Ergebnis von Erddruck.berechne()
   */
  zeichne(m, erg) {
    this.letzte = [m, erg];
    const { g, w, h } = canvasVorbereiten(this.cv);
    if (!erg || erg.fehler || w < 50 || h < 50) return;
    const lastenZeichnen = (m.art === "aktiv" || m.art === "erhoeht") && ((m.linien || []).some(l => l.Q > 0) || (m.streifen || []).some(t => t.q > 0 && t.b > 0));
    const top = 34 + (lastenZeichnen ? 46 : 0), bot = 18, hz = h - top - bot, sz = hz / erg.H;   // Pixel je m Tiefe
    const spalte = Math.max(90, Math.min(150, w * 0.26)), xw = 8 + spalte;           // x der Wand
    const breite = w - xw - 16, passiv = m.art === "passiv";
    const eMax = Math.max(erg.eMax, m.wasser ? erg.uMax : 0), sk = (breite - 70) / eMax;            // Pixel je kN/m²
    const Y = z => top + z * sz;
    g.font = "11px system-ui, sans-serif"; g.lineWidth = 1;

    // Schichtenprofil
    let z = 0;
    m.schichten.forEach((s, i) => {
      g.fillStyle = SCHICHTFARBEN[i % SCHICHTFARBEN.length]; g.fillRect(8, Y(z), spalte, s.d * sz);
      g.strokeStyle = "#8a7f6a"; g.strokeRect(8, Y(z), spalte, s.d * sz);
      g.fillStyle = "#222"; g.textAlign = "left";
      if (s.d * sz > 30) {
        g.font = "bold 11px system-ui, sans-serif"; g.fillText(`${i + 1} ${s.name || ""}`.slice(0, 18), 12, Y(z) + 13);
        g.font = "11px system-ui, sans-serif";
        g.fillText(`γ=${fmt(s.g, 1)} φ=${fmt(s.phi, 1)}°`, 12, Y(z) + 26);
        if (s.d * sz > 44) g.fillText(`c=${fmt(s.c, 1)} δ=${fmt(s.delta, 1)}°`, 12, Y(z) + 39);
      } else g.fillText(`${i + 1}`, 12, Y(z) + 12);
      z += s.d;
    });
    // Tiefenmaße
    g.fillStyle = "#555"; g.textAlign = "right"; z = 0;
    for (const s of [{ d: 0 }, ...m.schichten]) { z += s.d; g.fillText(fmt(z, 2), 6 + spalte - 3, Y(z) - 2); }
    g.textAlign = "left";

    // Grundwasser
    if (Number.isFinite(erg.gw) && erg.gw < erg.H) {
      g.strokeStyle = "#1565c0"; g.fillStyle = "#1565c0"; g.setLineDash([5, 3]);
      g.beginPath(); g.moveTo(8, Y(erg.gw)); g.lineTo(w - 8, Y(erg.gw)); g.stroke(); g.setLineDash([]);
      g.fillText(`▽ GW z = ${fmt(erg.gw, 2)} m`, 12 + spalte, Y(erg.gw) - 3);
    }
    // Auflast
    if (m.p > 0) {
      g.strokeStyle = "#e65100"; g.fillStyle = "#e65100";
      for (let x = 14; x < spalte; x += 18) this._pfeil(g, x, top - 22, x, top - 2);
      g.fillText(`p = ${fmt(m.p, 1)} kN/m²`, 12, top - 26);
    }
    // Wand (ggf. geneigt: α > 0 = Wandkopf vom Boden weg) und Geländeneigung
    const al = (m.alpha || 0) * Math.PI / 180, off = Math.max(-28, Math.min(28, hz * Math.tan(al)));
    g.fillStyle = "#555"; g.beginPath(); g.moveTo(xw - off, top); g.lineTo(xw - off + 5, top); g.lineTo(xw + 5, top + hz); g.lineTo(xw, top + hz); g.closePath(); g.fill();
    if (m.beta > 0 && !lastenZeichnen) {
      g.strokeStyle = "#8a7f6a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xw + 5 - off, top);
      g.lineTo(w - 8, top - Math.min(22, (w - 8 - xw) * Math.tan(m.beta * Math.PI / 180))); g.stroke(); g.lineWidth = 1;
      g.fillStyle = "#8a7f6a"; g.fillText(`β = ${fmt(m.beta, 1)}°`, w - 70, top - 26);
    }
    // Linien- und Streifenlasten (waagerechter Maßstab nach Abstand von der Wand)
    if (lastenZeichnen) {
      const ext = Math.max(1, ...(m.linien || []).map(l => l.a), ...(m.streifen || []).map(t => t.a + t.b)), sh = Math.min(sz, (breite - 20) / ext), xb = xw + 5;
      g.strokeStyle = "#e65100"; g.fillStyle = "#e65100"; g.lineWidth = 1.5;
      (m.linien || []).filter(l => l.Q > 0).forEach(l => {
        const x = xb + l.a * sh; this._pfeil(g, x, top - 38, x, top - 2);
        g.textAlign = "left"; g.fillText(`Q = ${fmt(l.Q, 1)} kN/m, a = ${fmt(l.a, 2)} m`, Math.min(x + 4, w - 150), top - 40);
      });
      (m.streifen || []).filter(t => t.q > 0 && t.b > 0).forEach(t => {
        const x1 = xb + t.a * sh, x2 = xb + (t.a + t.b) * sh;
        g.fillStyle = "#e6510033"; g.fillRect(x1, top - 22, x2 - x1, 20); g.fillStyle = "#e65100"; g.strokeRect(x1, top - 22, x2 - x1, 20);
        for (let x = x1 + 6; x < x2; x += 14) this._pfeil(g, x, top - 22, x, top - 2);
        g.textAlign = "left"; g.fillText(`q = ${fmt(t.q, 1)}, a = ${fmt(t.a, 2)}, b = ${fmt(t.b, 2)}`, Math.min(x1, w - 170), top - 26);
      });
      g.lineWidth = 1; g.strokeStyle = "#e65100"; g.beginPath(); g.moveTo(xb, top); g.lineTo(w - 8, top); g.stroke();
    }

    // Erddruckverlauf
    const x0 = xw + 5, farbe = passiv ? "#2e7d32" : "#c0392b";
    g.fillStyle = farbe + "33"; g.strokeStyle = farbe; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0, Y(0));
    for (const t of erg.stuecke) { g.lineTo(x0 + t.e1 * sk, Y(t.z1)); g.lineTo(x0 + t.e2 * sk, Y(t.z2)); }
    g.lineTo(x0, Y(erg.H)); g.closePath(); g.fill(); g.stroke();
    // Zusatzdrücke (Verdichtung, Linien-, Streifenlasten) als gestapelte Flächen über dem Bodendruck
    (erg.zusaetze || []).forEach((zu, k) => {
      const P = erg.profil, c = ZUSFARBEN[k % ZUSFARBEN.length], unten = p => p.e0 + p.zus.slice(0, k).reduce((a, b) => a + b, 0);
      g.fillStyle = c + "55"; g.strokeStyle = c; g.lineWidth = 1;
      g.beginPath(); P.forEach((p, i) => { const x = x0 + (unten(p) + p.zus[k]) * sk; i ? g.lineTo(x, Y(p.z)) : g.moveTo(x, Y(p.z)); });
      for (let i = P.length - 1; i >= 0; i--) g.lineTo(x0 + unten(P[i]) * sk, Y(P[i].z));
      g.closePath(); g.fill(); g.stroke();
    });
    if ((erg.zusaetze || []).length) {
      g.strokeStyle = "#222"; g.lineWidth = 1.5; g.beginPath();
      erg.profil.forEach((p, i) => { i ? g.lineTo(x0 + p.tot * sk, Y(p.z)) : g.moveTo(x0 + p.tot * sk, Y(p.z)); }); g.stroke(); g.lineWidth = 1;
    }
    // Wasserdruck (blau, vom Grundwasserspiegel bis zum Fuß)
    if (erg.hw > 0 && m.wasser) {
      g.fillStyle = "#1565c022"; g.strokeStyle = "#1565c0"; g.setLineDash([4, 3]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0, Y(erg.gw)); g.lineTo(x0 + erg.uMax * sk, Y(erg.H)); g.lineTo(x0, Y(erg.H)); g.closePath(); g.fill(); g.stroke(); g.setLineDash([]);
    }
    // Werte an den Knickpunkten
    g.fillStyle = "#111"; g.lineWidth = 1; g.textAlign = "left"; g.font = "11px system-ui, sans-serif";
    let ly = -99;
    const marke = (e, zz, abov) => {
      if (e < 1e-6 || Math.abs(Y(zz) - ly) < 12) return;
      ly = Y(zz); g.fillText(fmt(e, 1), x0 + e * sk + 4, Y(zz) + (abov ? -3 : 11));
    };
    erg.stuecke.forEach(t => { marke(t.e1, t.z1, false); marke(t.e2, t.z2, true); });
    if (erg.hw > 0 && m.wasser) { g.fillStyle = "#1565c0"; g.fillText(`u = ${fmt(erg.uMax, 1)}`, x0 + erg.uMax * sk + 4, Y(erg.H) - 14); }

    // Resultierende E_h in Angriffshöhe
    const zr = erg.H - erg.ezGes, xr = x0 + Math.max(erg.eMax, 0) * sk + 40;
    if (erg.EhGes > 1e-9) {
      g.strokeStyle = "#000"; g.fillStyle = "#000"; g.lineWidth = 2;
      this._pfeil(g, Math.min(xr + 30, w - 60), Y(zr), x0 + 2, Y(zr));
      g.font = "bold 11px system-ui, sans-serif"; g.textAlign = "right";
      g.fillText(`E_h = ${fmt(erg.EhGes, 1)} kN/m`, w - 10, Y(zr) - 6);
      g.font = "11px system-ui, sans-serif";
    }
    g.textAlign = "left"; g.fillStyle = "#444"; g.font = "11px system-ui, sans-serif";
    g.fillText(`e_h [kN/m²] – ${{ aktiv: "aktiv", erhoeht: "erhöht aktiv", ruhe: "Ruhedruck", passiv: "passiv" }[m.art]}`, xw + 12, 12);

    // Mausabfrage: Tiefe unter dem Zeiger
    if (this.maus && this.maus.y >= top && this.maus.y <= top + hz) {
      const zz = (this.maus.y - top) / sz, v = Erddruck.werteBei(erg, zz);
      if (v) {
        g.strokeStyle = "#555"; g.lineWidth = 1; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(8, this.maus.y); g.lineTo(w - 8, this.maus.y); g.stroke(); g.setLineDash([]);
        g.fillStyle = "#111"; g.beginPath(); g.arc(x0 + v.etot * sk, this.maus.y, 4, 0, 7); g.fill();
        const s = m.schichten[v.i], zeilen = [`z = ${fmt(zz, 2)} m (${v.i + 1} ${s.name || ""})`, `σ′v = ${fmt(v.sv, 1)} kN/m²`, `e_h = ${fmt(v.e, 2)} kN/m²`];
        (erg.zusaetze || []).forEach((zu, k) => { if (v.zus[k] > 1e-6) zeilen.push(`${zu.name}: +${fmt(v.zus[k], 2)} kN/m²`); });
        if (v.zus.some(a => a > 1e-6)) zeilen.push(`e_h gesamt = ${fmt(v.etot, 2)} kN/m²`);
        if (v.u > 0) zeilen.push(`u = ${fmt(v.u, 1)} kN/m², e_h + u = ${fmt(v.e + v.u, 1)}`);
        const bw = Math.max(...zeilen.map(t => g.measureText(t).width)) + 14, bh = zeilen.length * 15 + 8;
        const bx = Math.min(Math.max(4, this.maus.x + 12), w - bw - 4), by = Math.min(Math.max(4, this.maus.y + 10), h - bh - 4);
        g.fillStyle = "rgba(255,255,255,.96)"; g.strokeStyle = "#555"; g.fillRect(bx, by, bw, bh); g.strokeRect(bx, by, bw, bh);
        g.fillStyle = "#111"; g.textAlign = "left"; zeilen.forEach((t, i) => g.fillText(t, bx + 7, by + 16 + i * 15));
      }
    }
  }
}

/** Liste der Bodenschichten als Karten. */
class SchichtListe {
  constructor(box, bei) { this.box = box; this.bei = bei; this.liste = []; this.platz = []; }

  static neu(n = 0) {
    return { name: `Schicht ${n + 1}`, d: 2, g: 18, gs: 10, phi: 30, c: 0, delta: 20, ka: NaN, k0: NaN, kp: NaN };
  }

  setze(liste) { this.liste = liste; this.baue(); }

  /** Platzhalter der Beiwertfelder mit den berechneten Werten aktualisieren. */
  zeigeAuto(k, anteil) {
    (k || []).forEach((b, i) => {
      const f = this.platz[i]; if (!f) return;
      const s = this.liste[i], fixiert = Number.isFinite(anteil) && anteil >= 0;           // δ aus Anteil von φ′ → Feld gesperrt
      f.delta.disabled = fixiert; f.delta.value = fixiert ? fmt(anteil * s.phi, 2) : (Number.isFinite(s.delta) ? s.delta : "");
      f.ka.placeholder = Number.isFinite(b.auto.ka) ? fmt(b.auto.ka, 3) : "–";
      f.k0.placeholder = fmt(b.auto.k0, 3);
      f.kp.placeholder = Number.isFinite(b.auto.kp) ? fmt(b.auto.kp, 3) : "–";
    });
  }

  baue() {
    this.box.replaceChildren(); this.platz = [];
    this.liste.forEach((s, n) => {
      const karte = document.createElement("div"); karte.className = "sw-karte";
      karte.style.borderLeft = `8px solid ${SCHICHTFARBEN[n % SCHICHTFARBEN.length]}`;
      const kopf = document.createElement("div"); kopf.className = "sw-kkopf";
      const nr = document.createElement("b"); nr.textContent = String(n + 1); kopf.appendChild(nr);
      const name = document.createElement("input"); name.type = "text"; name.value = s.name; name.style.flex = "1"; name.placeholder = "Bezeichnung";
      name.addEventListener("input", () => { s.name = name.value; this.bei(); }); kopf.appendChild(name);
      const x = document.createElement("button"); x.type = "button"; x.className = "sw-x"; x.textContent = "×"; x.title = "Schicht löschen";
      x.disabled = this.liste.length <= 1;
      x.addEventListener("click", () => { this.liste.splice(n, 1); this.baue(); this.bei(); }); kopf.appendChild(x);
      karte.appendChild(kopf);
      const raster = document.createElement("div"); raster.className = "sw-kfelder";
      const feld = (k, label, opt = {}) => {
        const l = document.createElement("label"), sp = document.createElement("span"); sp.innerHTML = label; l.appendChild(sp);
        const e = document.createElement("input"); e.type = "number"; e.step = "any"; e.inputMode = "decimal";
        e.value = Number.isFinite(s[k]) ? s[k] : ""; if (opt.platz) e.placeholder = opt.platz;
        e.addEventListener("input", () => { s[k] = e.value === "" ? NaN : parseFloat(e.value); this.bei(); });
        l.appendChild(e); (opt.ziel || raster).appendChild(l); return e;
      };
      feld("d", "Dicke d [m]"); feld("g", "γ [kN/m³]"); feld("gs", "γ′ (unter GW) [kN/m³]", { platz: "γ − 10" });
      feld("phi", "φ′ [°]"); feld("c", "c′ [kN/m²]"); const fd = feld("delta", "δ Wandreibung [°]");
      karte.appendChild(raster);
      const det = document.createElement("details"); det.innerHTML = "<summary>Erddruckbeiwerte (leer = berechnen)</summary>";
      const r2 = document.createElement("div"); r2.className = "sw-kfelder";
      const f = {
        delta: fd,
        ka: feld("ka", "K<sub>agh</sub> aktiv", { ziel: r2 }),
        k0: feld("k0", "K<sub>0h</sub> Ruhe", { ziel: r2 }),
        kp: feld("kp", "K<sub>pgh</sub> passiv", { ziel: r2 }),
      };
      det.appendChild(r2); karte.appendChild(det);
      this.platz.push(f);
      this.box.appendChild(karte);
    });
    const add = document.createElement("button"); add.type = "button"; add.className = "sw-add"; add.textContent = "+ Schicht";
    add.addEventListener("click", () => { this.liste.push(SchichtListe.neu(this.liste.length)); this.baue(); this.bei(); });
    this.box.appendChild(add);
  }
}

/** Liste einfacher Zahlenzeilen (Linien-/Streifenlasten): eine Zeile je Last mit beschrifteten Feldern. */
class ZeilenListe {
  /** @param {HTMLElement} box @param {Array<{k:string,label:string,wert:number}>} felder @param {string} text Beschriftung des Hinzufügen-Knopfs */
  constructor(box, felder, text, bei) { this.box = box; this.felder = felder; this.text = text; this.bei = bei; this.liste = []; }

  setze(liste) { this.liste = liste; this.baue(); }

  baue() {
    this.box.replaceChildren();
    this.liste.forEach((z, n) => {
      const zeile = document.createElement("div"); zeile.className = "sw-karte ed-zeile";
      const nr = document.createElement("b"); nr.textContent = String(n + 1); zeile.appendChild(nr);
      for (const f of this.felder) {
        const l = document.createElement("label"), sp = document.createElement("span"); sp.innerHTML = f.label; l.appendChild(sp);
        const e = document.createElement("input"); e.type = "number"; e.step = "any"; e.inputMode = "decimal"; e.value = Number.isFinite(z[f.k]) ? z[f.k] : "";
        e.addEventListener("input", () => { z[f.k] = e.value === "" ? NaN : parseFloat(e.value); this.bei(); });
        l.appendChild(e); zeile.appendChild(l);
      }
      const x = document.createElement("button"); x.type = "button"; x.className = "sw-x"; x.textContent = "×"; x.title = "Löschen";
      x.addEventListener("click", () => { this.liste.splice(n, 1); this.baue(); this.bei(); }); zeile.appendChild(x);
      this.box.appendChild(zeile);
    });
    const add = document.createElement("button"); add.type = "button"; add.className = "sw-add"; add.textContent = this.text;
    add.addEventListener("click", () => { const z = {}; this.felder.forEach(f => { z[f.k] = f.wert; }); this.liste.push(z); this.baue(); this.bei(); });
    this.box.appendChild(add);
  }
}

/** Wandreibung als Anteil von φ′ (Richtwerte der Tabellen zu DIN 4085/EAB) */
const DELTA_ANTEILE = { manuell: NaN, "0": 0, "1/3": 1 / 3, "1/2": 1 / 2, "2/3": 2 / 3, "1": 1 };

/** Seite "Lastermittlung" */
class ErddruckSeite {
  constructor() {
    this.zeichnung = new ErddruckZeichnung(document.getElementById("ed-canvas"));
    this.schichten = new SchichtListe(document.getElementById("ed-schichten"), () => this.aktualisiere());
    const bei = () => this.aktualisiere();
    this.linien = new ZeilenListe(document.getElementById("ed-linien"), [{ k: "Q", label: "Q [kN/m]", wert: 50 }, { k: "a", label: "Abstand a [m]", wert: 1.5 }], "+ Linienlast", bei);
    this.streifen = new ZeilenListe(document.getElementById("ed-streifen"), [{ k: "q", label: "q [kN/m²]", wert: 20 }, { k: "a", label: "Abstand a [m]", wert: 1 }, { k: "b", label: "Breite b [m]", wert: 2 }], "+ Streifenlast", bei);
    ["ed-art", "ed-faktor", "ed-beta", "ed-alpha", "ed-p", "ed-gw", "ed-wasser", "ed-phimin", "ed-verd", "ed-delta", "ed-gleit", "ed-mobs", "ed-mobsb", "ed-wand", "ed-paf", "ed-dichte"].forEach(id => document.getElementById(id).addEventListener("input", () => this.aktualisiere()));
    document.getElementById("ed-beispiel").addEventListener("click", () => { this.lade(ErddruckSeite.BEISPIEL()); this.aktualisiere(); });
    window.addEventListener("resize", () => { if (document.getElementById("tab-lasten").classList.contains("aktiv")) this.aktualisiere(); });
    // Speicherplätze (benennbar); der frühere Einzelspeicher wird als Startwert übernommen
    this.speicher = new ModellSpeicher(document.getElementById("ed-slots"), "lasten-erddruck-slots-1", 6, {
      holen: () => this.modell(),
      setzen: m => { this.lade(m); if (this.verlauf) this.verlauf.neu(); this.aktualisiere(); },
    });
    let start = this.speicher.start();
    try { if (!start) start = JSON.parse(localStorage.getItem("lasten-erddruck-1")); } catch (e) { start = null; }
    this.lade(start && start.schichten && start.schichten.length ? start : ErddruckSeite.BEISPIEL());
    // Rückgängig / Wiederherstellen
    this.verlauf = new Verlauf({
      holen: () => JSON.stringify(this.modell()),
      setzen: t => { this.lade(JSON.parse(t)); this.aktualisiere(); },
    });
    this.aktualisiere();
  }

  /** Wandbewegungsarten je Erddruckart; die erste ist der Normalfall (aktiv: Drehung um den Fuß, passiv: Parallelverschiebung) */
  static WAND = {
    aktiv: [["a", "a) Drehung um den Wandfuß (Dreieck)"], ["b", "b) Parallelverschiebung"], ["c", "c) Drehung um den Wandkopf"], ["d", "d) Durchbiegung"]],
    passiv: [["b", "b) Parallelverschiebung (Normalfall)"], ["a", "a) Drehung um den Wandfuß"], ["c", "c) Drehung um den Wandkopf"]],
  };

  static BEISPIEL() {
    return {
      art: "aktiv", faktor: 1, beta: 0, alpha: 0, phimin: NaN, verd: 0, deltaAnteil: NaN, gleit: "eben", mobS: NaN, mobSb: 10,
      linien: [], streifen: [], p: 10, gw: 3, wasser: true,
      schichten: [
        { name: "Auffüllung, Sand", d: 2, g: 18, gs: 10, phi: 32.5, c: 0, delta: 21.7, ka: NaN, k0: NaN, kp: NaN },
        { name: "Sand, mitteldicht", d: 3, g: 19, gs: 11, phi: 30, c: 0, delta: 20, ka: NaN, k0: NaN, kp: NaN },
        { name: "Ton, steif", d: 2, g: 20, gs: 10, phi: 22.5, c: 10, delta: 15, ka: NaN, k0: NaN, kp: NaN },
      ],
    };
  }

  lade(m) {
    document.getElementById("ed-art").value = m.art; document.getElementById("ed-faktor").value = m.faktor;
    document.getElementById("ed-beta").value = m.beta; document.getElementById("ed-p").value = m.p;
    document.getElementById("ed-gw").value = Number.isFinite(m.gw) ? m.gw : "";
    document.getElementById("ed-wasser").checked = m.wasser !== false;
    document.getElementById("ed-alpha").value = m.alpha || 0;
    document.getElementById("ed-phimin").value = Number.isFinite(m.phimin) ? m.phimin : "";
    document.getElementById("ed-verd").value = m.verd || "";
    document.getElementById("ed-delta").value = Number.isFinite(m.deltaAnteil) ? Object.keys(DELTA_ANTEILE).find(k => DELTA_ANTEILE[k] === m.deltaAnteil) || "manuell" : "manuell";
    document.getElementById("ed-gleit").value = m.gleit || "eben";
    this._wandOptionen(m.art, m.wand);
    document.getElementById("ed-paf").value = Number.isFinite(m.paf) ? m.paf : 0.5;
    document.getElementById("ed-dichte").value = Number.isFinite(m.dichte) ? m.dichte : "";
    document.getElementById("ed-mobs").value = Number.isFinite(m.mobS) ? m.mobS : "";
    document.getElementById("ed-mobsb").value = Number.isFinite(m.mobSb) ? m.mobSb : 10;
    this.linien.setze(m.linien || []); this.streifen.setze(m.streifen || []);
    this.schichten.setze(m.schichten);
  }

  modell() {
    const v = id => { const x = parseFloat(document.getElementById(id).value); return Number.isFinite(x) ? x : NaN; };
    return {
      art: document.getElementById("ed-art").value, faktor: v("ed-faktor"), beta: v("ed-beta") || 0, p: v("ed-p") || 0,
      gw: v("ed-gw"), wasser: document.getElementById("ed-wasser").checked, schichten: this.schichten.liste,
      alpha: v("ed-alpha") || 0, phimin: v("ed-phimin"), verd: v("ed-verd") || 0,
      deltaAnteil: DELTA_ANTEILE[document.getElementById("ed-delta").value], gleit: document.getElementById("ed-gleit").value,
      mobS: v("ed-mobs"), mobSb: v("ed-mobsb"), wand: document.getElementById("ed-wand").value, paf: v("ed-paf"), dichte: v("ed-dichte"), linien: this.linien.liste, streifen: this.streifen.liste,
    };
  }

  zeige() { Kopfleiste.setze(this.verlauf); this.aktualisiere(); }

  /** Auswahl der Wandbewegungsart je Erddruckart (aktiv: Tab. C.1, passiv: Tab. D.1); bei Ruhedruck/erhöht ausgeblendet. */
  _wandOptionen(art, wahl) {
    const sel = document.getElementById("ed-wand"), liste = ErddruckSeite.WAND[art];
    document.getElementById("ed-wand-label").hidden = !liste;
    if (!liste) { sel.innerHTML = ""; document.getElementById("ed-paf-label").hidden = true; return; }
    if (sel.dataset.art !== art || sel.options.length !== liste.length) {
      sel.innerHTML = liste.map(([k, t]) => `<option value="${k}">${t}</option>`).join(""); sel.dataset.art = art;
    }
    sel.value = liste.some(([k]) => k === wahl) ? wahl : liste[0][0];
    document.getElementById("ed-paf-label").hidden = !(art === "passiv" && sel.value === "a");
  }

  aktualisiere() {
    this._wandOptionen(document.getElementById("ed-art").value, document.getElementById("ed-wand").value);
    const m = this.modell(), box = document.getElementById("ed-ergebnis");
    if (this.speicher) this.speicher.sichern();
    const rechner = new Erddruck(m), erg = rechner.berechne();
    if (!erg.fehler) this.schichten.zeigeAuto(erg.K, m.deltaAnteil);
    this.zeichnung.zeichne(m, erg);
    box.innerHTML = erg.fehler ? `<span class="fehler">${erg.fehler}</span>` : this._html(m, erg);
    if (this.verlauf) this.verlauf.merke();
  }

  _html(m, e) {
    const art = { aktiv: "aktiver Erddruck", erhoeht: "erhöhter aktiver Erddruck", ruhe: "Erdruhedruck", passiv: "passiver Erddruck" }[m.art];
    const ev = m.art === "aktiv" || m.art === "passiv";
    let h = `<h3>Resultierende – ${art}${m.faktor !== 1 ? ` (Faktor ${fmt(m.faktor, 2)})` : ""} ${infoBtn("erddruck")}</h3><table>`;
    h += `<tr><td>Wandhöhe H (Summe der Schichten)</td><td>${fmt(e.H, 2)}</td><td>m</td></tr>`;
    h += `<tr><td>Horizontale Erddruckkraft E<sub>h</sub></td><td><b>${fmt(e.Eh, 2)}</b></td><td>kN/m</td></tr>`;
    if (ev) h += `<tr><td>Vertikale Komponente E<sub>v</sub> = ΣE<sub>h,i</sub>·tan(α ${m.art === "aktiv" ? "+" : "−"} δ<sub>i</sub>) (+ abwärts, − aufwärts auf die Wand)</td><td>${fmt(e.Ev, 2)}</td><td>kN/m</td></tr>`;
    h += `<tr><td>Angriffshöhe über Wandfuß</td><td>${fmt(e.ez, 2)}</td><td>m</td></tr>`;
    if (e.zusaetze.length) {
      for (const z of e.zusaetze) h += `<tr><td>${z.name}: E<sub>h</sub>, Höhe über Fuß ${fmt(z.ez, 2)} m, max e<sub>h</sub> = ${fmt(z.eMax, 1)} kN/m²</td><td>${fmt(z.E, 2)}</td><td>kN/m</td></tr>`;
      h += `<tr><td>Summe Boden + Zusätze: E<sub>h</sub>, Angriffshöhe ${fmt(e.ezGes, 2)} m über Fuß</td><td><b>${fmt(e.EhGes, 2)}</b></td><td>kN/m</td></tr>`;
      if (m.art === "aktiv") h += `<tr><td>E<sub>v</sub> gesamt</td><td>${fmt(e.EvGes, 2)}</td><td>kN/m</td></tr>`;
    }
    if (e.last) h += `<tr><td>Lastausbreitung: Gleitflächenwinkel ϑ<sub>a</sub> (Schicht 1), Beiwert E<sub>h</sub>/Q</td><td>${fmt(e.last.th * 180 / Math.PI, 1)}° / ${fmt(e.last.kq, 3)}</td><td></td></tr>`;
    if (e.zusaetze.some(z => z.typ === "verd")) { const i = e.zusaetze.find(z => z.typ === "verd").info; h += `<tr><td>Ingold: σ<sub>hc</sub>, z<sub>e</sub>, z<sub>c</sub></td><td>${fmt(i.shc, 1)} / ${fmt(i.ze, 2)} / ${fmt(i.zc, 2)}</td><td>kN/m² / m / m</td></tr>`; }
    if (e.hw > 0 && m.wasser) {
      h += `<tr><td>Wasserdruck W = ½·γ<sub>w</sub>·h<sub>w</sub>² (h<sub>w</sub> = ${fmt(e.hw, 2)} m), Höhe über Fuß ${fmt(e.ezW, 2)} m</td><td>${fmt(e.W, 2)}</td><td>kN/m</td></tr>`;
      const ges = e.EhGes + e.W, ezg = (e.EhGes * e.ezGes + e.W * e.ezW) / ges;
      h += `<tr><td>Summe E<sub>h</sub> (gesamt) + W, Angriffshöhe ${fmt(ezg, 2)} m über Fuß</td><td><b>${fmt(ges, 2)}</b></td><td>kN/m</td></tr>`;
    }
    h += "</table><h3>Verlauf je Schichtabschnitt</h3><table><tr><th>Schicht</th><th>z [m]</th><th>σ′v [kN/m²]</th><th>K<sub>h</sub></th><th>e<sub>h</sub> [kN/m²]</th><th>E<sub>h</sub> [kN/m]</th></tr>";
    for (const t of e.stuecke) {
      const k = e.K[t.i], kk = m.art === "aktiv" ? k.ka : m.art === "ruhe" ? k.k0 : m.art === "passiv" ? k.kp : `${fmt(k.ka, 3)}/${fmt(k.k0, 3)}`;
      h += `<tr><td>${t.i + 1}</td><td>${fmt(t.z1, 2)} – ${fmt(t.z2, 2)}</td><td>${fmt(t.sv1, 1)} – ${fmt(t.sv2, 1)}</td><td>${typeof kk === "number" ? fmt(kk, 3) : kk}</td><td>${fmt(t.e1, 1)} – ${fmt(t.e2, 1)}</td><td>${fmt(t.E, 1)}</td></tr>`;
    }
    h += "</table>";
    if (e.hinweise.length) h += "<ul>" + e.hinweise.map(t => `<li>${t}</li>`).join("") + "</ul>";
    return h;
  }
}
