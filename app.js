"use strict";

/**
 * app.js - Oberfläche: verbindet Eingabefelder mit den Rechenklassen.
 *  - QuerschnittWahl          : Querschnittsauswahl + Maßfelder (auch Textfeld für Polygone)
 *  - QSkizze                  : Querschnittsskizze mit Schwerachsen, plastischen Nulllinien, Hauptachsen
 *  - QuerschnittswerteAnzeige : Tabelle der Querschnittswerte
 *  - TragfaehigkeitAnzeige    : Tabellen der Tragfähigkeit (Stahl)
 *  - SpannungsAnzeige         : Punkte, 3D-Ansicht und Nachweis gegen f_yd
 *  - StahlbauSeite            : eine Seite für Querschnittswerte, Tragfähigkeit und Spannungen
 *  - SBSkizze, StahlbetonSeite: Seite Massivbau (Biegebemessung, Dehnungen, Spannungen)
 *  - App                      : Startseite, Bereiche, Navigation
 */

/** Tabellenzeile: Bezeichnung | Wert | Einheit */
const SchnittgroessenIds = ["in-N", "in-Vy", "in-Vz", "in-My", "in-Mz"];   // Eingabefelder der Schnittgrößen
const zeile = (l, w, e = "") => `<tr><td>${l}</td><td>${w}</td><td>${e}</td></tr>`;
/** Bezeichnung mit Info-Symbol (Formel und Norm, siehe info.js) */
const lbl = (text, key) => text + infoBtn(key);
/** Tabellenzeile mit beliebig vielen Zellen */
const zeileN = (...zellen) => "<tr>" + zellen.map(z => `<td>${z}</td>`).join("") + "</tr>";
/** Text, der nicht umbrochen werden soll */
const nb = t => `<span class="nb">${t}</span>`;

/** Skaliert ein Canvas auf Bildschirmauflösung, leert es und liefert {g, w, h}. */
function canvasVorbereiten(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

/* ======================= Querschnittsauswahl ======================= */

class QuerschnittWahl {
  /**
   * @param {string} selectId  ID des <select>
   * @param {string} felderId  ID des Containers für die Maßfelder
   * @param {Function} beiAenderung Rückruf bei jeder Änderung
   * @param {string} start Schlüssel des vorgewählten Querschnitts (optional)
   */
  constructor(selectId, felderId, beiAenderung, start = null, slotsId = null, zusatz = null) {
    this.sel = document.getElementById(selectId);
    this.box = document.getElementById(felderId);
    this.slotBox = slotsId ? document.getElementById(slotsId) : null;
    this.zusatz = zusatz;            // optional {holen(), setzen(o)}: weitere Eingaben (z. B. Schnittgrößen), die je Reiter gespeichert werden
    this.beiAenderung = beiAenderung;
    // jede Änderung wird zuerst im aktiven Slot gespeichert, dann weitergegeben
    this.cb = () => { this._speichere(); this.beiAenderung(); };

    // Auswahlliste nach Gruppen (parametrisch / frei / Walzprofile) aufbauen
    const gruppen = {};
    for (const [key, K] of Object.entries(QUERSCHNITTE)) {
      if (!gruppen[K.gruppe]) {
        gruppen[K.gruppe] = document.createElement("optgroup");
        gruppen[K.gruppe].label = K.gruppe;
        this.sel.appendChild(gruppen[K.gruppe]);
      }
      gruppen[K.gruppe].appendChild(new Option(K.titel, key));
    }
    if (start && QUERSCHNITTE[start]) this.sel.value = start;

    this.sel.addEventListener("change", () => { this.baueFelder(); this.cb(); });
    this.baueFelder();
    if (this.slotBox) this._initSlots();
  }

  /* ---------- Speicherslots: mehrere Querschnittseingaben, zwischen denen man wechseln kann ---------- */

  static get SLOTS() { return 6; }

  /** Slots aus dem lokalen Speicher laden und Knöpfe aufbauen. */
  _initSlots() {
    this.schluessel = `statik-qs-slots-${this.box.id}`;
    this.slots = Array(QuerschnittWahl.SLOTS).fill(null);
    this.aktiv = 0;
    try {
      const d = JSON.parse(localStorage.getItem(this.schluessel) || "null");
      if (d && Array.isArray(d.slots)) { this.slots = d.slots.slice(0, QuerschnittWahl.SLOTS); this.aktiv = d.aktiv || 0; }
    } catch (e) { /* Speicher nicht verfügbar: Slots gelten nur für diese Sitzung */ }
    while (this.slots.length < QuerschnittWahl.SLOTS) this.slots.push(null);
    this.slotBox.innerHTML = "";
    for (let i = 0; i < QuerschnittWahl.SLOTS; i++) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "knopf slot"; b.textContent = i + 1;
      b.addEventListener("click", () => this.wechsle(i));
      this.slotBox.appendChild(b);
    }
    if (this.slots[this.aktiv]) this._lade(this.slots[this.aktiv]); else this._speichere();
    this._slotAnzeige();
  }

  /** Aktuelle Eingabe als Zustand {typ, werte}. */
  _zustand() {
    const werte = {};
    for (const f of this.klasse.felder) werte[f.id] = document.getElementById(`${this.box.id}-${f.id}`).value;
    return { typ: this.sel.value, werte, zusatz: this.zusatz ? this.zusatz.holen() : undefined };
  }

  /** Zustand in die Felder schreiben. */
  _lade(z) {
    if (!QUERSCHNITTE[z.typ]) return;
    this.sel.value = z.typ;
    this.baueFelder();
    for (const [id, v] of Object.entries(z.werte || {})) {
      const el = document.getElementById(`${this.box.id}-${id}`);
      if (el) el.value = v;
    }
    this._sichtbarkeit();
    if (z.zusatz && this.zusatz) this.zusatz.setzen(z.zusatz);
  }

  /** Aktuelle Eingabe im aktiven Slot ablegen. */
  _speichere() {
    if (!this.slots) return;
    this.slots[this.aktiv] = this._zustand();
    try { localStorage.setItem(this.schluessel, JSON.stringify({ slots: this.slots, aktiv: this.aktiv })); } catch (e) { /* ignorieren */ }
    this._slotAnzeige();
  }

  /** Zu Slot i springen; ein leerer Slot startet als Kopie der aktuellen Eingabe. */
  wechsle(i) {
    if (i === this.aktiv) return;
    this._speichere();
    this.aktiv = i;
    if (this.slots[i]) this._lade(this.slots[i]);
    this.cb();                       // speichert (ggf. Kopie) und aktualisiert alle Anzeigen
  }

  /** Knöpfe: aktiv = ausgefüllt hervorgehoben, belegt = durchgezogener Rand, leer = gestrichelt. */
  _slotAnzeige() {
    [...this.slotBox.children].forEach((b, i) => {
      b.classList.toggle("aktiv", i === this.aktiv);
      b.classList.toggle("leer", !this.slots[i]);
      const z = this.slots[i];
      b.title = z ? `Reiter ${i + 1}: ${QUERSCHNITTE[z.typ] ? QUERSCHNITTE[z.typ].titel : z.typ}` : `Reiter ${i + 1}: leer (startet als Kopie)`;
    });
  }

  get klasse() { return QUERSCHNITTE[this.sel.value]; }

  /** Eingabefelder des gewählten Querschnitts erzeugen (Zahlenfeld, Auswahlliste oder Textfeld). */
  baueFelder() {
    this.box.innerHTML = "";
    for (const f of this.klasse.felder) {
      const label = document.createElement("label");
      // Beschriftung immer als eigenes Element: sonst bricht jedes Teilstück (z. B. tiefgestellte Zahl) um
      const text = document.createElement("span");
      text.textContent = f.label;
      if (f.info) text.insertAdjacentHTML("beforeend", infoBtn(f.info));
      label.appendChild(text);

      let el;
      if (f.optionen) {
        el = document.createElement("select");
        f.optionen.forEach(o => el.add(new Option(o, o)));
        el.value = f.wert;
        el.addEventListener("change", () => { this._sichtbarkeit(); this.cb(); });
        label.style.gridColumn = "1 / -1"; // Profilauswahl über die volle Breite
      } else if (f.text) {
        el = document.createElement("textarea");
        el.rows = f.zeilen || 8; el.value = f.wert; el.spellcheck = false;
        el.autocapitalize = "off"; el.autocomplete = "off";
        el.addEventListener("input", () => this.cb());
        label.style.gridColumn = "1 / -1";
      } else {
        el = document.createElement("input");
        el.type = "number"; el.step = "any"; el.value = f.wert;
        el.addEventListener("input", () => { this._sichtbarkeit(); this.cb(); });
      }
      el.id = `${this.box.id}-${f.id}`;
      label.id = `${el.id}-label`;
      label.appendChild(el);
      this.box.appendChild(label);
    }
    this._sichtbarkeit();
  }

  /** Felder mit zeigeWenn(werte) nur einblenden, wenn die Bedingung erfüllt ist (z. B. Einzelstege nur im Sonderfall). */
  _sichtbarkeit() {
    const werte = {};
    for (const f of this.klasse.felder) {
      const el = document.getElementById(`${this.box.id}-${f.id}`);
      werte[f.id] = (f.optionen || f.text) ? el.value : Number(el.value);
    }
    for (const f of this.klasse.felder) {
      if (f.zeigeWenn) document.getElementById(`${this.box.id}-${f.id}-label`).classList.toggle("versteckt", !f.zeigeWenn(werte));
    }
  }

  /** Querschnitt aus den Feldern erzeugen (wirft Error bei ungültigen Maßen). */
  erzeuge() {
    const K = this.klasse, werte = {};
    for (const f of K.felder) {
      const id = `${this.box.id}-${f.id}`;
      werte[f.id] = (f.optionen || f.text) ? document.getElementById(id).value : zahl(id);
    }
    return new K(werte);
  }
}

/* ======================= Querschnittsskizze ======================= */

/** Zeichnet den Querschnitt mit Schwerachsen, Hauptmaßen, plastischen Nulllinien und ggf. Hauptachsen. */
class QSkizze {
  constructor(canvas) { this.cv = canvas; }

  /**
   * @param {Querschnitt} q
   * @param {Object} opt {pna: {y, z}} = Lage der plastischen Nulllinien relativ zum Schwerpunkt [mm]
   */
  zeichne(q, opt = {}) {
    const { g, w, h } = canvasVorbereiten(this.cv);
    if (w === 0 || h === 0) return;
    const m = 36;
    const sk = Math.min((w - 2 * m) / q.breite, (h - 2 * m) / q.hoehe);
    const ox = w / 2 - (q.ymin + q.ymax) / 2 * sk;
    const oy = h / 2 - (q.zmin + q.zmax) / 2 * sk;
    const X = y => ox + y * sk, Y = z => oy + z * sk;

    // Fläche aus Zellen
    g.fillStyle = "#b9c2cf";
    for (const c of q.zellenAuto(5000)) g.fillRect(X(c.y - c.dy / 2), Y(c.z - c.dz / 2), c.dy * sk + 0.6, c.dz * sk + 0.6);

    // Schwerachsen (elastische Nulllinien)
    g.save(); g.setLineDash([8, 4]); g.lineWidth = 1.5;
    g.strokeStyle = "#c0392b"; g.beginPath(); g.moveTo(X(q.ymin) - 14, Y(0)); g.lineTo(X(q.ymax) + 14, Y(0)); g.stroke();
    g.strokeStyle = "#2874a6"; g.beginPath(); g.moveTo(X(0), Y(q.zmin) - 14); g.lineTo(X(0), Y(q.zmax) + 14); g.stroke();
    g.restore();
    g.font = "12px system-ui, sans-serif";
    g.fillStyle = "#c0392b"; g.fillText("y", X(q.ymax) + 16, Y(0) + 4);
    g.fillStyle = "#2874a6"; g.fillText("z", X(0) + 5, Y(q.zmax) + 26);

    // Hauptachsen (nur bei unsymmetrischen Querschnitten): violett punktiert
    if (q.unsymmetrisch) {
      const a = q.alphaHaupt, L = 0.62 * Math.max(q.breite, q.hoehe) * sk;
      g.save(); g.setLineDash([2, 4]); g.strokeStyle = "#8e44ad"; g.fillStyle = "#8e44ad"; g.lineWidth = 2;
      [["1", a], ["2", a + Math.PI / 2]].forEach(([n, w2]) => {
        const dx = Math.cos(w2) * L, dy = Math.sin(w2) * L;
        g.beginPath(); g.moveTo(X(0) - dx, Y(0) - dy); g.lineTo(X(0) + dx, Y(0) + dy); g.stroke();
        g.fillText(n, X(0) + dx * 1.07, Y(0) + dy * 1.07 + 4);
      });
      g.restore();
    }

    // Plastische Nulllinien (grün, durchgezogen)
    if (opt.pna) {
      g.save(); g.strokeStyle = "#1b7f3b"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(q.ymin) - 14, Y(opt.pna.z)); g.lineTo(X(q.ymax) + 14, Y(opt.pna.z)); g.stroke();
      g.beginPath(); g.moveTo(X(opt.pna.y), Y(q.zmin) - 14); g.lineTo(X(opt.pna.y), Y(q.zmax) + 14); g.stroke();
      g.restore();
    }

    // Hauptmaße
    g.fillStyle = "#333"; g.textAlign = "center";
    g.fillText(`b = ${fmt(q.breite, 1)} mm`, X(0), Y(q.zmin) - 20);
    g.save(); g.translate(X(q.ymin) - 12, Y(0) + 60); g.rotate(-Math.PI / 2);
    g.fillText(`h = ${fmt(q.hoehe, 1)} mm`, 0, 0); g.restore();
    g.textAlign = "left";
  }
}

/* ======================= Anzeige: Querschnittswerte ======================= */

/** Rein geometrische Werte. Elastische und plastische Widerstandsmomente stehen nur hier (nicht noch einmal bei der Tragfähigkeit). */
class QuerschnittswerteAnzeige {
  /** HTML-Tabelle aller Querschnittswerte. */
  static html(q) {
    // linke Tabelle: Geometrie und Trägheit
    let g = "<table>";
    g += zeile(lbl("Breite b", "breite"), fmt(q.breite, 1), "mm");
    g += zeile(lbl("Höhe h", "hoehe"), fmt(q.hoehe, 1), "mm");
    g += zeile(lbl("<b>Fläche A</b>", "A"), `<b>${fmt(q.A / 100, 2)}</b>`, "cm²");
    g += zeile(lbl("Masse (Stahl)", "masse"), fmt(q.masse, 1), "kg/m");
    g += zeile(lbl("z<sub>s</sub> von oben", "zs"), fmt(Math.abs(q.zmin), 1), "mm");
    g += zeile("z<sub>s</sub> von unten", fmt(q.zmax, 1), "mm");
    g += zeile(lbl("y<sub>s</sub> von links", "ys"), fmt(Math.abs(q.ymin), 1), "mm");
    g += zeile(lbl("<b>I<sub>y</sub></b>", "Iy"), `<b>${fmt(q.Iy / 1e4, 1)}</b>`, "cm⁴");
    g += zeile(lbl("<b>I<sub>z</sub></b>", "Iz"), `<b>${fmt(q.Iz / 1e4, 1)}</b>`, "cm⁴");
    if (q.unsymmetrisch) {
      g += zeile(lbl("I<sub>yz</sub>", "Iyz"), fmt(q.Iyz / 1e4, 1), "cm⁴");
      g += zeile(lbl("I<sub>1</sub> (Hauptachse)", "hauptachsen"), fmt(q.I1 / 1e4, 1), "cm⁴");
      g += zeile("I<sub>2</sub> (Hauptachse)", fmt(q.I2 / 1e4, 1), "cm⁴");
      g += zeile("α (Hauptachse 1)", fmt(q.alphaHaupt * 180 / Math.PI, 2), "°");
    }
    g += zeile(lbl("I<sub>p</sub>", "Ip"), fmt(q.Ip / 1e4, 1), "cm⁴");
    g += zeile(lbl("i<sub>y</sub>", "iy"), fmt(q.iy / 10, 2), "cm");
    g += zeile(lbl("i<sub>z</sub>", "iz"), fmt(q.iz / 10, 2), "cm");
    g += "</table>";

    // rechte Tabelle: Widerstandsmomente und plastische Größen
    let w = "<table>";
    w += zeile(lbl("<b>W<sub>el,y,o</sub></b> (oben)", "Wyo"), `<b>${fmt(q.Wyo / 1e3, 2)}</b>`, "cm³");
    w += zeile(lbl("<b>W<sub>el,y,u</sub></b> (unten)", "Wyu"), `<b>${fmt(q.Wyu / 1e3, 2)}</b>`, "cm³");
    w += zeile(lbl("<b>W<sub>el,z</sub></b>", "Wz"), `<b>${fmt(q.Wz / 1e3, 2)}</b>`, "cm³");
    w += zeile(lbl("<b>W<sub>pl,y</sub></b>", "Wpl"), `<b>${fmt(q.Wply / 1e3, 2)}</b>`, "cm³");
    w += zeile(lbl("<b>W<sub>pl,z</sub></b>", "Wpl"), `<b>${fmt(q.Wplz / 1e3, 2)}</b>`, "cm³");
    w += zeile(lbl("α<sub>pl,y</sub>", "alpha"), fmt(q.Wply / q.Wely, 3), "–");
    w += zeile("α<sub>pl,z</sub>", fmt(q.Wplz / q.Welz, 3), "–");
    w += zeile(lbl("pl. NL y–y", "pna"), fmt(q.plastisch("y").lage, 1), "mm");
    w += zeile("pl. NL z–z", fmt(q.plastisch("z").lage, 1), "mm");
    w += zeile(lbl("S<sub>y</sub> (obere Hälfte)", "Sy"), fmt(q.Sy / 1e3, 2), "cm³");
    w += "</table>";

    let h = `<div class="qw-spalten">${g}${w}</div>`;
    h += '<p class="hinweis">α<sub>pl</sub> = W<sub>pl</sub>/W<sub>el</sub>. pl. NL: Lage der plastischen Nulllinie vom Schwerpunkt (positiv nach unten bzw. rechts).</p>';
    if (q.unsymmetrisch) h += '<p class="hinweis">Unsymmetrischer Querschnitt: y und z sind keine Hauptachsen (I<sub>yz</sub> ≠ 0).</p>';
    return h;
  }
}

/* ======================= Anzeige: Querschnittsklassifizierung ======================= */

class KlassifizierungAnzeige {
  /** @param r Ergebnis von Stahlbemessung.berechne(), @param ep Ergebnis von PlastischerNachweis.berechne() */
  static html(r, ep) {
    if (!r.klassen) return '<p class="hinweis">Für diese Querschnittsform ist keine Klassifizierung hinterlegt (E-P nicht möglich).</p>';
    let h = "<ul>";
    for (const [name, k] of [["Biegung y–y", r.klassen.biegungY], ["Biegung z–z", r.klassen.biegungZ], ["Druck", r.klassen.druck]]) {
      const teile = k.teile.map(t => `${t.name} c/t = ${fmt(t.ct, 1)} (Kl. ${t.klasse})`).join(", ");
      h += `<li>${name}: <b>Klasse ${k.klasse}</b>${teile ? " – " + teile : ""}${k.hinweis ? " – " + k.hinweis : ""}</li>`;
    }
    h += "</ul>";
    const kl = ep.klasseMax;
    if (r.klassen.hinweis) h += `<p class="hinweis">${r.klassen.hinweis}</p>`;
    h += `<p><b>Maßgebende Klasse für die vorhandene Beanspruchung: ${kl}</b> – ` +
      (kl <= 2 ? '<span class="ok">plastische Bemessung (E-P) möglich</span>' : '<span class="fehler">nur elastische Bemessung (E-E)</span>') + "</p>";
    if (kl === 4) h += '<p class="hinweis">Klasse 4: Beulen (wirksamer Querschnitt) wird nicht berechnet.</p>';
    return h;
  }
}

/* ======================= Anzeige: Tragfähigkeit (Stahl) ======================= */

class TragfaehigkeitAnzeige {
  /** Ergebnisse als HTML. @param ep Ergebnis von PlastischerNachweis.berechne(), @param {boolean} plastisch E-P-Nachweis anzeigen */
  static html(q, r, ep, plastisch) {
    const zOS = (v, d) => (v === null ? "–" : fmt(v, d));
    const haken = ok => ok ? '<span class="ok">✓</span>' : '<span class="fehler">✗</span>';

    let h = "<table>";
    h += zeile(lbl("f<sub>y</sub>", "fy"), fmt(r.fy, 0), "N/mm²");
    h += zeile(lbl("ε = √(235/f<sub>y</sub>)", "eps"), fmt(r.eps, 3), "–");
    h += "</table>";

    h += "<p><b>Querschnittswiderstände</b></p><table><tr><th></th><th>y–y</th><th>z–z</th><th></th></tr>";
    h += zeileN(lbl("M<sub>el,Rd</sub>", "Mel"), fmt(r.y.Mel, 1), fmt(r.z.Mel, 1), "kNm");
    h += zeileN(lbl("M<sub>pl,Rd</sub>", "Mpl"), fmt(r.y.Mpl, 1), fmt(r.z.Mpl, 1), "kNm");
    h += zeileN(lbl("<b>M<sub>c,Rd</sub></b>", "Mc"), `<b>${zOS(r.y.Mc, 1)}</b>`, `<b>${zOS(r.z.Mc, 1)}</b>`, "kNm");
    h += zeileN(lbl("A<sub>v</sub>", "Av"), r.Av && r.Av.z ? fmt(r.Av.z / 100, 2) : "–", r.Av && r.Av.y ? fmt(r.Av.y / 100, 2) : "–", "cm²");
    h += zeileN(lbl("<b>V<sub>pl,Rd</sub></b>", "Vpl"), `<b>${zOS(r.Vz, 1)}</b>`, `<b>${zOS(r.Vy, 1)}</b>`, "kN");
    h += "</table>";
    h += "<table>";
    h += zeile(lbl("N<sub>pl,Rd</sub>", "Npl"), fmt(r.Npl, 1), "kN");
    h += "</table>";
    h += '<p class="hinweis">V<sub>pl,Rd</sub> in der Spalte y–y gilt für V<sub>z</sub> (parallel zum Steg), in der Spalte z–z für V<sub>y</sub>.</p>';

    // ---- Plastischer Nachweis E-P (nur im Modus E-P) ----
    if (plastisch) {
    h += `<h3>Plastischer Nachweis E-P ${infoBtn("epNachweis")}</h3>`;
    if (ep.zulaessig === false) {
      h += `<p class="fehler">Querschnittsklasse ${ep.klasseMax}: plastische Nachweise sind nur für Klasse 1 und 2 zulässig. Die Werte dienen nur der Orientierung, maßgebend ist der elastische Nachweis (Vergleichsspannung).</p>`;
    } else if (ep.zulaessig === null) {
      h += '<p class="hinweis">Querschnittsklasse nicht ermittelt: Die plastischen Nachweise gelten nur, wenn Klasse 1 oder 2 sichergestellt ist.</p>';
    }
    h += "<table><tr><th></th><th>y–y</th><th>z–z</th><th></th></tr>";
    h += zeileN("V<sub>Ed</sub>", fmt(ep.y.V, 1), fmt(ep.z.V, 1), "kN");
    h += zeileN("V<sub>Ed</sub> / V<sub>pl,Rd</sub>", zOS(ep.y.Vpl ? ep.y.etaV : null, 3), zOS(ep.z.Vpl ? ep.z.etaV : null, 3), "");
    h += zeileN(lbl("ρ", "rho"), fmt(ep.y.rho, 3), fmt(ep.z.rho, 3), "");
    h += zeileN(lbl("M<sub>V,Rd</sub>", "MV"), fmt(ep.y.MV, 1), fmt(ep.z.MV, 1), "kNm");
    h += zeileN(lbl("M<sub>N,Rd</sub> (n = " + fmt(ep.n, 3) + ")", "MN"), fmt(ep.y.MN, 1), fmt(ep.z.MN, 1), "kNm");
    h += zeileN("<b>M<sub>N,V,Rd</sub></b>", `<b>${fmt(ep.y.MNV, 1)}</b>`, `<b>${fmt(ep.z.MNV, 1)}</b>`, "kNm");
    h += zeileN("M<sub>Ed</sub>", fmt(ep.y.M, 1), fmt(ep.z.M, 1), "kNm");
    h += zeileN("M<sub>Ed</sub> / M<sub>N,V,Rd</sub>", fmt(ep.y.M / ep.y.MNV, 3), fmt(ep.z.M / ep.z.MNV, 3), "");
    h += "</table>";
    const pz = v => (Number.isFinite(v) ? fmt(v * 100, 1) + " %" : "∞");
    const okz = v => (v <= 1 + 1e-9 ? '<span class="ok">✓</span>' : '<span class="fehler">✗</span>');
    h += "<p><b>Ausnutzungen</b></p><table>";
    h += zeile("Querkraft V<sub>z</sub> / V<sub>pl,z,Rd</sub>", pz(ep.y.etaV), okz(ep.y.etaV));
    h += zeile("Querkraft V<sub>y</sub> / V<sub>pl,y,Rd</sub>", pz(ep.z.etaV), okz(ep.z.etaV));
    h += zeile("Normalkraft N / N<sub>pl,Rd</sub>", pz(ep.n), okz(ep.n));
    h += zeile("Biegung + N + V (Interaktion)", pz(ep.eta), okz(ep.eta));
    h += "</table>";
    const ok = ep.etaMax <= 1 + 1e-9;
    const eta = Number.isFinite(ep.eta) ? fmt(ep.eta * 100, 1) + " %" : "∞";
    h += `<p>Interaktion ${infoBtn("interaktion")} (α = ${fmt(ep.alpha, 2)}, β = ${fmt(ep.beta, 2)}): <b>${eta}</b><br>` +
         `<b>Ausnutzung E-P = ${Number.isFinite(ep.etaMax) ? fmt(ep.etaMax * 100, 1) + " %" : "∞"}</b> ${haken(ok)}` +
         `<div class="balken"><i class="${ok ? "" : "zu-viel"}" style="width:${Math.min(100, ep.etaMax * 100) || 0}%"></i></div></p>`;
    }

    // Hinweise
    const hinweise = [];
    if (!r.klassen) hinweise.push("Querschnittsklasse für diese Form nicht ermittelt: M<sub>c,Rd</sub> nicht angegeben.");
    if (q.unsymmetrisch) hinweise.push("Unsymmetrischer Querschnitt: Die Tragfähigkeiten gelten für die Achsen y und z, nicht für die Hauptachsen.");
    if (r.Av && r.Av.hinweis) hinweise.push(r.Av.hinweis);
    if (plastisch) hinweise.push(`Interaktion: ${ep.bem}.`);
    h += "<ul>" + hinweise.map(t => `<li>${t}</li>`).join("") + "</ul>";
    return h;
  }
}

/* ======================= Anzeige: Spannungen ======================= */

/** Klassisches Spannungsdiagramm σ(z) bzw. σ(y) entlang der Schwerachsen (zeigt Fließplateaus bei E-P). */
class ProfilDiagramm {
  constructor(canvas) { this.cv = canvas; }

  /** @param sp Spannung oder ElastoPlastischeSpannung, @param {number} fyd [N/mm²] */
  zeichne(q, sp, fyd) {
    const { g, w, h } = canvasVorbereiten(this.cv);
    if (!w || !h) return;
    const koeff = sp.koeff;
    const plastisch = sp instanceof ElastoPlastischeSpannung;
    const tz = Math.abs(koeff.bz) > 1e-9, ty = Math.abs(koeff.by) > 1e-9;
    const felder = [];
    if (tz || !ty) felder.push({ name: "z", lo: q.zmin, hi: q.zmax, f: z => sp.sigma(0, z), lin: z => koeff.a0 + koeff.bz * z });
    if (ty) felder.push({ name: "y", lo: q.ymin, hi: q.ymax, f: y => sp.sigma(y, 0), lin: y => koeff.a0 + koeff.by * y });
    const smax = Math.max(fyd, ...felder.map(d => Math.max(Math.abs(d.f(d.lo)), Math.abs(d.f(d.hi)))));
    const bw = w / felder.length;
    felder.forEach((d, i) => this._panel(g, d, i * bw, bw, h, smax, fyd, plastisch));
  }

  _panel(g, d, x0, bw, h, smax, fyd, plastisch) {
    const pad = 26, xm = x0 + bw / 2, sk = (bw / 2 - pad - 8) / smax, hh = h - 2 * pad, k = hh / (d.hi - d.lo);
    const Y = c => pad + (d.name === "z" ? (c - d.lo) * k : (d.hi - c) * k);   // z nach unten; für y-Achse: Platzhalter vertikal
    const X = s => xm + s * sk;
    g.font = "11px system-ui, sans-serif"; g.textAlign = "center";
    // Grenzen ±fyd und Mittelachse
    g.setLineDash([5, 4]); g.strokeStyle = "#d9822b"; g.lineWidth = 1;
    for (const v of [fyd, -fyd]) { g.beginPath(); g.moveTo(X(v), pad - 6); g.lineTo(X(v), h - pad + 6); g.stroke(); }
    g.setLineDash([]); g.strokeStyle = "#888";
    g.beginPath(); g.moveTo(xm, pad - 6); g.lineTo(xm, h - pad + 6); g.stroke();
    g.fillStyle = "#a85d10"; g.fillText("−f_yd", X(-fyd), pad - 10); g.fillText("+f_yd", X(fyd), pad - 10);
    // ungedeckelter linearer Verlauf (E·ε) gestrichelt
    if (plastisch) {
      g.setLineDash([3, 3]); g.strokeStyle = "#999"; g.beginPath();
      g.moveTo(X(d.lin(d.lo)), Y(d.lo)); g.lineTo(X(d.lin(d.hi)), Y(d.hi)); g.stroke(); g.setLineDash([]);
    }
    // Spannungsverlauf als gefüllte Fläche (Zug rot, Druck blau)
    const n = 120, pts = [];
    for (let i = 0; i <= n; i++) { const c = d.lo + (d.hi - d.lo) * i / n; pts.push([X(d.f(c)), Y(c), d.f(c)]); }
    for (let i = 0; i < n; i++) {
      const [xa, ya, sa] = pts[i], [xb, yb, sb] = pts[i + 1], s = (sa + sb) / 2;
      g.fillStyle = s >= 0 ? "rgba(220,60,60,.55)" : "rgba(60,90,220,.55)";
      g.beginPath(); g.moveTo(xm, ya); g.lineTo(xa, ya); g.lineTo(xb, yb); g.lineTo(xm, yb); g.closePath(); g.fill();
    }
    g.strokeStyle = "#222"; g.lineWidth = 1.6; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.lineWidth = 1;
    g.fillStyle = "#222"; g.textAlign = "left";
    g.fillText(d.name === "z" ? "σ(z) längs der z-Achse (oben → unten)" : "σ(y) längs der y-Achse", x0 + 6, h - 6);
  }
}

class SpannungsAnzeige {
  constructor() {
    this.punkte = [];                       // vom Nutzer gesetzte Punkte {y, z}
    this.feld = "sigma";                    // dargestelltes Feld: sigma | tau | v
    this.ansicht = new Ansicht3D(document.getElementById("canvas3d"));
    this.profil = new ProfilDiagramm(document.getElementById("sp-profil"));
    this.letzte = null;
    document.getElementById("pt-add").addEventListener("click", () => {
      this.punkte.push({ y: zahl("pt-y"), z: zahl("pt-z") });
      this.neuZeichnen();
    });
    document.querySelector("#pt-tabelle tbody").addEventListener("click", e => {
      const i = e.target.dataset.loesche;
      if (i !== undefined) { this.punkte.splice(Number(i), 1); this.neuZeichnen(); }
    });
    document.querySelectorAll("[data-ansicht]").forEach(btn => btn.addEventListener("click", () => {
      const [az, el] = btn.dataset.ansicht.split(",").map(Number);
      this.ansicht.setzeAnsicht(az, el);
    }));
    document.querySelectorAll("[data-feld]").forEach(btn => btn.addEventListener("click", () => {
      this._setzeFeld(btn.dataset.feld);
      this.neuZeichnen();
    }));
    document.getElementById("zoom-plus").addEventListener("click", () => this.ansicht.zoomen(1.25));
    document.getElementById("zoom-minus").addEventListener("click", () => this.ansicht.zoomen(1 / 1.25));
  }

  /**
   * Alles mit neuen Daten anzeigen.
   * @param sp Spannung (E-E, linear) oder ElastoPlastischeSpannung (E-P, nichtlinear) - beide haben dieselbe Schnittstelle
   * @param {number} fyd Bemessungsstreckgrenze [N/mm²]
   */
  zeige(q, sp, schub, fyd, ep) {
    const plastisch = sp instanceof ElastoPlastischeSpannung;
    const felder = { sigma: new Spannungsfeld(sp, schub, "sigma"), tau: new Spannungsfeld(sp, schub, "tau") };
    if (!plastisch) felder.v = new Spannungsfeld(sp, schub, "v");      // σ_v nur für den elastischen Nachweis
    if (plastisch && this.feld === "v") this._setzeFeld("sigma");
    document.querySelector('[data-feld="v"]').style.display = plastisch ? "none" : "";
    this.letzte = { q, sp, schub, fyd, felder, plastisch, ep };
    this.neuZeichnen();
  }

  /** Dargestelltes Feld wählen und Knöpfe markieren. */
  _setzeFeld(f) {
    this.feld = f;
    document.querySelectorAll("[data-feld]").forEach(b => b.classList.toggle("aktiv", b.dataset.feld === f));
  }

  neuZeichnen() {
    if (!this.letzte) return;
    const { q, sp, schub, fyd, felder, plastisch, ep } = this.letzte;
    if (plastisch) this.nachweisEP(sp, felder, fyd, ep); else this.nachweis(felder, fyd);
    this.zeigePunkte(q, felder.sigma, schub);
    const grenze = this.feld === "tau" ? fyd / Math.sqrt(3) : fyd;
    this.ansicht.setzeDaten(q, felder[this.feld], this.punkte, grenze);
    this.profil.zeichne(q, sp, fyd);
    document.getElementById("sp-profil-hinweis").textContent = plastisch
      ? "Spannungsdiagramm: durchgezogen = tatsächliche Spannung (an den Rändern auf ±f_yd begrenzt), gestrichelt grau = linear fortgesetzte Dehnungsebene (E·ε)."
      : "Spannungsdiagramm: linearer Verlauf (E-E); orange gestrichelt: ±f_yd.";
  }

  /** Extremwerte und Vergleich mit f_yd (elastischer Nachweis mit der Vergleichsspannung). */
  nachweis(felder, fyd) {
    const es = felder.sigma.extremwerte(), et = felder.tau.extremwerte(), ev = felder.v.extremwerte();
    const ausn = ev.max.wert / fyd, ok = ausn <= 1 + 1e-9;
    const haken = ok ? '<span class="ok">✓</span>' : '<span class="fehler">✗</span>';
    const ort = e => nb(`bei y = ${fmt(e.y, 1)}, z = ${fmt(e.z, 1)} mm`);
    document.getElementById("sp-nachweis").innerHTML =
      `${nb(`f<sub>yd</sub> = <b>${fmt(fyd, 1)}</b> N/mm²`)} ${infoBtn("ausnutzung")}<br>` +
      `${nb(`σ<sub>max</sub> = <b>${fmt(es.max.wert)}</b>`)} ${nb(`σ<sub>min</sub> = <b>${fmt(es.min.wert)}</b> N/mm²`)} ${infoBtn("sigmaExtrem")}<br>` +
      `${nb(`τ<sub>max</sub> = <b>${fmt(et.max.wert)}</b> N/mm²`)} ${infoBtn("tau")}<br>` +
      `${nb(`σ<sub>v,max</sub> = <b>${fmt(ev.max.wert)}</b> N/mm²`)} ${ort(ev.max)} ${infoBtn("vergleich")}<br>` +
      `<b>Ausnutzung σ<sub>v,max</sub> / f<sub>yd</sub> = ${fmt(ausn * 100, 1)} %</b> ${haken}` +
      `<div class="balken"><i class="${ok ? "" : "zu-viel"}" style="width:${Math.min(100, ausn * 100)}%"></i></div>` +
      `<span class="hinweis">Nulllinie ${infoBtn("nulllinie")}</span>`;
  }

  /** Zustandsanzeige für E-P: Zustand, Fließanteil, Extremwerte (Nachweis selbst: siehe Tragfähigkeit). */
  nachweisEP(sp, felder, fyd, ep) {
    const ok = ep.etaMax <= 1 + 1e-9, ausn = Number.isFinite(ep.etaMax) ? fmt(ep.etaMax * 100, 1) + " %" : "∞";
    const es = felder.sigma.extremwerte(), et = felder.tau.extremwerte();
    const eps = sp.epsMax > 100 ? "> 100" : fmt(sp.epsMax, 2);
    let h = `${nb(`f<sub>yd</sub> = <b>${fmt(fyd, 1)}</b> N/mm²`)} ${infoBtn("berechnungsart")}<br>` +
      `Zustand: <b>${sp.zustand}</b> (${fmt(sp.plastAnteil * 100, 1)} % der Fläche fließen)<br>` +
      `${nb(`σ<sub>max</sub> = <b>${fmt(es.max.wert)}</b>`)} ${nb(`σ<sub>min</sub> = <b>${fmt(es.min.wert)}</b> N/mm²`)}<br>` +
      `${nb(`ε<sub>max</sub>/ε<sub>y</sub> = <b>${eps}</b>`)} (größte Randdehnung)<br>` +
      `${nb(`τ<sub>max</sub> = <b>${fmt(et.max.wert)}</b> N/mm²`)} ${infoBtn("tau")} (elastisch)<br>` +
      `<span class="hinweis">Dehnungsnulllinie ${infoBtn("nulllinie")}</span><br>` +
      `<b>Ausnutzung E-P = ${ausn}</b> ${infoBtn("epNachweis")} ${ok ? '<span class="ok">✓</span>' : '<span class="fehler">✗</span>'}` +
      `<div class="balken"><i class="${ok ? "" : "zu-viel"}" style="width:${Math.min(100, ep.etaMax * 100) || 0}%"></i></div>`;
    if (sp.ueberlast) h += `<br><span class="fehler">Die Beanspruchung (N, M) übersteigt die Traglast des Querschnitts. Dargestellt ist der Grenzzustand bei ${fmt(sp.lambda * 100, 1)} % der Beanspruchung.</span>`;
    document.getElementById("sp-nachweis").innerHTML = h;
  }

  /** Punkttabelle mit σ, τ und σ_v füllen. */
  zeigePunkte(q, feldSigma, schub) {
    const sp = feldSigma.sp, plastisch = sp instanceof ElastoPlastischeSpannung;
    const tb = document.querySelector("#pt-tabelle tbody");
    let ausserhalb = false;
    tb.innerHTML = this.punkte.map((p, i) => {
      const aussen = !q.enthaelt(p.y, p.z);
      ausserhalb = ausserhalb || aussen;
      const sig = sp.sigma(p.y, p.z), tau = schub.tau(p.y, p.z).t;
      return `<tr><td>P${i + 1}${aussen ? " *" : ""}</td><td>${fmt(p.y, 1)}</td><td>${fmt(p.z, 1)}</td>` +
             `<td>${fmt(sig, 1)}</td><td>${fmt(tau, 1)}</td><td>${plastisch ? "–" : fmt(Math.sqrt(sig * sig + 3 * tau * tau), 1)}</td>` +
             `<td><button data-loesche="${i}" title="Löschen">✕</button></td></tr>`;
    }).join("");
    document.getElementById("pt-hinweis").textContent = ausserhalb
      ? "* Punkt liegt außerhalb des Querschnitts (Werte gelten für die verlängerte Spannungsebene)."
      : "Koordinaten in mm, Spannungen in N/mm².";
  }
}

/* ======================= Seite Stahlbau ======================= */

/** Eine Eingabe (Querschnitt, Stahlgüte, Schnittgrößen) – alle Ergebnisse auf einer Seite. */
class StahlbauSeite {
  constructor() {
    this.skizze = new QSkizze(document.getElementById("st-skizze"));
    this.spannung = new SpannungsAnzeige();
    this.wahl = new QuerschnittWahl("st-typ", "st-felder", () => this.aktualisiere(), "ipe", "st-slots", {
      holen: () => Object.fromEntries(SchnittgroessenIds.map(id => [id, document.getElementById(id).value])),
      setzen: o => SchnittgroessenIds.forEach(id => { if (o[id] !== undefined) document.getElementById(id).value = o[id]; }),
    });

    const sel = document.getElementById("st-guete");
    STAHLGUETEN.forEach(([name]) => sel.add(new Option(name, name)));
    sel.value = "S355";
    sel.addEventListener("change", () => this.aktualisiere());
    this.plastischGewuenscht = false;                    // Schalter E-E / E-P
    document.querySelectorAll("[data-modus]").forEach(b => b.addEventListener("click", () => {
      this.plastischGewuenscht = b.dataset.modus === "ep";
      this.aktualisiere();
    }));
    document.getElementById("st-gm0").addEventListener("input", () => this.aktualisiere());
    // Schnittgrößen gehören zum Reiter: Änderung wird im aktiven Reiter gespeichert
    for (const id of SchnittgroessenIds) document.getElementById(id).addEventListener("input", () => this.wahl.cb());
    // Schnittgrößen aus einem wählbaren anderen Reiter in den aktuellen Reiter kopieren
    document.getElementById("sg-uebernehmen").addEventListener("click", () => {
      const i = Number(document.getElementById("sg-quelle").value);
      const z = this.wahl.slots[i] && this.wahl.slots[i].zusatz;
      if (z && i !== this.wahl.aktiv) { this.wahl.zusatz.setzen(z); this.wahl.cb(); }
    });
    this.aktualisiere();
  }

  /** Querschnitt einmal erzeugen und an alle Anzeigen weitergeben. */
  aktualisiere() {
    const fehler = txt => {
      const f = `<span class="fehler">${txt}</span>`;
      for (const id of ["sp-nachweis", "qw-tabelle", "tf-ergebnis", "kl-ergebnis"]) document.getElementById(id).innerHTML = f;
    };
    let q;
    try { q = this.wahl.erzeuge(); } catch (e) { fehler(e.message); return; }

    const name = document.getElementById("st-guete").value;
    const fy = STAHLGUETEN.find(s => s[0] === name)[1];
    const gm0 = zahl("st-gm0") > 0 ? zahl("st-gm0") : 1;
    const [N, Vy, Vz, My, Mz] = SchnittgroessenIds.map(zahl);
    this._quellReiter();

    const r = new Stahlbemessung(q, fy, gm0).berechne();
    const ep = new PlastischerNachweis(q, fy, gm0, r).berechne(N, Vy, Vz, My, Mz);
    const schub = new Schubspannung(q, Vy, Vz);

    // E-P nur bei Klasse 1/2 möglich; sonst ist der Schalter gesperrt und es wird elastisch gerechnet
    const moeglich = ep.zulaessig === true;
    const plastisch = moeglich && this.plastischGewuenscht;
    this._modusAnzeige(moeglich, plastisch, ep);
    const sp = plastisch ? new ElastoPlastischeSpannung(q, N, My, Mz, fy / gm0) : new Spannung(q, N, My, Mz);

    document.getElementById("qw-tabelle").innerHTML = QuerschnittswerteAnzeige.html(q);
    document.getElementById("kl-ergebnis").innerHTML = KlassifizierungAnzeige.html(r, ep);
    document.getElementById("tf-ergebnis").innerHTML = TragfaehigkeitAnzeige.html(q, r, ep, plastisch);
    document.getElementById("sp-titel").textContent = plastisch ? "Spannungen (elastisch-plastisch, E-P)" : "Spannungen (elastisch, E-E)";
    this.spannung.zeige(q, sp, schub, fy / gm0, ep);
    this.skizze.zeichne(q, { pna: { y: r.z.lage, z: r.y.lage } });
  }

  /** Auswahl der Quell-Reiter für die Übernahme: alle anderen Reiter, die Schnittgrößen gespeichert haben. */
  _quellReiter() {
    const sel = document.getElementById("sg-quelle"), alt = sel.value, w = this.wahl;
    const frei = (w.slots || []).map((z, i) => (z && z.zusatz && i !== w.aktiv ? i : -1)).filter(i => i >= 0);
    sel.innerHTML = frei.map(i => `<option value="${i}">aus Reiter ${i + 1}</option>`).join("");
    if (frei.map(String).includes(alt)) sel.value = alt;
    sel.disabled = document.getElementById("sg-uebernehmen").disabled = !frei.length;
  }

  /** Schalter E-E / E-P aktualisieren: E-P ist bei Klasse 3/4 oder unbekannter Klasse gesperrt. */
  _modusAnzeige(moeglich, plastisch, ep) {
    const knopfEP = document.querySelector('[data-modus="ep"]');
    knopfEP.disabled = !moeglich;
    document.querySelector('[data-modus="ee"]').classList.toggle("aktiv", !plastisch);
    knopfEP.classList.toggle("aktiv", plastisch);
    document.getElementById("st-modus-hinweis").textContent =
      ep.zulaessig === true ? (plastisch ? "Plastisch: Fließzonen und Durchplastizieren werden berücksichtigt." : "Elastisch gerechnet (E-P wäre möglich: Klasse " + ep.klasseMax + ").")
      : ep.zulaessig === false ? "E-P gesperrt: Querschnittsklasse " + ep.klasseMax + " (nur Klasse 1 und 2 zulässig)."
      : "E-P gesperrt: Querschnittsklasse nicht ermittelt.";
  }

  /** Beim Einblenden der Seite neu zeichnen (Zeichenflächen haben zuvor keine Größe). */
  zeige() { this.aktualisiere(); }
}

/* ======================= Skizze Stahlbeton (Querschnitt + Dehnungen) ======================= */

class SBSkizze {
  constructor(canvas) { this.cv = canvas; }

  leeren() { canvasVorbereiten(this.cv); }

  zeichne(q, res) {
    const { g, w, h } = canvasVorbereiten(this.cv);
    if (w === 0 || h === 0 || res.fehler) return;

    const pb = q.typ === "plattenbalken";
    const bmax = Math.max(q.b, q.bf);
    const rand = 12, oben = 28, unten = 14;
    const wSek = (w - 2 * rand) * 0.34;                      // Breite des Querschnittsfelds
    const sk = Math.min(wSek / bmax, (h - oben - unten) / q.h); // Pixel je mm
    const ox = rand + (wSek - bmax * sk) / 2, oy = oben;
    const X = y => ox + y * sk, Y = z => oy + z * sk;
    const xs = (bmax - q.b) / 2;                              // linker Rand des Stegs
    const zp = zc => res.negativ ? q.h - zc : zc;             // Abstand vom Druckrand -> Höhe von oben

    // Querschnittsform
    g.fillStyle = "#e8eaee"; g.strokeStyle = "#333"; g.lineWidth = 1.5;
    g.beginPath();
    if (pb) {
      g.moveTo(X(0), Y(0)); g.lineTo(X(bmax), Y(0)); g.lineTo(X(bmax), Y(q.hf));
      g.lineTo(X(xs + q.b), Y(q.hf)); g.lineTo(X(xs + q.b), Y(q.h)); g.lineTo(X(xs), Y(q.h));
      g.lineTo(X(xs), Y(q.hf)); g.lineTo(X(0), Y(q.hf));
    } else {
      g.rect(X(0), Y(0), q.b * sk, q.h * sk);
    }
    g.closePath(); g.fill(); g.stroke();

    // Druckzone (Spannungsblock)
    g.fillStyle = "rgba(40,90,200,0.35)";
    const s = res.s;
    if (res.negativ) {
      g.fillRect(X(xs), Y(q.h - s), q.b * sk, s * sk);
    } else if (pb) {
      g.fillRect(X(0), Y(0), bmax * sk, Math.min(s, q.hf) * sk);
      if (s > q.hf) g.fillRect(X(xs), Y(q.hf), q.b * sk, (s - q.hf) * sk);
    } else {
      g.fillRect(X(0), Y(0), q.b * sk, s * sk);
    }

    // Dehnungsnulllinie x
    const yx = zp(res.x);
    g.save(); g.setLineDash([6, 4]); g.strokeStyle = "#1f4e9a"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(0) - 4, Y(yx)); g.lineTo(X(bmax) + 4, Y(yx)); g.stroke(); g.restore();

    // Bewehrungslagen mit Beschriftung
    const zugY = zp(res.d), druckY = zp(q.d2);
    g.font = "11px system-ui, sans-serif";
    const lage = (zz, farbe, text, versatz) => {
      g.strokeStyle = farbe; g.lineWidth = 5;
      g.beginPath(); g.moveTo(X(xs + q.b * 0.1), Y(zz)); g.lineTo(X(xs + q.b * 0.9), Y(zz)); g.stroke();
      g.lineWidth = 3; g.strokeStyle = "#fff"; g.strokeText(text, X(xs) + 3, Y(zz) + versatz);
      g.fillStyle = farbe; g.fillText(text, X(xs) + 3, Y(zz) + versatz);
    };
    lage(zugY, "#c0392b", `As1 ${fmt(res.As1 / 100)}`, res.negativ ? 16 : -7);
    if (res.As2 > 0) lage(druckY, "#1b3a6b", `As2 ${fmt(res.As2 / 100)}`, res.negativ ? -7 : 16);

    // ---- Dehnungsdiagramm ----
    const dn = res.dehnung;
    if (!dn) return;
    const x0 = rand + wSek + 12, dw = (w - rand - x0) / 2 - 6;   // Spalte Dehnungen (Mitte); Spannungen folgen rechts
    const eps = zc => dn.kappa * (zc - res.x);
    const werte = dn.ebenen.map(e => e.eps);
    const epsMin = Math.min(...werte, 0), epsMax = Math.max(...werte, 0);
    const sc = dw * 0.52 / (epsMax - epsMin);               // Pixel je ‰
    const xz = x0 + (-epsMin) * sc;                           // Position der Nulllinie

    g.fillStyle = "#333"; g.fillText("ε [‰]", x0, 16);
    g.strokeStyle = "#888"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(xz, Y(0)); g.lineTo(xz, Y(q.h)); g.stroke();

    // Dehnungsgerade vom Druckrand zum Zugrand
    g.strokeStyle = "#1f4e79"; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(xz + eps(0) * sc, Y(zp(0))); g.lineTo(xz + eps(q.h) * sc, Y(zp(q.h)));
    g.stroke();

    // Ebenen: Hilfslinie, Punkt, Zahlenwert (Beschriftungen gegen Überlappung versetzt)
    const marken = dn.ebenen.map(e => ({ y: Y(zp(e.z)), px: xz + e.eps * sc, eps: e.eps }));
    const sortiert = [...marken].sort((a, b) => a.y - b.y);
    let letzte = -99;
    for (const m of sortiert) { m.ly = Math.max(m.y, letzte + 12); letzte = m.ly; }
    for (const m of marken) {
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = "#aaa"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(bmax) + 4, m.y); g.lineTo(m.px, m.y); g.stroke(); g.restore();
      g.fillStyle = "#1f4e79"; g.beginPath(); g.arc(m.px, m.y, 3.5, 0, 2 * Math.PI); g.fill();
      g.fillStyle = "#111"; g.textAlign = "right"; g.fillText(fmt(m.eps, 2), x0 + dw, m.ly + 4);
    }
    g.textAlign = "left";

    this._zeichneSpannungen(g, q, res, { x1: x0 + dw + 14, w, rand, Y, zp });
  }

  /**
   * Spannungsverlauf (rechte Spalte). Beton: Parabel-Rechteck-Diagramm aus der Dehnungsebene und
   * rechteckiger Spannungsblock; das gewählte Modell ist gefüllt, das andere gestrichelt (Vergleich).
   * Stahl: Pfeile (Zug rechts, Druck links). Beton und Stahl haben getrennte Maßstäbe.
   */
  _zeichneSpannungen(g, q, res, { x1, w, rand, Y, zp }) {
    const sp = res.spannung;
    if (!sp) return;
    const breite = w - rand - x1, xz = x1 + breite / 2;     // Nulllinie der Spannungen in der Mitte der Spalte
    const bMax = breite / 2 - 2;
    g.font = "11px system-ui, sans-serif";
    g.fillStyle = "#333"; g.textAlign = "left"; g.fillText("σ [N/mm²]", x1 - 2, 16);
    g.strokeStyle = "#888"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(xz, Y(0)); g.lineTo(xz, Y(q.h)); g.stroke();

    const breiteSig = sig => bMax * sig / res.fcd;           // Breite im Diagramm: f_cd entspricht bMax
    const modelle = {
      // Parabel-Rechteck: Polygon aus den Stützstellen (Spannung wird zur Nulllinie hin Null)
      pr: () => {
        g.beginPath(); g.moveTo(xz, Y(zp(0)));
        for (const p of sp.pr) g.lineTo(xz - breiteSig(p.sig), Y(zp(p.z)));
        g.lineTo(xz, Y(zp(res.x))); g.closePath();
      },
      // Spannungsblock: Rechteck der Höhe λ·x mit der Spannung η·f_cd
      block: () => {
        g.beginPath(); g.rect(xz - breiteSig(sp.sigC), Math.min(Y(zp(0)), Y(zp(res.sBlock))), breiteSig(sp.sigC), Math.abs(Y(zp(res.sBlock)) - Y(zp(0))));
      },
    };
    const anderes = res.modus === "pr" ? "block" : "pr";
    // Vergleichsmodell gestrichelt
    g.save(); g.setLineDash([4, 3]); g.strokeStyle = "#7a8fb5"; g.lineWidth = 1.2; modelle[anderes](); g.stroke(); g.restore();
    // gewähltes Modell gefüllt
    g.fillStyle = "rgba(40,90,200,0.35)"; g.strokeStyle = "#1f4e9a"; g.lineWidth = 1.6;
    modelle[res.modus](); g.fill(); g.stroke();

    // Betonspannung am Druckrand und Knickpunkt ε_c2 (Übergang Parabel -> Rechteck)
    g.fillStyle = "#111"; g.textAlign = "left";
    const yTop = Y(zp(0));
    g.fillText(`−${fmt(sp.sigCmax, 1)}`, xz - breiteSig(sp.sigCmax) - 2, yTop + (res.negativ ? -5 : 12));
    if (res.modus === "pr" && sp.epsTop > res.epsC2) {
      const zk = res.x * (1 - res.epsC2 / sp.epsTop);          // Tiefe, in der ε_c = ε_c2 erreicht wird
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = "#1f4e9a"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(xz - bMax - 2, Y(zp(zk))); g.lineTo(xz + 2, Y(zp(zk))); g.stroke(); g.restore();
      g.fillStyle = "#1f4e9a"; g.fillText("ε_c2", xz + 4, Y(zp(zk)) + (res.negativ ? -2 : 10));
    }

    // Bewehrung: Pfeil von der Nulllinie, Länge ~ Spannung/f_yd (Zug rechts, Druck links)
    const pfeil = (yPix, sigma, farbe) => {
      const l = bMax * 0.55 * Math.min(1, Math.abs(sigma) / res.fyd) * Math.sign(sigma);
      g.strokeStyle = farbe; g.fillStyle = farbe; g.lineWidth = 3;
      g.beginPath(); g.moveTo(xz, yPix); g.lineTo(xz + l, yPix); g.stroke();
      const r = Math.sign(l) * 6;
      g.beginPath(); g.moveTo(xz + l, yPix); g.lineTo(xz + l - r, yPix - 4); g.lineTo(xz + l - r, yPix + 4); g.closePath(); g.fill();
      g.fillStyle = "#111"; g.textAlign = l >= 0 ? "left" : "right";
      g.fillText(fmt(sigma, 0), xz + l + (l >= 0 ? 3 : -3), yPix - 6);
    };
    pfeil(Y(zp(res.d)), sp.sigS1, "#c0392b");
    if (res.As2 > 0) pfeil(Y(zp(q.d2)), -sp.sigS2, "#1b3a6b");
    g.textAlign = "left";
    g.fillStyle = "#666"; g.fillText("Maßstäbe getrennt", x1 - 2, Y(q.h) + 12);
    g.fillText(res.modus === "pr" ? "gestrichelt: Spannungsblock" : "gestrichelt: Parabel-Rechteck", x1 - 2, Y(q.h) + 24);
  }
}

/* ======================= Seite Massivbau: Stahlbeton ======================= */

class StahlbetonSeite {
  constructor() {
    this.skizze = new SBSkizze(document.getElementById("sb-skizze"));
    const sel = document.getElementById("sb-beton");
    BETONKLASSEN.forEach(k => sel.add(new Option(k[0], k[0])));
    sel.value = "C30/37";

    const ids = ["sb-typ", "sb-b", "sb-h", "sb-bf", "sb-hf", "sb-d1", "sb-d2", "sb-beton", "sb-stahl", "sb-linie", "sb-M"];
    ids.forEach(id => document.getElementById(id).addEventListener("input", () => this.aktualisiere()));
    this.aktualisiere();
  }

  /** Beim Einblenden der Seite neu zeichnen. */
  zeige() { this.aktualisiere(); }

  aktualisiere() {
    const typ = document.getElementById("sb-typ").value;
    document.querySelectorAll(".nur-pb").forEach(el => el.classList.toggle("versteckt", typ !== "plattenbalken"));
    document.getElementById("sb-lbl-b").innerHTML = typ === "plattenbalken" ? "Stegbreite b<sub>w</sub> [cm]" : "Breite b [cm]";

    const box = document.getElementById("sb-ergebnis");
    try {
      const q = new SBQuerschnitt({
        typ, b: zahl("sb-b"), h: zahl("sb-h"), bf: zahl("sb-bf"), hf: zahl("sb-hf"),
        d1: zahl("sb-d1"), d2: zahl("sb-d2"),
      });
      const beton = Beton.aus(document.getElementById("sb-beton").value);
      const res = new Biegebemessung(q, beton, new Betonstahl()).bemesse(zahl("sb-M"), document.getElementById("sb-linie").value);
      res.epsC2 = beton.epsC2; res.nPR = beton.nPR;   // für Tabelle und Skizze
      this.zeigeErgebnis(box, res);
      this.skizze.zeichne(q, res);
    } catch (e) {
      box.innerHTML = `<span class="fehler">${e.message}</span>`;
      this.skizze.leeren();
    }
  }

  zeigeErgebnis(box, r) {
    if (r.fehler) { box.innerHTML = `<span class="fehler">${r.fehler}</span>`; this.skizze.leeren(); return; }
    const haken = ok => ok ? '<span class="ok">✓</span>' : '<span class="fehler">✗</span>';

    let h = `<b>${r.fall}</b> – ${r.druckzone}${r.negativ ? " (Zug oben)" : ""}<br><span class="hinweis">Betonarbeitslinie: ${r.modus === "pr" ? "Parabel-Rechteck-Diagramm" : "rechteckiger Spannungsblock"}</span><table>`;
    h += zeile(lbl("f<sub>cd</sub>", "fcd"), fmt(r.fcd), "N/mm²");
    h += zeile(lbl("f<sub>yd</sub>", "fyd"), fmt(r.fyd), "N/mm²");
    if (r.modus === "pr") {
      h += zeile(lbl("n (Parabel-Rechteck)", "arbeitslinie"), fmt(r.nPR, 2), "–");
      h += zeile("ε<sub>c2</sub>", fmt(r.epsC2, 1), "‰");
    } else {
      h += zeile(lbl("λ", "lambdaEta"), fmt(r.lambda), "–");
      h += zeile("η", fmt(r.eta), "–");
    }
    h += zeile(lbl("ε<sub>cu2</sub>", "epsCu2"), fmt(r.epsCu2, 1), "‰");
    h += zeile(lbl("Nutzhöhe d","d"), fmt(r.d / 10, 1), "cm");
    h += zeile(lbl("Druckzonenhöhe x","x"), fmt(r.x / 10, 1), "cm");
    h += zeile(lbl(`ξ = x/d (≤ ${fmt(r.xiLim, 2)})`,"xi"), fmt(r.xi, 3), haken(r.xiOk));
    h += zeile(lbl("A<sub>s1</sub> erforderlich","As1erf"), fmt(r.As1erf / 100), "cm²");
    h += zeile(lbl("A<sub>s,min</sub>","Asmin"), fmt(r.AsMin / 100), "cm²");
    h += zeile(lbl("<b>A<sub>s1</sub> maßgebend</b>","As1"), `<b>${fmt(r.As1 / 100)}</b>`, "cm²");
    if (r.As2 > 0) h += zeile(lbl("<b>A<sub>s2</sub> (Druckbewehrung)</b>","As2"), `<b>${fmt(r.As2 / 100)}</b>`, "cm²");
    h += zeile(lbl("A<sub>s,max</sub>","Asmax"), fmt(r.AsMax / 100), haken(r.AsMaxOk) + " cm²");
    h += "</table>";

    // Dehnungsebene über die relevanten Ebenen
    const dn = r.dehnung;
    if (dn) {
      const bereich = dn.bereich === 2
        ? `Bereich 2: Stahldehnung auf ε<sub>ud</sub> = ${fmt(dn.epsUd, 1)} ‰ begrenzt`
        : `Bereich 3: Betonstauchung ε<sub>cu2</sub> = ${fmt(r.epsCu2, 1)} ‰ maßgebend`;
      h += `<p><b>Dehnungsebene</b> ${infoBtn("dehnung")} – ${bereich}</p>`;
      h += "<table><tr><th>Ebene</th><th>Abstand Druckrand [cm]</th><th>ε [‰]</th></tr>";
      for (const e of dn.ebenen) h += `<tr><td>${e.name}</td><td>${fmt(e.z / 10, 1)}</td><td>${fmt(e.eps, 2)}</td></tr>`;
      h += "</table>";
      h += `<p>ε<sub>yd</sub> ${infoBtn("epsYd")} = ${fmt(dn.epsYd, 2)} ‰ → Zugbewehrung ${dn.fliesst ? "fließt" : "fließt nicht"} ${haken(dn.fliesst)}</p>`;
    }

    // Spannungen
    const sp = r.spannung;
    if (sp) {
      h += `<p><b>Spannungen</b> ${infoBtn("sbSpannung")}</p><table>`;
      h += zeile("Beton σ<sub>c</sub> am Druckrand", fmt(-sp.sigCmax, 1), "N/mm²");
      h += zeile("Betondruckkraft F<sub>c</sub>", fmt(r.Fc / 1e3, 0), "kN");
      h += zeile(r.modus === "pr" ? "Druckzonenhöhe x" : "Höhe des Blocks λ·x", fmt(r.s / 10, 1), "cm");
      h += zeile("Zugbewehrung σ<sub>s1</sub>", fmt(sp.sigS1, 1), "N/mm²");
      if (r.As2 > 0) h += zeile("Druckbewehrung σ<sub>s2</sub>", fmt(-sp.sigS2, 1), "N/mm²");
      h += "</table>";
    }

    h += `<p><b>Bewehrungsvorschlag A<sub>s1</sub></b> ${infoBtn("bewehrung")}</p>` + "<table><tr><th>Ø [mm]</th><th>Anzahl</th><th>A<sub>s,vorh</sub> [cm²]</th></tr>";
    for (const v of Biegebemessung.vorschlag(r.As1)) h += `<tr><td>Ø ${v.dm}</td><td>${v.n}</td><td>${fmt(v.As / 100)}</td></tr>`;
    h += "</table>";

    if (r.hinweise.length) h += "<ul>" + r.hinweise.map(t => `<li>${t}</li>`).join("") + "</ul>";
    box.innerHTML = h;
  }
}

/* ======================= Start ======================= */

/** Bereiche der App: Titel und zugehörige Seite (Sektion im HTML). */
const BEREICHE = {
  stahlbau: { titel: "Stahlbau", sektion: "stahlbau" },
  massivbau: { titel: "Massivbau", sektion: "stahlbeton" },
};

class App {
  constructor() {
    this.stahlbau = new StahlbauSeite();
    this.massivbau = new StahlbetonSeite();
    this.info = new InfoPanel();
    // Navigation über die Adresse (#start, #stahlbau, #massivbau): funktioniert mit Zurück-Taste
    window.addEventListener("hashchange", () => this.ausAdresse());
    this.ausAdresse();
  }

  /** Bereich aus dem URL-Fragment lesen und anzeigen (Standard: Startseite). */
  ausAdresse() {
    const name = location.hash.replace("#", "");
    if (!BEREICHE[name]) { this.zeigeSeite("start", "", "Statik-Rechner"); return; }
    const b = BEREICHE[name];
    this.zeigeSeite(b.sektion, b.titel, `${b.titel} – Statik-Rechner`);
    // Zeichenflächen sind erst jetzt sichtbar und werden neu gezeichnet
    (name === "stahlbau" ? this.stahlbau : this.massivbau).zeige();
  }

  zeigeSeite(sektion, titel, dokumentTitel) {
    document.querySelectorAll(".seite").forEach(s => s.classList.toggle("aktiv", s.id === "tab-" + sektion));
    document.getElementById("bereich-titel").textContent = titel ? "› " + titel : "";
    document.title = dokumentTitel;
    window.scrollTo(0, 0);
  }
}

window.addEventListener("DOMContentLoaded", () => new App());
