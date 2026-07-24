/* Leitura da "Lista de pedidos" para o modelo 'tabela'.
   Detecta a aba pelos cabecalhos (linha de header) e devolve linhas tipadas
   nos campos de PLANNING_FIELDS. Ignora as 4 colunas calculadas do arquivo.

   Aceita tanto o modelo de carga ("Baixar modelo", so as 13 colunas de entrada)
   quanto o arquivo que sai do proprio "Exportar (Excel)" da Base Gerencial (as
   13 + as 4 calculadas: Status de entrega/Geral/Prazo, Dias de atraso) — o
   fluxo exportar → editar no Excel → reimportar precisa funcionar sem que o
   usuario precise apagar essas colunas antes. As calculadas nao entram em
   HEADER_MAP, entao ficam de fora de colMap e sao ignoradas silenciosamente
   (nunca viram campo pra gravar).

   Usa SheetJS (getXLSX), nao ExcelJS: alem de mais leve (so precisamos de VALORES
   + datas, nao formatacao), o ExcelJS trava neste arquivo real (slicers + Excel
   Table). SheetJS le o mesmo arquivo em ~0.5s. */
import { getXLSX, getExcelJS, downloadBlob } from "./excel.js";

/* Cabecalho do Excel (normalizado) -> campo. Normalizamos o texto (minusculo,
   sem acento, colapsa espacos) para casar apesar de variacoes de grafia. */
const HEADER_MAP = {
  "#": "item_num",
  "referencia": "referencia",
  "grupo": "grupo",
  "descricao no client portal": "descricao",
  "empresa": "empresa",
  "segmento": "segmento",
  "data-base": "data_base",
  "status": "status",
  "data solicitacao": "data_solicitacao",
  "prazo recebimento": "prazo_recebimento",
  "area responsavel": "area_responsavel",
  "responsavel": "responsavel",
  "entrega efetiva": "entrega_efetiva",
};
const DATE_FIELDS = new Set(["data_base", "prazo_recebimento", "entrega_efetiva"]); // -> YYYY-MM-DD
const TS_FIELDS = new Set(["data_solicitacao"]);                                     // -> ISO timestamp
// Minimo de campos-chave para reconhecer a aba como valida (o modelo Lista de pedidos).
// "status" NAO e obrigatoria: e so um marcador livre (ex.: "N/A"), fica lida se
// a coluna existir, mas a aba e reconhecida mesmo sem ela.
const REQUIRED = ["item_num", "referencia", "grupo", "empresa", "prazo_recebimento"];

function norm(s) {
  return String(s ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // tira acento (combining marks U+0300-036F)
    .replace(/\s+/g, " ");
}

/* Data-only: usa os componentes LOCAIS (wall-clock) — datas do Excel sao calendario,
   nao instantes; evita deslocar o dia por fuso. */
function toISODate(v) {
  if (v == null || v === "") return null;
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function toISOTs(v) {
  if (v == null || v === "") return null;
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* Acha a linha de cabecalho (ate a 6a linha lida) que casa com o modelo.
   rows = array de arrays (sheet_to_json header:1). Retorna {headerRow, colMap} ou null. */
function detectHeader(rows) {
  const maxScan = Math.min(6, rows.length);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] || [];
    const colMap = {};
    row.forEach((cell, c) => {
      const field = HEADER_MAP[norm(cell)];
      if (field && !(field in colMap)) colMap[field] = c;
    });
    if (REQUIRED.every((f) => f in colMap)) return { headerRow: r, colMap };
  }
  return null;
}

/* Le o arquivo e retorna a 1a aba que bate com o modelo, ja parseada.
   { sheetName, rows: [{campo: valor}] }  |  lanca erro se nenhuma aba casar. */
export async function parseTableXlsx(file) {
  const XLSX = await getXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  let found = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false, defval: null });
    const det = detectHeader(rows);
    if (det) { found = { name, rows, ...det }; break; }
  }
  if (!found) {
    throw new Error("Nenhuma aba com o formato da Lista de pedidos (colunas #, Referência, Grupo, Empresa, Status, Prazo recebimento).");
  }

  const { name, rows, headerRow, colMap } = found;
  const out = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const obj = {};
    let hasAny = false;
    for (const [field, c] of Object.entries(colMap)) {
      let val = row[c];
      if (val == null || val === "") { obj[field] = null; continue; }
      if (DATE_FIELDS.has(field)) val = toISODate(val);
      else if (TS_FIELDS.has(field)) val = toISOTs(val);
      else val = String(val).trim();
      obj[field] = val;
      if (val != null && val !== "") hasAny = true;
    }
    // linha valida precisa do item_num (o "#")
    if (hasAny && obj.item_num != null && String(obj.item_num).trim() !== "") {
      obj.item_num = String(obj.item_num).trim();
      out.push(obj);
    }
  }
  return { sheetName: name, rows: out };
}

/* Cabeçalho legível (com acentos) + regra de preenchimento, na mesma ordem de
   PLANNING_FIELDS/HEADER_MAP. "Obrigatório" espelha REQUIRED (fonte única). */
const TEMPLATE_COLS = [
  { field: "item_num", header: "#", rule: "Texto ou número curto (ex.: 1, 2, 3.1). Linhas sem \"#\" são ignoradas na carga. Único junto com Referência+Grupo+Empresa." },
  { field: "referencia", header: "Referência", rule: "Texto livre (ex.: 2ITR26)." },
  { field: "grupo", header: "Grupo", rule: "Texto livre (ex.: Ativos, Faturamento)." },
  { field: "descricao", header: "Descrição no Client Portal", rule: "Texto livre." },
  { field: "empresa", header: "Empresa", rule: "Texto livre (ex.: EQTL GO)." },
  { field: "segmento", header: "Segmento", rule: "Texto livre (ex.: Distribuição, Saneamento)." },
  { field: "data_base", header: "Data-base", rule: "Data (dd/mm/aaaa)." },
  { field: "status", header: "Status", rule: "Texto livre. Use \"N/A\" para itens sem prazo aplicável; qualquer outro valor entra no fluxo normal (calculado pelas datas)." },
  { field: "data_solicitacao", header: "Data solicitação", rule: "Data (dd/mm/aaaa)." },
  { field: "prazo_recebimento", header: "Prazo recebimento", rule: "Data (dd/mm/aaaa)." },
  { field: "area_responsavel", header: "Área responsável", rule: "Texto livre." },
  { field: "responsavel", header: "Responsável", rule: "Texto livre." },
  { field: "entrega_efetiva", header: "Entrega efetiva", rule: "Data (dd/mm/aaaa). Deixe em branco enquanto o item estiver pendente." },
];
const TEAL = "FF12A0A8";

/* Gera o modelo padrão de carga: aba "Preencher" (cabeçalho fixo, em branco) +
   aba "Orientações" (regra de preenchimento por coluna). Mesma estrutura que
   parseTableXlsx espera — padroniza a reimportação. */
export async function downloadTemplateXlsx(filename = "modelo-lista-de-pedidos.xlsx") {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Controle de Solicitações";

  const wsFill = wb.addWorksheet("Preencher");
  const head1 = wsFill.addRow(TEMPLATE_COLS.map((c) => c.header));
  head1.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.alignment = { vertical: "middle" };
  });
  wsFill.views = [{ state: "frozen", ySplit: 1 }];
  TEMPLATE_COLS.forEach((c, i) => { wsFill.getColumn(i + 1).width = Math.max(12, c.header.length + 4); });

  const wsOrient = wb.addWorksheet("Orientações");
  const head2 = wsOrient.addRow(["Coluna", "Obrigatório", "Formato / regra de preenchimento"]);
  head2.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.alignment = { vertical: "middle" };
  });
  for (const c of TEMPLATE_COLS) {
    const row = wsOrient.addRow([c.header, REQUIRED.includes(c.field) ? "Sim" : "Não", c.rule]);
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
  }
  wsOrient.getColumn(1).width = 26;
  wsOrient.getColumn(2).width = 12;
  wsOrient.getColumn(3).width = 72;

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}
