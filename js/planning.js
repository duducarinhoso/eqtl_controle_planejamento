/* Projeto do tipo "tabela": Lista de pedidos como tabela editável de colunas fixas.
   Datagrid vanilla (paridade com DataTable/ListView do Cronograma).
   Fase 3: datagrid completo (ListView) com as colunas de ENTRADA. As 4 colunas
   calculadas (status) + chips + edição inline entram na Fase 4; o modal de
   divergências no reimport, na Fase 5. */
import { h, toast } from "./util.js";
import * as store from "./store.js";
import { parseTableXlsx } from "./table_import.js";
import { ListView } from "./listview.js";
import { statusEntrega, statusGeral, statusPrazo, diasAtraso, statusKlass } from "./calc.js";
import { buildZoomControl } from "./zoomctl.js";
import { buildDashboard } from "./dashboard.js";

const TAB_KEY = (pid) => "eqtl.planning.tab." + pid;
function getTab(pid) { try { return localStorage.getItem(TAB_KEY(pid)) || "dashboard"; } catch { return "dashboard"; } }
function setTab(pid, t) { try { localStorage.setItem(TAB_KEY(pid), t); } catch { /* */ } }

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function fmtData(d) {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  if (!y || !m || !day) return String(d);
  const dow = DIAS[new Date(Number(y), Number(m) - 1, Number(day)).getDay()];
  return `${day}/${m}/${y} ${dow}`;
}
const txt = (v) => (v == null ? "" : String(v));
const isoDate = (v) => (v ? String(v).slice(0, 10) : "");
/* chave única (bloqueio de colisão na edição das colunas-chave) */
const KEYCOLS = ["item_num", "referencia", "grupo", "empresa"];
const keyStr = (it, override) => KEYCOLS.map((k) => String((override && k in override ? override[k] : it[k]) ?? "").trim()).join("|");

/* Colunas: 13 de ENTRADA (editáveis) + 4 CALCULADAS (read-only, chip colorido). */
function planningColumns(items) {
  const inText = (key, header, opts = {}) => ({ key, header, render: (r) => txt(r[key]), cellText: (r) => txt(r[key]), editable: true, editType: "text", ...opts });
  const inDate = (key, header, opts = {}) => ({ key, header, render: (r) => fmtData(r[key]), cellText: (r) => fmtData(r[key]), editable: true, editType: "date", editValue: (r) => isoDate(r[key]), dateValue: (r) => isoDate(r[key]), ...opts });
  const calc = (key, header, fn) => ({ key, header, render: (r) => { const v = fn(r); return v ? h("span", { class: "dg-status " + statusKlass(v) }, v) : ""; }, cellText: (r) => String(fn(r) ?? ""), filterValue: (r) => String(fn(r) ?? ""), sortKey: key });
  return [
    { key: "item_num", header: "#", sticky: true, width: 74, editable: true, editType: "text", render: (r) => h("span", { class: "cell-strong" }, txt(r.item_num)), cellText: (r) => txt(r.item_num) },
    inText("referencia", "Referência", { filterValue: (r) => txt(r.referencia) }),
    inText("grupo", "Grupo", { filterValue: (r) => txt(r.grupo) }),
    inText("descricao", "Descrição no Client portal"),
    inText("empresa", "Empresa", { filterValue: (r) => txt(r.empresa) }),
    inText("segmento", "Segmento", { filterValue: (r) => txt(r.segmento) }),
    inDate("data_base", "Data-base"),
    /* coluna "Status" (texto de origem do Excel) ocultada da grade a pedido — o
       status é lido pelas colunas calculadas (Status de entrega/Geral/Prazo). */
    inDate("data_solicitacao", "Data solicitação"),
    inDate("prazo_recebimento", "Prazo recebimento"),
    inText("area_responsavel", "Área responsável", { filterValue: (r) => txt(r.area_responsavel) }),
    inText("responsavel", "Responsável", { filterValue: (r) => txt(r.responsavel) }),
    inDate("entrega_efetiva", "Entrega efetiva"),
    calc("c_entrega", "Status de entrega", statusEntrega),
    calc("c_geral", "Status Geral", statusGeral),
    calc("c_prazo", "Status Prazo", statusPrazo),
    { key: "c_dias", header: "Dias de atraso", align: "right", render: (r) => { const d = diasAtraso(r); return d == null ? "" : String(d); }, cellText: (r) => { const d = diasAtraso(r); return d == null ? "" : String(d); }, sortKey: "c_dias" },
  ];
}

export function buildPlanningPane(project) {
  const pane = h("div", { class: "planning-pane grid-page" });
  render(pane, project);
  return pane;
}

/* Topbar do projeto tabela: voltar aos Projetos + nome + contagem + densidade "Aa".
   (No modelo tabela o topbar do shell fica oculto — esta barra dá navegação e config.) */
function buildTopbar(project, count, activeTab, onTab) {
  const back = h("button", { class: "pt-back", title: "Voltar aos projetos", "aria-label": "Voltar aos projetos",
    onClick: () => { location.hash = "#/projetos"; },
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' });
  back.append(document.createTextNode("Projetos"));
  /* botão de tema = o "flutuante" do modelo (gradiente redondo), agora no topbar
     em tamanho reduzido — substitui o ícone plano; some o flutuante do shell. */
  const theme = h("button", { class: "theme-toggle pt-theme", title: "Alternar tema", "aria-label": "Alternar tema",
    onClick: () => window.toggleTheme && window.toggleTheme(),
    html: '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>' });
  const tab = (id, label) => {
    const b = h("button", { class: "planning-tab" + (activeTab === id ? " on" : ""), onClick: () => onTab(id) }, label);
    return b;
  };
  const tabs = onTab ? h("div", { class: "planning-tabs" }, tab("dashboard", "Dashboard"), tab("base", "Base Gerencial")) : null;
  return h("div", { class: "planning-topbar" },
    h("div", { class: "pt-left" }, back,
      h("span", { class: "pt-sep", "aria-hidden": "true" }, "/"),
      h("h1", { class: "pt-title" }, project.name)),
    tabs,
    h("div", { class: "pt-right" },
      h("span", { class: "pt-count muted" }, `${count} linha(s)`),
      theme, buildZoomControl()));
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

  if (!items.length) {
    pane.appendChild(buildTopbar(project, 0, null, null));
    const btn = h("button", { class: "btn btn-primary" }, "Carregar planilha");
    btn.onclick = () => importFlow(project, () => render(pane, project));
    pane.appendChild(h("div", { class: "empty-state" },
      h("p", { class: "muted" }, "Nenhuma linha ainda. Carregue a Lista de pedidos (.xlsx)."), btn));
    return;
  }

  // Topbar com abas (Dashboard | Base Gerencial) + corpo conforme a aba ativa
  const host = h("div", { class: "planning-body" });
  const mount = (tab, drill) => {
    setTab(project.id, tab);
    pane.replaceChildren(buildTopbar(project, items.length, tab, mount), host);
    renderBody(host, project, items, tab, mount, drill);
  };
  mount(getTab(project.id));
}

/* drill: o Dashboard manda {coluna: [valores]} e abrimos a Base Gerencial filtrada */
function renderBody(host, project, items, tab, mount, drill) {
  host.replaceChildren();
  if (tab === "dashboard") {
    host.appendChild(buildDashboard(project, items, { onDrill: (colSel) => mount("base", colSel) }));
    return;
  }
  // Base Gerencial (datagrid)
  const btnImport = h("button", { class: "btn btn-primary btn-sm" }, "Reimportar planilha");
  btnImport.onclick = () => importFlow(project, () => render(host.closest(".planning-pane"), project));
  new ListView(host, {
    columns: planningColumns(items),
    rows: items,
    initialColSel: drill || undefined,
    persistKey: "planning:" + project.id,
    searchPlaceholder: "Buscar por #, referência, empresa, responsável…",
    emptyMessage: "Nenhuma linha encontrada.",
    csvFilename: "lista-de-pedidos.xlsx",
    actions: btnImport,
    onCellEdit: (row, col, value) => onCellEdit(items, row, col, value),
  });
}

/* Edição inline de uma célula de entrada: valida a chave, muta em memória (render
   imediato — as calculadas recalculam) e persiste; reverte no erro. */
function onCellEdit(items, row, col, value) {
  let val = value;
  if (col.editType === "date") val = value || null;
  if (val === row[col.key]) return;

  // proteção da chave composta (# + Referência + Grupo + Empresa)
  if (KEYCOLS.includes(col.key)) {
    const novo = keyStr(row, { [col.key]: val });
    if (items.some((it) => it.id !== row.id && keyStr(it) === novo)) {
      toast("Já existe uma linha com essa chave (# + Referência + Grupo + Empresa).", "err");
      return;
    }
  }

  const old = row[col.key];
  row[col.key] = val;   // muta o objeto (mesmo em items) → re-render recalcula
  store.updatePlanningItem(row.id, { [col.key]: val })
    .catch((e) => { row[col.key] = old; toast("Erro ao salvar: " + e.message, "err"); });
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
