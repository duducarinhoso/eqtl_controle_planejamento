/* =====================================================================
   solic.js — Tela-tabela "Solicitações" portada do _gerenciador_projetos.
   Reproduz layout/estrutura/CSS (.gp-root) e as funcionalidades dos
   cabeçalhos: busca, ordenar, filtrar, agrupar, ocultar, redimensionar,
   menu de coluna, seleção em massa, colunas fixas (só adiciona LINHAS).
   Dados via ctx: { rows, abas:[{name,sub}], areas:[label], statusOptions,
     abaCounts:Map(abaName-> Map(status->qtd)),
     onEdit(row,patch), onAdd(), onDelete(row), onDeleteMany(ids),
     onGoAba(name), onGoOriginal(), onRecount(), onAddArea(label) }
   ===================================================================== */
import { h, $, clear } from "./util.js";

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  filter: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  group: '<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/>',
  sort: '<path d="M3 6h12M3 12h8M3 18h4"/><path d="M18 4v16M18 20l3-3M18 20l-3-3"/>',
  "sort-asc": '<path d="M6 15l6-6 6 6"/>',
  "sort-desc": '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off": '<path d="M3 3l18 18M10.6 5.2A10 10 0 0122 12s-1.2 2.3-3.4 4M6.4 6.4A10 10 0 002 12s3.5 7 10 7a10 10 0 004.2-.9"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  hash: '<path d="M4 9h16M4 15h16M10 4L8 20M16 4l-2 16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  link: '<path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
  "align-left": '<path d="M3 6h18M3 12h12M3 18h15"/>',
};
function ic(name, size = 16) { return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`; }
const ICONE_TIPO = { tags: "list", texto: "align-left", data: "calendar", aba: "link", statusnum: "hash" };
const LARGURA = { tags: 300, texto: 200, data: 120, aba: 120, statusnum: 70 };
const LARGURA_MIN = { tags: 180, texto: 130, data: 100, aba: 90, statusnum: 56 };
const SEL_W = 40, GUT_W = 48, AUTOFIT_MIN = 110, AUTOFIT_MAX = 520, MODELO = "solicitacoes";
const lsW = () => { try { return JSON.parse(localStorage.getItem("gp:colW:" + MODELO) || "{}"); } catch (_) { return {}; } };
const lsWset = (m) => { try { localStorage.setItem("gp:colW:" + MODELO, JSON.stringify(m)); } catch (_) {} };
const lsHide = () => { try { return JSON.parse(localStorage.getItem("gp:colHide:" + MODELO) || "[]"); } catch (_) { return []; } };
const lsHideSet = (a) => { try { localStorage.setItem("gp:colHide:" + MODELO, JSON.stringify(a)); } catch (_) {} };

let S = null, ctx = null, root = null;   // estado de módulo (uma tela por vez)

export function openSolic(container, context) {
  ctx = context;
  S = { busca: "", filtros: {}, ordenarPor: null, ordenarDir: "asc", agruparPor: null, colapsados: new Set(), sel: new Set(), larg: lsW(), hide: new Set(lsHide()), container };
  draw();
}
export function refreshSolic() { if (S && S.container) draw(); }

function colsAll() {
  const cols = [
    { id: "area", nome: "Área", tipo: "tags", primary: true },
    { id: "scot", nome: "Scot", tipo: "texto" },
    { id: "client_portal", nome: "Client Portal", tipo: "texto" },
    { id: "data_solicitacao", nome: "Data", tipo: "data" },
    { id: "deadline", nome: "Deadline", tipo: "data" },
    { id: "sheet_link", nome: "Aba", tipo: "aba" },
    { id: "area_eqtl", nome: "Área EQTL", tipo: "texto" },
    { id: "responsavel", nome: "Responsável", tipo: "texto" },
  ];
  (ctx.statusOptions || []).forEach((st) => cols.push({ id: "st:" + st, nome: st, tipo: "statusnum", status: st, readonly: true }));
  return cols;
}
function rawVal(row, col) {
  if (col.tipo === "tags") return row.area || [];
  if (col.tipo === "aba") return row.sheet_link || "";
  if (col.tipo === "statusnum") { const m = ctx.abaCounts && ctx.abaCounts.get(String(row.sheet_link || "").trim()); return m ? (m.get(col.status) || 0) : 0; }
  return row[col.id] || "";
}
function cellText(row, col) { const v = rawVal(row, col); return Array.isArray(v) ? v.join(" ") : String(v); }
function larguraDe(col) { const w = S.larg[col.id]; if (w > 0) return w; return col.primary ? LARGURA.tags : (LARGURA[col.tipo] || 160); }
function larguraMin(col) { return col.primary ? 200 : (LARGURA_MIN[col.tipo] || 110); }
function nFiltros() { return Object.values(S.filtros || {}).filter((x) => x != null).length; }
function filtrado() { return (S.busca || "").trim() !== "" || nFiltros() > 0; }

function matchFilter(row, col, spec) {
  if (!spec) return true;
  if (spec.op === "contem") return cellText(row, col).toLowerCase().includes(String(spec.v || "").toLowerCase());
  if (spec.op === "in") {
    const vals = spec.vals || [], raw = rawVal(row, col), arr = Array.isArray(raw) ? raw : [raw];
    const vazio = !arr.length || arr.every((x) => x === "" || x == null);
    if (vals.includes("__vazio__") && vazio) return true;
    return arr.some((x) => vals.includes(String(x)));
  }
  return true;
}
function viewRows() {
  let r = (ctx.rows || []).slice();
  const q = (S.busca || "").trim().toLowerCase();
  if (q) r = r.filter((row) => S.cols.some((c) => cellText(row, c).toLowerCase().includes(q)));
  for (const [cid, spec] of Object.entries(S.filtros || {})) {
    if (!spec) continue; const col = colsAll().find((c) => c.id === cid); if (!col) continue;
    r = r.filter((row) => matchFilter(row, col, spec));
  }
  if (S.ordenarPor) { const col = colsAll().find((c) => c.id === S.ordenarPor); if (col) { const dir = S.ordenarDir === "desc" ? -1 : 1; r.sort((a, b) => cmp(a, b, col) * dir); } }
  return r;
}
function cmp(a, b, col) {
  if (col.tipo === "statusnum") return (rawVal(a, col) || 0) - (rawVal(b, col) || 0);
  return cellText(a, col).toLowerCase().localeCompare(cellText(b, col).toLowerCase(), "pt");
}

/* ---------------- popover ---------------- */
function closePop() { document.querySelectorAll(".dd-pop,.col-menu").forEach((e) => e.remove()); if (S && S._popClose) { document.removeEventListener("mousedown", S._popClose); S._popClose = null; } }
function showPop(pop, anchor, w = 280) {
  const r = anchor.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - 80) + "px";
  (root || document.body).appendChild(pop);   // dentro do .gp-root: o CSS escopado se aplica
  const close = (e) => { if (!pop.contains(e.target)) closePop(); };
  S._popClose = close;
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

/* ======================= DRAW ======================= */
function draw() {
  closePop();
  S.cols = colsAll().filter((c) => !S.hide.has(c.id) || c.primary);
  S.ocultos = colsAll().filter((c) => S.hide.has(c.id) && !c.primary);
  clear(S.container);
  root = h("div", { class: "gp-root grade-view" });
  S.container.appendChild(root);
  root.appendChild(buildCmdbar());
  root.appendChild(buildBulkbar());
  const wrap = h("div", { class: "table-wrap", id: "gp-wrap" });
  const table = h("table", { class: "grade" });
  table.appendChild(buildColgroup());
  table.appendChild(buildThead());
  const tbody = h("tbody", { id: "gp-body" });
  table.appendChild(tbody);
  wrap.appendChild(table);
  root.appendChild(wrap);
  S.table = table; S.tbody = tbody; S.wrap = wrap;
  fixTableWidth();
  renderBody();
  configurarResize();
  wrap.addEventListener("scroll", () => wrap.classList.toggle("scrolled", wrap.scrollLeft > 0));
}

function buildCmdbar() {
  const search = h("input", { id: "gp-busca", type: "search", placeholder: "Buscar…", value: S.busca });
  search.addEventListener("input", () => { clearTimeout(S._bt); const v = search.value; S._bt = setTimeout(() => { S.busca = v; renderBody(); }, 200); });
  return h("div", { class: "cmdbar" },
    h("div", { class: "search" }, h("span", { class: "s-ic", html: ic("search", 15) }), search),
    filtrado() ? h("span", { class: "count", id: "gp-count" }, `${viewRows().length} de ${ctx.rows.length}`) : null,
    h("span", { class: "spacer" }),
    S.ocultos.length ? h("button", { class: "btn btn-light btn-sm gp-ocultas", onClick: (e) => menuOcultas(e.currentTarget), html: ic("eye-off", 14) + ` <span>${S.ocultos.length} oculta(s)</span>` }) : null,
    h("span", { class: "cmd-divider" }),
    h("button", { class: "btn btn-light btn-sm" + (nFiltros() ? " is-on" : ""), onClick: abrirModalFiltros, html: ic("filter", 14) + " Filtros" + (nFiltros() ? ` <span class="badge-on">${nFiltros()}</span>` : "") }),
    h("button", { class: "btn btn-light btn-sm" + (S.agruparPor ? " is-on" : ""), onClick: (e) => menuAgrupar(e.currentTarget), html: ic("group", 14) + " Agrupar" }),
    h("button", { class: "btn btn-light btn-sm" + (S.ordenarPor ? " is-on" : ""), onClick: (e) => menuOrdenar(e.currentTarget), html: ic("sort", 14) + " Ordenar" }),
    h("span", { class: "cmd-divider" }),
    h("button", { class: "btn btn-light btn-sm", onClick: () => ctx.onGoOriginal && ctx.onGoOriginal() }, "Ver aba original"),
    h("button", { class: "btn btn-light btn-sm", title: "Recalcular contagens", onClick: async () => { if (ctx.onRecount) { await ctx.onRecount(); renderBody(); } } }, "↻ Status"),
    h("button", { class: "btn btn-primary btn-sm", onClick: () => ctx.onAdd && ctx.onAdd(), html: ic("plus", 15) + " Linha" }));
}
function buildBulkbar() {
  return h("div", { class: "bulkbar", id: "gp-bulkbar", style: { display: "none" } },
    h("span", { class: "bulk-count" }, ""),
    h("span", { class: "spacer" }),
    h("button", { class: "btn btn-light btn-sm bulk-danger", onClick: bulkExcluir, html: ic("trash", 14) + " Excluir selecionados" }),
    h("button", { class: "btn btn-light btn-sm", onClick: () => { S.sel.clear(); renderBody(); }, html: ic("x", 14) + " Limpar seleção" }));
}
function buildColgroup() {
  const cg = h("colgroup", { id: "gp-colgroup" });
  cg.appendChild(h("col", { style: { width: SEL_W + "px" } }));
  cg.appendChild(h("col", { style: { width: GUT_W + "px" } }));
  S.cols.forEach((c) => cg.appendChild(h("col", { "data-col": c.id, style: { width: larguraDe(c) + "px" } })));
  return cg;
}
function larguraTotal() { let t = SEL_W + GUT_W; S.cols.forEach((c) => t += larguraDe(c)); return t; }
function fixTableWidth() { if (S.table) S.table.style.width = larguraTotal() + "px"; }

function escAttr(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function buildThead() {
  const tr = h("tr", {});
  const selAll = h("input", { type: "checkbox", id: "gp-selall", class: "cell-check" });
  selAll.addEventListener("change", () => { const vis = viewRows(); if (selAll.checked) vis.forEach((r) => S.sel.add(r.id)); else vis.forEach((r) => S.sel.delete(r.id)); renderBody(); });
  tr.appendChild(h("th", { class: "th-sel sticky-sel" }, selAll));
  tr.appendChild(h("th", { class: "th-num sticky-num" }, h("span", { class: "th-num-h" }, "#")));
  S.cols.forEach((f) => {
    const temFiltro = S.filtros[f.id] != null;
    const seta = S.ordenarPor === f.id ? ic(S.ordenarDir === "desc" ? "sort-desc" : "sort-asc", 13) : "";
    const th = h("th", { class: "th-col" + (f.primary ? " sticky-col" : "") + (temFiltro ? " col-filtro-ativo" : ""), "data-col": f.id });
    const rotulo = h("span", { class: "th-rotulo", title: f.nome, html:
      `<span class="th-ic">${ic(ICONE_TIPO[f.tipo] || "align-left", 13)}</span><span class="th-lab">${escAttr(f.nome)}</span><span class="sort-ind">${seta}</span>` +
      (temFiltro ? `<span class="th-funil" title="Filtro ativo">${ic("funnel", 12)}</span>` : "") });
    const caret = h("button", { class: "th-menu", title: "Opções da coluna", html: ic("chevron-down", 13) });
    const open = (e) => { e.stopPropagation(); menuColuna(caret, f); };
    rotulo.addEventListener("click", open); caret.addEventListener("click", open);
    th.appendChild(rotulo); th.appendChild(caret);
    th.appendChild(h("span", { class: "col-resize", "data-col": f.id, title: "Arraste para redimensionar (duplo-clique = ajustar)" }));
    tr.appendChild(th);
  });
  return h("thead", { id: "gp-thead" }, tr);
}

function updateCount() {
  const bar = root.querySelector(".cmdbar"); if (!bar) return;
  let c = $("#gp-count");
  if (filtrado()) { if (!c) { c = h("span", { class: "count", id: "gp-count" }); bar.querySelector(".search").after(c); } c.textContent = `${viewRows().length} de ${ctx.rows.length}`; }
  else if (c) c.remove();
}
function renderBody() {
  clear(S.tbody);
  const vis = viewRows();
  let numero = 0;
  const addRow = (row) => { numero++; S.tbody.appendChild(linhaRegistro(row, numero)); };
  if (S.agruparPor) {
    const col = colsAll().find((c) => c.id === S.agruparPor);
    agrupar(vis, col).forEach((g) => {
      const collapsed = S.colapsados.has(g.chave);
      S.tbody.appendChild(h("tr", { class: "grp-row" + (collapsed ? " is-collapsed" : "") },
        h("td", { colspan: String(2 + S.cols.length) },
          h("div", { class: "grp-head", onClick: () => { if (collapsed) S.colapsados.delete(g.chave); else S.colapsados.add(g.chave); renderBody(); } },
            h("span", { class: "grp-chevron", html: ic("chevron-down", 14) }), h("span", {}, g.rotulo), h("span", { class: "grp-count" }, String(g.rows.length))))));
      if (!collapsed) g.rows.forEach(addRow);
    });
  } else vis.forEach(addRow);
  if (!vis.length) S.tbody.appendChild(h("tr", {}, h("td", { class: "sc-empty", colspan: String(2 + S.cols.length) }, filtrado() ? "Nada encontrado." : "Sem solicitações.")));
  updateCount();
  atualizarSelecao();
}
function agrupar(rows, col) {
  const map = new Map();
  rows.forEach((r) => { const raw = rawVal(r, col); const key = (Array.isArray(raw) ? raw.join(", ") : String(raw)) || "__vazio__"; if (!map.has(key)) map.set(key, []); map.get(key).push(r); });
  const out = [...map.entries()].map(([chave, rs]) => ({ chave, rotulo: chave === "__vazio__" ? "(vazio)" : chave, rows: rs }));
  out.sort((a, b) => a.chave === "__vazio__" ? 1 : b.chave === "__vazio__" ? -1 : a.rotulo.localeCompare(b.rotulo, "pt"));
  return out;
}
function linhaRegistro(row, numero) {
  const tr = h("tr", {});
  if (S.sel.has(row.id)) tr.classList.add("is-sel");
  const cb = h("input", { type: "checkbox", class: "cell-check", checked: S.sel.has(row.id) });
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", () => { if (cb.checked) S.sel.add(row.id); else S.sel.delete(row.id); tr.classList.toggle("is-sel", cb.checked); atualizarSelecao(); });
  tr.appendChild(h("td", { class: "td-sel sticky-sel" }, cb));
  const del = h("button", { class: "row-del", title: "Excluir linha", html: ic("trash", 14) });
  del.addEventListener("click", (e) => { e.stopPropagation(); ctx.onDelete && ctx.onDelete(row); });
  tr.appendChild(h("td", { class: "td-num sticky-num" }, h("span", { class: "row-n" }, String(numero)), del));
  S.cols.forEach((c) => tr.appendChild(montarCelula(row, c)));
  return tr;
}
function montarCelula(row, col) {
  if (col.tipo === "tags") { const td = h("td", { class: "sc-edit" + (col.primary ? " sticky-col td-primaria" : "") }); paintTags(td, row); td.onclick = () => editTags(td, row); return td; }
  if (col.tipo === "aba") return abaCell(row);
  if (col.tipo === "statusnum") { const n = rawVal(row, col); return h("td", { class: "td-st td-right" }, n ? String(n) : h("span", { class: "cell-empty" }, "·")); }
  return textCell(row, col);
}
function paintTags(td, row) {
  clear(td);
  const arr = row.area || [];
  if (!arr.length) { td.appendChild(h("span", { class: "cell-empty" }, "—")); return; }
  const box = h("div", { class: "cell-chips" });
  arr.forEach((a) => box.appendChild(h("span", { class: "badge" }, a)));   // Área SEM cor
  td.appendChild(box);
}
function textCell(row, col) {
  const td = h("td", { class: "sc-edit" });
  const paint = () => { clear(td); if (row[col.id]) td.appendChild(document.createTextNode(row[col.id])); else td.appendChild(h("span", { class: "cell-empty" }, "—")); };
  paint();
  td.onclick = () => {
    if (td.querySelector("input")) return;
    const inp = h("input", { class: "gp-input", value: row[col.id] || "" });
    clear(td); td.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const fin = (commit) => { if (done) return; done = true; if (commit && inp.value.trim() !== (row[col.id] || "")) ctx.onEdit(row, { [col.id]: inp.value.trim() }); paint(); };
    inp.addEventListener("blur", () => fin(true));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } else if (e.key === "Escape") fin(false); });
  };
  return td;
}
function abaCell(row) {
  const td = h("td", { class: "sc-edit sc-aba" });
  const paint = () => {
    clear(td);
    if (row.sheet_link) {
      td.appendChild(h("span", { class: "badge" }, row.sheet_link));
      const eye = h("button", { class: "aba-eye", title: "Ir para a aba", html: ic("eye", 14) });
      eye.addEventListener("click", (e) => { e.stopPropagation(); ctx.onGoAba && ctx.onGoAba(row.sheet_link); });
      td.appendChild(eye);
    } else td.appendChild(h("span", { class: "cell-empty" }, "—"));
  };
  paint();
  td.onclick = () => abrirDropdownAba(td, row, paint);
  return td;
}
function editTags(td, row) {
  closePop();
  const pop = h("div", { class: "dd-pop" });
  const listEl = h("div", { class: "dd-list" });
  const sel = new Set(row.area || []);
  const labels = (ctx.areas || []).slice();
  (row.area || []).forEach((a) => { if (!labels.includes(a)) labels.push(a); });
  const checks = [];
  const addOpt = (label, on) => { const cb = h("input", { type: "checkbox", checked: on }); checks.push({ cb, label }); listEl.appendChild(h("label", { class: "dd-opt" }, cb, h("span", { class: "badge" }, label))); };
  labels.forEach((l) => addOpt(l, sel.has(l)));
  const novo = h("input", { class: "gp-input", placeholder: "+ nova área" });
  const add = h("button", { class: "btn btn-light btn-sm", onClick: async () => { const v = novo.value.trim(); if (!v) return; if (ctx.onAddArea) await ctx.onAddArea(v); addOpt(v, true); novo.value = ""; } }, "Add");
  const pronto = h("button", { class: "btn btn-primary btn-sm", onClick: () => { ctx.onEdit(row, { area: checks.filter((x) => x.cb.checked).map((x) => x.label) }); paintTags(td, row); closePop(); } }, "Pronto");
  pop.appendChild(listEl);
  pop.appendChild(h("div", { class: "dd-foot" }, novo, add, pronto));
  showPop(pop, td);
}
function abrirDropdownAba(td, row, paint) {
  closePop();
  const pop = h("div", { class: "dd-pop" });
  const listEl = h("div", { class: "dd-list" });
  const pick = (name) => { ctx.onEdit(row, { sheet_link: name }); paint(); closePop(); renderBody(); };
  listEl.appendChild(h("button", { class: "dd-opt", onClick: () => pick("") }, h("span", { class: "muted" }, "— sem aba —")));
  (ctx.abas || []).forEach((a) => listEl.appendChild(h("button", { class: "dd-opt" + (row.sheet_link === a.name ? " on" : ""), onClick: () => pick(a.name) }, h("span", {}, a.name), a.sub ? h("span", { class: "dd-sub" }, a.sub) : null)));
  pop.appendChild(listEl);
  showPop(pop, td);
}

function atualizarSelecao() {
  const all = $("#gp-selall");
  const vis = viewRows().map((r) => r.id);
  const selVis = vis.filter((id) => S.sel.has(id));
  if (all) { all.checked = !!vis.length && selVis.length === vis.length; all.indeterminate = selVis.length > 0 && selVis.length < vis.length; }
  const bb = $("#gp-bulkbar");
  if (bb) { bb.style.display = S.sel.size ? "flex" : "none"; const c = bb.querySelector(".bulk-count"); if (c) c.textContent = `${S.sel.size} selecionado(s)`; }
}
async function bulkExcluir() { const ids = [...S.sel]; if (!ids.length) return; if (ctx.onDeleteMany) await ctx.onDeleteMany(ids); S.sel.clear(); }

/* ---------------- menus ---------------- */
function cmItem(label, fn, iconName) { return h("button", { class: "cm-item", onClick: () => { closePop(); fn(); } }, iconName ? h("span", { class: "cm-ic", html: ic(iconName, 14) }) : null, h("span", {}, label)); }
function menuColuna(anchor, f) {
  closePop();
  const m = h("div", { class: "col-menu" });
  m.appendChild(cmItem("Ordenar crescente (A→Z)", () => { S.ordenarPor = f.id; S.ordenarDir = "asc"; draw(); }, "sort-asc"));
  m.appendChild(cmItem("Ordenar decrescente (Z→A)", () => { S.ordenarPor = f.id; S.ordenarDir = "desc"; draw(); }, "sort-desc"));
  m.appendChild(cmItem(S.agruparPor === f.id ? "Remover agrupamento" : "Agrupar por esta coluna", () => { S.agruparPor = S.agruparPor === f.id ? null : f.id; S.colapsados = new Set(); draw(); }, "group"));
  m.appendChild(h("div", { class: "cm-sep" }));
  m.appendChild(blocoFiltro(f));
  m.appendChild(h("div", { class: "cm-sep" }));
  if (!f.primary) m.appendChild(cmItem("Ocultar coluna", () => { const a = lsHide(); if (!a.includes(f.id)) a.push(f.id); lsHideSet(a); S.hide = new Set(a); draw(); }, "eye-off"));
  m.appendChild(cmItem("Ajustar largura ao conteúdo", () => autoFit(f), "align-left"));
  showPop(m, anchor, 260);
}
function blocoFiltro(f) {
  const box = h("div", { class: "cm-filtro" });
  const spec0 = S.filtros[f.id];
  if (f.tipo === "tags" || f.tipo === "aba") {
    const opts = f.tipo === "tags" ? (ctx.areas || []) : (ctx.abas || []).map((a) => a.name);
    const cur = new Set((spec0 && spec0.vals) || []);
    const cl = h("div", { class: "cm-checklist" });
    const checks = [];
    const mk = (val, lbl) => { const cb = h("input", { type: "checkbox", checked: cur.has(val) }); checks.push({ cb, val }); cl.appendChild(h("label", { class: "cm-chk" }, cb, h("span", {}, lbl))); };
    opts.forEach((o) => mk(String(o), String(o))); mk("__vazio__", "(vazio)");
    box.appendChild(cl);
    box.appendChild(h("div", { class: "cm-acts" },
      h("button", { class: "btn btn-light btn-sm", onClick: () => { delete S.filtros[f.id]; draw(); } }, "Limpar"),
      h("button", { class: "btn btn-primary btn-sm", onClick: () => { const vals = checks.filter((x) => x.cb.checked).map((x) => x.val); S.filtros[f.id] = vals.length ? { op: "in", vals } : null; draw(); } }, "Aplicar")));
  } else {
    const inp = h("input", { class: "cm-input", placeholder: "Contém…", value: (spec0 && spec0.v) || "" });
    const apply = () => { S.filtros[f.id] = inp.value.trim() ? { op: "contem", v: inp.value.trim() } : null; draw(); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
    box.appendChild(inp);
    box.appendChild(h("div", { class: "cm-acts" },
      h("button", { class: "btn btn-light btn-sm", onClick: () => { delete S.filtros[f.id]; draw(); } }, "Limpar"),
      h("button", { class: "btn btn-primary btn-sm", onClick: apply }, "Aplicar")));
  }
  return box;
}
function menuOrdenar(anchor) {
  closePop();
  const m = h("div", { class: "col-menu" });
  if (S.ordenarPor) m.appendChild(cmItem("Sem ordenação", () => { S.ordenarPor = null; draw(); }, "x"));
  S.cols.forEach((c) => m.appendChild(cmItem(c.nome + (S.ordenarPor === c.id ? (S.ordenarDir === "desc" ? "  ↓" : "  ↑") : ""), () => { if (S.ordenarPor === c.id) S.ordenarDir = S.ordenarDir === "asc" ? "desc" : "asc"; else { S.ordenarPor = c.id; S.ordenarDir = "asc"; } draw(); })));
  showPop(m, anchor, 240);
}
function menuAgrupar(anchor) {
  closePop();
  const m = h("div", { class: "col-menu" });
  if (S.agruparPor) m.appendChild(cmItem("Sem agrupamento", () => { S.agruparPor = null; draw(); }, "x"));
  S.cols.filter((c) => c.tipo !== "statusnum").forEach((c) => m.appendChild(cmItem(c.nome + (S.agruparPor === c.id ? "  ✓" : ""), () => { S.agruparPor = c.id; S.colapsados = new Set(); draw(); })));
  showPop(m, anchor, 240);
}
function menuOcultas(anchor) {
  closePop();
  const m = h("div", { class: "col-menu" });
  m.appendChild(h("div", { class: "cm-title" }, "Mostrar colunas"));
  S.ocultos.forEach((c) => m.appendChild(cmItem(c.nome, () => { const a = lsHide().filter((x) => x !== c.id); lsHideSet(a); S.hide = new Set(a); draw(); }, "eye")));
  showPop(m, anchor, 220);
}
function abrirModalFiltros() {
  const filtraveis = S.cols.filter((c) => c.tipo === "tags" || c.tipo === "aba");
  closePop();
  const scrim = h("div", { class: "scrim" });
  const close = () => scrim.remove();
  const body = h("div", { class: "fmod" });
  body.appendChild(h("div", { class: "fmod-top" }, h("span", {}, "Filtrar registros"),
    h("button", { class: "btn btn-light btn-sm", onClick: () => { S.filtros = {}; close(); draw(); } }, "Limpar tudo")));
  const groups = [];
  filtraveis.forEach((f) => {
    const opts = f.tipo === "tags" ? (ctx.areas || []) : (ctx.abas || []).map((a) => a.name);
    const cur = new Set((S.filtros[f.id] && S.filtros[f.id].vals) || []);
    const cl = h("div", { class: "cm-checklist" });
    const checks = [];
    const mk = (val, lbl) => { const cb = h("input", { type: "checkbox", checked: cur.has(val) }); checks.push({ cb, val }); cl.appendChild(h("label", { class: "cm-chk" }, cb, h("span", {}, lbl))); };
    opts.forEach((o) => mk(String(o), String(o))); mk("__vazio__", "(vazio)");
    groups.push({ f, checks });
    body.appendChild(h("div", { class: "fmod-sec" }, h("h4", { class: "fmod-h" }, f.nome), cl));
  });
  if (!filtraveis.length) body.appendChild(h("p", { class: "muted" }, "Sem colunas filtráveis."));
  const foot = h("div", { class: "modal-foot" },
    h("button", { class: "btn btn-ghost", onClick: close }, "Cancelar"),
    h("button", { class: "btn btn-primary", onClick: () => { groups.forEach(({ f, checks }) => { const vals = checks.filter((x) => x.cb.checked).map((x) => x.val); S.filtros[f.id] = vals.length ? { op: "in", vals } : null; }); close(); draw(); } }, "Aplicar"));
  const modal = h("div", { class: "modal", style: { width: "560px", maxWidth: "calc(100vw - 32px)" } }, h("h3", {}, "Filtros"), body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  (root || document.body).appendChild(scrim);
}

/* ---------------- resize ---------------- */
function configurarResize() {
  S.table.querySelectorAll(".col-resize").forEach((handle) => {
    const cid = handle.getAttribute("data-col");
    const colEl = S.table.querySelector(`colgroup col[data-col="${cid}"]`);
    const col = S.cols.find((c) => c.id === cid);
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const x0 = e.clientX, w0 = parseFloat(colEl.style.width) || larguraDe(col);
      document.body.classList.add("gp-resizing");
      const move = (ev) => { const w = Math.max(larguraMin(col), Math.round(w0 + ev.clientX - x0)); colEl.style.width = w + "px"; S.larg[cid] = w; fixTableWidth(); };
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.classList.remove("gp-resizing"); lsWset(S.larg); };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
    handle.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); autoFit(col); });
  });
}
function autoFit(col) {
  const idx = S.cols.indexOf(col); if (idx < 0) return;
  const cellIndex = 2 + idx;
  const c2 = document.createElement("canvas").getContext("2d");
  c2.font = "600 12.5px 'IBM Plex Sans', sans-serif";
  let max = 80;
  S.tbody.querySelectorAll("tr").forEach((tr) => { const td = tr.children[cellIndex]; if (td) max = Math.max(max, c2.measureText(td.textContent || "").width + 28); });
  max = Math.max(AUTOFIT_MIN, Math.min(AUTOFIT_MAX, Math.round(max)));
  S.larg[col.id] = max; lsWset(S.larg);
  const colEl = S.table.querySelector(`colgroup col[data-col="${col.id}"]`); if (colEl) colEl.style.width = max + "px";
  fixTableWidth();
}
