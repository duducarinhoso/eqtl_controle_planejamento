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
/* sem acento + minúsculo (p/ comparar "Grupo Equatorial", meses etc.) */
const deacc = (v) => low(v).normalize("NFD").replace(/[̀-ͯ]/g, "");

/* heurística: o texto parece uma DATA? (formatos numéricos + por extenso em pt-BR) */
const MESES = "janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
export function looksLikeDate(s) {
  const t = deacc(s).trim();
  if (!t) return false;
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(t)) return true;   // 31/03/2026
  if (/^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/.test(t)) return true;      // 2026-03-31
  if (new RegExp("(^|\\s)(" + MESES + ")(\\s|$|/|,)").test(t)) return true;   // "... março ..."
  if (/^\d{1,2}\s+de\s+/.test(t)) return true;                       // "31 de ..."
  if (/^\s*(0?[1-9]|[12]\d|3[01])\s+\S/.test(t) && /\b\d{4}\b/.test(t)) return true; // dia ... ano
  return false;
}

/* detectLegend(cells): descobre o subtítulo da aba a partir do conteúdo.
   Estratégia: acha a âncora "Grupo Equatorial" nas primeiras linhas/colunas e,
   ABAIXO dela (mesma coluna primeiro; depois em faixa próxima), pega o 1º texto
   que não é vazio, não é a própria âncora e não é data (ex.: "Derivativos").
   A ordem data↔nome varia entre abas — por isso pulamos qualquer data.
   Sem âncora → "" (fica em branco para o usuário renomear manualmente).
   cells: array de { row, col, value }. */
export function detectLegend(cells) {
  const map = new Map();
  let maxRow = 0, maxCol = 0;
  for (const c of cells || []) {
    const v = norm(c.value); if (!v) continue;
    map.set(c.row + ":" + c.col, v);
    if (c.row > maxRow) maxRow = c.row;
    if (c.col > maxCol) maxCol = c.col;
  }
  const val = (r, c) => map.get(r + ":" + c) || "";
  const isAnchor = (s) => deacc(s).includes("grupo equatorial");
  const usable = (t) => t && !isAnchor(t) && !looksLikeDate(t);

  // 1) acha a âncora nas primeiras linhas/colunas
  let ar = 0, ac = 0;
  const rLim = Math.min(maxRow, 20), cLim = Math.min(maxCol, 15);
  outer: for (let r = 1; r <= rLim; r++) for (let c = 1; c <= cLim; c++) {
    if (isAnchor(val(r, c))) { ar = r; ac = c; break outer; }
  }
  if (!ar) return "";

  // 2) mesma coluna, para baixo: 1º texto útil
  for (let r = ar + 1; r <= Math.min(maxRow, ar + 12); r++) {
    const t = val(r, ac); if (usable(t)) return t;
  }
  // 3) fallback: faixa de linhas logo abaixo, varrendo colunas próximas
  for (let r = ar + 1; r <= Math.min(maxRow, ar + 6); r++) {
    for (let c = 1; c <= Math.min(maxCol, ac + 6); c++) {
      const t = val(r, c); if (usable(t)) return t;
    }
  }
  return "";
}

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
    // Suporte a SEÇÕES: o cabeçalho de empresa pode se repetir coluna abaixo (ex.: um
    // bloco EQTL MA…GO e, mais abaixo, um bloco CSA na mesma coluna). Cada status é
    // atribuído à empresa do cabeçalho mais PRÓXIMO ACIMA, na MESMA coluna — assim o
    // bloco CSA não é contado como a empresa do topo.
    const compRowsByCol = new Map();   // col -> [linhas com empresa, asc]
    const compNameAt = new Map();      // "r:c" -> nome canônico
    for (let c = 1; c <= maxCol; c++) {
      for (let r = 1; r <= maxRow; r++) {
        const v = val(r, c);
        if (v && isCompany(v)) {
          if (!compRowsByCol.has(c)) compRowsByCol.set(c, []);
          compRowsByCol.get(c).push(r);
          compNameAt.set(r + ":" + c, canon(v));
        }
      }
    }
    const companyCols = [...compRowsByCol.keys()].sort((a, b) => a - b);
    const firstCompCol = companyCols[0];
    const firstHeader = Math.min(...[...compNameAt.keys()].map((k) => +k.slice(0, k.indexOf(":"))));
    const companyAbove = (r, c) => {   // empresa do cabeçalho mais próximo acima, na coluna c
      const rows = compRowsByCol.get(c); if (!rows) return null;
      let best = null;
      for (const hr of rows) { if (hr < r) best = hr; else break; }
      return best == null ? null : compNameAt.get(best + ":" + c);
    };
    const compsUsed = new Set();
    for (let r = firstHeader + 1; r <= maxRow; r++) {
      let num = "", desc = "";
      for (let c = 1; c < firstCompCol; c++) {
        const t = val(r, c);
        if (!t) continue;
        if (/^\d+([.,]\d+)?$/.test(t) && !num) num = t;
        else if (t.length > desc.length) desc = t;
      }
      for (const c of companyCols) {
        const s = val(r, c);
        if (!isStatusVal(s)) continue;
        const emp = companyAbove(r, c);
        if (!emp) continue;
        compsUsed.add(emp);
        records.push({ empresa: emp, num, desc, status: s, row: r, col: c });
      }
    }
    return { orientation: "matrix", companies: [...compsUsed], records, headerRow };
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
    perSheet.push({ sheet: s, res, legend: detectLegend(cells) });
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
