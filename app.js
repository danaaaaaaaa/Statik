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
  constructor(selectId, felderId, beiAenderung, start = null) {
    this.sel = document.getElementById(selectId);
    this.box = document.getElementById(felderId);
    this.cb = beiAenderung;

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
        el.addEventListener("change", () => this.cb());
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
        el.addEventListener("input", () => this.cb());
      }
      el.id = `${this.box.id}-${f.id}`;
      label.appendChild(el);
      this.box.appendChild(label);
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

class QuerschnittswerteAnzeige {
  /** HTML-Tabelle aller Querschnittswerte. */
  static html(q) {
    let h = "<table>";
    h += zeile(lbl("Breite b", "breite"), fmt(q.breite, 1), "mm");
    h += zeile(lbl("Höhe h", "hoehe"), fmt(q.hoehe, 1), "mm");
    h += zeile(lbl("<b>Fläche A</b>", "A"), `<b>${fmt(q.A / 100, 2)}</b>`, "cm²");
    h += zeile(lbl("Masse (Stahl)", "masse"), fmt(q.masse, 1), "kg/m");
    h += zeile(lbl("z<sub>s</sub> von Oberkante", "zs"), fmt(Math.abs(q.zmin), 1), "mm");
    h += zeile("z<sub>s</sub> von Unterkante", fmt(q.zmax, 1), "mm");
    h += zeile(lbl("y<sub>s</sub> von links", "ys"), fmt(Math.abs(q.ymin), 1), "mm");
    h += zeile(lbl("<b>I<sub>y</sub></b>", "Iy"), `<b>${fmt(q.Iy / 1e4, 1)}</b>`, "cm⁴");
    h += zeile(lbl("<b>I<sub>z</sub></b>", "Iz"), `<b>${fmt(q.Iz / 1e4, 1)}</b>`, "cm⁴");
    if (q.unsymmetrisch) {
      h += zeile(lbl("I<sub>yz</sub>", "Iyz"), fmt(q.Iyz / 1e4, 1), "cm⁴");
      h += zeile(lbl("I<sub>1</sub> (Hauptachse)", "hauptachsen"), fmt(q.I1 / 1e4, 1), "cm⁴");
      h += zeile("I<sub>2</sub> (Hauptachse)", fmt(q.I2 / 1e4, 1), "cm⁴");
      h += zeile("α (Hauptachse 1 gegen y)", fmt(q.alphaHaupt * 180 / Math.PI, 2), "°");
    }
    h += zeile(lbl("I<sub>p</sub> = I<sub>y</sub> + I<sub>z</sub>", "Ip"), fmt(q.Ip / 1e4, 1), "cm⁴");
    h += zeile(lbl("<b>W<sub>y,o</sub></b> (oben)", "Wyo"), `<b>${fmt(q.Wyo / 1e3, 2)}</b>`, "cm³");
    h += zeile(lbl("<b>W<sub>y,u</sub></b> (unten)", "Wyu"), `<b>${fmt(q.Wyu / 1e3, 2)}</b>`, "cm³");
    h += zeile(lbl("<b>W<sub>z</sub></b>", "Wz"), `<b>${fmt(q.Wz / 1e3, 2)}</b>`, "cm³");
    h += zeile(lbl("<b>W<sub>pl,y</sub></b>", "Wpl"), `<b>${fmt(q.Wply / 1e3, 2)}</b>`, "cm³");
    h += zeile(lbl("<b>W<sub>pl,z</sub></b>", "Wpl"), `<b>${fmt(q.Wplz / 1e3, 2)}</b>`, "cm³");
    h += zeile(lbl("i<sub>y</sub>", "iy"), fmt(q.iy / 10, 2), "cm");
    h += zeile(lbl("i<sub>z</sub>", "iz"), fmt(q.iz / 10, 2), "cm");
    h += zeile(lbl("S<sub>y</sub> (obere Hälfte)", "Sy"), fmt(q.Sy / 1e3, 2), "cm³");
    h += "</table>";
    if (q.unsymmetrisch) h += '<p class="hinweis">Unsymmetrischer Querschnitt: y und z sind keine Hauptachsen (I<sub>yz</sub> ≠ 0).</p>';
    return h;
  }
}

/* ======================= Anzeige: Tragfähigkeit (Stahl) ======================= */

class TragfaehigkeitAnzeige {
  /** Ergebnisse als HTML-Tabellen. */
  static html(q, r) {
    const kl = k => (k === null ? "–" : k);
    const zahlOderStrich = (v, d) => (v === null ? "–" : fmt(v, d));

    let h = "<table>";
    h += zeile(lbl("f<sub>y</sub>", "fy"), fmt(r.fy, 0), "N/mm²");
    h += zeile(lbl("ε = √(235/f<sub>y</sub>)", "eps"), fmt(r.eps, 3), "–");
    h += "</table>";

    h += "<p><b>Biegung</b></p><table><tr><th></th><th>y–y</th><th>z–z</th><th></th></tr>";
    h += zeileN(lbl("W<sub>el</sub>", "Wel"), fmt(r.y.Wel / 1e3, 1), fmt(r.z.Wel / 1e3, 1), "cm³");
    h += zeileN(lbl("W<sub>pl</sub>", "Wpl"), fmt(r.y.Wpl / 1e3, 1), fmt(r.z.Wpl / 1e3, 1), "cm³");
    h += zeileN(lbl("α<sub>pl</sub>", "alpha"), fmt(r.y.alpha, 3), fmt(r.z.alpha, 3), "–");
    h += zeileN(lbl("Lage pl. NL*", "pna"), fmt(r.y.lage, 1), fmt(r.z.lage, 1), "mm");
    h += zeileN(lbl("Klasse", "klasse"), kl(r.y.klasse), kl(r.z.klasse), "");
    h += zeileN(lbl("M<sub>el,Rd</sub>", "Mel"), fmt(r.y.Mel, 1), fmt(r.z.Mel, 1), "kNm");
    h += zeileN(lbl("M<sub>pl,Rd</sub>", "Mpl"), fmt(r.y.Mpl, 1), fmt(r.z.Mpl, 1), "kNm");
    h += zeileN(lbl("<b>M<sub>c,Rd</sub></b>", "Mc"), `<b>${zahlOderStrich(r.y.Mc, 1)}</b>`, `<b>${zahlOderStrich(r.z.Mc, 1)}</b>`, "kNm");
    h += "</table><p class=\"hinweis\">* Abstand der plastischen Nulllinie (NL) vom Schwerpunkt.</p>";

    h += "<p><b>Normalkraft und Querkraft</b></p><table><tr><th></th><th>V<sub>z</sub> / Druck</th><th>V<sub>y</sub></th><th></th></tr>";
    h += zeileN(lbl("Klasse (Druck)", "klasse"), kl(r.klasseDruck), "", "");
    h += zeileN(lbl("N<sub>pl,Rd</sub>", "Npl"), fmt(r.Npl, 1), "", "kN");
    h += zeileN(lbl("A<sub>v</sub>", "Av"), r.Av && r.Av.z ? fmt(r.Av.z / 100, 2) : "–", r.Av && r.Av.y ? fmt(r.Av.y / 100, 2) : "–", "cm²");
    h += zeileN(lbl("<b>V<sub>pl,Rd</sub></b>", "Vpl"), `<b>${zahlOderStrich(r.Vz, 1)}</b>`, `<b>${zahlOderStrich(r.Vy, 1)}</b>`, "kN");
    h += "</table>";

    // Klassifizierung im Detail
    if (r.klassen) {
      h += `<p><b>Querschnittsklassen</b> ${infoBtn("klasse")}</p><ul>`;
      for (const [name, k] of [["Biegung y–y", r.klassen.biegungY], ["Biegung z–z", r.klassen.biegungZ], ["Druck", r.klassen.druck]]) {
        const teile = k.teile.map(t => `${t.name} c/t = ${fmt(t.ct, 1)} (Kl. ${t.klasse})`).join(", ");
        h += `<li>${name}: <b>Klasse ${k.klasse}</b>${teile ? " – " + teile : ""}${k.hinweis ? " – " + k.hinweis : ""}</li>`;
      }
      h += "</ul>";
    }

    // Hinweise
    const hinweise = [];
    if (!r.klassen) hinweise.push("Querschnittsklasse für diese Form nicht ermittelt: M<sub>c,Rd</sub> nicht angegeben, M<sub>pl,Rd</sub> gilt nur bei Klasse 1 und 2.");
    if ([r.y.klasse, r.z.klasse, r.klasseDruck].includes(4)) hinweise.push("Klasse 4: Beulen (wirksamer Querschnitt) wird nicht berechnet, deshalb ist dafür kein M<sub>c,Rd</sub> angegeben und N<sub>pl,Rd</sub> nicht anwendbar.");
    if (q.unsymmetrisch) hinweise.push("Unsymmetrischer Querschnitt: Die Biegetragfähigkeiten gelten für die Achsen y und z, nicht für die Hauptachsen.");
    if (r.Av && r.Av.hinweis) hinweise.push(r.Av.hinweis);
    hinweise.push("Biegung, Normalkraft und Querkraft einzeln betrachtet; Abminderungen durch N und V (EN 1993-1-1, 6.2.8 bis 6.2.10) sind nicht berücksichtigt.");
    h += "<ul>" + hinweise.map(t => `<li>${t}</li>`).join("") + "</ul>";
    return h;
  }
}

/* ======================= Anzeige: Spannungen ======================= */

class SpannungsAnzeige {
  constructor() {
    this.punkte = [];                       // vom Nutzer gesetzte Punkte {y, z}
    this.ansicht = new Ansicht3D(document.getElementById("canvas3d"));
    this.letzte = null;                     // zuletzt angezeigte Daten {q, sp, fyd} für den Punkt-Rückruf
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
    document.getElementById("zoom-plus").addEventListener("click", () => this.ansicht.zoomen(1.25));
    document.getElementById("zoom-minus").addEventListener("click", () => this.ansicht.zoomen(1 / 1.25));
  }

  /** Alles mit neuen Daten anzeigen. @param {number} fyd Bemessungsstreckgrenze [N/mm²] */
  zeige(q, sp, fyd) {
    this.letzte = { q, sp, fyd };
    this.neuZeichnen();
  }

  neuZeichnen() {
    if (!this.letzte) return;
    const { q, sp, fyd } = this.letzte;
    this.nachweis(sp, fyd);
    this.zeigePunkte(q, sp);
    this.ansicht.setzeDaten(q, sp, this.punkte, fyd);
  }

  /** Extremwerte und Vergleich mit f_yd (elastischer Spannungsnachweis). */
  nachweis(sp, fyd) {
    const e = sp.extremwerte();
    const maxAbs = Math.max(Math.abs(e.max.wert), Math.abs(e.min.wert));
    const ausn = maxAbs / fyd, ok = ausn <= 1 + 1e-9;
    const haken = ok ? '<span class="ok">✓</span>' : '<span class="fehler">✗</span>';
    document.getElementById("sp-nachweis").innerHTML =
      `${nb(`f<sub>yd</sub> = <b>${fmt(fyd, 1)}</b> N/mm²`)} ${infoBtn("ausnutzung")}<br>` +
      `${nb(`σ<sub>max</sub> = <b>${fmt(e.max.wert)}</b> N/mm²`)} ${nb(`bei y = ${fmt(e.max.y, 1)}, z = ${fmt(e.max.z, 1)} mm`)}<br>` +
      `${nb(`σ<sub>min</sub> = <b>${fmt(e.min.wert)}</b> N/mm²`)} ${nb(`bei y = ${fmt(e.min.y, 1)}, z = ${fmt(e.min.z, 1)} mm`)} ${infoBtn("sigmaExtrem")}<br>` +
      `<b>Ausnutzung max|σ| / f<sub>yd</sub> = ${fmt(ausn * 100, 1)} %</b> ${haken}` +
      `<div class="balken"><i class="${ok ? "" : "zu-viel"}" style="width:${Math.min(100, ausn * 100)}%"></i></div>` +
      `<span class="hinweis">Nulllinie ${infoBtn("nulllinie")} – elastischer Nachweis, Schub und Vergleichsspannung nicht enthalten.</span>`;
  }

  /** Punkttabelle mit Spannungen füllen. */
  zeigePunkte(q, sp) {
    const tb = document.querySelector("#pt-tabelle tbody");
    let ausserhalb = false;
    tb.innerHTML = this.punkte.map((p, i) => {
      const aussen = !q.enthaelt(p.y, p.z);
      ausserhalb = ausserhalb || aussen;
      return `<tr><td>P${i + 1}${aussen ? " *" : ""}</td><td>${fmt(p.y, 1)}</td><td>${fmt(p.z, 1)}</td>` +
             `<td>${fmt(sp.sigma(p.y, p.z))}</td><td><button data-loesche="${i}" title="Löschen">✕</button></td></tr>`;
    }).join("");
    document.getElementById("pt-hinweis").textContent =
      ausserhalb ? "* Punkt liegt außerhalb des Querschnitts (Wert gilt für die verlängerte Spannungsebene)." : "";
  }
}

/* ======================= Seite Stahlbau ======================= */

/** Eine Eingabe (Querschnitt, Stahlgüte, Schnittgrößen) – alle Ergebnisse auf einer Seite. */
class StahlbauSeite {
  constructor() {
    this.skizze = new QSkizze(document.getElementById("st-skizze"));
    this.spannung = new SpannungsAnzeige();
    this.wahl = new QuerschnittWahl("st-typ", "st-felder", () => this.aktualisiere(), "ipe");

    const sel = document.getElementById("st-guete");
    STAHLGUETEN.forEach(([name]) => sel.add(new Option(name, name)));
    sel.value = "S355";
    sel.addEventListener("change", () => this.aktualisiere());
    for (const id of ["st-gm0", "in-N", "in-My", "in-Mz"]) {
      document.getElementById(id).addEventListener("input", () => this.aktualisiere());
    }
    this.aktualisiere();
  }

  /** Querschnitt einmal erzeugen und an alle drei Anzeigen weitergeben. */
  aktualisiere() {
    const fehler = txt => {
      const f = `<span class="fehler">${txt}</span>`;
      for (const id of ["sp-nachweis", "qw-tabelle", "tf-ergebnis"]) document.getElementById(id).innerHTML = f;
    };
    let q;
    try { q = this.wahl.erzeuge(); } catch (e) { fehler(e.message); return; }

    const name = document.getElementById("st-guete").value;
    const fy = STAHLGUETEN.find(s => s[0] === name)[1];
    const gm0 = zahl("st-gm0") > 0 ? zahl("st-gm0") : 1;
    const r = new Stahlbemessung(q, fy, gm0).berechne();
    const sp = new Spannung(q, zahl("in-N"), zahl("in-My"), zahl("in-Mz"));

    document.getElementById("qw-tabelle").innerHTML = QuerschnittswerteAnzeige.html(q);
    document.getElementById("tf-ergebnis").innerHTML = TragfaehigkeitAnzeige.html(q, r);
    this.spannung.zeige(q, sp, fy / gm0);
    this.skizze.zeichne(q, { pna: { y: r.z.lage, z: r.y.lage } });
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
   * Spannungsverlauf (rechte Spalte): Betondruckspannung im Spannungsblock (links der Nulllinie)
   * und Stahlspannungen als Pfeile (Zug rechts, Druck links). Beton und Stahl haben getrennte Maßstäbe.
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

    // Beton: Spannungsblock über die Höhe λ·x vom Druckrand
    const ya = Y(zp(0)), yb = Y(zp(res.s)), top = Math.min(ya, yb), hoehe = Math.abs(yb - ya);
    g.fillStyle = "rgba(40,90,200,0.35)"; g.strokeStyle = "#1f4e9a"; g.lineWidth = 1.5;
    g.fillRect(xz - bMax, top, bMax, hoehe); g.strokeRect(xz - bMax, top, bMax, hoehe);
    g.fillStyle = "#111"; g.textAlign = "left";
    g.fillText(`−${fmt(sp.sigC, 1)}`, xz - bMax + 2, top + (res.negativ ? -4 : hoehe + 12));

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
  }
}

/* ======================= Seite Massivbau: Stahlbeton ======================= */

class StahlbetonSeite {
  constructor() {
    this.skizze = new SBSkizze(document.getElementById("sb-skizze"));
    const sel = document.getElementById("sb-beton");
    BETONKLASSEN.forEach(k => sel.add(new Option(k[0], k[0])));
    sel.value = "C30/37";

    const ids = ["sb-typ", "sb-b", "sb-h", "sb-bf", "sb-hf", "sb-d1", "sb-d2", "sb-beton", "sb-stahl", "sb-M"];
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
      const res = new Biegebemessung(q, beton, new Betonstahl()).bemesse(zahl("sb-M"));
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

    let h = `<b>${r.fall}</b> – ${r.druckzone}${r.negativ ? " (Zug oben)" : ""}<table>`;
    h += zeile(lbl("f<sub>cd</sub>", "fcd"), fmt(r.fcd), "N/mm²");
    h += zeile(lbl("f<sub>yd</sub>", "fyd"), fmt(r.fyd), "N/mm²");
    h += zeile(lbl("λ", "lambdaEta"), fmt(r.lambda), "–");
    h += zeile("η", fmt(r.eta), "–");
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
      h += zeile("Beton σ<sub>c</sub> = −η·f<sub>cd</sub>", fmt(-sp.sigC, 1), "N/mm²");
      h += zeile("Höhe des Blocks λ·x", fmt(r.s / 10, 1), "cm");
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
