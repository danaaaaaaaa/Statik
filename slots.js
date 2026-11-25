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
