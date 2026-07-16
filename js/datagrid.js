/* Datagrid vanilla — port do DataTable.tsx (eqtl_cronograma_fechamento, React).
   Paridade: colunas tipadas, auto-fit por medição em canvas, redimensionar,
   colunas congeladas (sticky), ordenação, seleção (linha/todos/grupo),
   agrupamento colapsável e virtualização (windowing). CSS em styles/datagrid.css
   (escopo .dg). Fonte de verdade do comportamento: o .tsx original.

   Column = {
     key, header (string|Node), headerLabel, render(row)->(string|Node),
     sortKey, align:'left'|'right'|'center', width, fixedWidth, autoWidthScale,
     sticky, filterValue(row)->string, groupValue(row)->string,
     cellText(row)->string, autoWidthText(row)->string, menuLabel, filterKey,
     dateValue(row)->string, editable
   }
   Linhas precisam de `id` (number|string). */
import { appZoom } from "./uizoom.js";

const CHECKBOX_W = 40;
const COL_MIN_W = 72, COL_MAX_W = 444, CHAR_PX = 6.7, CELL_PAD = 26;
const HEADER_CTRL_PX = 48, AUTOFIT_MAX_CHARS = 60, AUTOFIT_SAMPLE = 400, COL_DEFAULT_W = 160;
const HEADER_FONT = "500 11px Roboto, -apple-system, sans-serif";
const CELL_FONT = "12.5px Roboto, -apple-system, sans-serif";
const CELL_FONT_BOLD = "500 12.5px Roboto, -apple-system, sans-serif";
const VIRTUAL_MIN = 60, OVERSCAN = 10, ROW_H_DEFAULT = 37, GROUP_H_DEFAULT = 41;

const _measureCache = new Map();
let _measureCtx;
function textWidth(text, font) {
  if (!text) return 0;
  const key = font + " " + text;
  const hit = _measureCache.get(key);
  if (hit !== undefined) return hit;
  if (_measureCtx === undefined) {
    try { _measureCtx = document.createElement("canvas").getContext("2d"); }
    catch { _measureCtx = null; }
  }
  let w;
  if (_measureCtx) { _measureCtx.font = font; w = _measureCtx.measureText(text).width; }
  else w = text.length * CHAR_PX;
  _measureCache.set(key, w);
  return w;
}
// Remede quando a Roboto carregar (a 1ª medição pode usar fallback).
if (typeof document !== "undefined" && document.fonts?.ready) {
  document.fonts.ready.then(() => _measureCache.clear());
}

function groupAccessor(c) { return c.groupValue ?? c.filterValue; }
function textAccessor(c) { return c.cellText ?? c.filterValue ?? c.groupValue; }
function headerText(c) { return c.headerLabel ?? (typeof c.header === "string" ? c.header : c.key); }

/* mini-helpers de DOM (não usa util.h p/ controlar SVG e appends) */
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
function svgIco(paths, extra = "") {
  return `<svg viewBox="0 0 24 24" ${extra} aria-hidden>${paths}</svg>`;
}
/* aceita string ou Node no conteúdo de uma célula */
function appendContent(td, content) {
  if (content == null) return;
  if (content instanceof Node) td.appendChild(content);
  else td.appendChild(document.createTextNode(String(content)));
}

export class DataGrid {
  constructor(container, opts = {}) {
    this.container = container;
    this.columns = opts.columns || [];
    this.rows = opts.rows || [];
    this.selectable = !!opts.selectable;
    this.fillHeight = opts.fillHeight !== false;
    this.emptyMessage = opts.emptyMessage || "Nenhum registro encontrado.";
    this.loading = !!opts.loading;
    this.onRowClick = opts.onRowClick || null;
    this.onCellEdit = opts.onCellEdit || null;   // (row, column, newValue) — edição inline
    this.onToggleSelect = opts.onToggleSelect || null;
    this.onToggleSelectAll = opts.onToggleSelectAll || null;
    this.onToggleSelectMany = opts.onToggleSelectMany || null;
    this.onSortChange = opts.onSortChange || null;
    this.onGroupByChange = opts.onGroupByChange || null;
    this.onFilterColumn = opts.onFilterColumn || null;
    this.filterableKeys = opts.filterableKeys || new Set();
    this.activeFilterKeys = opts.activeFilterKeys || new Set();

    this.sort = opts.sort || null;                 // {key, dir}
    this.groupBy = opts.groupBy || null;
    this.selectedIds = opts.selectedIds || new Set();
    this.colFilters = {};                          // funil do cabeçalho (por key -> Set)
    this.colWidths = {};                           // ajuste manual
    this.expanded = new Set(opts.initialExpandedGroups || []);
    this._initialExpanded = new Set(opts.initialExpandedGroups || []);

    this.scrollTop = 0; this.viewportH = 0; this.rowH = ROW_H_DEFAULT;
    this._portal = null;

    this._build();
    this.refresh();
  }

  /* ---- estrutura estável (wrap + table) ---- */
  _build() {
    this.container.classList.add("dg-host");
    this.wrap = el("div", "table-wrap" + (this.fillHeight ? " table-fill" : ""));
    this.table = el("table", "table table-fixed");
    this.colgroup = el("colgroup");
    this.thead = el("thead");
    this.tbody = el("tbody");
    this.table.append(this.colgroup, this.thead, this.tbody);
    this.wrap.appendChild(this.table);
    this.container.replaceChildren(this.wrap);

    let raf = 0;
    this.wrap.addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; this.scrollTop = this.wrap.scrollTop; this._renderBody(); });
    }, { passive: true });
    this._ro = new ResizeObserver(() => {
      const h = this.wrap.clientHeight;
      if (h !== this.viewportH) { this.viewportH = h; this._renderBody(); }
    });
    this._ro.observe(this.wrap);
    this.viewportH = this.wrap.clientHeight;
  }

  /* ---- API pública ---- */
  setRows(rows) { this.rows = rows || []; this.refresh(); }
  setSort(sort) { this.sort = sort || null; this._renderHead(); this._renderBody(); }
  setGroupBy(key) { this.groupBy = key || null; this.expanded = new Set(this._initialExpanded); this.refresh(); }
  setSelectedIds(set) { this.selectedIds = set || new Set(); this._renderHead(); this._renderBody(); }
  setActiveFilterKeys(set) { this.activeFilterKeys = set || new Set(); this._renderHead(); }
  refresh() { this._computeWidths(); this._renderCols(); this._renderHead(); this._renderBody(); }
  destroy() { this._ro?.disconnect(); this._closePortal(); this.container.replaceChildren(); }

  /* ---- larguras (auto-fit) ---- */
  _visibleRows() {
    const active = this.columns.filter((c) => c.filterValue && this.colFilters[c.key]?.size);
    if (!active.length) return this.rows;
    return this.rows.filter((r) => active.every((c) => this.colFilters[c.key].has(c.filterValue(r))));
  }
  _computeWidths() {
    const rows = this._visibleRows();
    const sample = rows.length > AUTOFIT_SAMPLE ? rows.slice(0, AUTOFIT_SAMPLE) : rows;
    const out = {}, meta = {};
    this.columns.forEach((c, i) => {
      const hasCtrl = !!(c.sortKey || c.filterValue || groupAccessor(c));
      const headerPx = textWidth(headerText(c), HEADER_FONT) + CELL_PAD + (hasCtrl ? HEADER_CTRL_PX : 0);
      if (c.fixedWidth && c.width != null) { out[c.key] = c.width; meta[c.key] = { header: headerPx, content: COL_MIN_W }; return; }
      const acc = c.autoWidthText ?? textAccessor(c);
      const contentFont = i === 0 ? CELL_FONT_BOLD : CELL_FONT;
      let contentPx = COL_DEFAULT_W, w;
      if (!acc) {
        w = Math.max(COL_MIN_W, c.width ?? Math.max(headerPx, COL_DEFAULT_W));
      } else {
        let w0 = 0;
        for (const r of sample) {
          const v = acc(r);
          if (v) { const mw = textWidth(v.length > AUTOFIT_MAX_CHARS ? v.slice(0, AUTOFIT_MAX_CHARS) : v, contentFont); if (mw > w0) w0 = mw; }
        }
        contentPx = w0 + CELL_PAD;
        let fit = Math.max(COL_MIN_W, Math.min(COL_MAX_W, Math.max(contentPx, headerPx)));
        if (c.autoWidthScale) fit = Math.round(fit * c.autoWidthScale);
        w = c.sticky ? Math.max(c.width ?? 0, fit) : fit;
      }
      out[c.key] = Math.round(w);
      meta[c.key] = { header: headerPx, content: contentPx };
    });
    this.autoWidths = out; this.autoMeta = meta;
  }
  _widthOf(c) { return this.colWidths[c.key] ?? this.autoWidths[c.key] ?? c.width ?? 160; }
  _colFloor(key) { const m = this.autoMeta[key]; return m ? Math.max(44, Math.min(m.header, m.content)) : COL_MIN_W; }
  _stickyLayout() {
    const sl = {}; let a = this.selectable ? CHECKBOX_W : 0, last;
    for (const c of this.columns) if (c.sticky) { sl[c.key] = a; a += this._widthOf(c); last = c.key; }
    const tw = (this.selectable ? CHECKBOX_W : 0) + this.columns.reduce((s, c) => s + this._widthOf(c), 0);
    return { stickyLeft: sl, lastStickyKey: last, totalWidth: tw };
  }

  _renderCols() {
    const cg = this.colgroup; cg.replaceChildren();
    if (this.selectable) cg.appendChild(el("col", null, { style: { width: CHECKBOX_W + "px" } }));
    for (const c of this.columns) cg.appendChild(el("col", null, { style: { width: this._widthOf(c) + "px" } }));
    const { totalWidth } = this._stickyLayout();
    this.table.style.minWidth = totalWidth + "px";
  }

  /* ---- cabeçalho ---- */
  _renderHead() {
    const { stickyLeft, lastStickyKey } = this._stickyLayout();
    const rows = this._visibleRows();
    const allSelected = this.selectable && rows.length > 0 && rows.every((r) => this.selectedIds.has(r.id));
    const groups = this._groups();
    const tr = el("tr");

    if (this.selectable) {
      const th = el("th", "table-checkbox-col table-sticky-cell", { style: { left: "0" } });
      if (groups) {
        const allExp = groups.length > 0 && groups.every((g) => this.expanded.has(g.key));
        const b = el("button", "group-toggle group-toggle-all" + (allExp ? "" : " collapsed"),
          { type: "button", "aria-label": allExp ? "Recolher todos" : "Expandir todos", title: allExp ? "Recolher todos" : "Expandir todos",
            html: svgIco('<path d="M9 6l6 6-6 6"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"') });
        b.onclick = () => this._toggleAll();
        th.appendChild(b);
      } else {
        const cb = el("input", null, { type: "checkbox", "aria-label": "Selecionar todos" });
        cb.checked = allSelected;
        cb.onchange = (e) => this.onToggleSelectAll?.(e.target.checked);
        th.appendChild(cb);
      }
      tr.appendChild(th);
    }

    for (const c of this.columns) {
      const activeDir = c.sortKey && this.sort?.key === c.sortKey ? this.sort.dir : undefined;
      const cls = (c.sticky ? "table-sticky-cell" : "") + (c.key === lastStickyKey ? " table-sticky-last" : "");
      const th = el("th", cls.trim() || null);
      if (c.sticky) th.style.left = stickyLeft[c.key] + "px";
      if (c.align) th.style.textAlign = c.align;
      th.setAttribute("aria-sort", c.sortKey ? (activeDir ? (activeDir === "asc" ? "ascending" : "descending") : "none") : "none");

      const inner = el("div", "th-inner");
      if (c.sortKey) {
        const b = el("button", "th-sort-btn", { type: "button", title: "Ordenar por " + headerText(c) });
        appendContent(b, typeof c.header === "string" ? c.header : c.header?.cloneNode?.(true) ?? headerText(c));
        const ico = el("span", "th-sort-icon" + (activeDir ? " active" : ""), { "aria-hidden": true });
        ico.textContent = activeDir === "desc" ? "↓" : "↑";
        b.appendChild(ico);
        b.onclick = () => this.onSortChange?.(c.sortKey);
        inner.appendChild(b);
      } else {
        const s = el("span"); appendContent(s, typeof c.header === "string" ? c.header : headerText(c)); inner.appendChild(s);
      }

      // funil aceso (filtro ativo) → reabre o filtro daquela coluna na toolbar
      if (this.activeFilterKeys.has(c.filterKey ?? c.key) && this.onFilterColumn) {
        const fb = el("button", "th-filter-active", { type: "button", title: "Filtro ativo — clique para ajustar",
          html: svgIco('<path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>', 'fill="currentColor" width="12" height="12"') });
        fb.onclick = () => this.onFilterColumn(c.filterKey ?? c.key);
        inner.appendChild(fb);
      }
      // funil de multi-seleção embutido (só quando a coluna traz filterValue própria)
      if (c.filterValue) inner.appendChild(this._colFilterBtn(c));
      // menu "…" (ordenar/agrupar/filtrar)
      const canMenuFilter = !!(this.filterableKeys.has(c.filterKey ?? c.key) && this.onFilterColumn);
      if ((c.sortKey && this.onSortChange) || (groupAccessor(c) && this.onGroupByChange) || canMenuFilter) {
        inner.appendChild(this._headerMenuBtn(c, activeDir, canMenuFilter));
      }
      th.appendChild(inner);

      // alça de redimensionamento
      const rz = el("span", "col-resize", { role: "separator", title: "Arraste para redimensionar · duplo-clique para auto-ajustar" });
      rz.addEventListener("mousedown", (e) => this._startResize(e, c.key, this._widthOf(c)));
      rz.addEventListener("dblclick", () => this._autoFitCol(c.key));
      rz.addEventListener("click", (e) => e.stopPropagation());
      th.appendChild(rz);

      tr.appendChild(th);
    }
    this.thead.replaceChildren(tr);
  }

  /* ---- corpo (virtualização) ---- */
  _groups() {
    const gc = this.groupBy ? this.columns.find((c) => c.key === this.groupBy && groupAccessor(c)) : null;
    if (!gc) return null;
    const acc = groupAccessor(gc);
    const order = [], byKey = new Map();
    for (const r of this._visibleRows()) {
      const k = acc(r) || "—";
      let b = byKey.get(k); if (!b) { b = []; byKey.set(k, b); order.push(k); }
      b.push(r);
    }
    this._groupCol = gc;
    return order.map((k) => ({ key: k, rows: byKey.get(k) }));
  }
  _flatItems(groups) {
    const out = []; let di = 0;
    if (groups) {
      for (const g of groups) { out.push({ type: "group", g }); if (this.expanded.has(g.key)) for (const row of g.rows) out.push({ type: "row", row, even: di++ % 2 === 0 }); }
    } else {
      for (const row of this._visibleRows()) out.push({ type: "row", row, even: di++ % 2 === 0 });
    }
    return out;
  }
  _renderBody() {
    const colSpan = this.columns.length + (this.selectable ? 1 : 0);
    if (this.loading) {
      const td = el("td", "table-empty", { colspan: colSpan, html: '<div class="center-screen" style="height:120px"><div class="spinner"></div></div>' });
      this.tbody.replaceChildren(el("tr", null, {}));
      this.tbody.firstChild.appendChild(td); return;
    }
    const groups = this._groups();
    const items = this._flatItems(groups);
    if (!items.length) {
      const tr = el("tr"); const td = el("td", "table-empty", { colspan: colSpan }); td.textContent = this.emptyMessage;
      tr.appendChild(td); this.tbody.replaceChildren(tr); return;
    }
    // offsets acumulados
    const off = new Array(items.length + 1); off[0] = 0;
    for (let i = 0; i < items.length; i++) off[i + 1] = off[i] + (items[i].type === "group" ? GROUP_H_DEFAULT : this.rowH);
    const totalH = off[items.length];

    const virtualize = this.fillHeight && items.length > VIRTUAL_MIN && this.viewportH > 0;
    let winStart = 0, winEnd = items.length;
    if (virtualize) {
      let lo = 0, hi = items.length;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (off[mid] <= this.scrollTop) lo = mid; else hi = mid - 1; }
      winStart = Math.max(0, lo - OVERSCAN);
      const bottom = this.scrollTop + this.viewportH;
      let a = 0, b = items.length;
      while (a < b) { const mid = (a + b) >> 1; if (off[mid] >= bottom) b = mid; else a = mid + 1; }
      winEnd = Math.min(items.length, a + OVERSCAN);
    }
    const topPad = virtualize ? off[winStart] : 0;
    const botPad = virtualize ? totalH - off[winEnd] : 0;

    const frag = document.createDocumentFragment();
    if (topPad > 0) { const tr = el("tr", "v-spacer", { "aria-hidden": true }); tr.appendChild(el("td", null, { colspan: colSpan, style: { height: topPad + "px" } })); frag.appendChild(tr); }
    const slice = virtualize ? items.slice(winStart, winEnd) : items;
    for (const it of slice) frag.appendChild(it.type === "group" ? this._renderGroupHeader(it.g, colSpan) : this._renderRow(it.row, it.even));
    if (botPad > 0) { const tr = el("tr", "v-spacer", { "aria-hidden": true }); tr.appendChild(el("td", null, { colspan: colSpan, style: { height: botPad + "px" } })); frag.appendChild(tr); }
    this.tbody.replaceChildren(frag);

    // calibra a altura real da linha 1x
    const rEl = this.tbody.querySelector("tr:not(.v-spacer):not(.group-row)");
    if (rEl) { const h = rEl.offsetHeight; if (h > 0 && Math.abs(h - this.rowH) > 1) { this.rowH = h; } }
  }
  _renderRow(row, even) {
    const { stickyLeft, lastStickyKey } = this._stickyLayout();
    const cls = [this.onRowClick ? "clickable" : "", even ? "row-even" : "", this.selectedIds.has(row.id) ? "row-selected" : "", row.excluido ? "row-excluida" : ""].filter(Boolean).join(" ");
    const tr = el("tr", cls || null);
    if (this.onRowClick) { tr.onclick = () => this.onRowClick(row); tr.setAttribute("role", "button"); tr.tabIndex = 0;
      tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.onRowClick(row); } }; }
    if (this.selectable) {
      const td = el("td", "table-checkbox-col table-sticky-cell", { style: { left: "0" } });
      td.onclick = (e) => e.stopPropagation();
      const cb = el("input", null, { type: "checkbox", "aria-label": "Selecionar linha" });
      cb.checked = this.selectedIds.has(row.id);
      cb.onchange = () => this.onToggleSelect?.(row.id);
      td.appendChild(cb); tr.appendChild(td);
    }
    this.columns.forEach((c, i) => {
      const td = el("td", (c.sticky ? "table-sticky-cell" : "") + (c.key === lastStickyKey ? " table-sticky-last" : "") + (i === 0 ? " table-col-first" : ""));
      if (c.sticky) td.style.left = stickyLeft[c.key] + "px";
      if (c.align) td.style.textAlign = c.align;
      const txt = c.cellText?.(row) ?? c.filterValue?.(row);
      if (txt) td.title = txt;
      appendContent(td, c.render(row));
      if (c.editable && this.onCellEdit) {
        td.classList.add("dg-editable");
        td.addEventListener("dblclick", (e) => { e.stopPropagation(); this._startEdit(td, row, c); });
      }
      tr.appendChild(td);
    });
    return tr;
  }
  _renderGroupHeader(g, colSpan) {
    const isCollapsed = !this.expanded.has(g.key);
    const gSel = this.selectable && g.rows.length > 0 && g.rows.every((r) => this.selectedIds.has(r.id));
    const gPart = this.selectable && !gSel && g.rows.some((r) => this.selectedIds.has(r.id));
    const tr = el("tr", "group-row");
    const td = el("td", "group-cell", { colspan: colSpan });
    const head = el("div", "group-head");
    if (this.selectable && this.onToggleSelectMany) {
      const cb = el("input", "group-check", { type: "checkbox", "aria-label": "Selecionar grupo " + g.key });
      cb.checked = gSel; cb.indeterminate = gPart;
      cb.onchange = (e) => this.onToggleSelectMany(g.rows.map((r) => r.id), e.target.checked);
      head.appendChild(cb);
    }
    const tgl = el("button", "group-toggle" + (isCollapsed ? " collapsed" : ""), { type: "button", "aria-expanded": !isCollapsed,
      "aria-label": (isCollapsed ? "Expandir" : "Recolher") + " grupo " + g.key,
      html: svgIco('<path d="M9 6l6 6-6 6"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"') });
    tgl.onclick = () => this._toggleGroup(g.key);
    head.appendChild(tgl);
    const label = el("span", "group-label"); appendContent(label, this._groupCol.render(g.rows[0])); head.appendChild(label);
    const cnt = el("span", "group-count"); cnt.textContent = g.rows.length; head.appendChild(cnt);
    td.appendChild(head); tr.appendChild(td);
    return tr;
  }

  /* edição inline: duplo-clique numa célula editável troca por input/date/select */
  _startEdit(td, row, c) {
    if (td.querySelector(".dg-edit")) return;
    const cur = c.editValue ? c.editValue(row) : (row[c.key] ?? "");
    let input;
    if (c.editType === "select") {
      input = el("select", "dg-edit");
      for (const o of ["", ...(c.editOptions || [])]) {
        const op = document.createElement("option"); op.value = o; op.textContent = o || "—";
        if (String(o) === String(cur ?? "")) op.selected = true; input.appendChild(op);
      }
    } else if (c.editType === "date") {
      input = el("input", "dg-edit", { type: "date" }); input.value = cur ? String(cur).slice(0, 10) : "";
    } else {
      input = el("input", "dg-edit", { type: "text" }); input.value = cur ?? "";
    }
    const prevTitle = td.title;
    td.replaceChildren(input); td.removeAttribute("title");
    input.focus(); input.select?.();
    let done = false;
    const commit = () => { if (done) return; done = true; this.onCellEdit(row, c, input.value); };
    const cancel = () => { if (done) return; done = true; td.title = prevTitle || ""; td.replaceChildren(); appendContent(td, c.render(row)); };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", commit);
  }

  _toggleGroup(key) { if (this.expanded.has(key)) this.expanded.delete(key); else this.expanded.add(key); this._renderHead(); this._renderBody(); }
  _toggleAll() { const groups = this._groups() || []; const allExp = groups.length > 0 && groups.every((g) => this.expanded.has(g.key)); this.expanded = allExp ? new Set() : new Set(groups.map((g) => g.key)); this._renderHead(); this._renderBody(); }

  /* ---- redimensionar ---- */
  _startResize(e, key, startW) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, floor = this._colFloor(key);
    document.body.classList.add("col-resizing");
    const move = (ev) => { const w = Math.max(floor, Math.min(900, startW + (ev.clientX - startX))); this.colWidths[key] = w; this._renderCols(); this._renderHead(); this._renderBody(); };
    const up = () => { document.body.classList.remove("col-resizing"); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  }
  _autoFitCol(key) { if (key in this.colWidths) { delete this.colWidths[key]; this._renderCols(); this._renderHead(); this._renderBody(); } }

  /* ---- menu "…" do cabeçalho (portal) ---- */
  _headerMenuBtn(c, activeDir, canFilter) {
    const btn = el("button", "th-menu-btn", { type: "button", "aria-label": "Opções de " + headerText(c), "aria-haspopup": "menu",
      html: svgIco('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', 'fill="currentColor"') });
    btn.onclick = () => {
      if (this._portal) { this._closePortal(); return; }
      const r = btn.getBoundingClientRect();
      const z = appZoom();   // popup fixed no <html> zoomado: coords em px de layout
      const pop = el("div", "dg-menu-pop", { role: "menu", style: { top: ((r.bottom + 4) / z) + "px", left: (Math.max(8, Math.min(r.left, window.innerWidth - 214)) / z) + "px" } });
      const item = (ico, label, opts = {}) => {
        const b = el("button", "dg-menu-item" + (opts.active ? " active" : ""), { type: "button", role: "menuitem" });
        if (opts.disabled) b.disabled = true;
        b.innerHTML = `<span class="dg-menu-ico">${ico}</span>`;
        b.appendChild(document.createTextNode(label));
        if (opts.check) b.insertAdjacentHTML("beforeend", '<span class="dg-menu-check">✓</span>');
        b.onclick = opts.onClick; return b;
      };
      const hasSort = !!(c.sortKey && this.onSortChange);
      const hasGroup = !!(groupAccessor(c) && this.onGroupByChange);
      const grouped = this.groupBy === c.key;
      if (canFilter) { pop.appendChild(item('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></svg>', "Filtrar por este campo", { onClick: () => { this._closePortal(); this.onFilterColumn(c.filterKey ?? c.key); } })); if (hasSort || hasGroup) pop.appendChild(el("div", "dg-menu-sep")); }
      if (hasSort) {
        pop.appendChild(item("↑", "Ordenar A→Z", { active: activeDir === "asc", check: activeDir === "asc", onClick: () => { this._closePortal(); this.onSortChange(c.sortKey, "asc"); } }));
        pop.appendChild(item("↓", "Ordenar Z→A", { active: activeDir === "desc", check: activeDir === "desc", onClick: () => { this._closePortal(); this.onSortChange(c.sortKey, "desc"); } }));
        pop.appendChild(item("✕", "Limpar classificação", { disabled: !activeDir, onClick: () => { this._closePortal(); this.onSortChange(c.sortKey, null); } }));
      }
      if (hasSort && hasGroup) pop.appendChild(el("div", "dg-menu-sep"));
      if (hasGroup) pop.appendChild(item("▤", grouped ? "Desagrupar" : "Agrupar por este campo", { active: grouped, check: grouped, onClick: () => { this._closePortal(); this.onGroupByChange(grouped ? null : c.key); } }));
      this._openPortal(pop, btn);
      btn.classList.add("open");
      this._portalBtn = btn;
    };
    return btn;
  }

  /* ---- funil de multi-seleção embutido (portal) ---- */
  _colFilterBtn(c) {
    const sel = this.colFilters[c.key] ?? new Set();
    const btn = el("button", "col-filter-btn" + (sel.size ? " active" : ""), { type: "button", title: "Filtrar por " + headerText(c),
      html: svgIco('<path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') });
    if (sel.size) { const cnt = el("span", "col-filter-count"); cnt.textContent = sel.size; btn.appendChild(cnt); }
    btn.onclick = () => {
      if (this._portal) { this._closePortal(); return; }
      const r = btn.getBoundingClientRect();
      const z = appZoom();
      const options = [...new Set(this.rows.map((x) => c.filterValue(x)).filter((v) => v != null && v !== ""))].sort((a, b) => a.localeCompare(b, "pt"));
      const cur = new Set(this.colFilters[c.key] ?? []);
      const pop = el("div", "dg-filter-pop", { style: { top: ((r.bottom + 4) / z) + "px", left: (Math.max(8, Math.min(r.left, window.innerWidth - 258)) / z) + "px" } });
      const search = el("input", "dg-filter-search", { placeholder: "Buscar…" });
      const tools = el("div", "dg-filter-tools");
      const all = el("button", "link-btn", { type: "button" }); all.textContent = "Selecionar todos";
      const none = el("button", "link-btn", { type: "button" }); none.textContent = "Limpar";
      tools.append(all, none);
      const list = el("div", "dg-filter-list");
      const apply = (set) => { if (set.size) this.colFilters[c.key] = set; else delete this.colFilters[c.key]; this.refresh(); };
      const renderList = (q) => {
        list.replaceChildren();
        const fil = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
        if (!fil.length) { list.appendChild(el("div", "dg-filter-empty", { html: "Nenhuma opção" })); return; }
        for (const o of fil) {
          const lab = el("label", "dg-filter-item");
          const cb = el("input", null, { type: "checkbox" }); cb.checked = cur.has(o);
          cb.onchange = () => { if (cb.checked) cur.add(o); else cur.delete(o); };
          const sp = el("span"); sp.textContent = o;
          lab.append(cb, sp); list.appendChild(lab);
        }
      };
      all.onclick = () => { options.forEach((o) => cur.add(o)); apply(new Set(cur)); this._closePortal(); };
      none.onclick = () => { cur.clear(); apply(new Set()); this._closePortal(); };
      search.oninput = () => renderList(search.value);
      renderList("");
      pop.append(search, tools, list);
      // aplica ao fechar
      this._onPortalClose = () => apply(new Set(cur));
      pop.append();
      this._openPortal(pop, btn);
      setTimeout(() => search.focus(), 10);
    };
    return btn;
  }

  /* ---- portal genérico (menus/filtros) ---- */
  _openPortal(node, anchorBtn) {
    this._closePortal();
    this._portal = node; document.body.appendChild(node);
    this._portalBtn = anchorBtn;
    const onDown = (e) => { if (node.contains(e.target) || anchorBtn?.contains(e.target)) return; this._closePortal(); };
    const onKey = (e) => { if (e.key === "Escape") this._closePortal(); };
    this._portalDown = onDown; this._portalKey = onKey;
    setTimeout(() => { document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey); }, 0);
  }
  _closePortal() {
    if (this._onPortalClose) { const f = this._onPortalClose; this._onPortalClose = null; f(); }
    if (this._portal) { this._portal.remove(); this._portal = null; }
    if (this._portalBtn) { this._portalBtn.classList.remove("open"); this._portalBtn = null; }
    if (this._portalDown) document.removeEventListener("mousedown", this._portalDown);
    if (this._portalKey) document.removeEventListener("keydown", this._portalKey);
    this._portalDown = this._portalKey = null;
  }
}
