/* Helpers de UI sem dependencias. */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* indice de coluna (1-based) -> "A", "B", ... "AA" */
export function colName(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function initials(name) {
  const p = String(name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let toastBox;
export function toast(msg, type = "") {
  if (!toastBox) { toastBox = h("div", { id: "toasts" }); document.body.appendChild(toastBox); }
  const t = h("div", { class: "toast " + type }, msg);
  toastBox.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

/* mapeia o texto do status -> classe do chip (.recebido/.pendente/.na/...) */
export function statusClass(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "recebido") return "recebido";
  if (s === "pendente") return "pendente";
  if (s === "n/a" || s === "na") return "na";
  if (s.startsWith("em an")) return "analise";
  if (s.startsWith("parcial") || s.includes("parcial")) return "parcial";
  return "";
}

/* opcoes oferecidas no dropdown das colunas de status — PADRAO embutido.
   Em runtime, a lista vem da tabela status_options (ver setStatusOptions). */
export const STATUS_OPTIONS = ["Pendente", "Recebido", "Em análise", "Parcial", "N/A"];

/* lista ATIVA (rotulos) e mapa rotulo->classe-de-cor, alimentados pelo banco.
   Comecam com o padrao embutido e sao substituidos apos loadStatusOptions(). */
let _statusOptions = [...STATUS_OPTIONS];
let _statusClassMap = new Map();
export function getStatusOptions() { return _statusOptions; }
export function setStatusOptions(list) {
  if (!Array.isArray(list) || !list.length) return;
  _statusOptions = list.map((o) => o.label);
  _statusClassMap = new Map(list.map((o) => [o.label, o.klass || statusClass(o.label) || "na"]));
}
/* classe de cor do chip: usa o mapa do banco e cai no statusClass por palavra-chave */
export function statusClassFor(label) {
  if (_statusClassMap.has(label)) return _statusClassMap.get(label);
  return statusClass(label);
}

/* cor estavel a partir de uma string (fallback p/ avatar) */
export function colorFromString(str) {
  const palette = ["#1a5fa8", "#16a34a", "#d97706", "#7c3aed", "#ea580c", "#2563eb", "#0e7490", "#be123c"];
  let hash = 0;
  for (const ch of String(str || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
