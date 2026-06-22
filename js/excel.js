/* Import (SheetJS) e Export (ExcelJS) de .xlsx, carregados sob demanda via CDN.
   Import: traz apenas VALORES (formula -> valor calculado).
   Export: mantem layout (larguras, mescla, cores, negrito, alinhamento). */

let _XLSX, _ExcelJS;
async function getXLSX() {
  if (!_XLSX) _XLSX = await import("https://esm.sh/xlsx@0.18.5");
  return _XLSX;
}
async function getExcelJS() {
  if (!_ExcelJS) { const m = await import("https://esm.sh/exceljs@4.4.0"); _ExcelJS = m.default || m; }
  return _ExcelJS;
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  const base = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return (d.getHours() || d.getMinutes()) ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}

/* Le um .xlsx -> [{ name, cells: Map("r:c" -> valor string) }] (1-based). */
export async function parseXlsxFile(file) {
  const XLSX = await getXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true, cellText: true });
  const out = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const cells = new Map();
    if (ws && ws["!ref"]) {
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (!cell) continue;
          let v;
          if (cell.v instanceof Date) v = fmtDate(cell.v);             // datas SEMPRE dd/mm/aaaa
          else v = cell.w != null ? cell.w : cell.v;                   // senao usa o texto formatado
          if (v == null || v === "") continue;
          cells.set((R + 1) + ":" + (C + 1), String(v).trim());
        }
      }
    }
    out.push({ name, cells });
  }
  return out;
}

/* Le um .xlsx COM formatação (ExcelJS) -> por aba:
   { name, position, hidden, kind, row_count, col_count, col_widths, row_heights,
     merges, covered, cells: Map("r:c" -> {value, format}), comments }.
   Captura fonte/cor/preenchimento/borda/alinhamento/numfmt (cores de tema),
   mais larguras/alturas reais, mescla de celulas e notas — o suficiente para
   a CARGA INICIAL de um projeto direto do Excel (sem passar por Python/JSON). */
export async function parseXlsxFull(file) {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const palette = buildThemePalette(wb);
  const out = [];
  let pos = 0;
  wb.eachSheet((ws) => {
    const cells = new Map();
    const comments = [];
    let maxR = 1, maxC = 1;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const value = cellText(cell);
        const format = extractFormat(cell, palette);
        if ((value != null && value !== "") || Object.keys(format).length) {
          cells.set(r + ":" + c, { value, format });
          if (r > maxR) maxR = r;
          if (c > maxC) maxC = c;
        }
        const note = noteText(cell);
        if (note) comments.push({ row: r, col: c, author: "", body: note });
      });
    });

    // ---- mescla de celulas (ancora -> span; demais -> covered_by) ----
    const merges = {}, covered = {};
    let ranges = [];
    try { ranges = (ws.model && ws.model.merges) || []; } catch (_) { ranges = []; }
    for (const rg of ranges) {
      const parts = String(rg).split(":");
      const pa = refToRC(parts[0]), pb = refToRC(parts[1] || parts[0]);
      if (!pa || !pb) continue;
      merges[pa.r + ":" + pa.c] = { rowspan: pb.r - pa.r + 1, colspan: pb.c - pa.c + 1 };
      for (let r = pa.r; r <= pb.r; r++)
        for (let c = pa.c; c <= pb.c; c++)
          if (r !== pa.r || c !== pa.c) covered[r + ":" + c] = pa.r + ":" + pa.c;
      if (pb.r > maxR) maxR = pb.r;
      if (pb.c > maxC) maxC = pb.c;
    }

    // ---- larguras / alturas reais (mesma conversao do migrador Python) ----
    const defW = (ws.properties && ws.properties.defaultColWidth) || 8.43;
    const col_widths = {};
    for (let c = 1; c <= maxC; c++) {
      const col = ws.getColumn(c);
      const w = (col && typeof col.width === "number") ? col.width : defW;
      col_widths[String(c)] = Math.round(w * 7) + 5;        // chars -> px
    }
    const row_heights = {};
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (typeof row.height === "number" && row.height > 0)
        row_heights[String(r)] = Math.max(18, Math.round(row.height * 4 / 3));  // pts -> px
    });

    const nm = ws.name.trim().toLowerCase();
    const kind = ["solicitações", "solicitacoes", "status wkt"].includes(nm) ? "index" : "matrix";
    out.push({
      name: ws.name, position: pos++,
      hidden: ws.state ? ws.state !== "visible" : false,
      kind, row_count: Math.max(maxR + 20, 60), col_count: Math.max(maxC + 4, 12),
      col_widths, row_heights, merges, covered, cells, comments,
    });
  });
  return out;
}

/* "B12" -> {r:12, c:2} (ignora cifroes de referencia absoluta) */
function refToRC(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(ref).replace(/\$/g, "").toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: parseInt(m[2], 10), c };
}

/* texto de uma nota/comentario de celula (ExcelJS expoe cell.note) */
function noteText(cell) {
  const n = cell && cell.note;
  if (!n) return "";
  if (typeof n === "string") return n.trim();
  if (Array.isArray(n.texts)) return n.texts.map((t) => (t && t.text) || "").join("").trim();
  if (typeof n.text === "string") return n.text.trim();
  return "";
}

function cellText(cell) {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === "object") {
    if (v.result !== undefined) return v.result instanceof Date ? fmtDate(v.result) : numOrStr(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return String(v.text);
    return "";
  }
  return numOrStr(v);
}
function numOrStr(x) {
  if (x == null) return "";
  if (typeof x === "number") return Number.isInteger(x) ? String(x) : String(x);
  return String(x);
}
function extractFormat(cell, palette) {
  const f = {};
  const fn = cell.font;
  if (fn) {
    if (fn.bold) f.bold = true;
    if (fn.italic) f.italic = true;
    if (fn.underline) f.underline = true;
    const col = resolveColor(fn.color, palette);
    if (col && col !== "#000000") f.color = col;
    if (fn.size && fn.size !== 11) f.fontSize = fn.size;
  }
  const fill = cell.fill;
  if (fill && fill.type === "pattern" && fill.pattern === "solid") {
    const bg = resolveColor(fill.fgColor, palette);
    if (bg && bg !== "#ffffff") f.bg = bg;
  }
  const al = cell.alignment;
  if (al) {
    if (["left", "center", "right"].includes(al.horizontal)) f.align = al.horizontal;
    if (al.wrapText) f.wrap = true;
    if (al.vertical === "top" || al.vertical === "bottom") f.valign = al.vertical;
    else if (al.vertical === "middle") f.valign = "center";
  }
  const bd = cell.border;
  if (bd) {
    const sides = {}; let bc = null;
    [["top", "t"], ["right", "r"], ["bottom", "b"], ["left", "l"]].forEach(([k, s]) => {
      if (bd[k] && bd[k].style) { sides[s] = true; if (!bc && bd[k].color) bc = resolveColor(bd[k].color, palette); }
    });
    if (Object.keys(sides).length) { if (bc && bc !== "#000000") sides.c = bc; f.border = sides; }
  }
  if (cell.numFmt && cell.numFmt !== "General") f.numfmt = cell.numFmt;
  return f;
}
function resolveColor(c, palette) {
  if (!c) return null;
  if (c.argb && /^[0-9A-Fa-f]{8}$/.test(c.argb)) return "#" + c.argb.slice(2).toLowerCase();
  if (c.theme !== undefined && palette && palette[c.theme]) return "#" + applyTint(palette[c.theme], c.tint || 0);
  return null;
}
function applyTint(hex, tint) {
  let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const t = (ch) => tint < 0 ? Math.round(ch * (1 + tint)) : tint > 0 ? Math.round(ch * (1 - tint) + 255 * tint) : ch;
  const h = (ch) => Math.max(0, Math.min(255, t(ch))).toString(16).padStart(2, "0");
  return h(r) + h(g) + h(b);
}
function buildThemePalette(wb) {
  try {
    const themes = wb.model && wb.model.themes;
    if (!themes) return null;
    const xml = themes.theme1 || Object.values(themes)[0];
    if (!xml || typeof xml !== "string") return null;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    let scheme = doc.getElementsByTagName("a:clrScheme")[0];
    if (!scheme) { const all = doc.getElementsByTagName("*"); for (const el of all) if ((el.localName || "") === "clrScheme") { scheme = el; break; } }
    if (!scheme) return null;
    const order = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
    const raw = {};
    for (const el of scheme.children) {
      const tag = el.localName || el.tagName.split(":").pop();
      const child = el.children[0]; if (!child) continue;
      const ct = child.localName || child.tagName.split(":").pop();
      if (ct === "srgbClr") raw[tag] = child.getAttribute("val");
      else if (ct === "sysClr") raw[tag] = child.getAttribute("lastClr") || (tag.startsWith("dk") ? "000000" : "FFFFFF");
    }
    const seq = order.map((k) => raw[k] || "000000");
    return [seq[1], seq[0], seq[3], seq[2], ...seq.slice(4)];
  } catch (_) { return null; }
}

/* Exporta para .xlsx. sheetsData: [{ name, col_widths, col_count, cells:[record] }] */
export async function exportToXlsx(sheetsData, filename) {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Controle de Solicitações";
  for (const sd of sheetsData) {
    const ws = wb.addWorksheet(sanitizeName(sd.name));
    const widths = sd.col_widths || {};
    for (let c = 1; c <= (sd.col_count || 26); c++) {
      const px = widths[String(c)];
      if (px) ws.getColumn(c).width = Math.max(2, Math.round(px / 7));
    }
    for (const rec of sd.cells) {
      if (rec.covered_by) continue;
      const cell = ws.getCell(rec.row, rec.col);
      cell.value = coerce(rec.value);
      const f = rec.format || {};
      const font = {};
      if (f.bold) font.bold = true;
      if (f.italic) font.italic = true;
      if (f.underline) font.underline = true;
      if (f.color) font.color = { argb: toARGB(f.color) };
      if (f.fontSize) font.size = f.fontSize;
      if (Object.keys(font).length) cell.font = font;
      if (f.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toARGB(f.bg) } };
      if (f.border) {
        const bc = { argb: f.border.c ? toARGB(f.border.c) : "FF000000" };
        const bd = {};
        if (f.border.t) bd.top = { style: "thin", color: bc };
        if (f.border.r) bd.right = { style: "thin", color: bc };
        if (f.border.b) bd.bottom = { style: "thin", color: bc };
        if (f.border.l) bd.left = { style: "thin", color: bc };
        cell.border = bd;
      }
      const al = {};
      if (f.align) al.horizontal = f.align;
      if (f.valign) al.vertical = f.valign;
      if (f.wrap) al.wrapText = true;
      if (Object.keys(al).length) cell.alignment = al;
      if (rec.merge && (rec.merge.rowspan > 1 || rec.merge.colspan > 1)) {
        try { ws.mergeCells(rec.row, rec.col, rec.row + rec.merge.rowspan - 1, rec.col + rec.merge.colspan - 1); } catch (_) {}
      }
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

/* autoteste: gera um xlsx (ExcelJS) e rele (SheetJS). Usado so em verificacao. */
export async function selftest() {
  const XLSX = await getXLSX();
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Teste");
  ws.getCell(1, 1).value = "Olá"; ws.getCell(1, 1).font = { bold: true };
  ws.getCell(2, 1).value = 42;
  ws.mergeCells(3, 1, 3, 2);
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = XLSX.read(buf, { type: "array" });
  const ws2 = wb2.Sheets[wb2.SheetNames[0]];
  return { sheets: wb2.SheetNames, a1: ws2["A1"] && ws2["A1"].v, a2: ws2["A2"] && ws2["A2"].v };
}

export async function styletest() {
  const XLSX = await getXLSX(); const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("S");
  const cell = ws.getCell(1, 1); cell.value = "X";
  cell.font = { bold: true, color: { argb: "FFFF0000" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002060" } };
  cell.border = { top: { style: "thin", color: { argb: "FF000000" } } };
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = XLSX.read(buf, { cellStyles: true });
  const c = wb2.Sheets["S"]["A1"];
  return { hasS: !!(c && c.s), s: c && c.s ? c.s : null };
}

function coerce(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s !== "" && /^-?\d+(\.\d+)?$/.test(s)) { const n = Number(s); if (!isNaN(n)) return n; }
  return v;
}
function toARGB(hex) {
  hex = String(hex).replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
  return "FF" + hex.toUpperCase();
}
function sanitizeName(n) { return (String(n).replace(/[\\/?*\[\]:]/g, "_").slice(0, 31)) || "Aba"; }
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
