/* Zoom da UI (alta densidade) — port vanilla do uiZoom.ts do Cronograma.
   Aplica a CSS `zoom` no <html> (reescala todo o app, como o zoom do navegador).
   Funciona porque os tokens do DS são em px (não rem): tudo escala junto —
   texto, espaçamentos, tabela, larguras auto-fit e a virtualização.
   O valor é persistido em localStorage e reaplicado no boot (+ script anti-flash
   no index.html, que deve ficar em sincronia com os valores abaixo). */

const KEY = "eqtl-ui-zoom";
export const ZMIN = 0.7, ZMAX = 1.2, ZSTEP = 0.1, ZDEFAULT = 0.8;

function clampZoom(z) {
  z = Math.round(z * 100) / 100;         // evita 0.7999…
  return Math.min(ZMAX, Math.max(ZMIN, z));
}
export function getZoom() {
  const z = parseFloat(localStorage.getItem(KEY));
  return (z >= ZMIN && z <= ZMAX) ? z : ZDEFAULT;
}
export function applyZoom(z) {
  const r = document.documentElement.style;
  r.setProperty("zoom", String(z));
  r.setProperty("--app-zoom", String(z));   // alimenta --app-vh (evita tela cortada)
}
/* zoom computado no <html> — para corrigir getBoundingClientRect (px visuais = layout × zoom). */
export function appZoom() {
  return parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
}
export function initZoom() { applyZoom(getZoom()); }
export function setZoom(z) {
  z = clampZoom(z);
  try { localStorage.setItem(KEY, String(z)); } catch { /* modo privado */ }
  applyZoom(z);
  return z;
}
