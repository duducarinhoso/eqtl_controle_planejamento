/* Projeto do tipo "tabela": Lista de pedidos como tabela editável de colunas fixas.
   Datagrid vanilla (paridade com DataTable/ListView do Cronograma).
   Fase 1: apenas o placeholder; a carga da planilha entra na Fase 2. */
import { h } from "./util.js";

export function buildPlanningPane(project) {
  return h("div", { class: "planning-pane grid-page" },
    h("div", { class: "empty-state" },
      h("h3", {}, "Tabela estruturada"),
      h("p", { class: "muted" }, `Projeto "${project.name}". A carga da Lista de pedidos entra na Fase 2.`)));
}
