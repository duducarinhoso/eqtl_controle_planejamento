import { colName, escapeHtml, statusClass, STATUS_OPTIONS } from "./util.js";

const ROWHEAD_W = 46;
const DEFAULT_COL_W = 124;
const ROW_H = 26;

export class Grid {
  /* container: elemento .grid-scroll
     actions: { save(r,c,patch), clear(r,c), insertRow(at), deleteRow(at),
                insertCol(at), deleteCol(at), setSheet(patch),
                openHistory(r,c), openComments(r,c), onEditing(keyOrNull) } */
  constructor(container, actions) {
    this.box = container;
    this.actions = actions;
    this.cells = new Map();      // "r:c" -> record
    this.comments = new Map();   // "r:c" -> count
    this.peers = new Map();      // "r:c" -> {name,color}
    this.sel = { r: 1, c: 1 };
    this.selEnd = { r: 1, c: 1 };
    this.editing = null;
    this.undoStack = [];
    this.redoStack = [];
    this._bindGlobal();
  }

  /* ---------------- undo / redo ---------------- */
  snapshot(r, c) {
    const rec = this.get(r, c);
    if (!rec) return null;
    return {
      value: rec.value ?? null, data_type: rec.data_type || "text",
      format: rec.format ? { ...rec.format } : {},
      merge: rec.merge ? { ...rec.merge } : null, covered_by: rec.covered_by || null,
    };
  }
  _stateEmpty(s) {
    return !s || ((s.value == null || s.value === "") &&
      (!s.format || !Object.keys(s.format).length) && !s.merge && !s.covered_by);
  }
  _applyState(r, c, s, refresh = true) {
    if (this._stateEmpty(s)) {
      this.cells.delete(this.key(r, c));
      this.actions.clear(r, c);
    } else {
      const rec = { row: r, col: c, value: s.value ?? null, data_type: s.data_type || "text",
        format: s.format || {}, merge: s.merge || null, covered_by: s.covered_by || null };
      this.cells.set(this.key(r, c), rec);
      this.actions.save(r, c, { value: rec.value, data_type: rec.data_type, format: rec.format, merge: rec.merge, covered_by: rec.covered_by });
    }
    if (refresh) this.refreshCell(r, c);
  }
  /* funil de toda mutacao de celula: grava undo/redo automaticamente.
     list = [{r,c,state}] com o NOVO estado de cada celula (null = limpar). */
  _writeCells(list, { rerender = false } = {}) {
    const undo = list.map(({ r, c }) => ({ r, c, state: this.snapshot(r, c) }));
    for (const { r, c, state } of list) this._applyState(r, c, state, !rerender);
    const redo = list.map(({ r, c }) => ({ r, c, state: this.snapshot(r, c) }));
    const changed = undo.some((u, i) => JSON.stringify(u.state) !== JSON.stringify(redo[i].state));
    if (rerender) this.render();
    if (changed) {
      this.undoStack.push({ undo, redo });
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
      this._notifyHistory();
    }
  }
  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    for (const { r, c, state } of op.undo) this._applyState(r, c, state, false);
    this.redoStack.push(op);
    this.render(); this._notifyHistory();
  }
  redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    for (const { r, c, state } of op.redo) this._applyState(r, c, state, false);
    this.undoStack.push(op);
    this.render(); this._notifyHistory();
  }
  _notifyHistory() { this.actions.onHistoryChange && this.actions.onHistoryChange(this.undoStack.length > 0, this.redoStack.length > 0); }

  key(r, c) { return r + ":" + c; }
  get(r, c) { return this.cells.get(this.key(r, c)); }

  /* ---------------- carga ---------------- */
  load(sheet, cells, comments = []) {
    this.sheet = sheet;
    this.cells.clear();
    for (const c of cells) this.cells.set(this.key(c.row, c.col), c);
    this.comments.clear();
    for (const cm of comments) {
      const k = this.key(cm.row, cm.col);
      this.comments.set(k, (this.comments.get(k) || 0) + 1);
    }
    this.sel = { r: 1, c: 1 }; this.selEnd = { r: 1, c: 1 }; this.editing = null;
    this.undoStack = []; this.redoStack = []; this._notifyHistory();
    this.render();
  }

  colWidth(c) {
    const w = this.sheet.col_widths && this.sheet.col_widths[String(c)];
    return Math.max(16, w || DEFAULT_COL_W);
  }

  /* ---------------- render completo ---------------- */
  render() {
    const rows = this.sheet.row_count, cols = this.sheet.col_count;
    // largura total explicita: com table-layout:fixed, sem isto o navegador
    // espreme as colunas pra caber no container (ignorando o colgroup).
    let cg = `<col style="width:${ROWHEAD_W}px">`;
    let total = ROWHEAD_W;
    for (let c = 1; c <= cols; c++) { const w = this.colWidth(c); total += w; cg += `<col style="width:${w}px">`; }
    let html = `<table class="grid" style="width:${total}px"><colgroup>` + cg + "</colgroup><thead><tr>";
    html += '<th class="corner"></th>';
    for (let c = 1; c <= cols; c++)
      html += `<th class="colhead" data-c="${c}">${colName(c)}<span class="rsz" data-c="${c}"></span></th>`;
    html += "</tr></thead><tbody>";
    const heights = this.sheet.row_heights || {};
    for (let r = 1; r <= rows; r++) {
      const hStyle = heights[String(r)] ? ` style="height:${heights[String(r)]}px"` : "";
      html += `<tr${hStyle}>`;
      html += `<td class="rowhead" data-r="${r}">${r}<span class="rsz-row" data-r="${r}"></span></td>`;
      for (let c = 1; c <= cols; c++) {
        const rec = this.get(r, c);
        if (rec && rec.covered_by) continue;               // coberta por mescla
        const span = rec && rec.merge ? rec.merge : null;
        const rs = span && span.rowspan > 1 ? ` rowspan="${span.rowspan}"` : "";
        const cs = span && span.colspan > 1 ? ` colspan="${span.colspan}"` : "";
        const cmt = this.comments.get(this.key(r, c)) ? " has-comment" : "";
        const st = this.tdStyle(rec);
        html += `<td class="cell${cmt}" data-r="${r}" data-c="${c}"${rs}${cs}${st ? ` style="${st}"` : ""}>${this.cellInner(r, c, rec)}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    this.box.innerHTML = html;
    this.table = this.box.querySelector("table.grid");
    this._bindTable();
    this.paintSelection();
    this.applySpill();
    this.actions.onRender && this.actions.onRender();
  }

  /* ---------------- spill (texto transborda p/ celulas vazias a direita) ---------------- */
  isEmptyCell(r, c) {
    const rec = this.get(r, c);
    if (!rec) return true;
    if (rec.covered_by || rec.merge) return false;
    return rec.value == null || rec.value === "";
  }
  applySpillRow(r) {
    if (!this.table) return;
    const cols = this.sheet.col_count, ctx = this._measureCtx();
    for (let c = 1; c <= cols; c++) {
      const td = this.tdAt(r, c);
      if (!td) continue;
      if (td.classList.contains("spill")) { td.classList.remove("spill"); const cc = td.querySelector(".cc"); if (cc) cc.style.width = ""; }
    }
    for (let c = 1; c <= cols; c++) {
      const rec = this.get(r, c);
      if (!rec || rec.covered_by || rec.merge) continue;
      const f = rec.format || {};
      if (rec.data_type === "status" || f.wrap || f.align === "right" || f.align === "center") continue;
      const v = rec.value;
      if (v == null || v === "") continue;
      ctx.font = `${f.bold ? "700" : "400"} ${f.fontSize || 13}px "Plus Jakarta Sans", sans-serif`;
      let textW = 0;
      for (const line of String(v).split("\n")) textW = Math.max(textW, ctx.measureText(line).width);
      const ownW = this.colWidth(c);
      if (textW + 14 <= ownW) continue;
      let avail = ownW, cc = c + 1;
      while (cc <= cols && this.isEmptyCell(r, cc) && avail < textW + 14) { avail += this.colWidth(cc); cc++; }
      if (avail > ownW) {
        const td = this.tdAt(r, c);
        if (td) { td.classList.add("spill"); const el = td.querySelector(".cc"); if (el) el.style.width = avail + "px"; }
      }
    }
  }
  applySpill() {
    if (!this.table) return;
    for (let r = 1; r <= this.sheet.row_count; r++) this.applySpillRow(r);
  }

  tdStyle(rec) {
    const f = rec && rec.format;
    if (!f) return "";
    let s = "";
    if (f.bg) s += `background:${f.bg};`;
    const b = f.border;
    if (b) {
      const col = b.c || "#8a93a6";
      if (b.t) s += `border-top:1.5px solid ${col};`;
      if (b.r) s += `border-right:1.5px solid ${col};`;
      if (b.b) s += `border-bottom:1.5px solid ${col};`;
      if (b.l) s += `border-left:1.5px solid ${col};`;
    }
    return s;
  }

  cellInner(r, c, rec) {
    rec = rec || this.cells.get(this.key(r, c));
    const f = (rec && rec.format) || {};
    const cls = ["cc"];
    if (f.bold) cls.push("f-bold");
    if (f.italic) cls.push("f-italic");
    if (f.underline) cls.push("f-underline");
    if (f.align === "center") cls.push("f-center");
    if (f.align === "right") cls.push("f-right");
    if (f.wrap) cls.push("f-wrap");
    let style = "";
    if (f.color) style += `color:${f.color};`;        /* bg vai no TD, nao no texto */
    if (f.fontSize) style += `font-size:${f.fontSize}px;`;
    const val = rec ? (rec.value ?? "") : "";

    let content;
    if (rec && rec.data_type === "status") {
      const sc = statusClass(val);
      content = val ? `<span class="chip ${sc}">${escapeHtml(val)}</span>` : "";
      cls.push("status-cell");
    } else {
      content = escapeHtml(val);
    }
    const hasC = this.comments.get(this.key(r, c));
    // o marcador de comentario e aplicado na td (classe), aqui so o conteudo:
    return `<div class="${cls.join(" ")}"${style ? ` style="${style}"` : ""}>${content}</div>`;
  }

  /* re-renderiza apenas uma celula (apos edicao local/remota) */
  refreshCell(r, c) {
    if (!this.table) return;
    const td = this.tdAt(r, c);
    if (!td) { this.render(); return; }   // surgiu/sumiu mescla -> render total
    const rec = this.get(r, c);
    td.classList.toggle("has-comment", !!this.comments.get(this.key(r, c)));
    td.setAttribute("style", this.tdStyle(rec));
    td.innerHTML = this.cellInner(r, c, rec);
    this.applySpillRow(r);
    this._decoratePeers();
  }

  tdAt(r, c) { return this.table.querySelector(`td.cell[data-r="${r}"][data-c="${c}"]`); }

  /* ---------------- selecao ---------------- */
  selRange() {
    return {
      r1: Math.min(this.sel.r, this.selEnd.r), r2: Math.max(this.sel.r, this.selEnd.r),
      c1: Math.min(this.sel.c, this.selEnd.c), c2: Math.max(this.sel.c, this.selEnd.c),
    };
  }
  paintSelection() {
    if (!this.table) return;
    this.table.querySelectorAll("td.cell.sel").forEach((td) => td.classList.remove("sel"));
    this.table.querySelectorAll(".colhead.hl,.rowhead.hl").forEach((e) => e.classList.remove("hl"));
    const { r1, r2, c1, c2 } = this.selRange();
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const td = this.tdAt(r, c);
        if (td) td.classList.add("sel");
      }
    // destaca cabecalhos de coluna/linha da selecao (estilo Excel)
    for (let c = c1; c <= c2; c++) this.table.querySelector(`.colhead[data-c="${c}"]`)?.classList.add("hl");
    for (let r = r1; r <= r2; r++) this.table.querySelector(`.rowhead[data-r="${r}"]`)?.classList.add("hl");
    const td = this.tdAt(this.sel.r, this.sel.c);
    if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" });
    this.actions.onSelect && this.actions.onSelect(this.sel, this.get(this.sel.r, this.sel.c));
  }

  selectColumn(c, extend = false) {
    this.commitEdit();
    if (!extend) this.sel = { r: 1, c };
    this.selEnd = { r: this.sheet.row_count, c };
    this.paintSelection();
  }
  selectRow(r, extend = false) {
    this.commitEdit();
    if (!extend) this.sel = { r, c: 1 };
    this.selEnd = { r, c: this.sheet.col_count };
    this.paintSelection();
  }

  /* ---------------- auto-ajuste de largura ---------------- */
  _measureCtx() {
    if (!this._mctx) this._mctx = document.createElement("canvas").getContext("2d");
    return this._mctx;
  }
  contentWidth(c) {
    const ctx = this._measureCtx();
    let max = 0;
    for (const [k, rec] of this.cells) {
      if (rec.col !== c || rec.covered_by) continue;
      const v = rec.value;
      if (v == null || v === "") continue;
      const f = rec.format || {};
      ctx.font = `${f.bold ? "700" : "400"} ${f.fontSize || 13}px "Plus Jakarta Sans", sans-serif`;
      for (const line of String(v).split("\n")) {
        const w = ctx.measureText(line).width;
        if (w > max) max = w;
      }
    }
    return max ? Math.min(520, Math.max(46, Math.ceil(max) + 18)) : null;
  }
  autoFitColumn(c, persist = true) {
    const w = this.contentWidth(c);
    if (!w) return;
    const widths = { ...(this.sheet.col_widths || {}) };
    widths[String(c)] = w;
    this.sheet.col_widths = widths;
    this.render();
    if (persist) this.actions.setSheet({ col_widths: widths });
  }
  autoFitAll() {
    const widths = { ...(this.sheet.col_widths || {}) };
    for (let c = 1; c <= this.sheet.col_count; c++) {
      const w = this.contentWidth(c);
      if (w) widths[String(c)] = w;
    }
    this.sheet.col_widths = widths;
    this.render();
    this.actions.setSheet({ col_widths: widths });
  }
  select(r, c, extend = false) {
    this.commitEdit();
    r = Math.max(1, Math.min(this.sheet.row_count, r));
    c = Math.max(1, Math.min(this.sheet.col_count, c));
    if (!extend) { this.sel = { r, c }; this.selEnd = { r, c }; }
    else this.selEnd = { r, c };
    this.paintSelection();
  }

  /* ---------------- edicao ---------------- */
  startEdit(initial = null) {
    const { r, c } = this.sel;
    const rec = this.get(r, c);
    if (rec && rec.data_type === "status") return this.openStatusMenu(r, c);
    const td = this.tdAt(r, c);
    if (!td) return;
    td.classList.add("editing");
    td.classList.remove("spill");          // ao editar, desliga o transbordo (volta a aceitar clique/cursor)
    const cc = td.querySelector(".cc");
    cc.style.width = "";
    cc.setAttribute("contenteditable", "plaintext-only");
    if (initial != null) cc.textContent = initial;
    cc.focus();
    // cursor ao fim
    const range = document.createRange(); range.selectNodeContents(cc); range.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    this.editing = { r, c };
    this.actions.onEditing && this.actions.onEditing(this.key(r, c));
  }
  commitEdit() {
    if (!this.editing) return;
    const { r, c } = this.editing;
    const td = this.tdAt(r, c);
    this.editing = null;
    this.actions.onEditing && this.actions.onEditing(null);
    if (!td) return;
    const cc = td.querySelector(".cc");
    const val = (cc.innerText || "").replace(/\n$/, "");
    td.classList.remove("editing");
    cc.removeAttribute("contenteditable");
    const rec = this.get(r, c);
    const old = rec ? (rec.value ?? "") : "";
    if (val !== old) this.setValue(r, c, val);
    else this.refreshCell(r, c);
  }
  cancelEdit() {
    if (!this.editing) return;
    const { r, c } = this.editing;
    this.editing = null;
    this.actions.onEditing && this.actions.onEditing(null);
    const td = this.tdAt(r, c);
    if (td) { td.classList.remove("editing"); td.querySelector(".cc")?.removeAttribute("contenteditable"); }
    this.refreshCell(r, c);
  }

  /* grava valor (otimista + persistencia + undo) */
  setValue(r, c, value) {
    const rec = this.get(r, c);
    this._writeCells([{ r, c, state: {
      value, data_type: (rec && rec.data_type) || "text",
      format: (rec && rec.format) || {}, merge: (rec && rec.merge) || null, covered_by: (rec && rec.covered_by) || null,
    } }]);
  }

  clearSelection() {
    const { r1, r2, c1, c2 } = this.selRange();
    const list = [];
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const rec = this.get(r, c);
        if (rec && rec.value != null && rec.value !== "")
          list.push({ r, c, state: { value: "", data_type: rec.data_type, format: rec.format, merge: rec.merge, covered_by: rec.covered_by } });
      }
    if (list.length) this._writeCells(list);
  }

  lastColInRow(r) {
    let last = 1;
    for (let c = 1; c <= this.sheet.col_count; c++) {
      const rec = this.get(r, c);
      if (rec && rec.value != null && rec.value !== "") last = c;
    }
    return last;
  }

  async copySelection() {
    const { r1, r2, c1, c2 } = this.selRange();
    const rows = [];
    for (let r = r1; r <= r2; r++) {
      const cols = [];
      for (let c = c1; c <= c2; c++) { const rec = this.get(r, c); cols.push(rec && rec.value != null ? String(rec.value) : ""); }
      rows.push(cols.join("\t"));
    }
    this._clip = rows.join("\n");
    try { await navigator.clipboard.writeText(this._clip); } catch (_) {}
  }

  async pasteClipboard() {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch (_) { text = this._clip || ""; }
    if (!text) text = this._clip || "";
    if (!text) return;
    const lines = text.replace(/\r/g, "").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    const { r, c } = this.sel;
    const list = [];
    lines.forEach((line, i) => line.split("\t").forEach((val, j) => {
      const rr = r + i, cc = c + j;
      if (rr > this.sheet.row_count || cc > this.sheet.col_count) return;
      const rec = this.get(rr, cc);
      list.push({ r: rr, c: cc, state: { value: val, data_type: (rec && rec.data_type) || "text", format: (rec && rec.format) || {}, merge: (rec && rec.merge) || null, covered_by: (rec && rec.covered_by) || null } });
    }));
    if (list.length) this._writeCells(list);
  }

  /* ---------------- formatacao ---------------- */
  applyFormat(patch) {
    const { r1, r2, c1, c2 } = this.selRange();
    const list = [];
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const rec = this.get(r, c);
        const fmt = { ...((rec && rec.format) || {}) };
        for (const [k, v] of Object.entries(patch)) { if (v === null || v === false) delete fmt[k]; else fmt[k] = v; }
        list.push({ r, c, state: {
          value: (rec && rec.value) ?? null, data_type: (rec && rec.data_type) || "text",
          format: fmt, merge: (rec && rec.merge) || null, covered_by: (rec && rec.covered_by) || null,
        } });
      }
    this._writeCells(list);
  }
  toggleFormat(prop) {
    const rec = this.get(this.sel.r, this.sel.c);
    const cur = rec && rec.format && rec.format[prop];
    this.applyFormat({ [prop]: cur ? null : true });
  }
  currentFormat() { const rec = this.get(this.sel.r, this.sel.c); return (rec && rec.format) || {}; }

  setStatusType(on) {
    const { r1, r2, c1, c2 } = this.selRange();
    const list = [];
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const rec = this.get(r, c);
        list.push({ r, c, state: {
          value: (rec && rec.value) ?? null, data_type: on ? "status" : "text",
          format: (rec && rec.format) || {}, merge: (rec && rec.merge) || null, covered_by: (rec && rec.covered_by) || null,
        } });
      }
    this._writeCells(list);
  }

  /* ---------------- mescla ---------------- */
  mergeSelection() {
    const { r1, r2, c1, c2 } = this.selRange();
    if (r1 === r2 && c1 === c2) return;
    const a = this.get(r1, c1);
    const list = [{ r: r1, c: c1, state: {
      value: (a && a.value) ?? null, data_type: (a && a.data_type) || "text", format: (a && a.format) || {},
      merge: { rowspan: r2 - r1 + 1, colspan: c2 - c1 + 1 }, covered_by: null } }];
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) continue;
        list.push({ r, c, state: { value: null, data_type: "text", format: {}, merge: null, covered_by: r1 + ":" + c1 } });
      }
    this._writeCells(list, { rerender: true });
  }
  unmergeSelection() {
    const { r1, c1 } = this.selRange();
    const anchor = this.get(r1, c1);
    if (!anchor || !anchor.merge) return;
    const { rowspan, colspan } = anchor.merge;
    const list = [{ r: r1, c: c1, state: { value: anchor.value ?? null, data_type: anchor.data_type || "text", format: anchor.format || {}, merge: null, covered_by: null } }];
    for (let r = r1; r < r1 + rowspan; r++)
      for (let c = c1; c < c1 + colspan; c++) {
        if (r === r1 && c === c1) continue;
        list.push({ r, c, state: null });
      }
    this._writeCells(list, { rerender: true });
  }

  /* ---------------- dropdown de status ---------------- */
  /* opcoes = lista base + quaisquer valores ja usados naquela coluna (status nao mapeado) */
  statusOptionsFor(c) {
    const out = [...STATUS_OPTIONS];
    const seen = new Set(out.map((s) => s.toLowerCase()));
    for (const [, rec] of this.cells) {
      if (rec.col === c && rec.data_type === "status" && rec.value) {
        const v = String(rec.value).trim();
        if (v && !seen.has(v.toLowerCase())) { out.push(v); seen.add(v.toLowerCase()); }
      }
    }
    return out;
  }

  openStatusMenu(r, c) {
    const td = this.tdAt(r, c); if (!td) return;
    document.querySelector(".ctx-menu")?.remove();
    const rect = td.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.style.left = rect.left + "px";
    menu.style.top = rect.bottom + "px";
    menu.style.minWidth = Math.max(150, rect.width) + "px";
    for (const opt of this.statusOptionsFor(c)) {
      const b = document.createElement("button");
      b.innerHTML = `<span class="chip ${statusClass(opt)}">${opt}</span>`;
      b.onclick = () => { menu.remove(); this.setValue(r, c, opt); };
      menu.appendChild(b);
    }
    // opcao para limpar
    const clr = document.createElement("button");
    clr.innerHTML = `<span class="muted" style="font-family:var(--font-ui);font-size:11px">— limpar —</span>`;
    clr.onclick = () => { menu.remove(); this.setValue(r, c, ""); };
    menu.appendChild(clr);
    document.body.appendChild(menu);
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", close); } };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  }

  /* ---------------- presenca ---------------- */
  setPeers(peers, myId) {
    this.peers.clear();
    for (const p of peers) {
      if (!p || p.id === myId || !p.cell) continue;
      this.peers.set(p.cell, { name: p.name, color: p.color });
    }
    this._decoratePeers();
  }
  _decoratePeers() {
    if (!this.table) return;
    this.table.querySelectorAll(".peer-flag,.peer-tag").forEach((e) => e.remove());
    for (const [k, info] of this.peers) {
      const [r, c] = k.split(":").map(Number);
      const td = this.tdAt(r, c);
      if (!td) continue;
      const flag = document.createElement("div"); flag.className = "peer-flag"; flag.style.setProperty("--peer", info.color);
      const tag = document.createElement("div"); tag.className = "peer-tag"; tag.style.setProperty("--peer", info.color); tag.textContent = info.name;
      td.appendChild(flag); td.appendChild(tag);
    }
  }

  /* ---------------- realtime remoto ---------------- */
  applyRemote(rec) {
    const k = this.key(rec.row, rec.col);
    const hadMerge = !!(this.cells.get(k)?.merge || this.cells.get(k)?.covered_by);
    this.cells.set(k, rec);
    if (this.editing && this.editing.r === rec.row && this.editing.c === rec.col) return; // nao atropela edicao local
    if (hadMerge || rec.merge || rec.covered_by) this.render();
    else this.refreshCell(rec.row, rec.col);
  }
  removeRemote(r, c) {
    this.cells.delete(this.key(r, c));
    this.refreshCell(r, c);
  }

  /* ---------------- eventos ---------------- */
  _bindTable() {
    const t = this.table;
    t.addEventListener("mousedown", (e) => {
      if (e.target.closest(".rsz") || e.target.closest(".rsz-row")) return;  // resize tem handler proprio
      const td = e.target.closest("td.cell");
      if (td) {
        const r = +td.dataset.r, c = +td.dataset.c;
        if (this.editing && (this.editing.r !== r || this.editing.c !== c)) this.commitEdit();
        if (e.shiftKey) { e.preventDefault(); this.select(r, c, true); return; }   // shift-clique estende
        e.preventDefault();
        this.select(r, c, false);
        const rec = this.get(r, c);
        const isStatus = rec && rec.data_type === "status";
        // arrastar para selecionar um intervalo (estilo Excel)
        const drag = { moved: false };
        const onMove = (ev) => {
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const c2 = el && el.closest ? el.closest("td.cell") : null;
          if (!c2) return;
          const rr = +c2.dataset.r, cc = +c2.dataset.c;
          if (rr !== this.selEnd.r || cc !== this.selEnd.c) { drag.moved = true; this.select(rr, cc, true); }
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          if (!drag.moved && isStatus) this.openStatusMenu(r, c);  // clique simples no status abre a lista
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        return;
      }
      const ch = e.target.closest(".colhead");
      if (ch) { this.selectColumn(+ch.dataset.c, e.shiftKey); return; }
      const rh = e.target.closest(".rowhead");
      if (rh) { this.selectRow(+rh.dataset.r, e.shiftKey); return; }
    });
    t.addEventListener("dblclick", (e) => {
      const rsz = e.target.closest(".rsz");
      if (rsz) { this.autoFitColumn(+rsz.dataset.c); return; }   // duplo-clique na borda = auto-ajustar
      const td = e.target.closest("td.cell");
      if (td) { this.select(+td.dataset.r, +td.dataset.c); this.startEdit(); }
    });
    // edicao: commit ao perder foco
    t.addEventListener("focusout", (e) => {
      if (e.target.classList?.contains("cc") && this.editing) this.commitEdit();
    });
    // resize de coluna
    t.addEventListener("mousedown", (e) => {
      const h = e.target.closest(".rsz");
      if (!h) return;
      e.preventDefault(); e.stopPropagation();
      const c = +h.dataset.c;
      const colEl = t.querySelectorAll("colgroup col")[c]; // 0 = rowhead
      const startX = e.clientX, startW = this.colWidth(c);
      const move = (ev) => { const w = Math.max(16, startW + ev.clientX - startX); colEl.style.width = w + "px"; this._tmpW = w; };
      const up = () => {
        document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
        const widths = { ...(this.sheet.col_widths || {}) }; widths[String(c)] = this._tmpW || startW;
        this.sheet.col_widths = widths; this.actions.setSheet({ col_widths: widths });
        this.applySpill();   // recalcula o transbordo de texto com a nova largura
      };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
    // resize de ALTURA de linha
    t.addEventListener("mousedown", (e) => {
      const h = e.target.closest(".rsz-row");
      if (!h) return;
      e.preventDefault(); e.stopPropagation();
      const r = +h.dataset.r;
      const tr = h.closest("tr");
      const startY = e.clientY, startH = tr.getBoundingClientRect().height;
      const move = (ev) => { this._tmpH = Math.max(20, Math.round(startH + ev.clientY - startY)); tr.style.height = this._tmpH + "px"; };
      const up = () => {
        document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
        const heights = { ...(this.sheet.row_heights || {}) }; heights[String(r)] = this._tmpH || Math.round(startH);
        this.sheet.row_heights = heights; this.actions.setSheet({ row_heights: heights });
      };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
    // menu de contexto
    t.addEventListener("contextmenu", (e) => {
      const td = e.target.closest("td.cell");
      if (!td) return;
      e.preventDefault();
      this.select(+td.dataset.r, +td.dataset.c, e.shiftKey ? true : false);
      this.openContextMenu(e.clientX, e.clientY);
    });
  }

  _bindGlobal() {
    document.addEventListener("keydown", (e) => {
      if (!this.sheet || !this.table) return;
      if (!this.box.isConnected || !this.table.isConnected) return;   // grid fora da tela (ex.: dashboard)
      // se estiver editando, trata Enter/Esc/Tab
      if (this.editing) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.commitEdit(); this.select(this.sel.r + 1, this.sel.c); }
        else if (e.key === "Escape") { e.preventDefault(); this.cancelEdit(); }
        else if (e.key === "Tab") { e.preventDefault(); this.commitEdit(); this.select(this.sel.r, this.sel.c + (e.shiftKey ? -1 : 1)); }
        return;
      }
      // foco fora do grid? so age se a selecao estiver "ativa" (sem inputs externos focados)
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;

      const { r, c } = this.sel;
      // ----- combos com Ctrl/Cmd -----
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
        if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
        if (k === "c") { e.preventDefault(); this.copySelection(); return; }
        if (k === "x") { e.preventDefault(); this.copySelection(); this.clearSelection(); return; }
        if (k === "v") { e.preventDefault(); this.pasteClipboard(); return; }
        if (k === "a") { e.preventDefault(); this.sel = { r: 1, c: 1 }; this.selEnd = { r: this.sheet.row_count, c: this.sheet.col_count }; this.paintSelection(); return; }
        if (k === "b") { e.preventDefault(); this.toggleFormat("bold"); return; }
        if (k === "i") { e.preventDefault(); this.toggleFormat("italic"); return; }
        if (k === "u") { e.preventDefault(); this.toggleFormat("underline"); return; }
        if (e.key === "Home") { e.preventDefault(); this.select(1, 1); return; }
        if (e.key === "End") { e.preventDefault(); this.select(this.sheet.row_count, this.lastColInRow(this.sheet.row_count) || 1); return; }
        return;
      }
      // ----- teclas simples -----
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); this.select(r - 1, c, e.shiftKey); break;
        case "ArrowDown": e.preventDefault(); this.select(r + 1, c, e.shiftKey); break;
        case "ArrowLeft": e.preventDefault(); this.select(r, c - 1, e.shiftKey); break;
        case "ArrowRight": e.preventDefault(); this.select(r, c + 1, e.shiftKey); break;
        case "Home": e.preventDefault(); this.select(r, 1, e.shiftKey); break;
        case "End": e.preventDefault(); this.select(r, this.lastColInRow(r), e.shiftKey); break;
        case "PageDown": e.preventDefault(); this.select(Math.min(this.sheet.row_count, r + 20), c); break;
        case "PageUp": e.preventDefault(); this.select(Math.max(1, r - 20), c); break;
        case "Tab": e.preventDefault(); this.select(r, c + (e.shiftKey ? -1 : 1)); break;
        case "Enter": e.preventDefault(); this.startEdit(); break;
        case "F2": e.preventDefault(); this.startEdit(); break;
        case "Delete": case "Backspace": e.preventDefault(); this.clearSelection(); break;
        default:
          if (e.key.length === 1 && !e.altKey) this.startEdit(e.key);
      }
    });
  }

  openContextMenu(x, y) {
    document.querySelector(".ctx-menu")?.remove();
    const { r, c } = this.sel;
    const rec = this.get(r, c);
    const isStatus = rec && rec.data_type === "status";
    const m = document.createElement("div"); m.className = "ctx-menu";
    m.style.left = x + "px"; m.style.top = y + "px";
    const item = (label, fn, danger) => {
      const b = document.createElement("button"); b.textContent = label; if (danger) b.className = "danger";
      b.onclick = () => { m.remove(); fn(); }; m.appendChild(b);
    };
    const sep = () => { const s = document.createElement("div"); s.className = "sep"; m.appendChild(s); };
    item("Inserir linha acima", () => this.actions.insertRow(r));
    item("Inserir linha abaixo", () => this.actions.insertRow(r + 1));
    item("Remover linha", () => this.actions.deleteRow(r), true);
    sep();
    item("Inserir coluna à esquerda", () => this.actions.insertCol(c));
    item("Inserir coluna à direita", () => this.actions.insertCol(c + 1));
    item("Remover coluna", () => this.actions.deleteCol(c), true);
    sep();
    item("Mesclar seleção", () => this.mergeSelection());
    item("Desfazer mescla", () => this.unmergeSelection());
    item(isStatus ? "Remover dropdown de status" : "Tornar célula de status", () => this.setStatusType(!isStatus));
    sep();
    item("Comentários…", () => this.actions.openComments(r, c));
    item("Histórico desta célula…", () => this.actions.openHistory(r, c));
    document.body.appendChild(m);
    const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("mousedown", close); } };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  }

  /* aplica mudanca de contagem de comentarios vinda do realtime */
  bumpComment(r, c) {
    const k = this.key(r, c);
    this.comments.set(k, (this.comments.get(k) || 0) + 1);
    this.refreshCell(r, c);
  }
}
