/* Projeto do tipo "tabela": Lista de pedidos como tabela editável de colunas fixas.
   Datagrid vanilla (paridade com DataTable/ListView do Cronograma).
   Fase 2: carga da planilha (deteccao automatica da aba) + listagem crua provisoria.
   O datagrid entra na Fase 3; a carga direta aqui vira modal de divergencias na Fase 5. */
import { h, toast } from "./util.js";
import * as store from "./store.js";
import { parseTableXlsx } from "./table_import.js";

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

  const btnImport = h("button", { class: "btn btn-primary" },
    items.length ? "Reimportar planilha" : "Carregar planilha");
  btnImport.onclick = () => importFlow(project, () => render(pane, project));

  pane.appendChild(h("div", { class: "planning-toolbar" },
    h("h3", { style: { margin: "0" } }, project.name),
    h("span", { class: "muted", style: { flex: "1" } }, `${items.length} linha(s)`),
    btnImport));

  if (!items.length) {
    pane.appendChild(h("div", { class: "empty-state" },
      h("p", { class: "muted" }, "Nenhuma linha ainda. Carregue a Lista de pedidos (.xlsx).")));
    return;
  }

  // Listagem crua (provisoria; sera o datagrid na Fase 3)
  const cols = [
    ["#", "item_num"], ["Referência", "referencia"], ["Grupo", "grupo"],
    ["Empresa", "empresa"], ["Status", "status"], ["Prazo", "prazo_recebimento"],
  ];
  const t = h("table", { class: "table" });
  t.appendChild(h("tr", {}, ...cols.map(([label]) => h("th", {}, label))));
  items.forEach((it) => t.appendChild(
    h("tr", {}, ...cols.map(([, f]) => h("td", {}, it[f] == null ? "" : String(it[f]))))));
  pane.appendChild(h("div", { class: "planning-list", style: { overflow: "auto" } }, t));
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
    // Fase 2: carga direta (sem modal). O modal de divergencias entra na Fase 5.
    try {
      await store.upsertPlanningItems(parsed.rows, project, (m) => toast(m));
      toast(`${parsed.rows.length} linha(s) de "${parsed.sheetName}" carregada(s).`);
      done();
    } catch (e) { toast("Erro na carga: " + e.message, "err"); }
  };
  input.click();
}
