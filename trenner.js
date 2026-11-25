/**
 * Verschiebbarer Trenner zwischen Eingabespalte (links) und Ergebnissen (rechts).
 * Wird für jede Seite mit .eingabe und .ergebnisse eingefügt; die Breite wird je Seite gemerkt, Doppelklick setzt zurück.
 */
class Spaltentrenner {
  constructor(sektion) {
    this.s = sektion; this.schluessel = `trenner-${sektion.id}`;
    const links = sektion.querySelector(":scope > .eingabe"), rechts = sektion.querySelector(":scope > .ergebnisse");
    if (!links || !rechts) return;
    this.griff = document.createElement("div"); this.griff.className = "spalten-trenner"; this.griff.setAttribute("role", "separator");
    this.griff.title = "Ziehen: Breite der Eingabespalte ändern (Doppelklick: zurücksetzen)";
    sektion.insertBefore(this.griff, rechts);
    let px = null; try { px = parseFloat(localStorage.getItem(this.schluessel)); } catch (e) { px = null; }
    if (px > 0) this._setze(px);
    this.griff.addEventListener("pointerdown", e => {
      this.griff.setPointerCapture(e.pointerId); this.zieht = true; this.griff.classList.add("zieht"); e.preventDefault();
    });
    this.griff.addEventListener("pointermove", e => {
      if (!this.zieht) return;
      const r = sektion.getBoundingClientRect(), pad = parseFloat(getComputedStyle(sektion).paddingLeft) || 0;
      this._setze(Math.max(260, Math.min(r.width - 2 * pad - 320, e.clientX - r.left - pad)), true);
    });
    const ende = () => { if (!this.zieht) return; this.zieht = false; this.griff.classList.remove("zieht"); try { localStorage.setItem(this.schluessel, String(this.px)); } catch (e) { /* ignorieren */ } };
    this.griff.addEventListener("pointerup", ende); this.griff.addEventListener("pointercancel", ende);
    this.griff.addEventListener("dblclick", () => {
      this.s.style.removeProperty("--links"); this.px = null;
      try { localStorage.removeItem(this.schluessel); } catch (e) { /* ignorieren */ }
      window.dispatchEvent(new Event("resize"));
    });
  }

  _setze(px, neuZeichnen = false) {
    this.px = px; this.s.style.setProperty("--links", `${Math.round(px)}px`);
    if (neuZeichnen) { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))); }
  }
}
