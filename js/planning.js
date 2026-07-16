/* Projeto do tipo "tabela": Lista de pedidos como tabela editável de colunas fixas.
   Datagrid vanilla (paridade com DataTable/ListView do Cronograma).
   Fase 3: datagrid completo (ListView) com as colunas de ENTRADA. As 4 colunas
   calculadas (status) + chips + edição inline entram na Fase 4; o modal de
   divergências no reimport, na Fase 5. */
import { h, toast } from "./util.js";
import * as store from "./store.js";
import { parseTableXlsx } from "./table_import.js";
import { ListView } from "./listview.js";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function fmtData(d) {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  if (!y || !m || !day) return String(d);
  const dow = DIAS[new Date(Number(y), Number(m) - 1, Number(day)).getDay()];
  return `${day}/${m}/${y} ${dow}`;
}
const txt = (v) => (v == null ? "" : String(v));

/* Colunas de ENTRADA (as calculadas entram na Fase 4). filterValue → filtro/agrupar;
   dateValue → filtro por intervalo; cellText → busca/medição/export/tooltip. */
function planningColumns() {
  const col = (key, header, opts = {}) => ({
    key, header,
    render: (r) => (opts.date ? fmtData(r[key]) : txt(r[key])),
    cellText: (r) => (opts.date ? fmtData(r[key]) : txt(r[key])),
    ...opts,
  });
  return [
    { key: "item_num", header: "#", sticky: true, width: 74, render: (r) => h("span", { class: "cell-strong" }, txt(r.item_num)), cellText: (r) => txt(r.item_num) },
    col("referencia", "Referência"),
    col("grupo", "Grupo", { filterValue: (r) => txt(r.grupo) }),
    col("descricao", "Descrição no Client portal"),
    col("empresa", "Empresa", { filterValue: (r) => txt(r.empresa) }),
    col("segmento", "Segmento", { filterValue: (r) => txt(r.segmento) }),
    col("data_base", "Data-base", { date: true, dateValue: (r) => (r.data_base ? String(r.data_base).slice(0, 10) : "") }),
    col("status", "Status", { filterValue: (r) => txt(r.status) }),
    col("data_solicitacao", "Data solicitação", { date: true, dateValue: (r) => (r.data_solicitacao ? String(r.data_solicitacao).slice(0, 10) : "") }),
    col("prazo_recebimento", "Prazo recebimento", { date: true, dateValue: (r) => (r.prazo_recebimento ? String(r.prazo_recebimento).slice(0, 10) : "") }),
    col("area_responsavel", "Área responsável", { filterValue: (r) => txt(r.area_responsavel) }),
    col("responsavel", "Responsável", { filterValue: (r) => txt(r.responsavel) }),
    col("entrega_efetiva", "Entrega efetiva", { date: true, dateValue: (r) => (r.entrega_efetiva ? String(r.entrega_efetiva).slice(0, 10) : "") }),
  ];
}

export function buildPlanningPane(project) {
  const pane = h("div", { class: "planning-pane grid-page" });
  render(pane, project);
  return pane;
}

async function render(pane, project) {
  pane.replaceChildren();

  let items = [];
  try { items = await store.listPlanningItems(project); }
  catch (e) {
    pane.appendChild(h("div", { class: "empty-state" },
      h("h3", {}, "Tabela estruturada"),
      h("p", { class: "muted" }, "Não consegui carregar os itens. Verifique se a tabela planning_items existe (sql/22)."),
      h("p", { class: "muted", style: { fontSize: "12px" } }, String(e.message || e))));
    return;
  }

  // Cabeçalho (título + contagem)
  pane.appendChild(h("div", { class: "planning-head" },
    h("h3", { style: { margin: "0" } }, project.name),
    h("span", { class: "muted", style: { flex: "1" } }, `${items.length} linha(s)`)));

  if (!items.length) {
    const btn = h("button", { class: "btn btn-primary" }, "Carregar planilha");
    btn.onclick = () => importFlow(project, () => render(pane, project));
    pane.appendChild(h("div", { class: "empty-state" },
      h("p", { class: "muted" }, "Nenhuma linha ainda. Carregue a Lista de pedidos (.xlsx)."), btn));
    return;
  }

  // Botão de reimport como ação da toolbar do ListView
  const btnImport = h("button", { class: "btn btn-primary btn-sm" }, "Reimportar planilha");
  btnImport.onclick = () => importFlow(project, () => render(pane, project));

  const host = h("div", { style: { flex: "1", minHeight: "0", display: "flex", flexDirection: "column" } });
  pane.appendChild(host);
  new ListView(host, {
    columns: planningColumns(),
    rows: items,
    persistKey: "planning:" + project.id,
    searchPlaceholder: "Buscar por #, referência, empresa, responsável…",
    emptyMessage: "Nenhuma linha encontrada.",
    csvFilename: "lista-de-pedidos.xlsx",
    actions: btnImport,
  });
}

function importFlow(project, done) {
  const input = h("input", { type: "file", accept: ".xlsx,.xls", style: { display: "none" } });
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files[0]; input.remove();
    if (!file) return;
    let parsed;
    try { parsed = await parseTableXlsx(file); }
    catch (e) { return toast(e.message, "err"); }
    // Fase 3: carga direta (sem modal). O modal de divergencias entra na Fase 5.
    try {
      await store.upsertPlanningItems(parsed.rows, project, (m) => toast(m));
      toast(`${parsed.rows.length} linha(s) de "${parsed.sheetName}" carregada(s).`);
      done();
    } catch (e) { toast("Erro na carga: " + e.message, "err"); }
  };
  input.click();
}
