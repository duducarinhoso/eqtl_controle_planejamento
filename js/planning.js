/* Projeto do tipo "tabela": Lista de pedidos como tabela editável de colunas fixas.
   Datagrid vanilla (paridade com DataTable/ListView do Cronograma).
   Fase 3: datagrid completo (ListView) com as colunas de ENTRADA. As 4 colunas
   calculadas (status) + chips + edição inline entram na Fase 4; o modal de
   divergências no reimport, na Fase 5. */
import { h, toast } from "./util.js";
import * as store from "./store.js";
import { parseTableXlsx, downloadTemplateXlsx } from "./table_import.js";
import { ListView } from "./listview.js";
import { statusEntrega, statusGeral, statusPrazo, diasAtraso, statusKlass } from "./calc.js";
import { buildZoomControl } from "./zoomctl.js";
import { buildDashboard } from "./dashboard.js";

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

/* ---------- reimport: diff por item (não por célula) ----------
   Campos comparáveis = as 9 colunas de entrada que NÃO fazem parte da chave.
   "date:true" compara só a data (corta hora, evita falso-positivo por fuso). */
const DIFF_FIELDS = [
  { key: "descricao", label: "Descrição no Client portal" },
  { key: "segmento", label: "Segmento" },
  { key: "data_base", label: "Data-base", date: true },
  { key: "status", label: "Status" },
  { key: "data_solicitacao", label: "Data solicitação", date: true },
  { key: "prazo_recebimento", label: "Prazo recebimento", date: true },
  { key: "area_responsavel", label: "Área responsável" },
  { key: "responsavel", label: "Responsável" },
  { key: "entrega_efetiva", label: "Entrega efetiva", date: true },
];
const normField = (v, isDate) => { const s = v == null ? "" : String(v); return isDate ? s.slice(0, 10) : s.trim(); };
const fmtDateShort = (s) => { if (!s) return ""; const [y, m, d] = s.split("-"); return (y && m && d) ? `${d}/${m}/${y}` : s; };
const fmtFieldVal = (v, isDate) => (isDate ? fmtDateShort(v) : v);

function diffFieldsFor(existing, novo) {
  const out = [];
  for (const f of DIFF_FIELDS) {
    const ov = normField(existing[f.key], f.date), nv = normField(novo[f.key], f.date);
    if (ov !== nv) out.push({ ...f, old: ov, neu: nv });
  }
  return out;
}
/* Compara a base atual (existing) com as linhas recem-parseadas (parsedRows),
   pela chave composta. Não decide nada sozinho — devolve as 4 categorias pro
   modal (showReimportDiffModal) exibir e o usuário escolher o que aplicar. */
function computeReimportDiff(existingItems, parsedRows) {
  const byKey = new Map(existingItems.map((it) => [keyStr(it), it]));
  const seenKeys = new Set();
  const novas = [], alteradas = [], semMudanca = [];
  for (const row of parsedRows) {
    const k = keyStr(row);
    seenKeys.add(k);
    const existing = byKey.get(k);
    if (!existing) { novas.push(row); continue; }
    const changes = diffFieldsFor(existing, row);
    if (changes.length) alteradas.push({ existing, novo: row, changes });
    else semMudanca.push(row);
  }
  const foraDaPlanilha = existingItems.filter((it) => !seenKeys.has(keyStr(it)));
  return { novas, alteradas, semMudanca, foraDaPlanilha };
}

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
    /* "Status" (texto de origem do Excel) fica de fora da grade a pedido — o que se
       lê é a coluna calculada (Status de entrega/Geral/Prazo). Mas segue no array:
       precisa estar no EXPORT (ver exportColumns) pra o ciclo exportar→editar→
       reimportar não apagar o valor (upsertPlanningItems grava null no que faltar). */
    inText("status", "Status"),
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

  // Topbar com abas (Dashboard | Base Gerencial) + corpo conforme a aba ativa.
  // Entrada sempre pelo Dashboard (não guarda a última aba vista).
  const host = h("div", { class: "planning-body" });
  const mount = (tab, drill) => {
    pane.replaceChildren(buildTopbar(project, items.length, tab, mount), host);
    renderBody(host, project, items, tab, mount, drill);
  };
  mount("dashboard");
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
  const btnTemplate = h("button", { class: "btn btn-ghost btn-sm" }, "Baixar modelo");
  btnTemplate.onclick = () => downloadTemplateXlsx().catch((e) => toast("Erro ao gerar o modelo: " + (e.message || e), "err"));
  const actions = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, btnImport, btnTemplate);
  const allColumns = planningColumns(items);
  const displayColumns = allColumns.filter((c) => c.key !== "status");
  new ListView(host, {
    columns: displayColumns,
    exportColumns: allColumns,
    rows: items,
    initialColSel: drill || undefined,
    initialGroupBy: "c_entrega",
    persistKey: "planning:" + project.id,
    searchPlaceholder: "Buscar por #, referência, empresa, responsável…",
    emptyMessage: "Nenhuma linha encontrada.",
    csvFilename: "lista-de-pedidos.xlsx",
    actions,
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

/* identidade legível de um item (chave composta) p/ listar no modal */
const itemLabel = (r) => `#${txt(r.item_num)} · ${txt(r.referencia)} · ${txt(r.grupo)} · ${txt(r.empresa)}`;

/* Modal de divergências do reimport — 4 categorias (Novas/Alteradas/Sem mudança/
   Fora da planilha), review por ITEM (não por célula): o usuário marca quais
   linhas novas/alteradas entram; nada é aplicado até confirmar. "Fora da
   planilha" é só informativo (nunca apaga nada daqui). */
function showReimportDiffModal(project, sheetName, diff, done) {
  const { novas, alteradas, semMudanca, foraDaPlanilha } = diff;
  const body = h("div", { class: "scrollbody" });

  const novaChecks = [];
  if (novas.length) {
    const sec = h("div", { class: "diff-sheet" });
    const list = h("div", { class: "diff-list" });
    const master = h("input", { type: "checkbox" }); master.checked = true;
    sec.appendChild(h("div", { class: "dh2" }, master, h("strong", {}, novas.length === 1 ? "1 linha nova" : `${novas.length} linhas novas`)));
    master.addEventListener("change", () => list.querySelectorAll(".nova-item").forEach((i) => { i.checked = master.checked; }));
    novas.forEach((row) => {
      const cb = h("input", { type: "checkbox", class: "nova-item" }); cb.checked = true;
      novaChecks.push({ row, input: cb });
      list.appendChild(h("div", { class: "diff-row wide-label" }, cb,
        h("span", { class: "ref" }, itemLabel(row)),
        h("span", { class: "new", style: { gridColumn: "3 / span 3" } }, "entra na base")));
    });
    sec.appendChild(list);
    body.appendChild(sec);
  }

  const altChecks = [];
  if (alteradas.length) {
    const sec = h("div", { class: "diff-sheet" });
    const list = h("div", { class: "diff-list" });
    const master = h("input", { type: "checkbox" }); master.checked = true;
    sec.appendChild(h("div", { class: "dh2" }, master, h("strong", {}, alteradas.length === 1 ? "1 linha alterada" : `${alteradas.length} linhas alteradas`)));
    master.addEventListener("change", () => list.querySelectorAll(".alt-item").forEach((i) => { i.checked = master.checked; }));
    alteradas.forEach(({ existing, novo, changes }) => {
      const cb = h("input", { type: "checkbox", class: "alt-item" }); cb.checked = true;
      altChecks.push({ novo, input: cb });
      const head = h("div", { class: "diff-row wide-label" }, cb,
        h("span", { class: "ref" }, itemLabel(novo)),
        h("span", { class: "count", style: { gridColumn: "3 / span 3" } }, `${changes.length} campo(s) alterado(s)`));
      list.appendChild(head);
      changes.forEach((c) => list.appendChild(h("div", { class: "diff-row wide-label diff-field" },
        h("span", {}),
        h("span", { class: "ref" }, c.label),
        h("span", { class: "old" }, fmtFieldVal(c.old, c.date) || "(vazio)"),
        h("span", { class: "arrow" }, "→"),
        h("span", { class: "new" }, fmtFieldVal(c.neu, c.date) || "(vazio)"))));
    });
    sec.appendChild(list);
    body.appendChild(sec);
  }

  if (semMudanca.length) body.appendChild(h("p", { class: "muted", style: { fontSize: "12.5px", margin: "0 0 8px" } },
    `${semMudanca.length} linha(s) sem mudança (não listadas).`));

  if (foraDaPlanilha.length) {
    const sec = h("div", { class: "diff-sheet" });
    sec.appendChild(h("div", { class: "dh2" }, h("strong", {}, `${foraDaPlanilha.length} linha(s) fora da planilha`),
      h("span", { class: "count" }, "existem na base, não vieram no arquivo")));
    const list = h("div", { class: "diff-list" });
    foraDaPlanilha.forEach((r) => list.appendChild(h("div", { class: "diff-row wide-label" },
      h("span", {}), h("span", { class: "ref", style: { gridColumn: "2 / span 4" } }, itemLabel(r)))));
    sec.appendChild(list);
    body.appendChild(sec);
    body.appendChild(h("p", { class: "muted", style: { fontSize: "12.5px", margin: "6px 0 0" } },
      "Nada é excluído por aqui — ficam como estão na base."));
  }

  const scrim = h("div", { class: "scrim" });
  const apply = h("button", { class: "btn btn-primary" }, "Aplicar selecionadas");
  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-ghost", onClick: () => scrim.remove() }, "Cancelar"), apply);
  const parts = [];
  if (novas.length) parts.push(`${novas.length} nova(s)`);
  if (alteradas.length) parts.push(`${alteradas.length} alterada(s)`);
  if (semMudanca.length) parts.push(`${semMudanca.length} sem mudança`);
  if (foraDaPlanilha.length) parts.push(`${foraDaPlanilha.length} fora da planilha`);
  const modal = h("div", { class: "modal wide" },
    h("h3", {}, "Reimportar planilha"),
    h("p", { class: "muted", style: { margin: "0 0 10px" } }, `"${sheetName}" traz: ${parts.join(" · ")}. Nada muda até você confirmar.`),
    body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) scrim.remove(); });
  document.body.appendChild(scrim);

  apply.onclick = async () => {
    const toApply = [...novaChecks.filter((x) => x.input.checked).map((x) => x.row), ...altChecks.filter((x) => x.input.checked).map((x) => x.novo)];
    if (!toApply.length) return scrim.remove();
    apply.disabled = true; apply.textContent = "Aplicando…";
    try {
      await store.upsertPlanningItems(toApply, project, (m) => { apply.textContent = m; });
      scrim.remove();
      toast(`${toApply.length} linha(s) aplicada(s).`);
      done();
    } catch (e) {
      apply.disabled = false; apply.textContent = "Aplicar selecionadas";
      toast("Erro ao aplicar: " + (e.message || e), "err");
    }
  };
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
    let existing = [];
    try { existing = await store.listPlanningItems(project); }
    catch (e) { return toast("Erro ao comparar com a base atual: " + (e.message || e), "err"); }
    const diff = computeReimportDiff(existing, parsed.rows);
    if (!diff.novas.length && !diff.alteradas.length) {
      toast(`Nada para aplicar — ${diff.semMudanca.length} sem mudança, ${diff.foraDaPlanilha.length} fora da planilha.`);
      return;
    }
    showReimportDiffModal(project, parsed.sheetName, diff, done);
  };
  input.click();
}
