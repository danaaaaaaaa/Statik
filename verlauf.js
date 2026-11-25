/**
 * Rückgängig / Wiederherstellen für Seiten mit einem serialisierbaren Modell.
 * Die Seite ruft merke() nach jeder Änderung auf; schnell aufeinanderfolgende Änderungen (Tippen) werden zusammengefasst.
 */
class Verlauf {
  /**
   * @param {{holen:()=>string, setzen:(s:string)=>void, undo:HTMLButtonElement, redo:HTMLButtonElement}} opt
   *   holen: aktueller Zustand als Text; setzen: Zustand wiederherstellen (ruft selbst die Seite neu auf)
   */
  constructor(opt) {
    this.o = opt; this.stapel = []; this.pos = -1; this.t = 0; this.sperre = false;
    opt.undo.addEventListener("click", () => this._gehe(this.pos - 1));
    opt.redo.addEventListener("click", () => this._gehe(this.pos + 1));
    this._knoepfe();
  }

  /** Verlauf leeren (z. B. beim Wechsel des Speicherplatzes); der nächste merke()-Aufruf setzt den Ausgangszustand. */
  neu() { this.stapel = []; this.pos = -1; this.t = 0; this._knoepfe(); }

  /** Aktuellen Zustand nach einer Änderung festhalten. */
  merke() {
    if (this.sperre) return;
    const s = this.o.holen();
    if (this.pos >= 0 && this.stapel[this.pos] === s) return;
    const jetzt = Date.now();
    this.stapel.length = this.pos + 1;                                   // Wiederherstellen-Zweig verwerfen
    if (this.pos > 0 && jetzt - this.t < 700) this.stapel[this.pos] = s; // Tippen: letzten Schritt ersetzen
    else { this.stapel.push(s); if (this.stapel.length > 100) this.stapel.shift(); this.pos = this.stapel.length - 1; }
    this.t = jetzt; this._knoepfe();
  }

  _gehe(p) {
    if (p < 0 || p >= this.stapel.length) return;
    this.pos = p; this.t = 0; this.sperre = true;
    try { this.o.setzen(this.stapel[p]); } finally { this.sperre = false; }
    this._knoepfe();
  }

  _knoepfe() { this.o.undo.disabled = this.pos <= 0; this.o.redo.disabled = this.pos >= this.stapel.length - 1; }
}
