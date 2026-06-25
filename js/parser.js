/* =====================================================================
   parser.js — extrai registros reais (empresa × status) das abas.
   Reconhece os dois padroes:
     - MATRIZ: empresas no cabecalho (linha), itens nas linhas, status no
       cruzamento (ex.: aba 1.2 Derivativos).
     - LISTA:  empresa repetida numa coluna, status noutra coluna por linha
       (ex.: aba 1.1 Contingencias, seccionada por empresa).
   So conta como registro quando o valor do status esta na Lista de Status
   (decisao do produto: "OK"/vazio nao contam).
   ===================================================================== */

const norm = (v) => String(v ?? "").trim();
const low = (v) => norm(v).toLowerCase();
/* chave de comparação de EMPRESA: minúsculas + trim + colapsa espaços (mantém acento) */
const key = (v) => low(v).replace(/\s+/g, " ");

/* parseSheet(sheet, cells, companySet, statusSet)
   companySet/statusSet: Set de rotulos em minusculas.
   retorna { orientation:'matrix'|'list'|'none', companies:[], records:[{empresa,num,desc,status,row,col}], ... } */
export function parseSheet(sheet, cells, companyResolve, statusSet) {
  const map = new Map();
  let maxRow = 0, maxCol = 0;
  for (const c of cells) {
    map.set(c.row + ":" + c.col, c);
    if (c.row > maxRow) maxRow = c.row;
    if (c.col > maxCol) maxCol = c.col;
  }
  if (!cells.length) return { orientation: "none", companies: [], records: [] };
  const val = (r, c) => { const x = map.get(r + ":" + c); return x ? norm(x.value) : ""; };
  const isStatusType = (r, c) => { const x = map.get(r + ":" + c); return !!(x && x.data_type === "status"); };
  const isCompany = (s) => companyResolve.has(key(s));
  const canon = (s) => companyResolve.get(key(s));
  const isStatusVal = (s) => statusSet.has(low(s));

  // ---- candidato MATRIZ: linha com >=2 empresas (cabecalho) ----
  let headerRow = 0, compCols = [];
  for (let r = 1; r <= maxRow; r++) {
    const cols = [];
    for (let c = 1; c <= maxCol; c++) if (isCompany(val(r, c))) cols.push(c);
    if (cols.length >= 2 && cols.length > compCols.length) { headerRow = r; compCols = cols; }
  }
  // ---- candidato LISTA: coluna com >=2 empresas ----
  let compCol = 0, compColN = 0;
  for (let c = 1; c <= maxCol; c++) {
    let n = 0;
    for (let r = 1; r <= maxRow; r++) if (isCompany(val(r, c))) n++;
    if (n >= 2 && n > compColN) { compCol = c; compColN = n; }
  }

  const records = [];

  // MATRIZ vence se tiver pelo menos tantas empresas no cabecalho quanto a coluna
  if (compCols.length >= 2 && compCols.length >= compColN) {
    const firstCompCol = Math.min(...compCols);
    const colCompany = new Map(compCols.map((c) => [c, canon(val(headerRow, c))]));
    for (let r = headerRow + 1; r <= maxRow; r++) {
      let num = "", desc = "";
      for (let c = 1; c < firstCompCol; c++) {
        const t = val(r, c);
        if (!t) continue;
        if (/^\d+([.,]\d+)?$/.test(t) && !num) num = t;
        else if (t.length > desc.length) desc = t;
      }
      for (const c of compCols) {
        const s = val(r, c);
        if (isStatusVal(s)) records.push({ empresa: colCompany.get(c), num, desc, status: s, row: r, col: c });
      }
    }
    return { orientation: "matrix", companies: [...new Set(compCols.map((c) => canon(val(headerRow, c))))], records, headerRow };
  }

  // LISTA
  if (compColN >= 2) {
    let statusCol = 0, statusColN = 0;
    for (let c = 1; c <= maxCol; c++) {
      if (c === compCol) continue;
      let n = 0;
      for (let r = 1; r <= maxRow; r++) if (isStatusType(r, c) && isStatusVal(val(r, c))) n++;
      if (n > statusColN) { statusCol = c; statusColN = n; }
    }
    let descCol = 0, descScore = -1;
    for (let c = 1; c <= maxCol; c++) {
      if (c === compCol || c === statusCol) continue;
      let total = 0, n = 0;
      for (let r = 1; r <= maxRow; r++) { const t = val(r, c); if (t && !isCompany(t) && !isStatusVal(t)) { total += t.length; n++; } }
      if (n >= 2 && total > descScore) { descScore = total; descCol = c; }
    }
    const comps = new Set();
    for (let r = 1; r <= maxRow; r++) {
      const raw = val(r, compCol);
      if (!isCompany(raw)) continue;
      const emp = canon(raw);
      comps.add(emp);
      const s = statusCol ? val(r, statusCol) : "";
      if (!isStatusVal(s)) continue;
      records.push({ empresa: emp, num: "", desc: descCol ? val(r, descCol) : "", status: s, row: r, col: statusCol });
    }
    return { orientation: "list", companies: [...comps], records, compCol, statusCol, descCol };
  }

  return { orientation: "none", companies: [], records: [] };
}

/* roda o parser em varias abas. loadCells(sheetId) -> Promise<cells[]>.
   onProgress(done,total,sheet,res) opcional. Retorna por aba + agregados. */
export async function parseAbas(sheets, loadCells, companies, statusOptions, onProgress) {
  const companyResolve = new Map();   // chave(grafia) -> nome canônico (canônicos + aliases)
  (companies || []).forEach((x) => {
    const label = typeof x === "string" ? x : x.label;
    if (!label) return;
    companyResolve.set(key(label), label);
    ((x && Array.isArray(x.aliases)) ? x.aliases : []).forEach((a) => { if (a) companyResolve.set(key(a), label); });
  });
  const statusSet = new Set((statusOptions || []).map((x) => low(typeof x === "string" ? x : x.label)));
  const perSheet = [];
  const byCompanyStatus = new Map();   // empresa -> Map(status -> qtd)
  const byStatus = new Map();
  let total = 0;
  const list = sheets.filter((s) => s.kind !== "index");
  let done = 0;
  for (const s of list) {
    let cells = [];
    try { cells = await loadCells(s.id); } catch (_) {}
    const res = parseSheet(s, cells, companyResolve, statusSet);
    perSheet.push({ sheet: s, res });
    for (const rec of res.records) {
      total++;
      byStatus.set(rec.status, (byStatus.get(rec.status) || 0) + 1);
      if (!byCompanyStatus.has(rec.empresa)) byCompanyStatus.set(rec.empresa, new Map());
      const m = byCompanyStatus.get(rec.empresa);
      m.set(rec.status, (m.get(rec.status) || 0) + 1);
    }
    done++;
    if (onProgress) onProgress(done, list.length, s, res);
  }
  return { perSheet, byCompanyStatus, byStatus, total };
}
