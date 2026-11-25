/**
 * Speicherplätze (Reiter) mit frei wählbaren Namen.
 * SlotLeiste zeichnet die Knöpfe (Nummer + Kurzname) und ein Textfeld für den Namen des aktiven Platzes.
 * Die Daten selbst (Inhalt der Plätze, aktiver Platz, Namen) verwaltet der Besitzer; hier nur Anzeige und Namenseingabe.
 */
class SlotLeiste {
  /**
   * @param {HTMLElement} box Container; @param {number} anzahl Anzahl der Plätze
   * @param {{namen:string[], beiWechsel:(i:number)=>void, beiName:()=>void}} opt
   *   namen: Namensliste (wird direkt verändert); beiWechsel: Platz i wurde angeklickt; beiName: ein Name wurde geändert
   */
  constructor(box, anzahl, opt) {
    this.box = box; this.n = anzahl; this.opt = opt;
    while (opt.namen.length < anzahl) opt.namen.push("");
    box.replaceChildren();
    this.zeile = document.createElement("div"); this.zeile.className = "knoepfe";
    this.knoepfe = Array.from({ length: anzahl }, (_, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "knopf slot";
      b.addEventListener("click", () => opt.beiWechsel(i));
      this.zeile.appendChild(b); return b;
    });
    this.eingabe = document.createElement("input"); this.eingabe.type = "text"; this.eingabe.maxLength = 30;
    this.eingabe.className = "slotname-eingabe"; this.eingabe.placeholder = "Name dieses Speicherplatzes";
    this.eingabe.addEventListener("input", () => { opt.namen[this.aktiv] = this.eingabe.value; this._beschrifte(); opt.beiName(); });
    box.append(this.zeile, this.eingabe);
    this.aktiv = 0;
  }

  /** Name eines Platzes (Standard: „Platz n“) */
  name(i) { return (this.opt.namen[i] || "").trim() || `Platz ${i + 1}`; }

  /** Knopfbeschriftung: Nummer und gekürzter Name */
  _beschrifte() {
    this.knoepfe.forEach((b, i) => {
      const n = (this.opt.namen[i] || "").trim();
      b.replaceChildren(); const z = document.createElement("b"); z.textContent = String(i + 1); b.appendChild(z);
      if (n) { const k = document.createElement("small"); k.textContent = n.length > 9 ? n.slice(0, 8) + "…" : n; b.appendChild(k); }
      b.title = `${i + 1}: ${this.name(i)}`;
    });
  }

  /** aktiven Platz markieren; belegt[i] = Platz enthält Daten */
  anzeige(aktiv, belegt) {
    this.aktiv = aktiv;
    this.knoepfe.forEach((b, i) => { b.classList.toggle("aktiv", i === aktiv); b.classList.toggle("leer", !belegt[i]); });
    this._beschrifte();
    if (document.activeElement !== this.eingabe) this.eingabe.value = this.opt.namen[aktiv] || "";
  }
}

/**
 * Benennbare Speicherplätze für Seiten, deren Zustand sich als einfaches Objekt beschreiben lässt.
 * Die Seite liefert holen() (aktueller Zustand) und setzen(zustand) (laden + neu rechnen) und ruft nach jeder Änderung sichern() auf.
 * Ein leerer Platz startet als Kopie des aktuellen Zustands.
 */
class ModellSpeicher {
  /** @param {HTMLElement} box @param {string} schluessel localStorage-Schlüssel @param {number} anzahl @param {{holen:()=>object, setzen:(z:object)=>void}} o */
  constructor(box, schluessel, anzahl, o) {
    this.k = schluessel; this.o = o;
    this.d = { slots: Array(anzahl).fill(null), namen: Array(anzahl).fill(""), aktiv: 0 };
    try {
      const d = JSON.parse(localStorage.getItem(schluessel) || "null");
      if (d && Array.isArray(d.slots)) this.d = { slots: d.slots.slice(0, anzahl), namen: (d.namen || []).slice(0, anzahl), aktiv: d.aktiv || 0 };
    } catch (e) { /* Speicher nicht verfügbar: Plätze gelten nur für diese Sitzung */ }
    while (this.d.slots.length < anzahl) this.d.slots.push(null);
    while (this.d.namen.length < anzahl) this.d.namen.push("");
    this.leiste = new SlotLeiste(box, anzahl, { namen: this.d.namen, beiWechsel: i => this.wechsel(i), beiName: () => this._schreibe() });
    this.leiste.anzeige(this.d.aktiv, this.d.slots.map(Boolean));
  }

  /** Gespeicherter Zustand des aktiven Platzes (oder null) */
  start() { const s = this.d.slots[this.d.aktiv]; return s ? JSON.parse(JSON.stringify(s)) : null; }

  /** Aktuellen Zustand im aktiven Platz ablegen */
  sichern() { this.d.slots[this.d.aktiv] = JSON.parse(JSON.stringify(this.o.holen())); this._schreibe(); }

  _schreibe() {
    try { localStorage.setItem(this.k, JSON.stringify(this.d)); } catch (e) { /* ignorieren */ }
    this.leiste.anzeige(this.d.aktiv, this.d.slots.map(Boolean));
  }

  wechsel(i) {
    if (i === this.d.aktiv) return;
    const kopie = JSON.parse(JSON.stringify(this.d.slots[i] || this.o.holen()));
    this.d.aktiv = i; this.o.setzen(kopie);
  }
}
