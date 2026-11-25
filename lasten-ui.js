/**
 * Seite "Lastermittlung": Eingabe der Bodenschichten, Berechnung des Erddrucks und grafische Darstellung
 * (Schichtenprofil und Erddruckverlauf mit Werten beim Überfahren/Antippen).
 */

/** Farben der Schichten im Schichtenprofil */
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
    const top = 34, bot = 18, hz = h - top - bot, sz = hz / erg.H;                    // Pixel je m Tiefe
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
      g.fillText(`p = ${fmt(m.p, 1)} kN/m²`, 12 + spalte, top - 10);
    }
    // Wand
    g.fillStyle = "#555"; g.fillRect(xw, top, 5, hz);

    // Erddruckverlauf
    const x0 = xw + 5, farbe = passiv ? "#2e7d32" : "#c0392b";
    g.fillStyle = farbe + "33"; g.strokeStyle = farbe; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0, Y(0));
    for (const t of erg.stuecke) { g.lineTo(x0 + t.e1 * sk, Y(t.z1)); g.lineTo(x0 + t.e2 * sk, Y(t.z2)); }
    g.lineTo(x0, Y(erg.H)); g.closePath(); g.fill(); g.stroke();
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
    const zr = erg.H - erg.ez, xr = x0 + Math.max(erg.eMax, 0) * sk + 40;
    if (erg.Eh > 1e-9) {
      g.strokeStyle = "#000"; g.fillStyle = "#000"; g.lineWidth = 2;
      this._pfeil(g, Math.min(xr + 30, w - 60), Y(zr), x0 + 2, Y(zr));
      g.font = "bold 11px system-ui, sans-serif"; g.textAlign = "right";
      g.fillText(`E_h = ${fmt(erg.Eh, 1)} kN/m`, w - 10, Y(zr) - 6);
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
        g.fillStyle = "#111"; g.beginPath(); g.arc(x0 + v.e * sk, this.maus.y, 4, 0, 7); g.fill();
        const s = m.schichten[v.i], zeilen = [`z = ${fmt(zz, 2)} m (${v.i + 1} ${s.name || ""})`, `σ′v = ${fmt(v.sv, 1)} kN/m²`, `e_h = ${fmt(v.e, 2)} kN/m²`];
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
  zeigeAuto(k) {
    (k || []).forEach((b, i) => {
      const f = this.platz[i]; if (!f) return;
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
      feld("phi", "φ′ [°]"); feld("c", "c′ [kN/m²]"); feld("delta", "δ Wandreibung [°]");
      karte.appendChild(raster);
      const det = document.createElement("details"); det.innerHTML = "<summary>Erddruckbeiwerte (leer = berechnen)</summary>";
      const r2 = document.createElement("div"); r2.className = "sw-kfelder";
      const f = {
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

/** Seite "Lastermittlung" */
class ErddruckSeite {
  constructor() {
    this.zeichnung = new ErddruckZeichnung(document.getElementById("ed-canvas"));
    this.schichten = new SchichtListe(document.getElementById("ed-schichten"), () => this.aktualisiere());
    ["ed-art", "ed-faktor", "ed-beta", "ed-p", "ed-gw", "ed-wasser"].forEach(id => document.getElementById(id).addEventListener("input", () => this.aktualisiere()));
    document.getElementById("ed-beispiel").addEventListener("click", () => { this.lade(ErddruckSeite.BEISPIEL()); this.aktualisiere(); });
    window.addEventListener("resize", () => { if (document.getElementById("tab-lasten").classList.contains("aktiv")) this.aktualisiere(); });
    let start = null;
    try { start = JSON.parse(localStorage.getItem("lasten-erddruck-1")); } catch (e) { start = null; }
    this.lade(start && start.schichten && start.schichten.length ? start : ErddruckSeite.BEISPIEL());
    this.aktualisiere();
  }

  static BEISPIEL() {
    return {
      art: "aktiv", faktor: 1, beta: 0, p: 10, gw: 3, wasser: true,
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
    this.schichten.setze(m.schichten);
  }

  modell() {
    const v = id => { const x = parseFloat(document.getElementById(id).value); return Number.isFinite(x) ? x : NaN; };
    return {
      art: document.getElementById("ed-art").value, faktor: v("ed-faktor"), beta: v("ed-beta") || 0, p: v("ed-p") || 0,
      gw: v("ed-gw"), wasser: document.getElementById("ed-wasser").checked, schichten: this.schichten.liste,
    };
  }

  zeige() { this.aktualisiere(); }

  aktualisiere() {
    const m = this.modell(), box = document.getElementById("ed-ergebnis");
    try { localStorage.setItem("lasten-erddruck-1", JSON.stringify(m)); } catch (e) { /* Speicher nicht verfügbar */ }
    const rechner = new Erddruck(m), erg = rechner.berechne();
    if (!erg.fehler) this.schichten.zeigeAuto(erg.K);
    this.zeichnung.zeichne(m, erg);
    box.innerHTML = erg.fehler ? `<span class="fehler">${erg.fehler}</span>` : this._html(m, erg);
  }

  _html(m, e) {
    const art = { aktiv: "aktiver Erddruck", erhoeht: "erhöhter aktiver Erddruck", ruhe: "Erdruhedruck", passiv: "passiver Erddruck" }[m.art];
    const ev = m.art === "aktiv" || m.art === "passiv";
    let h = `<h3>Resultierende – ${art}${m.faktor !== 1 ? ` (Faktor ${fmt(m.faktor, 2)})` : ""} ${infoBtn("erddruck")}</h3><table>`;
    h += `<tr><td>Wandhöhe H (Summe der Schichten)</td><td>${fmt(e.H, 2)}</td><td>m</td></tr>`;
    h += `<tr><td>Horizontale Erddruckkraft E<sub>h</sub></td><td><b>${fmt(e.Eh, 2)}</b></td><td>kN/m</td></tr>`;
    if (ev) h += `<tr><td>Vertikale Komponente E<sub>v</sub> = ΣE<sub>h,i</sub>·tanδ<sub>i</sub> (${m.art === "aktiv" ? "abwärts" : "aufwärts"} auf die Wand)</td><td>${fmt(e.Ev, 2)}</td><td>kN/m</td></tr>`;
    h += `<tr><td>Angriffshöhe über Wandfuß</td><td>${fmt(e.ez, 2)}</td><td>m</td></tr>`;
    if (e.hw > 0 && m.wasser) {
      h += `<tr><td>Wasserdruck W = ½·γ<sub>w</sub>·h<sub>w</sub>² (h<sub>w</sub> = ${fmt(e.hw, 2)} m), Höhe über Fuß ${fmt(e.ezW, 2)} m</td><td>${fmt(e.W, 2)}</td><td>kN/m</td></tr>`;
      const ges = e.Eh + e.W, ezg = (e.Eh * e.ez + e.W * e.ezW) / ges;
      h += `<tr><td>Summe E<sub>h</sub> + W, Angriffshöhe ${fmt(ezg, 2)} m über Fuß</td><td><b>${fmt(ges, 2)}</b></td><td>kN/m</td></tr>`;
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
