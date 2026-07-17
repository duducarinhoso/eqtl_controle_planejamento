/* ListView vanilla — port do ListView.tsx (eqtl_cronograma_fechamento, React).
   Toolbar padrão do sistema: busca + Filtrar/Agrupar/Classificar/Exportar (estilo
   Microsoft Lists), filtros multi-seleção e por intervalo de datas (calendário),
   chips de filtro ativo, seleção em lote, e a tabela dentro de .table-panel.
   Deriva tudo das colunas. Persiste a visão em localStorage. Monta o DataGrid.
   Fonte de verdade do comportamento: o ListView.tsx original. */
import { DataGrid } from "./datagrid.js";
import { getXLSX } from "./excel.js";

/* ---- helpers de texto/data (port de lib/text.ts e lib/format.ts) ---- */
function matchesTerm(fields, term) {
  const t = String(term || "").trim().toLowerCase();
  if (!t) return true;
  return fields.some((v) => String(v ?? "").toLowerCase().includes(t));
}
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function fmtData(d) {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  if (!y || !m || !day) return d;
  const dow = DIAS_SEMANA[new Date(Number(y), Number(m) - 1, Number(day)).getDay()];
  return `${day}/${m}/${y} ${dow}`;
}
const pad2 = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function datePreset(preset, today) {
  const dow = (today.getDay() + 6) % 7;
  const seg = new Date(today); seg.setDate(today.getDate() - dow);
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  if (preset === "hoje") return { de: isoLocal(today), ate: isoLocal(today) };
  if (preset === "semana") return { de: isoLocal(seg), ate: isoLocal(dom) };
  if (preset === "proxima") { const s = new Date(seg); s.setDate(seg.getDate() + 7); const d = new Date(s); d.setDate(s.getDate() + 6); return { de: isoLocal(s), ate: isoLocal(d) }; }
  const y = new Date(today); y.setDate(today.getDate() - 1); return { de: "", ate: isoLocal(y) };
}
function colLabel(c) { return c.menuLabel ?? (typeof c.header === "string" ? c.header : c.headerLabel ?? c.key); }
function textAccessor(c) { return c.cellText ?? c.filterValue ?? c.dateValue ?? c.groupValue; }

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "style") Object.assign(e.style, v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  return e;
}
const ICO = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  filtrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></svg>',
  agrupar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  classificar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden><path d="M3 6h11M3 12h7M3 18h4M17 4v14M17 18l3.5-3.5M17 18l-3.5-3.5"/></svg>',
  exportar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
};

const LV_PREFIX = "eqtl.listview.controle.";

/* ---- Calendário de intervalo (port de DateRangeCalendar.tsx) ---- */
function buildCalendar(value, onChange, today) {
  const WEEK = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const fromISO = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null; };
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fmtBR = (s) => { const d = fromISO(s); return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : "—"; };
  const hoje = sod(today);
  const root = el("div", "cal");
  let view;
  const de0 = fromISO(value.de), ate0 = fromISO(value.ate);
  view = new Date((de0 ?? ate0 ?? hoje).getFullYear(), (de0 ?? ate0 ?? hoje).getMonth(), 1);

  function pick(day) {
    const iso = isoLocal(day); const de = fromISO(value.de), ate = fromISO(value.ate);
    if (!de || (de && ate)) onChange({ de: iso, ate: "" });
    else if (day < de) onChange({ de: iso, ate: value.de });
    else onChange({ de: value.de, ate: iso });
  }
  function render() {
    root.replaceChildren();
    const de = fromISO(value.de), ate = fromISO(value.ate);
    const range = el("div", "cal-range", { "aria-hidden": true });
    range.innerHTML = `<span class="cal-range-box${de && !ate ? " active" : ""}"><em>De</em>${fmtBR(value.de)}</span><span class="cal-range-sep">→</span><span class="cal-range-box"><em>Até</em>${fmtBR(value.ate)}</span>`;
    root.appendChild(range);
    const head = el("div", "cal-head");
    const prev = el("button", "cal-nav", { type: "button", "aria-label": "Mês anterior" }); prev.textContent = "‹";
    const title = el("span", "cal-title", { html: `${MES[view.getMonth()]} <b>${view.getFullYear()}</b>` });
    const next = el("button", "cal-nav", { type: "button", "aria-label": "Próximo mês" }); next.textContent = "›";
    prev.onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); };
    next.onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); };
    head.append(prev, title, next); root.appendChild(head);
    const dow = el("div", "cal-dow", { "aria-hidden": true }); dow.innerHTML = WEEK.map((w) => `<span>${w}</span>`).join(""); root.appendChild(dow);
    const grid = el("div", "cal-grid", { role: "grid" });
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(first.getDate() - offset);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const inMonth = d.getMonth() === view.getMonth();
      const isDe = de && sameDay(d, de), isAte = ate && sameDay(d, ate);
      const inRange = de && ate && d > de && d < ate, isToday = sameDay(d, hoje);
      const cls = ["cal-day", inMonth ? "" : "muted", isDe ? "is-de" : "", isAte ? "is-ate" : "", inRange ? "in-range" : "", isToday ? "today" : ""].filter(Boolean).join(" ");
      const b = el("button", cls, { type: "button", role: "gridcell" }); b.textContent = d.getDate();
      b.onclick = () => pick(d);
      grid.appendChild(b);
    }
    root.appendChild(grid);
  }
  render();
  return root;
}

export class ListView {
  constructor(container, opts = {}) {
    this.container = container;
    this.columns = opts.columns || [];
    this.rows = opts.rows || [];
    this.selectable = !!opts.selectable;
    this.onRowClick = opts.onRowClick || null;
    this.onCellEdit = opts.onCellEdit || null;
    this.searchPlaceholder = opts.searchPlaceholder || "Buscar…";
    this.emptyMessage = opts.emptyMessage || "Nenhum registro encontrado.";
    this.actions = opts.actions || null;         // Node
    this.bulkActions = opts.bulkActions || null; // (selectedRows, clear) -> Node[]
    this.showExport = opts.showDefaultExport !== false;
    this.csvFilename = opts.csvFilename || "dados.xlsx";
    this.today = opts.today || new Date();
    this.persistKey = opts.persistKey || null;
    this.initialGroupBy = opts.initialGroupBy || null;
    this.initialExpandedGroups = opts.initialExpandedGroups || null;

    const p = this._load();
    this.busca = "";
    // initialColSel (ex.: drill vindo do Dashboard) tem precedencia sobre o estado salvo
    this.colSel = this._setsFromArrays(opts.initialColSel || p?.colSel);   // {dim: Set}
    this.dateSel = p?.dateSel ? { ...p.dateSel } : {}; // {dim: {de,ate}}
    this.sort = p?.sort || null;
    this.groupBy = p?.groupBy ?? this.initialGroupBy ?? null;
    this.selectedIds = new Set();
    this.toolMenu = null;    // 'filtrar'|'agrupar'|'classificar'
    this.filterCol = null;
    this.valSearch = "";

    this._deriveDims();
    this._build();
  }

  /* ---- dimensões derivadas das colunas ---- */
  _deriveDims() {
    const dims = [];
    for (const c of this.columns) {
      if (c.dateValue) dims.push({ key: c.key, label: colLabel(c), kind: "date", accessor: c.dateValue });
      else if (c.filterValue) dims.push({ key: c.key, label: colLabel(c), kind: "choice", accessor: c.filterValue });
    }
    this.filterDims = dims;
    this.dimByKey = Object.fromEntries(dims.map((d) => [d.key, d]));
    this.filterableKeys = new Set(dims.map((d) => d.key));
    this.groupableCols = this.columns.filter((c) => c.groupValue ?? c.filterValue);
    this.sortableCols = this.columns.filter((c) => textAccessor(c)).map((c) => ({ key: c.key, label: colLabel(c) }));
    this.sortAcc = {};
    for (const c of this.columns) { const a = textAccessor(c); if (a) this.sortAcc[c.key] = a; }
    // colunas repassadas à tabela: injeta sortKey, deriva groupValue, remove filterValue (filtro é na toolbar)
    this.tableColumns = this.columns.map((c) => ({ ...c, sortKey: c.sortKey ?? (this.sortAcc[c.key] ? c.key : undefined), groupValue: c.groupValue ?? c.filterValue, filterValue: undefined }));
  }

  /* ---- persistência ---- */
  _load() { if (!this.persistKey) return null; try { const raw = localStorage.getItem(LV_PREFIX + this.persistKey); const p = raw ? JSON.parse(raw) : null; return p && p.v === 1 ? p : null; } catch { return null; } }
  _save() {
    if (!this.persistKey) return;
    const colSel = {}; for (const [k, s] of Object.entries(this.colSel)) if (s.size) colSel[k] = [...s];
    const dateSel = {}; for (const [k, r] of Object.entries(this.dateSel)) if (r && (r.de || r.ate)) dateSel[k] = r;
    try { localStorage.setItem(LV_PREFIX + this.persistKey, JSON.stringify({ v: 1, groupBy: this.groupBy || undefined, sort: this.sort || undefined, colSel, dateSel })); } catch { /* best-effort */ }
  }
  _setsFromArrays(o) { const out = {}; if (o) for (const [k, arr] of Object.entries(o)) if (arr?.length) out[k] = new Set(arr); return out; }

  /* ---- dados: base (filtros+busca) -> ordenação ---- */
  _baseRows() {
    let arr = this.rows;
    for (const [dim, set] of Object.entries(this.colSel)) {
      const d = this.dimByKey[dim];
      if (d && d.kind === "choice" && set.size) arr = arr.filter((r) => set.has(d.accessor(r)));
    }
    for (const [dim, dr] of Object.entries(this.dateSel)) {
      const d = this.dimByKey[dim];
      if (d && d.kind === "date" && (dr.de || dr.ate)) arr = arr.filter((r) => { const v = d.accessor(r); if (!v) return false; if (dr.de && v < dr.de) return false; if (dr.ate && v > dr.ate) return false; return true; });
    }
    if (this.busca.trim()) { const accs = this.columns.map(textAccessor).filter(Boolean); arr = arr.filter((r) => matchesTerm(accs.map((a) => a(r)), this.busca)); }
    return arr;
  }
  _displayRows() {
    const arr = [...this._baseRows()];
    if (this.sort && this.sortAcc[this.sort.key]) {
      const acc = this.sortAcc[this.sort.key];
      arr.sort((a, b) => { const va = acc(a), vb = acc(b); const c = va < vb ? -1 : va > vb ? 1 : 0; return this.sort.dir === "asc" ? c : -c; });
    }
    return arr;
  }

  /* ---- estado de filtro (resumos/chips) ---- */
  _dimOptions(d) {
    if (d.kind !== "choice") return [];
    const s = new Set(); for (const r of this.rows) { const v = d.accessor(r); if (v != null && v !== "") s.add(v); }
    return [...s].sort((a, b) => a.localeCompare(b, "pt")).map((v) => ({ value: v, label: v }));
  }
  _dimAtiva(d) { return d.kind === "choice" ? (this.colSel[d.key]?.size ?? 0) > 0 : d.kind === "date" ? !!(this.dateSel[d.key]?.de || this.dateSel[d.key]?.ate) : false; }
  _dimResumo(d) {
    if (d.kind === "choice") { const s = this.colSel[d.key]; if (!s || !s.size) return "Todos"; if (s.size === 1) return [...s][0]; return `${s.size} selecionados`; }
    const dr = this.dateSel[d.key]; return dr && (dr.de || dr.ate) ? `${dr.de ? fmtData(dr.de) : "…"} – ${dr.ate ? fmtData(dr.ate) : "…"}` : "Todos";
  }
  _activeFilterKeys() { const s = new Set(); for (const [k, set] of Object.entries(this.colSel)) if (set.size) s.add(k); for (const [k, dr] of Object.entries(this.dateSel)) if (dr.de || dr.ate) s.add(k); return s; }

  /* ---- mutações ---- */
  _setBusca(v) { this.busca = v; this._pushRows(); }
  _toggleColVal(dim, val) { const set = new Set(this.colSel[dim] ?? []); if (set.has(val)) set.delete(val); else set.add(val); if (set.size) this.colSel[dim] = set; else delete this.colSel[dim]; this._save(); this._rerender(); }
  _limparColDim(dim) { delete this.colSel[dim]; this._save(); this._rerender(); }
  _limparDateDim(dim) { delete this.dateSel[dim]; this._save(); this._rerender(); }
  _setDate(dim, range) { this.dateSel[dim] = range; this._save(); this._rerender(); }
  _limparTudo() { this.colSel = {}; this.dateSel = {}; this.busca = ""; this._save(); this._rerender(); }
  _setSort(v) { this.sort = v || null; this._save(); if (this.grid) this.grid.sort = this.sort; this._pushRows(); this._renderToolbar(); }
  _setGroupBy(v) { this.groupBy = v || null; this._save(); this.grid?.setGroupBy(this.groupBy); this._renderToolbar(); }
  _onSortChange(key, dir) {
    if (dir === null) return this._setSort(null);
    if (dir) return this._setSort({ key, dir });
    this._setSort(this.sort?.key === key ? { key, dir: this.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  /* ---- seleção ---- */
  _toggleSelect(id) { const n = new Set(this.selectedIds); if (n.has(id)) n.delete(id); else n.add(id); this.selectedIds = n; this.grid?.setSelectedIds(n); this._renderBulk(); }
  _toggleSelectAll(checked) { const n = new Set(this.selectedIds); for (const r of this._displayRows()) { if (checked) n.add(r.id); else n.delete(r.id); } this.selectedIds = n; this.grid?.setSelectedIds(n); this._renderBulk(); }
  _toggleSelectMany(ids, checked) { const n = new Set(this.selectedIds); for (const id of ids) { if (checked) n.add(id); else n.delete(id); } this.selectedIds = n; this.grid?.setSelectedIds(n); this._renderBulk(); }
  _clearSelection() { this.selectedIds = new Set(); this.grid?.setSelectedIds(this.selectedIds); this._renderBulk(); }

  setRows(rows) { this.rows = rows || []; this._pushRows(); this._renderToolbar(); }
  _pushRows() { const disp = this._displayRows(); this.grid?.setRows(disp); this.grid?.setActiveFilterKeys(this._activeFilterKeys()); }
  _rerender() { this._pushRows(); this._renderToolbar(); }

  /* ---- export (SheetJS) ---- */
  async _exportar() {
    const sel = this._displayRows().filter((r) => this.selectedIds.has(r.id));
    const alvo = sel.length ? sel : this._displayRows();
    if (!alvo.length) return;
    const XLSX = await getXLSX();
    const heads = this.columns.map((c) => (typeof c.header === "string" ? c.header : colLabel(c)));
    const aoa = [heads];
    for (const r of alvo) aoa.push(this.columns.map((c) => (c.cellText ? c.cellText(r) : (c.filterValue ? c.filterValue(r) : ""))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, this.csvFilename.endsWith(".xlsx") ? this.csvFilename : this.csvFilename + ".xlsx");
  }

  /* ---- construção ---- */
  _build() {
    this.container.classList.add("dg");
    this.panel = el("div", "table-panel");
    this.toolbar = el("div", "page-toolbar");
    this.chipsBar = el("div", "filter-bar filter-chips-bar");
    this.bulkSlot = el("div");
    this.gridSlot = el("div", null, { style: { flex: "1", minHeight: "0", display: "flex", flexDirection: "column" } });
    this.panel.append(this.toolbar, this.chipsBar, this.bulkSlot, this.gridSlot);
    this.container.replaceChildren(this.panel);

    this.grid = new DataGrid(this.gridSlot, {
      columns: this.tableColumns, rows: this._displayRows(), selectable: this.selectable,
      fillHeight: true, emptyMessage: this.emptyMessage, onRowClick: this.onRowClick,
      sort: this.sort, onSortChange: (k, d) => this._onSortChange(k, d),
      groupBy: this.groupBy, onGroupByChange: (k) => this._setGroupBy(k),
      initialExpandedGroups: this.initialExpandedGroups,
      filterableKeys: this.filterableKeys, activeFilterKeys: this._activeFilterKeys(),
      onFilterColumn: (key) => { this.toolMenu = "filtrar"; this.filterCol = key; this.valSearch = ""; this._renderToolbar(); },
      onCellEdit: this.onCellEdit ? (row, col, value) => { this.onCellEdit(row, col, value); this._pushRows(); } : null,
      selectable: this.selectable, selectedIds: this.selectedIds,
      onToggleSelect: (id) => this._toggleSelect(id), onToggleSelectAll: (c) => this._toggleSelectAll(c),
      onToggleSelectMany: (ids, c) => this._toggleSelectMany(ids, c),
    });

    // fecha flyout ao clicar fora / Esc
    this._onDocDown = (e) => { if (this.toolMenu && this.toolsEl && !this.toolsEl.contains(e.target)) { this.toolMenu = null; this.filterCol = null; this._renderToolbar(); } };
    this._onDocKey = (e) => { if (e.key === "Escape" && this.toolMenu) { this.toolMenu = null; this.filterCol = null; this._renderToolbar(); } };
    document.addEventListener("mousedown", this._onDocDown);
    document.addEventListener("keydown", this._onDocKey);

    this._renderToolbar();
    this._renderBulk();
  }
  destroy() { document.removeEventListener("mousedown", this._onDocDown); document.removeEventListener("keydown", this._onDocKey); this.grid?.destroy(); }

  _iconBtn(kind, on, open, onClick, label) {
    const b = el("button", "icon-btn" + (on ? " on" : "") + (open ? " open" : ""), { type: "button", "aria-label": label, title: label, html: ICO[kind] });
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    if (on) b.appendChild(el("span", "tool-dot", { "aria-hidden": true }));
    return b;
  }
  _abrirTool(m) { this.toolMenu = this.toolMenu === m ? null : m; this.filterCol = null; this.valSearch = ""; this._renderToolbar(); }

  _renderToolbar() {
    const tb = this.toolbar; tb.replaceChildren();
    // busca
    const searchBox = el("div", "filter-search cron-search", { html: ICO.search });
    const input = el("input", null, { type: "search", placeholder: this.searchPlaceholder, "aria-label": "Buscar" });
    input.value = this.busca;
    input.oninput = () => this._setBusca(input.value);
    searchBox.appendChild(input);
    if (this.busca) { const x = el("button", null, { type: "button", "aria-label": "Limpar busca" }); x.textContent = "×"; x.onclick = () => { this._setBusca(""); this._renderToolbar(); }; searchBox.appendChild(x); }
    tb.appendChild(searchBox);

    // ferramentas
    const tools = el("div", "list-tools"); this.toolsEl = tools;
    const filtrosCol = this.filterDims.reduce((n, d) => n + (this._dimAtiva(d) ? 1 : 0), 0);
    if (this.filterDims.length) tools.appendChild(this._iconBtn("filtrar", filtrosCol > 0, this.toolMenu === "filtrar", () => this._abrirTool("filtrar"), "Filtrar"));
    if (this.groupableCols.length) tools.appendChild(this._iconBtn("agrupar", !!this.groupBy, this.toolMenu === "agrupar", () => this._abrirTool("agrupar"), "Agrupar"));
    if (this.sortableCols.length) tools.appendChild(this._iconBtn("classificar", !!this.sort, this.toolMenu === "classificar", () => this._abrirTool("classificar"), "Classificar"));
    if (this.showExport) { const b = el("button", "icon-btn", { type: "button", "aria-label": "Exportar para Excel", title: this.selectedIds.size ? `Exportar ${this.selectedIds.size} selecionado(s)` : "Exportar (Excel)", html: ICO.exportar }); b.disabled = this._displayRows().length === 0; b.onclick = () => this._exportar(); tools.appendChild(b); }

    if (this.toolMenu === "agrupar") tools.appendChild(this._flyoutAgrupar());
    else if (this.toolMenu === "classificar") tools.appendChild(this._flyoutClassificar());
    else if (this.toolMenu === "filtrar") tools.appendChild(this._flyoutFiltrar());
    tb.appendChild(tools);

    if (this.actions) tb.appendChild(this.actions);
    this._renderChips();
  }

  _flyoutAgrupar() {
    const f = el("div", "list-flyout", { role: "menu" });
    const head = el("div", "list-flyout-head"); head.appendChild(el("span", null, { html: "Agrupar por" }));
    if (this.groupBy) { const rm = el("button", "lf-clear", { type: "button" }); rm.textContent = "Remover"; rm.onclick = () => { this._setGroupBy(null); this.toolMenu = null; this._renderToolbar(); }; head.appendChild(rm); }
    f.appendChild(head);
    for (const c of this.groupableCols) {
      const sel = this.groupBy === c.key;
      const b = el("button", "list-flyout-item" + (sel ? " sel" : ""), { type: "button", role: "menuitemradio", "aria-checked": sel });
      b.appendChild(el("span", "lf-txt", { html: colLabel(c) }));
      if (sel) b.appendChild(el("span", "lf-check", { "aria-hidden": true, html: "✓" }));
      b.onclick = () => { this._setGroupBy(c.key); this.toolMenu = null; this._renderToolbar(); };
      f.appendChild(b);
    }
    return f;
  }
  _flyoutClassificar() {
    const f = el("div", "list-flyout", { role: "menu" });
    const head = el("div", "list-flyout-head"); head.appendChild(el("span", null, { html: "Classificar por" }));
    if (this.sort) { const cl = el("button", "lf-clear", { type: "button" }); cl.textContent = "Limpar"; cl.onclick = () => { this._setSort(null); this.toolMenu = null; this._renderToolbar(); }; head.appendChild(cl); }
    f.appendChild(head);
    for (const s of this.sortableCols) {
      const sel = this.sort?.key === s.key;
      const b = el("button", "list-flyout-item" + (sel ? " sel" : ""), { type: "button", role: "menuitemradio", "aria-checked": sel });
      b.appendChild(el("span", "lf-txt")); b.lastChild.textContent = s.label;
      if (sel) b.appendChild(el("span", "lf-check", { "aria-hidden": true, html: "✓" }));
      b.onclick = () => { this._setSort({ key: s.key, dir: this.sort?.key === s.key ? this.sort.dir : "asc" }); this._renderToolbar(); };
      f.appendChild(b);
    }
    f.appendChild(el("div", "list-flyout-sep"));
    const asc = el("button", "list-flyout-item" + (this.sort?.dir === "asc" ? " sel" : ""), { type: "button" }); asc.disabled = !this.sort;
    asc.appendChild(el("span", "lf-txt")); asc.firstChild.textContent = "Ascendente (A→Z)"; if (this.sort?.dir === "asc") asc.appendChild(el("span", "lf-check", { html: "✓" }));
    asc.onclick = () => { if (this.sort) this._setSort({ ...this.sort, dir: "asc" }); this._renderToolbar(); };
    const desc = el("button", "list-flyout-item" + (this.sort?.dir === "desc" ? " sel" : ""), { type: "button" }); desc.disabled = !this.sort;
    desc.appendChild(el("span", "lf-txt")); desc.firstChild.textContent = "Descendente (Z→A)"; if (this.sort?.dir === "desc") desc.appendChild(el("span", "lf-check", { html: "✓" }));
    desc.onclick = () => { if (this.sort) this._setSort({ ...this.sort, dir: "desc" }); this._renderToolbar(); };
    f.append(asc, desc);
    return f;
  }
  _flyoutFiltrar() {
    const f = el("div", "list-flyout list-flyout-filter", { role: "menu" });
    const dimAtual = this.filterCol ? this.filterDims.find((d) => d.key === this.filterCol) : null;
    if (!dimAtual) {
      const head = el("div", "list-flyout-head"); head.appendChild(el("span", null, { html: "Filtrar por" })); f.appendChild(head);
      for (const d of this.filterDims) {
        const b = el("button", "list-flyout-item lf-dim" + (this._dimAtiva(d) ? " on" : ""), { type: "button" });
        b.appendChild(el("span", "lf-txt")); b.firstChild.textContent = d.label;
        b.appendChild(el("span", "lf-value")); b.children[1].textContent = this._dimResumo(d);
        b.appendChild(el("span", "lf-caret", { "aria-hidden": true, html: "›" }));
        b.onclick = () => { this.filterCol = d.key; this.valSearch = ""; this._renderToolbar(); };
        f.appendChild(b);
      }
      return f;
    }
    const head = el("div", "list-flyout-head");
    const back = el("button", "lf-back", { type: "button", "aria-label": "Voltar" }); back.textContent = "‹"; back.onclick = () => { this.filterCol = null; this.valSearch = ""; this._renderToolbar(); };
    head.appendChild(back); head.appendChild(el("span", null)); head.children[1].textContent = dimAtual.label;
    if (this._dimAtiva(dimAtual)) { const cl = el("button", "lf-clear", { type: "button" }); cl.textContent = "Limpar"; cl.onclick = () => (dimAtual.kind === "date" ? this._limparDateDim(dimAtual.key) : this._limparColDim(dimAtual.key)); head.appendChild(cl); }
    f.appendChild(head);

    if (dimAtual.kind === "date") {
      const box = el("div", "lf-datebox");
      const presets = el("div", "lf-datepresets");
      [["hoje", "Hoje"], ["semana", "Esta semana"], ["proxima", "Próxima semana"], ["anterior", "Anterior a hoje"]].forEach(([k, lab]) => { const b = el("button", null, { type: "button" }); b.textContent = lab; b.onclick = () => this._setDate(dimAtual.key, datePreset(k, this.today)); presets.appendChild(b); });
      box.appendChild(presets);
      box.appendChild(buildCalendar(this.dateSel[dimAtual.key] ?? { de: "", ate: "" }, (next) => this._setDate(dimAtual.key, next), this.today));
      f.appendChild(box);
    } else {
      const opts = this._dimOptions(dimAtual);
      if (opts.length > 8) {
        const sb = el("div", "lf-search"); const si = el("input", null, { type: "search", placeholder: `Buscar em ${dimAtual.label.toLowerCase()}…` }); si.value = this.valSearch;
        si.oninput = () => { this.valSearch = si.value; this._renderValues(vals, dimAtual); }; sb.appendChild(si); f.appendChild(sb);
      }
      const vals = el("div", "lf-values"); f.appendChild(vals); this._renderValues(vals, dimAtual);
    }
    return f;
  }
  _renderValues(vals, dim) {
    vals.replaceChildren();
    const opts = this._dimOptions(dim).filter((o) => o.label.toLowerCase().includes(this.valSearch.toLowerCase()));
    if (!opts.length) { vals.appendChild(el("div", "lf-empty", { html: "Sem valores" })); return; }
    for (const o of opts) {
      const checked = this.colSel[dim.key]?.has(o.value) ?? false;
      const b = el("button", "list-flyout-item lf-checkitem" + (checked ? " sel" : ""), { type: "button", role: "menuitemcheckbox", "aria-checked": checked });
      b.appendChild(el("span", "lf-checkbox" + (checked ? " on" : ""), { "aria-hidden": true, html: checked ? "✓" : "" }));
      b.appendChild(el("span", "lf-txt")); b.lastChild.textContent = o.label;
      b.onclick = () => this._toggleColVal(dim.key, o.value);
      vals.appendChild(b);
    }
  }

  _renderChips() {
    const bar = this.chipsBar; bar.replaceChildren();
    const chips = [];
    for (const d of this.filterDims) if (this._dimAtiva(d)) chips.push({ label: `${d.label}: ${this._dimResumo(d)}`, clear: () => (d.kind === "date" ? this._limparDateDim(d.key) : this._limparColDim(d.key)) });
    if (!chips.length) { bar.style.display = "none"; return; }
    bar.style.display = "";
    for (const c of chips) {
      const chip = el("span", "chip"); chip.appendChild(document.createTextNode(c.label));
      const x = el("button", null, { type: "button", "aria-label": "Remover " + c.label }); x.textContent = "×"; x.onclick = c.clear;
      chip.appendChild(x); bar.appendChild(chip);
    }
    const all = el("button", "link-btn", { type: "button" }); all.textContent = "Limpar tudo"; all.onclick = () => this._limparTudo(); bar.appendChild(all);
  }

  _renderBulk() {
    const slot = this.bulkSlot; slot.replaceChildren();
    if (!this.selectable || this.selectedIds.size === 0) return;
    const bar = el("div", "bulk-bar", { role: "region", "aria-label": "Ações da seleção" });
    const inner = el("div", "bulk-bar-inner");
    const cnt = el("span", "bulk-count"); cnt.textContent = this.selectedIds.size;
    inner.append(cnt, el("span", "bulk-label", { html: "selecionado(s)" }), el("span", "bulk-sep", { "aria-hidden": true }));
    const acts = el("div", "bulk-bar-actions");
    const selRows = this._displayRows().filter((r) => this.selectedIds.has(r.id));
    if (this.bulkActions) { const nodes = this.bulkActions(selRows, () => this._clearSelection()); (Array.isArray(nodes) ? nodes : [nodes]).forEach((n) => n && acts.appendChild(n)); }
    if (this.showExport) { const b = el("button", "btn-mini", { type: "button" }); b.textContent = "Exportar (Excel)"; b.onclick = () => this._exportar(); acts.appendChild(b); }
    inner.appendChild(acts);
    const close = el("button", "bulk-close", { type: "button", "aria-label": "Limpar seleção" }); close.textContent = "×"; close.onclick = () => this._clearSelection();
    inner.appendChild(close); bar.appendChild(inner); slot.appendChild(bar);
  }
}
