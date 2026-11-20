"use strict";

/**
 * app.js - Oberfläche: verbindet Eingabefelder mit den Rechenklassen.
 *  - QuerschnittWahl     : Querschnittsauswahl + Maßfelder (von drei Tabs genutzt)
 *  - SpannungsTab        : Tab "Spannungen & 3D"
 *  - QSkizze             : Skizze des Querschnitts mit Schwerachsen und plastischen Nulllinien
 *  - QuerschnittswerteTab: Tab "Querschnittswerte"
 *  - TragfaehigkeitTab   : Tab "Tragfähigkeit" (Stahlquerschnitte)
 *  - SBSkizze            : Skizze Querschnitt + Dehnungsebene (Stahlbeton)
 *  - StahlbetonTab       : Tab "Stahlbeton"
 *  - App                 : Tab-Umschaltung, Start
 */

/** Tabellenzeile: Bezeichnung | Wert | Einheit */
const zeile = (l, w, e = "") => `<tr><td>${l}</td><td>${w}</td><td>${e}</td></tr>`;
/** Tabellenzeile mit beliebig vielen Zellen */
const zeileN = (...zellen) => "<tr>" + zellen.map(z => `<td>${z}</td>`).join("") + "</tr>";

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

    // Auswahlliste nach Gruppen (parametrisch / Walzprofile) aufbauen
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

  /** Eingabefelder des gewählten Querschnitts erzeugen (Zahlenfeld oder Auswahlliste). */
  baueFelder() {
    this.box.innerHTML = "";
    for (const f of this.klasse.felder) {
      const label = document.createElement("label");
      label.textContent = f.label;
      let el;
      if (f.optionen) {
        el = document.createElement("select");
        f.optionen.forEach(o => el.add(new Option(o, o)));
        el.value = f.wert;
        el.addEventListener("change", () => this.cb());
        label.style.gridColumn = "1 / -1"; // Profilauswahl über die volle Breite
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
      werte[f.id] = f.optionen ? document.getElementById(id).value : zahl(id);
    }
    return new K(werte);
  }
}

/* ======================= Tab 1: Spannungen ======================= */

class SpannungsTab {
  constructor() {
    this.punkte = [];                       // vom Nutzer gesetzte Punkte {y, z}
    this.ansicht = new Ansicht3D(document.getElementById("canvas3d"));
    this.wahl = new QuerschnittWahl("qs-typ", "qs-felder", () => this.aktualisiere());

    for (const id of ["in-N", "in-My", "in-Mz"]) {
      document.getElementById(id).addEventListener("input", () => this.aktualisiere());
    }
    document.getElementById("pt-add").addEventListener("click", () => this.punktHinzufuegen());
    document.querySelector("#pt-tabelle tbody").addEventListener("click", e => {
      const i = e.target.dataset.loesche;
      if (i !== undefined) { this.punkte.splice(Number(i), 1); this.aktualisiere(); }
    });
    document.querySelectorAll("[data-ansicht]").forEach(btn => btn.addEventListener("click", () => {
      const [az, el] = btn.dataset.ansicht.split(",").map(Number);
      this.ansicht.setzeAnsicht(az, el);
    }));
    document.getElementById("zoom-plus").addEventListener("click", () => this.ansicht.zoomen(1.25));
    document.getElementById("zoom-minus").addEventListener("click", () => this.ansicht.zoomen(1 / 1.25));

    this.aktualisiere();
  }

  punktHinzufuegen() {
    this.punkte.push({ y: zahl("pt-y"), z: zahl("pt-z") });
    this.aktualisiere();
  }

  /** Alles neu berechnen und anzeigen. */
  aktualisiere() {
    const kw = document.getElementById("qs-kennwerte");
    let q;
    try { q = this.wahl.erzeuge(); }
    catch (e) { kw.innerHTML = `<span class="fehler">${e.message}</span>`; return; }

    const sp = new Spannung(q, zahl("in-N"), zahl("in-My"), zahl("in-Mz"));

    kw.innerHTML =
      `A = ${fmt(q.A / 100, 2)} cm² &nbsp; I<sub>y</sub> = ${fmt(q.Iy / 1e4, 1)} cm⁴ &nbsp; ` +
      `I<sub>z</sub> = ${fmt(q.Iz / 1e4, 1)} cm⁴ <br><span class="hinweis">Alle Werte: Tab „Querschnittswerte“</span>`;

    const e = sp.extremwerte();
    document.getElementById("sp-extrem").innerHTML =
      `σ<sub>max</sub> = <b>${fmt(e.max.wert)}</b> N/mm² bei y = ${fmt(e.max.y, 1)}, z = ${fmt(e.max.z, 1)} mm<br>` +
      `σ<sub>min</sub> = <b>${fmt(e.min.wert)}</b> N/mm² bei y = ${fmt(e.min.y, 1)}, z = ${fmt(e.min.z, 1)} mm`;

    this.zeigePunkte(q, sp);
    this.ansicht.setzeDaten(q, sp, this.punkte);
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

/* ======================= Querschnittsskizze ======================= */

/** Zeichnet den Querschnitt mit Schwerachsen, Hauptmaßen und (optional) plastischen Nulllinien. */
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

/* ======================= Tab 2: Querschnittswerte ======================= */

class QuerschnittswerteTab {
  constructor() {
    this.skizze = new QSkizze(document.getElementById("qw-skizze"));
    this.wahl = new QuerschnittWahl("qw-typ", "qw-felder", () => this.aktualisiere(), "ipe");
    this.aktualisiere();
  }

  aktualisiere() {
    const box = document.getElementById("qw-tabelle");
    let q;
    try { q = this.wahl.erzeuge(); }
    catch (e) { box.innerHTML = `<span class="fehler">${e.message}</span>`; return; }

    let h = "<table>";
    h += zeile("Breite b", fmt(q.breite, 1), "mm");
    h += zeile("Höhe h", fmt(q.hoehe, 1), "mm");
    h += zeile("<b>Fläche A</b>", `<b>${fmt(q.A / 100, 2)}</b>`, "cm²");
    h += zeile("Masse (Stahl, 7850 kg/m³)", fmt(q.masse, 1), "kg/m");
    h += zeile("Schwerpunkt z<sub>s</sub> von Oberkante", fmt(Math.abs(q.zmin), 1), "mm");
    h += zeile("Schwerpunkt z<sub>s</sub> von Unterkante", fmt(q.zmax, 1), "mm");
    h += zeile("Schwerpunkt y<sub>s</sub> von linker Kante", fmt(Math.abs(q.ymin), 1), "mm");
    h += zeile("<b>Trägheitsmoment I<sub>y</sub></b>", `<b>${fmt(q.Iy / 1e4, 1)}</b>`, "cm⁴");
    h += zeile("<b>Trägheitsmoment I<sub>z</sub></b>", `<b>${fmt(q.Iz / 1e4, 1)}</b>`, "cm⁴");
    h += zeile("Polares Moment I<sub>p</sub> = I<sub>y</sub> + I<sub>z</sub>", fmt(q.Ip / 1e4, 1), "cm⁴");
    h += zeile("<b>Widerstandsmoment W<sub>y,o</sub></b> (oben)", `<b>${fmt(q.Wyo / 1e3, 2)}</b>`, "cm³");
    h += zeile("<b>Widerstandsmoment W<sub>y,u</sub></b> (unten)", `<b>${fmt(q.Wyu / 1e3, 2)}</b>`, "cm³");
    h += zeile("<b>Widerstandsmoment W<sub>z</sub></b>", `<b>${fmt(q.Wz / 1e3, 2)}</b>`, "cm³");
    h += zeile("<b>Plastisches Moment W<sub>pl,y</sub></b>", `<b>${fmt(q.Wply / 1e3, 2)}</b>`, "cm³");
    h += zeile("<b>Plastisches Moment W<sub>pl,z</sub></b>", `<b>${fmt(q.Wplz / 1e3, 2)}</b>`, "cm³");
    h += zeile("Trägheitsradius i<sub>y</sub>", fmt(q.iy / 10, 2), "cm");
    h += zeile("Trägheitsradius i<sub>z</sub>", fmt(q.iz / 10, 2), "cm");
    h += zeile("Statisches Moment S<sub>y</sub> (über Schwerachse)", fmt(q.Sy / 1e3, 2), "cm³");
    h += "</table>";
    box.innerHTML = h;
    this.skizze.zeichne(q);
  }
}

/* ======================= Tab 3: Tragfähigkeit (Stahl) ======================= */

class TragfaehigkeitTab {
  constructor() {
    this.skizze = new QSkizze(document.getElementById("tf-skizze"));
    this.wahl = new QuerschnittWahl("tf-typ", "tf-felder", () => this.aktualisiere(), "ipe");

    const sel = document.getElementById("tf-guete");
    STAHLGUETEN.forEach(([name]) => sel.add(new Option(name, name)));
    sel.value = "S355";
    sel.addEventListener("change", () => this.aktualisiere());
    document.getElementById("tf-gm0").addEventListener("input", () => this.aktualisiere());
    this.aktualisiere();
  }

  aktualisiere() {
    const box = document.getElementById("tf-ergebnis");
    let q;
    try { q = this.wahl.erzeuge(); }
    catch (e) { box.innerHTML = `<span class="fehler">${e.message}</span>`; return; }

    const name = document.getElementById("tf-guete").value;
    const fy = STAHLGUETEN.find(s => s[0] === name)[1];
    const gm0 = zahl("tf-gm0") > 0 ? zahl("tf-gm0") : 1;
    const r = new Stahlbemessung(q, fy, gm0).berechne();

    box.innerHTML = this.tabellen(q, r);
    this.skizze.zeichne(q, { pna: { y: r.z.lage, z: r.y.lage } });
  }

  /** Ergebnisse als HTML-Tabellen. */
  tabellen(q, r) {
    const kl = k => (k === null ? "–" : k);
    const zahlOderStrich = (v, d) => (v === null ? "–" : fmt(v, d));

    let h = "<table>";
    h += zeile("Streckgrenze f<sub>y</sub>", fmt(r.fy, 0), "N/mm²");
    h += zeile("ε = √(235/f<sub>y</sub>)", fmt(r.eps, 3), "–");
    h += zeile("Fläche A", fmt(q.A / 100, 2), "cm²");
    h += zeile("Masse (Stahl)", fmt(q.masse, 1), "kg/m");
    h += "</table>";

    h += "<p><b>Biegung</b></p><table><tr><th></th><th>y–y</th><th>z–z</th><th></th></tr>";
    h += zeileN("W<sub>el</sub>", fmt(r.y.Wel / 1e3, 1), fmt(r.z.Wel / 1e3, 1), "cm³");
    h += zeileN("W<sub>pl</sub>", fmt(r.y.Wpl / 1e3, 1), fmt(r.z.Wpl / 1e3, 1), "cm³");
    h += zeileN("α<sub>pl</sub> = W<sub>pl</sub>/W<sub>el</sub>", fmt(r.y.alpha, 3), fmt(r.z.alpha, 3), "–");
    h += zeileN("Lage pl. Nulllinie*", fmt(r.y.lage, 1), fmt(r.z.lage, 1), "mm");
    h += zeileN("Querschnittsklasse", kl(r.y.klasse), kl(r.z.klasse), "");
    h += zeileN("M<sub>el,Rd</sub> = W<sub>el</sub>·f<sub>y</sub>/γ<sub>M0</sub>", fmt(r.y.Mel, 1), fmt(r.z.Mel, 1), "kNm");
    h += zeileN("M<sub>pl,Rd</sub> = W<sub>pl</sub>·f<sub>y</sub>/γ<sub>M0</sub>", fmt(r.y.Mpl, 1), fmt(r.z.Mpl, 1), "kNm");
    h += zeileN("<b>M<sub>c,Rd</sub></b> (nach Klasse)", `<b>${zahlOderStrich(r.y.Mc, 1)}</b>`, `<b>${zahlOderStrich(r.z.Mc, 1)}</b>`, "kNm");
    h += "</table><p class=\"hinweis\">* Abstand der plastischen Nulllinie vom Schwerpunkt (z nach unten, y nach rechts).</p>";

    h += "<p><b>Normalkraft und Querkraft</b></p><table><tr><th></th><th>V<sub>z</sub> / Druck</th><th>V<sub>y</sub></th><th></th></tr>";
    h += zeileN("Klasse (Druck)", kl(r.klasseDruck), "", "");
    h += zeileN("N<sub>pl,Rd</sub> = A·f<sub>y</sub>/γ<sub>M0</sub>", fmt(r.Npl, 1), "", "kN");
    h += zeileN("A<sub>v</sub>", r.Av && r.Av.z ? fmt(r.Av.z / 100, 2) : "–", r.Av && r.Av.y ? fmt(r.Av.y / 100, 2) : "–", "cm²");
    h += zeileN("<b>V<sub>pl,Rd</sub></b> = A<sub>v</sub>·f<sub>y</sub>/(√3·γ<sub>M0</sub>)", `<b>${zahlOderStrich(r.Vz, 1)}</b>`, `<b>${zahlOderStrich(r.Vy, 1)}</b>`, "kN");
    h += "</table>";

    // Klassifizierung im Detail
    if (r.klassen) {
      h += "<p><b>Querschnittsklassen</b> (EN 1993-1-1, Tab. 5.2)</p><ul>";
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
    if (r.Av && r.Av.hinweis) hinweise.push(r.Av.hinweis);
    hinweise.push("Biegung, Normalkraft und Querkraft einzeln betrachtet; Abminderungen durch N und V (EN 1993-1-1, 6.2.8 bis 6.2.10) sind nicht berücksichtigt.");
    h += "<ul>" + hinweise.map(t => `<li>${t}</li>`).join("") + "</ul>";
    return h;
  }
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
    const wSek = (w - 2 * rand) * 0.42;                      // Breite des Querschnittsfelds
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
    const x0 = rand + wSek + 16, dw = w - rand - x0;
    const eps = zc => dn.kappa * (zc - res.x);
    const werte = dn.ebenen.map(e => e.eps);
    const epsMin = Math.min(...werte, 0), epsMax = Math.max(...werte, 0);
    const sc = dw * 0.52 / (epsMax - epsMin);               // Pixel je ‰
    const xz = x0 + (-epsMin) * sc;                           // Position der Nulllinie

    g.fillStyle = "#333"; g.fillText("Dehnungen ε [‰]", x0, 16);
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
      g.fillStyle = "#111"; g.textAlign = "right"; g.fillText(fmt(m.eps, 2), w - rand, m.ly + 4);
    }
    g.textAlign = "left";
  }
}

/* ======================= Tab 4: Stahlbeton ======================= */

class StahlbetonTab {
  constructor() {
    this.skizze = new SBSkizze(document.getElementById("sb-skizze"));
    const sel = document.getElementById("sb-beton");
    BETONKLASSEN.forEach(k => sel.add(new Option(k[0], k[0])));
    sel.value = "C30/37";

    const ids = ["sb-typ", "sb-b", "sb-h", "sb-bf", "sb-hf", "sb-d1", "sb-d2", "sb-beton", "sb-stahl", "sb-M"];
    ids.forEach(id => document.getElementById(id).addEventListener("input", () => this.aktualisiere()));
    this.aktualisiere();
  }

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
    h += zeile("f<sub>cd</sub> / f<sub>yd</sub>", `${fmt(r.fcd)} / ${fmt(r.fyd)}`, "N/mm²");
    h += zeile("λ / η / ε<sub>cu2</sub>", `${fmt(r.lambda)} / ${fmt(r.eta)} / ${fmt(r.epsCu2, 1)}`, "– / – / ‰");
    h += zeile("Nutzhöhe d", fmt(r.d / 10, 1), "cm");
    h += zeile("Druckzonenhöhe x", fmt(r.x / 10, 1), "cm");
    h += zeile("ξ = x/d", `${fmt(r.xi, 3)} (≤ ${fmt(r.xiLim, 2)})`, haken(r.xiOk));
    h += zeile("A<sub>s1</sub> erforderlich", fmt(r.As1erf / 100), "cm²");
    h += zeile("A<sub>s,min</sub>", fmt(r.AsMin / 100), "cm²");
    h += zeile("<b>A<sub>s1</sub> maßgebend</b>", `<b>${fmt(r.As1 / 100)}</b>`, "cm²");
    if (r.As2 > 0) h += zeile("<b>A<sub>s2</sub> (Druckbewehrung)</b>", `<b>${fmt(r.As2 / 100)}</b>`, "cm²");
    h += zeile("A<sub>s,max</sub> = 0,04·A<sub>c</sub>", fmt(r.AsMax / 100), haken(r.AsMaxOk) + " cm²");
    h += "</table>";

    // Dehnungsebene über die relevanten Ebenen
    const dn = r.dehnung;
    if (dn) {
      const bereich = dn.bereich === 2
        ? `Bereich 2: Stahldehnung auf ε<sub>ud</sub> = ${fmt(dn.epsUd, 1)} ‰ begrenzt`
        : `Bereich 3: Betonstauchung ε<sub>cu2</sub> = ${fmt(r.epsCu2, 1)} ‰ maßgebend`;
      h += `<p><b>Dehnungsebene</b> – ${bereich}</p>`;
      h += "<table><tr><th>Ebene</th><th>Abstand Druckrand [cm]</th><th>ε [‰]</th></tr>";
      for (const e of dn.ebenen) h += `<tr><td>${e.name}</td><td>${fmt(e.z / 10, 1)}</td><td>${fmt(e.eps, 2)}</td></tr>`;
      h += "</table>";
      h += `<p>ε<sub>yd</sub> = ${fmt(dn.epsYd, 2)} ‰ → Zugbewehrung ${dn.fliesst ? "fließt" : "fließt nicht"} ${haken(dn.fliesst)}</p>`;
    }

    h += "<p><b>Bewehrungsvorschlag A<sub>s1</sub></b></p><table><tr><th>Ø [mm]</th><th>Anzahl</th><th>A<sub>s,vorh</sub> [cm²]</th></tr>";
    for (const v of Biegebemessung.vorschlag(r.As1)) h += `<tr><td>Ø ${v.dm}</td><td>${v.n}</td><td>${fmt(v.As / 100)}</td></tr>`;
    h += "</table>";

    if (r.hinweise.length) h += "<ul>" + r.hinweise.map(t => `<li>${t}</li>`).join("") + "</ul>";
    box.innerHTML = h;
  }
}

/* ======================= Start ======================= */

class App {
  constructor() {
    this.spannung = new SpannungsTab();
    this.werte = new QuerschnittswerteTab();
    this.tragf = new TragfaehigkeitTab();
    this.stahlbeton = new StahlbetonTab();
    document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => this.wechsle(btn.dataset.tab)));
  }

  /** Tab umschalten und sichtbare Zeichenflächen neu zeichnen. */
  wechsle(name) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("aktiv", b.dataset.tab === name));
    document.querySelectorAll(".tab-inhalt").forEach(s => s.classList.toggle("aktiv", s.id === "tab-" + name));
    if (name === "spannung") this.spannung.ansicht.zeichne();
    else if (name === "werte") this.werte.aktualisiere();
    else if (name === "tragf") this.tragf.aktualisiere();
    else this.stahlbeton.aktualisiere();
  }
}

window.addEventListener("DOMContentLoaded", () => new App());
