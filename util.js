"use strict";

/**
 * util.js - kleine Hilfsfunktionen, die von allen Dateien genutzt werden.
 */

/** Zahl im deutschen Format ausgeben (Komma, d Nachkommastellen). */
function fmt(v, d = 2) {
  if (!Number.isFinite(v)) return "–";
  if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;          // kein "−0,0" bei Rundung auf null
  return v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Liest ein Zahlenfeld per ID aus (leer oder ungültig ergibt 0). */
function zahl(id) {
  const v = parseFloat(document.getElementById(id).value);
  return Number.isFinite(v) ? v : 0;
}
