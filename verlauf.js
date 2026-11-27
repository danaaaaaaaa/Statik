/**
 * Rückgängig / Wiederherstellen für Seiten mit einem serialisierbaren Modell.
 * Die Seite ruft merke() nach jeder Änderung auf; schnell aufeinanderfolgende Änderungen (Tippen) werden zusammengefasst.
 */
class Verlauf {
  /**
   * @param {{holen:()=>string, setzen:(s:string)=>void}} opt
   *   holen: aktueller Zustand als Text; setzen: Zustand wiederherstellen (ruft selbst die Seite neu auf)
   */
  constructor(opt) {
    this.o = opt; this.stapel = []; this.pos = -1; this.t = 0; this.sperre = false;
    this._knoepfe();
  }

  rueckgaengig() { this._gehe(this.pos - 1); }
  wiederherstellen() { this._gehe(this.pos + 1); }
  get kannRueckgaengig() { return this.pos > 0; }
  get kannWiederherstellen() { return this.pos < this.stapel.length - 1; }

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

  _knoepfe() { Kopfleiste.aktualisiere(this); }
}

/**
 * Die beiden Pfeilknöpfe in der Kopfleiste. Sie wirken auf den Verlauf der gerade angezeigten Seite
 * (Seiten ohne Verlauf blenden sie aus).
 */
class Kopfleiste {
  static init() {
    Kopfleiste.box = document.getElementById("kopf-verlauf");
    Kopfleiste.undo = document.getElementById("kopf-undo"); Kopfleiste.redo = document.getElementById("kopf-redo");
    Kopfleiste.undo.addEventListener("click", () => Kopfleiste.verlauf && Kopfleiste.verlauf.rueckgaengig());
    Kopfleiste.redo.addEventListener("click", () => Kopfleiste.verlauf && Kopfleiste.verlauf.wiederherstellen());
    // Tastenkürzel Strg/Cmd+Z bzw. +Y / Umschalt+Z (nicht in Textfeldern, dort gilt das Rückgängig des Feldes)
    document.addEventListener("keydown", e => {
      if (!(e.ctrlKey || e.metaKey) || !Kopfleiste.verlauf || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ""))) return;
      const z = e.key.toLowerCase();
      if (z === "z" && !e.shiftKey) { e.preventDefault(); Kopfleiste.verlauf.rueckgaengig(); }
      else if (z === "y" || (z === "z" && e.shiftKey)) { e.preventDefault(); Kopfleiste.verlauf.wiederherstellen(); }
    });
  }

  /** Verlauf der angezeigten Seite setzen (null = Seite ohne Rückgängig-Funktion) */
  static setze(v) { Kopfleiste.verlauf = v; Kopfleiste.aktualisiere(v); }

  /** Knopfzustand aktualisieren, wenn v der aktive Verlauf ist */
  static aktualisiere(v) {
    if (!Kopfleiste.box || v !== Kopfleiste.verlauf) return;
    Kopfleiste.box.hidden = !v;
    if (v) { Kopfleiste.undo.disabled = !v.kannRueckgaengig; Kopfleiste.redo.disabled = !v.kannWiederherstellen; }
  }
}
