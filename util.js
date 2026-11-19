"use strict";

/**
 * util.js - kleine Hilfsfunktionen, die von allen Dateien genutzt werden.
 */

/** Zahl im deutschen Format ausgeben (Komma, d Nachkommastellen). */
function fmt(v, d = 2) {
  if (!Number.isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Liest ein Zahlenfeld per ID aus (leer oder ungültig ergibt 0). */
function zahl(id) {
  const v = parseFloat(document.getElementById(id).value);
  return Number.isFinite(v) ? v : 0;
}
