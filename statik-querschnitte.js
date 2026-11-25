/**
 * Querschnitte und Materialien für die Statikseite.
 * Jeder Stab kann auf einen hier definierten Querschnitt verweisen; daraus werden A [cm²] und I [cm⁴] berechnet,
 * der E-Modul ergibt sich aus dem gewählten Material.
 */

/** Materialien mit E-Modul [N/mm²] und Wichte γ [kN/m³] (EN 1991-1-1 Anh. A, Holz: Mittelwert der Rohdichte). Beton: Sekantenmodul E_cm nach EN 1992-1-1, Tab. 3.1; Holz: E_0,mean (EN 14080). */
const MATERIALIEN = {
  S235:   { text: "Baustahl S235/S275/S355/S460", E: 210000, gamma: 78.5 },
  edel:   { text: "Nichtrostender Stahl", E: 200000, gamma: 79 },
  alu:    { text: "Aluminium", E: 70000, gamma: 27 },
  C20:    { text: "Beton C20/25", E: 30000, gamma: 25 },
  C25:    { text: "Beton C25/30", E: 31000, gamma: 25 },
  C30:    { text: "Beton C30/37", E: 33000, gamma: 25 },
  C35:    { text: "Beton C35/45", E: 34000, gamma: 25 },
  C40:    { text: "Beton C40/50", E: 35000, gamma: 25 },
  C45:    { text: "Beton C45/55", E: 36000, gamma: 25 },
  C50:    { text: "Beton C50/60", E: 37000, gamma: 25 },
  GL24h:  { text: "Brettschichtholz GL24h", E: 11500, gamma: 4.2 },
  GL28h:  { text: "Brettschichtholz GL28h", E: 12600, gamma: 4.5 },
  eigen:  { text: "Eigener E-Modul", E: 210000, gamma: 25 },
};

/** Liste der Querschnittsdefinitionen (Karten) mit Typ, Maßen und Material. */
class QuerschnittsListe {
  /** @param {HTMLElement} box Container; @param {Function} bei Rückruf nach jeder Änderung; @param {Function} vorLoeschen(n) */
  constructor(box, bei, vorLoeschen) {
    this.box = box; this.bei = bei; this.vorLoeschen = vorLoeschen; this.liste = [];
  }

  setze(liste) { this.liste = liste; this.baue(); }

  /** Neuer Querschnitt (Standard: IPE 300, Baustahl). */
  static neu() { return { typ: "ipe", werte: { profil: "IPE 300" }, mat: "S235", E: 210000, gamma: 25 }; }

  /** Querschnittsobjekt der Karte n (oder Fehlertext). */
  static erzeuge(q) {
    const K = QUERSCHNITTE[q.typ];
    if (!K) return { fehler: "unbekannter Querschnittstyp" };
    try { return { qs: new K(q.werte) }; } catch (e) { return { fehler: e.message }; }
  }

  /** Kennwerte {A [cm²], I [cm⁴], E [N/mm²]} oder {fehler}. I = Iy (Biegung um die starke Achse, Z nach unten). */
  static kennwerte(q) {
    const r = QuerschnittsListe.erzeuge(q); if (r.fehler) return r;
    const E = q.mat === "eigen" ? q.E : MATERIALIEN[q.mat].E;
    if (!(E > 0)) return { fehler: "E-Modul muss größer 0 sein" };
    const gamma = q.mat === "eigen" ? (q.gamma ?? 25) : MATERIALIEN[q.mat].gamma;
    return { A: r.qs.A / 100, I: r.qs.Iy / 1e4, E, gamma: gamma >= 0 ? gamma : 0, titel: QUERSCHNITTE[q.typ].titel };
  }

  /** Voute zwischen zwei Querschnittsdefinitionen (siehe VouteQuerschnitt). */
  static voute(q0, q1) { return VouteQuerschnitt.seg(q0, q1); }

  /** Kurzname für Auswahllisten, z. B. "Q1 IPE 300". */
  name(n) {
    const q = this.liste[n], w = q.werte;
    return `Q${n + 1} ${w.profil || QUERSCHNITTE[q.typ].titel}`;
  }

  /** Eingabefelder eines Querschnittstyps als DOM-Elemente. */
  _felder(q, zeile, ergebnis) {
    const K = QUERSCHNITTE[q.typ], feld = document.createElement("div"); feld.className = "sw-kfelder";
    for (const f of K.felder) {
      if (f.zeigeWenn && !f.zeigeWenn(q.werte)) continue;
      const l = document.createElement("label"), s = document.createElement("span"); s.innerHTML = f.label; l.appendChild(s);
      let e;
      if (f.optionen) {
        e = document.createElement("select"); f.optionen.forEach(o => e.add(new Option(o, o)));
        e.value = q.werte[f.id] ?? f.wert;
      } else {
        e = document.createElement("input"); e.type = f.text ? "text" : "number"; if (!f.text) e.step = "any";
        e.value = q.werte[f.id] ?? f.wert;
      }
      q.werte[f.id] = f.optionen || f.text ? e.value : parseFloat(e.value);
      e.addEventListener("input", () => {
        q.werte[f.id] = f.optionen || f.text ? e.value : parseFloat(e.value);
        // Felder mit zeigeWenn können sich ändern -> Karte neu aufbauen, wenn die Auswahl wechselt
        if (f.optionen) this.baue(); else { this._ergebnis(q, ergebnis); }
        this.bei();
      });
      l.appendChild(e); feld.appendChild(l);
    }
    return feld;
  }

  _ergebnis(q, el) {
    const k = QuerschnittsListe.kennwerte(q);
    el.innerHTML = k.fehler ? `<span class="fehler">${k.fehler}</span>`
      : `A = ${fmt(k.A, 2)} cm², I<sub>y</sub> = ${fmt(k.I, 1)} cm⁴, E = ${fmt(k.E, 0)} N/mm²`;
  }

  baue() {
    this.box.replaceChildren();
    this.liste.forEach((q, n) => {
      const karte = document.createElement("div"); karte.className = "sw-karte";
      const kopf = document.createElement("div"); kopf.className = "sw-kkopf";
      const nr = document.createElement("b"); nr.textContent = "Q" + (n + 1); kopf.appendChild(nr);
      // Typ-Auswahl nach Gruppen
      const typ = document.createElement("select"), gr = {};
      for (const [k, K] of Object.entries(QUERSCHNITTE)) {
        if (!gr[K.gruppe]) { gr[K.gruppe] = document.createElement("optgroup"); gr[K.gruppe].label = K.gruppe; typ.appendChild(gr[K.gruppe]); }
        gr[K.gruppe].appendChild(new Option(K.titel, k));
      }
      typ.value = q.typ;
      typ.addEventListener("input", () => {
        q.typ = typ.value; q.werte = {};
        QUERSCHNITTE[q.typ].felder.forEach(f => { q.werte[f.id] = f.wert; });
        this.baue(); this.bei();
      });
      kopf.appendChild(typ);
      const x = document.createElement("button"); x.type = "button"; x.className = "sw-x"; x.textContent = "×"; x.title = "Querschnitt löschen";
      x.disabled = this.liste.length <= 1;
      x.addEventListener("click", () => { this.vorLoeschen(n); this.liste.splice(n, 1); this.baue(); this.bei(); });
      kopf.appendChild(x); karte.appendChild(kopf);

      const erg = document.createElement("div"); erg.className = "hinweis";
      karte.appendChild(this._felder(q, n, erg));
      // Material
      const ml = document.createElement("label"), ms = document.createElement("span"); ms.textContent = "Material"; ml.appendChild(ms);
      const mat = document.createElement("select");
      Object.entries(MATERIALIEN).forEach(([k, v]) => mat.add(new Option(v.text, k)));
      mat.value = q.mat; ml.appendChild(mat);
      const el = document.createElement("label"), es = document.createElement("span"); es.textContent = "E-Modul [N/mm²]"; el.appendChild(es);
      const e = document.createElement("input"); e.type = "number"; e.step = "any"; e.value = q.mat === "eigen" ? q.E : MATERIALIEN[q.mat].E;
      e.disabled = q.mat !== "eigen"; el.appendChild(e);
      mat.addEventListener("input", () => { q.mat = mat.value; e.disabled = q.mat !== "eigen"; e.value = q.mat === "eigen" ? q.E : MATERIALIEN[q.mat].E; this._ergebnis(q, erg); this.bei(); });
      e.addEventListener("input", () => { q.E = parseFloat(e.value); this._ergebnis(q, erg); this.bei(); });
      const gl = document.createElement("label"), gs = document.createElement("span"); gs.textContent = "Wichte γ [kN/m³]"; gl.appendChild(gs);
      const ge = document.createElement("input"); ge.type = "number"; ge.step = "any"; ge.value = q.mat === "eigen" ? (q.gamma ?? 25) : MATERIALIEN[q.mat].gamma; ge.disabled = q.mat !== "eigen"; gl.appendChild(ge);
      ge.addEventListener("input", () => { q.gamma = parseFloat(ge.value); this.bei(); });
      mat.addEventListener("input", () => { ge.disabled = q.mat !== "eigen"; ge.value = q.mat === "eigen" ? (q.gamma ?? 25) : MATERIALIEN[q.mat].gamma; });
      const reihe = document.createElement("div"); reihe.className = "sw-kfelder"; reihe.append(ml, el, gl);
      karte.appendChild(reihe); karte.appendChild(erg);
      this._ergebnis(q, erg);
      this.box.appendChild(karte);
    });
    const add = document.createElement("button"); add.type = "button"; add.className = "sw-add"; add.textContent = "+ Querschnitt";
    add.addEventListener("click", () => { this.liste.push(QuerschnittsListe.neu()); this.baue(); this.bei(); });
    this.box.appendChild(add);
  }
}

/* ======================= Voute (linear veränderlicher Querschnitt) ======================= */

/** I-Profil mit frei vorgegebenen Abmessungen (für die Interpolation zwischen zwei Walzprofilen). */
class IProfilVoute extends IProfil {
  static get tabelle() { return []; }
  abm() { return this.w.dim; }
}

/**
 * Querschnitt an der Stelle t (0 = Anfang, 1 = Ende) bei linearer Interpolation der Maße
 * zwischen den Querschnitten q0 und q1 (Typ und Auswahlfelder müssen übereinstimmen;
 * gewalzte I-/H-Profile verschiedener Reihen dürfen gemischt werden).
 */
class VouteQuerschnitt {
  /** Zerlegt den Verlauf in n gleich lange Abschnitte; liefert {seg:[{A [cm²], I [cm⁴]}], h0, h1 [mm]} oder {fehler}. */
  static seg(q0, q1, n = 24) {
    const K0 = QUERSCHNITTE[q0.typ], K1 = QUERSCHNITTE[q1.typ];
    if (!K0 || !K1) return { fehler: "unbekannter Querschnittstyp" };
    let bei;                                              // Funktion t -> Querschnittsobjekt
    try {
      const iProfil = K => K === IProfil || K.prototype instanceof IProfil;
      if (iProfil(K0) && iProfil(K1)) {
        const d0 = new K0(q0.werte).abm(), d1 = new K1(q1.werte).abm();
        bei = t => { const dim = {}; for (const k of ["h", "b", "tw", "tf", "r"]) dim[k] = d0[k] + (d1[k] - d0[k]) * t; return new IProfilVoute({ profil: "Voute", dim }); };
      } else if (q0.typ === q1.typ) {
        const felder = K0.felder;
        for (const f of felder) if ((f.optionen || f.text) && q0.werte[f.id] !== q1.werte[f.id]) return { fehler: `Voute: Auswahl/Text „${f.label}“ muss an Anfang und Ende gleich sein` };
        bei = t => {
          const w = { ...q0.werte };
          for (const f of felder) if (!f.optionen && !f.text) w[f.id] = q0.werte[f.id] + (q1.werte[f.id] - q0.werte[f.id]) * t;
          return new K0(w);
        };
      } else return { fehler: "Voute nur zwischen gleichartigen Querschnitten möglich (gleicher Typ bzw. gewalzte I-/H-Profile)" };
      // Werte an 2n+1 Stellen; je Abschnitt harmonisches Mittel nach Simpson (Reihenschaltung der Steifigkeiten)
      const a = [], i = [];
      let h0 = 0, h1 = 0;
      for (let j = 0; j <= 2 * n; j++) {
        const qs = bei(j / (2 * n)); a.push(qs.A / 100); i.push(qs.Iy / 1e4);
        if (j === 0) h0 = qs.hoehe; if (j === 2 * n) h1 = qs.hoehe;
      }
      const mittel = (f, k) => 6 / (1 / f[2 * k] + 4 / f[2 * k + 1] + 1 / f[2 * k + 2]);
      const seg = [];
      for (let k = 0; k < n; k++) seg.push({ A: mittel(a, k), I: mittel(i, k) });
      return { seg, h0, h1, A1: a[2 * n], I1: i[2 * n] };
    } catch (e) { return { fehler: "Voute: " + e.message }; }
  }
}
