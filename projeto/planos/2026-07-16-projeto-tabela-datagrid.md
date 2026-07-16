---
data: 2026-07-16
tipo: plano
feature: projeto-tabela-datagrid
status: aberto
---

# Modelo "Projeto Tabela" (datagrid) — Plano de Implementação

> **Para quem executa:** este plano segue a convenção do projeto EQTL (vanilla JS, sem build, sem framework de testes). **A verificação é sempre no browser** (servidor `start.bat`, porta 5500, em **dark E light**), não com pytest/jest. Passos usam checkbox (`- [ ]`). Execute com a skill `executing-plans` (checkpoints por fase). **Git é do Eduardo** — os passos de commit acontecem **mediante aval explícito dele**, mensagem em português.

**Goal:** Adicionar um segundo tipo de projeto ("Tabela estruturada") em que o usuário carrega uma planilha no formato da aba "Lista de pedidos", os dados viram uma tabela editável com colunas fixas, as 4 colunas de status são calculadas pela aplicação, e reimportar a planilha reconcilia por uma chave única através de um modal de divergências.

**Architecture:** O app hoje conhece um único modelo (projeto → abas `sheets` → grade `cells`). Introduzimos `projects.kind` (`grade` | `tabela`). Para `tabela`, os dados vivem numa tabela relacional nova `planning_items` (uma linha = uma solicitação, colunas nomeadas), com UNIQUE composto `(project_id, item_num, referencia, grupo, empresa)`. As 4 colunas calculadas **não são persistidas** — computadas no cliente no render (dependem de "hoje"). A UI reusa um **datagrid vanilla** portado com paridade do `DataTable.tsx`+`ListView.tsx` do projeto React `eqtl_cronograma_fechamento`, com o CSS `components.css`/`tokens.css` reaproveitado verbatim.

**Tech Stack:** Vanilla JS (ES modules, helper `h()`), Supabase (Postgres + RLS), ExcelJS (via CDN, já presente), CSS puro com design tokens. Sem Node/build.

**Referências-fonte (paridade do datagrid):**
- `C:\Users\U21022996\_git_projetos_inovacao\eqtl_cronograma_fechamento\frontend\src\components\DataTable.tsx` (948 l) — a grade
- `...\frontend\src\components\ListView.tsx` (753 l) — a toolbar acima da tabela
- `...\frontend\src\components\DateRangeCalendar.tsx` (170 l) — calendário do filtro de data
- `...\frontend\src\styles\components.css` (1291 l) e `styles\tokens.css` (209 l) — estilos a portar verbatim
- `...\frontend\src\lib\text.ts` (`matchesTerm`) e `lib\format.ts` (`fmtData`, `fmtNome`)

**Modelo fixo de colunas** (aba "Lista de pedidos", cabeçalhos na **linha 3**, dados a partir da **linha 4**):

| Ordem | Cabeçalho no Excel | Campo (`planning_items`) | Tipo | Papel |
|---|---|---|---|---|
| 1 | `#` | `item_num` | text | entrada · **chave** |
| 2 | `Referência` | `referencia` | text | entrada · **chave** |
| 3 | `Grupo` | `grupo` | text | entrada · **chave** |
| 4 | `Descrição no Client portal` | `descricao` | text | entrada |
| 5 | `Empresa` | `empresa` | text | entrada · **chave** |
| 6 | `Segmento` | `segmento` | text | entrada |
| 7 | `Data-base` | `data_base` | date (nullable) | entrada |
| 8 | `Status` | `status` | text | entrada |
| 9 | `Data solicitação` | `data_solicitacao` | timestamptz (nullable) | entrada |
| 10 | `Prazo recebimento` | `prazo_recebimento` | date (nullable) | entrada |
| 11 | `Área responsável` | `area_responsavel` | text | entrada |
| 12 | `Responsável` | `responsavel` | text | entrada |
| 13 | `Entrega efetiva` | `entrega_efetiva` | date (nullable) | entrada (editável na app) |
| — | `Status de entrega` | *(calculada)* | — | **read-only, app** |
| — | `Status Geral` | *(calculada)* | — | **read-only, app** |
| — | `Status Prazo` | *(calculada)* | — | **read-only, app** |
| — | `Dias de atraso` | *(calculada)* | — | **read-only, app** |

**Regras confirmadas com o Eduardo (2026-07-16):**
1. Datagrid: **vanilla, paridade total** (CSS verbatim, todas as opções da toolbar + virtualização/resize/sticky).
2. **Todas as colunas de entrada são editáveis**; as 4 calculadas são read-only.
3. Reimport pela chave: **preserva por padrão as edições feitas na app** e mostra as divergências num **modal amplo com tabs** (Novas linhas · Alterados · Sem mudança · Fora da planilha).
4. Detecção da aba **pelas colunas** (a app acha sozinha a aba cujo cabeçalho bate com o modelo).
5. **Sem guardar listas** (empresa/segmento são texto livre; nenhuma tabela `companies`/`segmentos` neste modelo).

---

## Estrutura de arquivos

**Criar:**
- `sql/21_project_kind.sql` — coluna `projects.kind`
- `sql/22_planning_items.sql` — tabela `planning_items` + índice único + RLS
- `js/planning.js` — a view do projeto-tabela (colunas do modelo, edição inline, cálculo, orquestração de import/reimport)
- `js/calc.js` — as 4 funções puras de cálculo de status (+ helpers de data)
- `js/table_import.js` — leitura tipada do `.xlsx` e detecção da aba pelo modelo
- `js/datagrid.js` — o `DataTable` vanilla (classe `DataGrid`)
- `js/listview.js` — o `ListView` vanilla (classe `ListView`, toolbar)
- `styles/datagrid.css` — port verbatim dos blocos de `components.css` (tabela + toolbar) e das variáveis de `tokens.css` que faltarem

**Modificar:**
- `js/store.js` — `createProject` aceita `kind`; novas funções `planning*`
- `js/app.js` — `newProject` (escolha de modelo); `mountProject` bifurca por `kind`; roteamento
- `index.html` — novos módulos no importmap + `styles/datagrid.css` + cache-bust `v=24 → v=25`

---

## FASE 1 — Fundação: tipo de projeto + criação

> **Entrega verificável:** consigo criar um projeto do tipo "Tabela estruturada" e cair numa tela placeholder própria; os projetos existentes continuam abrindo a grade normalmente.

### Task 1.1: Coluna `projects.kind`

**Files:**
- Create: `sql/21_project_kind.sql`

- [ ] **Passo 1: escrever a migração SQL**

```sql
-- sql/21_project_kind.sql
-- Tipo do projeto: 'grade' (espelho de Excel, abas/celulas — padrao atual)
--                  'tabela' (tabela estruturada de colunas fixas — modelo novo)
alter table public.projects
  add column if not exists kind text not null default 'grade';

alter table public.projects
  drop constraint if exists projects_kind_chk;
alter table public.projects
  add constraint projects_kind_chk check (kind in ('grade', 'tabela'));
```

- [ ] **Passo 2: rodar no Supabase** (SQL Editor) e confirmar sucesso. Projetos existentes ficam `kind='grade'` pelo default.

- [ ] **Passo 3: verificar** — no SQL Editor: `select id, name, kind from projects;` → todos com `kind='grade'`.

### Task 1.2: `createProject` aceita `kind`

**Files:**
- Modify: `js/store.js:130-136` (`createProject`)

- [ ] **Passo 1: aceitar e gravar `kind`**

Substituir a função `createProject` por:

```js
export async function createProject({ name, description = "", kind = "grade" }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("projects")
    .insert({ name, description, kind, created_by: user?.id }).select().single();
  if (error) throw error;
  return data;
}
```

- [ ] **Passo 2: verificar** — nenhuma regressão: criar um projeto normal pela UI ainda funciona (a chamada atual não passa `kind`, então cai no default `'grade'`). Confirmar no browser criando um projeto e no banco que ele nasceu `kind='grade'`.

### Task 1.3: Modal "Novo projeto" com escolha de modelo

**Files:**
- Modify: `js/app.js:506-522` (`newProject`)

- [ ] **Passo 1: adicionar o seletor de modelo ao modal**

Substituir `newProject` por (mantém o padrão `h()`/`openModal` já usado no arquivo):

```js
function newProject() {
  const name = h("input", { class: "input", placeholder: "Ex.: Auditoria EQTL 2026" });
  const desc = h("textarea", { class: "input", placeholder: "Descrição (opcional)", rows: 2 });

  // Escolha do modelo do projeto (grade x tabela)
  let kind = "grade";
  const optGrade = h("label", { class: "kind-opt kind-sel" },
    h("input", { type: "radio", name: "proj-kind", value: "grade", checked: true }),
    h("div", {}, h("strong", {}, "Planilha / abas"),
      h("span", { class: "muted" }, "Espelho do Excel: abas e grade, formatação por célula.")));
  const optTabela = h("label", { class: "kind-opt" },
    h("input", { type: "radio", name: "proj-kind", value: "tabela" }),
    h("div", {}, h("strong", {}, "Tabela estruturada"),
      h("span", { class: "muted" }, "Carrega a Lista de pedidos: colunas fixas, status calculado pela aplicação.")));
  const kindWrap = h("div", { class: "kind-choices" }, optGrade, optTabela);
  kindWrap.addEventListener("change", (e) => {
    kind = e.target.value;
    kindWrap.querySelectorAll(".kind-opt").forEach((l) =>
      l.classList.toggle("kind-sel", l.contains(e.target) && e.target.checked));
  });

  const content = h("div", {},
    h("div", { class: "field" }, h("label", {}, "Nome do projeto"), name),
    h("div", { class: "field" }, h("label", {}, "Descrição"), desc),
    h("div", { class: "field" }, h("label", {}, "Modelo do projeto"), kindWrap));

  openModal("Novo projeto", content, [
    { label: "Cancelar", onClick: (a) => a.close() },
    { label: "Criar projeto", primary: true, onClick: async (a) => {
        if (!name.value.trim()) return;
        if (!(await store.projectsAvailable())) { a.close(); return toast("Para criar vários projetos, rode o SQL sql/07_projects.sql no Supabase.", "err"); }
        a.close();
        try {
          const p = await store.createProject({ name: name.value.trim(), description: desc.value.trim(), kind });
          App._projects = null; goProject(p.id);
        } catch (e) { toast("Erro ao criar: " + e.message, "err"); }
      } },
  ]);
  setTimeout(() => name.focus(), 30);
}
```

- [ ] **Passo 2: estilo do seletor** — em `styles/app-ds.css`, acrescentar (reusa tokens do DS v2; sem inventar cores):

```css
/* Seletor de modelo no "Novo projeto" */
.kind-choices { display: grid; gap: 8px; }
.kind-opt { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px;
  border: 1px solid var(--border, #d9dee3); border-radius: 8px; cursor: pointer; }
.kind-opt input { margin-top: 3px; }
.kind-opt .muted { display: block; font-size: 12px; }
.kind-opt.kind-sel { border-color: var(--blue, #246b78); background: color-mix(in srgb, var(--blue, #246b78) 6%, transparent); }
```

- [ ] **Passo 3: verificar no browser (5500, dark+light)** — "Novo projeto" mostra os dois modelos, o selecionado fica destacado, e criar com "Tabela estruturada" grava `kind='tabela'` (conferir no banco).

### Task 1.4: `mountProject` bifurca por `kind` (placeholder da tabela)

**Files:**
- Modify: `js/app.js:562-571` (`mountProject`)
- Create: `js/planning.js` (esqueleto)

- [ ] **Passo 1: criar o esqueleto de `js/planning.js`**

```js
/* Projeto do tipo "tabela": Lista de pedidos como tabela editável de colunas fixas.
   Datagrid vanilla (paridade com DataTable/ListView do Cronograma). */
import { h } from "./util.js";

export function buildPlanningPane(project) {
  // Placeholder da Fase 1; substituído nas fases seguintes.
  return h("div", { class: "planning-pane grid-page" },
    h("div", { class: "empty-state" },
      h("h3", {}, "Tabela estruturada"),
      h("p", { class: "muted" }, `Projeto "${project.name}". Carga da Lista de pedidos entra na Fase 2.`)));
}
```

- [ ] **Passo 2: bifurcar `mountProject`**

Substituir `mountProject` por:

```js
async function mountProject(project) {
  App.project = project;
  App.sheetFilter = "";
  App.view = null;
  const slot = mountModuleShell("ops-proj");
  document.querySelector(".app")?.classList.add("in-project");
  slot.classList.add("proj-mode");
  if (project.kind === "tabela") {
    const { buildPlanningPane } = await import("./planning.js");
    slot.appendChild(buildPlanningPane(project));
    App.view = "planning";
    return;
  }
  slot.appendChild(buildProjectPane());
  await refreshSheets();
}
```

- [ ] **Passo 3: adicionar `js/planning.js` ao importmap** — em `index.html`, dentro do bloco `importmap`, acrescentar a linha (e subir o cache-bust global de `v=24` para `v=25` em TODAS as ocorrências do arquivo):

```json
"./js/planning.js": "./js/planning.js?v=25",
```

- [ ] **Passo 4: verificar no browser** — criar um projeto "Tabela estruturada" cai no placeholder; abrir um projeto antigo continua mostrando a grade. Sem erro no console. Conferir F5 (a rota `#/p/<id>` reconstrói o placeholder).

- [ ] **Passo 5 (checkpoint): commit — mediante aval do Eduardo**

```
feat(projeto-tabela): tipo de projeto (grade|tabela) + escolha no Novo projeto e placeholder da tabela
```

---

## FASE 2 — Persistência e carga inicial da planilha

> **Entrega verificável:** num projeto "tabela" vazio, carrego o `.xlsx`, a app acha a aba "Lista de pedidos" sozinha, e as 258 linhas entram em `planning_items` (visíveis via uma listagem crua na tela).

### Task 2.1: Tabela `planning_items`

**Files:**
- Create: `sql/22_planning_items.sql`

- [ ] **Passo 1: escrever a migração**

```sql
-- sql/22_planning_items.sql
-- Uma linha = uma solicitacao da "Lista de pedidos" (modelo de projeto 'tabela').
-- As 4 colunas de status (Status de entrega / Status Geral / Status Prazo / Dias de
-- atraso) NAO sao persistidas: a aplicacao as calcula no cliente (dependem de "hoje").
create table if not exists public.planning_items (
  id                bigint generated always as identity primary key,
  project_id        uuid not null references public.projects(id) on delete cascade,
  item_num          text not null default '',
  referencia        text not null default '',
  grupo             text not null default '',
  descricao         text,
  empresa           text not null default '',
  segmento          text,
  data_base         date,
  status            text,
  data_solicitacao  timestamptz,
  prazo_recebimento date,
  area_responsavel  text,
  responsavel       text,
  entrega_efetiva   date,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Chave unica composta: bloqueia/atualiza no reimport.
create unique index if not exists planning_items_key
  on public.planning_items (project_id, item_num, referencia, grupo, empresa);

create index if not exists planning_items_project on public.planning_items (project_id);

alter table public.planning_items enable row level security;

-- Mesmo padrao das demais tabelas do app: qualquer usuario autenticado (a allowlist
-- ja gate o cadastro). Ajustar se as outras tabelas usarem politica mais restrita.
drop policy if exists planning_items_all on public.planning_items;
create policy planning_items_all on public.planning_items
  for all to authenticated using (true) with check (true);
```

- [ ] **Passo 2: conferir o padrão de RLS das outras tabelas** — antes de rodar, abrir `sql/` e comparar a policy de `cells`/`sheets`. Se elas usarem uma condição mais restrita (ex.: via `project` do usuário), **replicar a mesma** aqui em vez de `using(true)`. (Não inventar um padrão novo.)

- [ ] **Passo 3: rodar no Supabase** e verificar: `select count(*) from planning_items;` → 0; `\d planning_items` mostra o índice único.

### Task 2.2: Funções de store para `planning_items`

**Files:**
- Modify: `js/store.js` (acrescentar no fim da seção de projetos, ~linha 145)

- [ ] **Passo 1: escrever as funções**

```js
/* ===================== PLANNING ITEMS (modelo 'tabela') ===================== */
export const PLANNING_FIELDS = [
  "item_num", "referencia", "grupo", "descricao", "empresa", "segmento",
  "data_base", "status", "data_solicitacao", "prazo_recebimento",
  "area_responsavel", "responsavel", "entrega_efetiva",
];
const PLANNING_KEY = ["item_num", "referencia", "grupo", "empresa"];

let _planningAvailable = null;
export async function planningAvailable() {
  if (_planningAvailable !== null) return _planningAvailable;
  const { error } = await supabase.from("planning_items").select("id").limit(1);
  _planningAvailable = !error;
  return _planningAvailable;
}

export async function listPlanningItems(project) {
  const pid = project?.id;
  const { data, error } = await supabase.from("planning_items")
    .select("*").eq("project_id", pid).order("id", { ascending: true });
  if (error) throw error;
  return data || [];
}

/* Insere linhas novas (carga inicial). rows = objetos com PLANNING_FIELDS.
   Usa upsert por (project_id + chave) para ser idempotente. onConflict garante
   que reimportar nao duplica. Lotes de 500. */
export async function upsertPlanningItems(rows, project, onProgress) {
  const { data: { user } } = await supabase.auth.getUser();
  const pid = project?.id;
  let done = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => {
      const o = { project_id: pid, created_by: user?.id, updated_at: new Date().toISOString() };
      for (const f of PLANNING_FIELDS) o[f] = r[f] ?? null;
      // colunas NOT NULL da chave nao aceitam null
      for (const k of PLANNING_KEY) o[k] = r[k] ?? "";
      return o;
    });
    const { error } = await supabase.from("planning_items")
      .upsert(batch, { onConflict: "project_id,item_num,referencia,grupo,empresa" });
    if (error) throw error;
    done += batch.length;
    onProgress?.(`Gravando ${done}/${rows.length}…`);
  }
  return { count: rows.length };
}

export async function updatePlanningItem(id, patch) {
  const body = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("planning_items").update(body).eq("id", id);
  if (error) throw error;
}

export async function deletePlanningItems(ids) {
  if (!ids?.length) return;
  const { error } = await supabase.from("planning_items").delete().in("id", ids);
  if (error) throw error;
}
```

- [ ] **Passo 2: verificar** — via console do browser (com o app carregado e logado): `import("./js/store.js").then(s => s.planningAvailable()).then(console.log)` → `true`.

### Task 2.3: Leitura tipada do `.xlsx` + detecção da aba

> **Nota de execução (2026-07-16):** o plano previa **ExcelJS**, mas na verificação o ExcelJS **travou** ao ler o arquivo real (`wb.xlsx.load` nunca retorna — o arquivo tem *slicers* + Excel Table). Trocado para **SheetJS** (`getXLSX`), que lê o mesmo arquivo em ~0,5s e basta (só precisamos de valores + datas). O `js/table_import.js` final usa SheetJS; o código ExcelJS abaixo ficou histórico.

**Files:**
- Create: `js/table_import.js`

- [ ] **Passo 1: escrever o parser tipado + detecção**

O `parseXlsxFull` de `excel.js` devolve texto; aqui precisamos de **valores tipados** (datas como `Date`), lidos direto do ExcelJS. Reusa o loader `getExcelJS` exportando-o.

Primeiro, exportar o loader em `js/excel.js` (localizar `async function getExcelJS` e trocar `async function` por `export async function`).

Depois, criar `js/table_import.js`:

```js
/* Leitura da "Lista de pedidos" para o modelo 'tabela'.
   Detecta a aba pelos cabecalhos (linha de header) e devolve linhas tipadas
   nos campos de PLANNING_FIELDS. Ignora as 4 colunas calculadas do arquivo. */
import { getExcelJS } from "./excel.js";

/* Cabecalho do Excel -> campo. Normalizamos o texto (minusculo, sem acento,
   colapsa espacos) para casar apesar de variacoes de grafia. */
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
const DATE_FIELDS = new Set(["data_base", "data_solicitacao", "prazo_recebimento", "entrega_efetiva"]);
// Minimo de campos-chave que precisam existir para reconhecer a aba como valida.
const REQUIRED = ["item_num", "referencia", "grupo", "empresa", "status", "prazo_recebimento"];

function norm(s) {
  return String(s ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // tira acento
    .replace(/\s+/g, " ");
}

function cellVal(cell) {
  const v = cell?.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.text != null) return v.text;                  // rich text / hyperlink
    if (v.result != null) return v.result;              // formula -> valor calculado
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    return null;
  }
  return v;
}

function toISODate(v) {
  if (v == null || v === "") return null;
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);                  // YYYY-MM-DD
}
function toISOTs(v) {
  if (v == null || v === "") return null;
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* Acha, em uma aba, a linha de cabecalho (ate a linha 6) que casa com o modelo.
   Retorna { headerRow, colMap: {campo: colIndex} } ou null. */
function detectHeader(ws) {
  for (let r = 1; r <= 6; r++) {
    const row = ws.getRow(r);
    const colMap = {};
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const field = HEADER_MAP[norm(cellVal(cell))];
      if (field && !(field in colMap)) colMap[field] = c;
    });
    if (REQUIRED.every((f) => f in colMap)) return { headerRow: r, colMap };
  }
  return null;
}

/* Le o arquivo e retorna a 1a aba que bate com o modelo, ja parseada.
   { sheetName, rows: [{campo: valor}] }  |  lanca erro se nenhuma aba casar. */
export async function parseTableXlsx(file) {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  let found = null;
  wb.eachSheet((ws) => {
    if (found) return;
    const det = detectHeader(ws);
    if (det) found = { ws, ...det };
  });
  if (!found) {
    throw new Error("Nenhuma aba com o formato da Lista de pedidos (colunas #, Referência, Grupo, Empresa, Status, Prazo recebimento).");
  }

  const { ws, headerRow, colMap } = found;
  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    let hasAny = false;
    for (const [field, c] of Object.entries(colMap)) {
      let val = cellVal(row.getCell(c));
      if (DATE_FIELDS.has(field)) {
        val = (field === "data_solicitacao") ? toISOTs(val) : toISODate(val);
      } else {
        val = (val == null) ? null : String(val).trim();
      }
      obj[field] = val;
      if (val != null && val !== "") hasAny = true;
    }
    // linha valida precisa de item_num (o "#")
    if (hasAny && obj.item_num != null && String(obj.item_num).trim() !== "") {
      obj.item_num = String(obj.item_num).trim();
      rows.push(obj);
    }
  }
  return { sheetName: ws.name, rows };
}
```

- [ ] **Passo 2: adicionar `js/table_import.js` ao importmap** (`index.html`, cache-bust `v=25`):

```json
"./js/table_import.js": "./js/table_import.js?v=25",
```

- [ ] **Passo 3: verificar via console** — com o arquivo real de teste (o Eduardo fornece o `.xlsx`): num `<input type=file>` improvisado ou reusando o fluxo, chamar `parseTableXlsx(file)` e conferir no console: `sheetName === "Lista de pedidos"` e `rows.length === 258`, e que `rows[0].prazo_recebimento` é uma string `YYYY-MM-DD`.

### Task 2.4: Fluxo de carga inicial na view da tabela

**Files:**
- Modify: `js/planning.js`

- [ ] **Passo 1: adicionar botão "Carregar planilha" + carga**

Estender `js/planning.js` (por ora renderiza uma listagem crua `<table>` para provar a carga; o datagrid entra na Fase 3):

```js
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
  const items = await store.listPlanningItems(project);

  const btnImport = h("button", { class: "btn btn-primary" },
    items.length ? "Reimportar planilha" : "Carregar planilha");
  btnImport.onclick = () => importFlow(project, () => render(pane, project));

  pane.appendChild(h("div", { class: "planning-toolbar" },
    h("h3", {}, project.name),
    h("span", { class: "muted", style: { flex: "1" } }, `${items.length} linha(s)`),
    btnImport));

  if (!items.length) {
    pane.appendChild(h("div", { class: "empty-state" },
      h("p", { class: "muted" }, "Nenhuma linha ainda. Carregue a Lista de pedidos.")));
    return;
  }
  // Listagem crua (provisoria; sera o datagrid na Fase 3)
  const t = h("table", { class: "table" });
  t.appendChild(h("tr", {}, ...["#", "Referência", "Grupo", "Empresa", "Status", "Prazo"].map((x) => h("th", {}, x))));
  items.slice(0, 50).forEach((it) => t.appendChild(h("tr", {},
    h("td", {}, it.item_num), h("td", {}, it.referencia), h("td", {}, it.grupo),
    h("td", {}, it.empresa), h("td", {}, it.status || ""), h("td", {}, it.prazo_recebimento || ""))));
  pane.appendChild(t);
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
```

- [ ] **Passo 2: verificar no browser** — projeto "tabela" → "Carregar planilha" → escolher o `.xlsx` → toast "258 linha(s) carregada(s)" e a listagem crua aparece. Conferir no banco: `select count(*) from planning_items;` → 258. Reimportar o **mesmo** arquivo → continua 258 (o upsert não duplica).

- [ ] **Passo 3 (checkpoint): commit — mediante aval**

```
feat(projeto-tabela): schema planning_items + import tipado com deteccao de aba e carga idempotente
```

---

## FASE 3 — Datagrid vanilla (paridade com DataTable/ListView)

> **Entrega verificável:** as linhas carregadas aparecem no **datagrid** com a mesma cara do Cronograma e **toda a toolbar** funcionando (busca, filtrar, agrupar, classificar, exportar, chips, seleção em lote), além de resize/sticky/virtualização.
>
> **Natureza da tarefa:** é um **port fiel** de dois componentes React para vanilla JS. O código-fonte de referência é a especificação — o executor lê o `.tsx` de cada capacidade e reproduz o comportamento em vanilla, verificando lado a lado no browser. Por isso as tarefas abaixo são decompostas **por capacidade**, cada uma com o arquivo/linhas-fonte e o critério de aceite; não se colam aqui as ~1700 linhas do port.

### Task 3.1: Portar o CSS verbatim

**Files:**
- Create: `styles/datagrid.css`
- Modify: `index.html` (link + cache-bust)

- [ ] **Passo 1: copiar os blocos de estilo** — de `...\eqtl_cronograma_fechamento\frontend\src\styles\components.css`, copiar **verbatim** os blocos da tabela e da toolbar (linhas indicadas no levantamento: tabela 186-460; sticky/grupos 359-421; toolbar 570-690, 731-732, 884-885, 944-946, 985-1003). Colar em `styles/datagrid.css`.

- [ ] **Passo 2: reconciliar tokens** — abrir `...\frontend\src\styles\tokens.css` (209 l) e, para cada variável usada pelos blocos copiados (`--surface`, `--accent`, `--border`, `--divider`, `--row-hover`, `--stripe`, `--table-group-bg`, `--row-selected`, `--table-header-bg`, `--radius`, `--fs-*`, `--space-*`), verificar se já existe equivalente no DS v2 (`styles/design-system.css`). Onde existir, **mapear para o token do DS**; onde não existir, **definir a variável em `styles/datagrid.css`** (escopo `.grid-page`) com o valor do `tokens.css` de origem, para **dark e light** (`[data-theme]`). Objetivo: mesma aparência nos dois temas, sem quebrar o DS.

- [ ] **Passo 3: incluir no `index.html`** — acrescentar `<link rel="stylesheet" href="styles/datagrid.css?v=25" />` após `solic.css`. Garantir a fonte **Roboto** (já carregada no `<head>`), pois a medição de largura por canvas é calibrada para ela.

- [ ] **Passo 4: verificar** — nada visual ainda (sem markup), mas o CSS carrega sem erro (Network 200) e não afeta telas existentes.

### Task 3.2: `DataGrid` vanilla — render base + colunas + ordenação

**Files:**
- Create: `js/datagrid.js`
- Fonte: `DataTable.tsx` (API `Column` 5-45; props 470-523; render 696-823; sort via `SortIcon`/`onSortChange`)

- [ ] **Passo 1: definir a API `DataGrid`** — classe vanilla que recebe `{ columns, rows, options }` e monta `<table class="table table-fixed">` dentro de um container. A definição de coluna espelha `Column<T>`:

```js
/* js/datagrid.js — port vanilla do DataTable.tsx (paridade).
   Column = {
     key, header|headerLabel, render(row)->(string|Node), align, width, fixedWidth,
     sticky, sortKey(row)->comparable, filterValue(row)->string, groupValue(row)->string,
     dateValue(row)->Date|null, cellText(row)->string, editable, menuLabel
   } */
export class DataGrid {
  constructor(container, { columns, rows = [], selectable = false, onRowChange = null } = {}) { /* ... */ }
  setRows(rows) { /* ... re-render */ }
  render() { /* thead (com clique p/ ordenar) + tbody */ }
  // estado: sort {key, dir}, selectedIds:Set, groupBy, filters
}
```

Reproduzir de `DataTable.tsx`: cabeçalho com `SortIcon` e clique para ordenar (asc/desc/limpar), `render(row)` por célula, `align`/`width`, `cellText` para tooltip/export. **Ordenação client-side** por `sortKey`.

- [ ] **Passo 2: montar na view** — em `js/planning.js`, trocar a `<table>` crua por `new DataGrid(container, { columns: PLANNING_COLUMNS, rows: items })` (as colunas do modelo entram na Task 4.x; por ora, um conjunto mínimo de colunas de texto para validar o render).

- [ ] **Passo 3: verificar no browser (dark+light)** — a tabela renderiza as linhas, cabeçalho igual ao Cronograma; clicar no cabeçalho ordena asc/desc/limpa; tooltip nas células truncadas.

### Task 3.3: Redimensionar coluna + colunas sticky + auto-fit

**Files:**
- Modify: `js/datagrid.js`
- Fonte: `DataTable.tsx` — `textWidth` 61-100, `startResize` 642-659, `autoFitCol` 662-669, sticky 673-687

- [ ] **Passo 1: portar** medição de largura em canvas (`textWidth`), arraste da borda para redimensionar, duplo-clique para auto-ajustar, e colunas `sticky` à esquerda.
- [ ] **Passo 2: verificar** — arrastar a borda redimensiona; duplo-clique ajusta à maior célula; coluna sticky (ex.: `#`) fica congelada ao rolar horizontalmente. Conferir dark+light.

### Task 3.4: Virtualização (windowing)

**Files:**
- Modify: `js/datagrid.js`
- Fonte: `DataTable.tsx` — 102-107, 736-757 (ativa acima de 60 linhas com `fillHeight`)

- [ ] **Passo 1: portar** o windowing: renderizar só as linhas visíveis + buffer, com spacers de topo/base calculados pela altura de linha.
- [ ] **Passo 2: verificar** — com as 258 linhas, rolar é fluido; o DOM tem só as linhas visíveis (checar via DevTools). Ordenação/scroll não "pulam".

### Task 3.5: Seleção de linhas (checkbox + grupo + todos)

**Files:**
- Modify: `js/datagrid.js`
- Fonte: `DataTable.tsx` — checkbox por linha, "selecionar todos", checkbox por grupo com estado indeterminado; `TableRow = memo` 468

- [ ] **Passo 1: portar** seleção por linha, "selecionar todos" no cabeçalho, e (após 3.7) por grupo com indeterminado. Expor `selectedIds` + callback.
- [ ] **Passo 2: verificar** — marcar/desmarcar linhas e "todos" funciona; contador reflete a seleção.

### Task 3.6: `ListView` vanilla — toolbar (busca + chips) + orquestração

**Files:**
- Create: `js/listview.js`
- Fonte: `ListView.tsx` — toolbar 490-786; busca `.cron-search` 505-518 (`matchesTerm` de `lib/text.ts`); chips 732-742; `baseRows/filteredRows/displayRows` 311-357; persistência `localStorage` 22-56

- [ ] **Passo 1: portar** o wrapper `ListView` que embrulha `DataGrid` e deriva filtros/agrupamentos/ordenação **das próprias colunas** (as que têm `filterValue`/`sortKey`/`dateValue`). Incluir: caixa de **busca** (client-side via port de `matchesTerm`), a **barra de chips** de filtro ativo com "×" e "Limpar tudo", e a **persistência da visão** em `localStorage` (prefixo `eqtl.listview.controle.`). **Sem `useAuth`** — o "Ver excluídos" (admin) é opcional; se mantido, receber `isAdmin` por parâmetro (o app tem `canSeeAdmin()`).

```js
/* js/listview.js — port vanilla do ListView.tsx (toolbar + orquestracao). */
export class ListView {
  constructor(container, { columns, rows, persistKey, searchPlaceholder, actions, selectable, bulkActions, onRowChange }) { /* ... */ }
  setRows(rows) {}   // recomputa base/filtro/ordem/grupo e repassa ao DataGrid
}
```

- [ ] **Passo 2: portar `lib/text.ts` e `lib/format.ts`** — copiar `matchesTerm` (busca acento-insensível) e `fmtData`/`fmtNome` para `js/listview.js` (ou um pequeno `js/table_fmt.js`).
- [ ] **Passo 3: verificar** — a caixa de busca filtra em memória; digitar mostra chips e "Limpar tudo" some com eles; recarregar a página mantém a visão (localStorage).

### Task 3.7: Filtrar (multi-seleção + data), Agrupar, Classificar, Exportar

**Files:**
- Modify: `js/listview.js`
- Create: `js/daterange.js` (port de `DateRangeCalendar.tsx`)
- Fonte: `ListView.tsx` — `abrirTool` 427; flyout Filtrar 635-727; Agrupar 574-594; Classificar 596-633; Exportar 561-572; presets de data 78/388; `DateRangeCalendar.tsx` 170 l

- [ ] **Passo 1: Filtrar** — flyout de 2 níveis (dimensão → valores). `choice`: multi-seleção com busca (aparece campo se >8 valores) + "Limpar". `date`: presets **Hoje / Esta semana / Próxima semana / Anterior a hoje** + calendário de intervalo (port de `DateRangeCalendar`). As dimensões vêm das colunas com `filterValue`/`dateValue`.
- [ ] **Passo 2: Agrupar** — radio das colunas agrupáveis + "Remover"; seções colapsáveis no `DataGrid` (portar o group-by de `DataTable.tsx` 696-823, com expandir/recolher e "expandir todos").
- [ ] **Passo 3: Classificar** — radio de colunas ordenáveis + Ascendente/Descendente + "Limpar".
- [ ] **Passo 4: Exportar** — botão de download; **reusar `excel.js` (ExcelJS)** deste projeto para gerar o `.xlsx` dos itens exibidos/selecionados (não portar `exportExcel.ts` nem trazer o logo da referência). Cabeçalhos = os `header` das colunas; valores = `cellText(row)`.
- [ ] **Passo 5: verificar (dark+light)** — cada controle: filtro multi-seleção reduz as linhas e cria chip; filtro por data com preset e intervalo; agrupar cria seções colapsáveis com contagem; classificar reordena; exportar baixa um `.xlsx` com as colunas visíveis. Comparar lado a lado com a aba "Pessoas" do Cronograma.

- [ ] **Passo 6 (checkpoint): commit — mediante aval**

```
feat(projeto-tabela): datagrid vanilla com paridade (toolbar: busca, filtrar, agrupar, classificar, exportar, chips, selecao, resize, sticky, virtualizacao)
```

---

## FASE 4 — Colunas do modelo, cálculo de status e edição inline

> **Entrega verificável:** o datagrid mostra as 13 colunas de entrada + as 4 calculadas (com chip de cor), os status batem com o que o Excel mostraria hoje, e edito células de entrada com persistência.

### Task 4.1: Funções puras de cálculo

**Files:**
- Create: `js/calc.js`

- [ ] **Passo 1: escrever as 4 funções** (tradução fiel das fórmulas N/O/P/Q da planilha; datas ISO `YYYY-MM-DD`; comparação em dias):

```js
/* js/calc.js — colunas calculadas da Lista de pedidos (paridade com as formulas
   do Excel). Todas recebem o item e "hoje" (Date local, meia-noite). */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseDay(iso) { if (!iso) return null; const d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : "")); return isNaN(d) ? null : startOfDay(d); }
function diffDays(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); } // a - b (dias)
function isNA(status) { return String(status || "").trim().toLowerCase().replace("/", "") === "na"; }

/* N — Status de entrega */
export function statusEntrega(item, hoje = new Date()) {
  if (isNA(item.status)) return "N/A";
  const prazo = parseDay(item.prazo_recebimento);
  const entrega = parseDay(item.entrega_efetiva);
  if (!entrega) {
    if (!prazo) return "Pendente";
    return diffDays(hoje, prazo) <= 0 ? "Em andamento" : "Pendente";
  }
  if (!prazo) return "Concluído no prazo";
  return diffDays(prazo, entrega) >= 0 ? "Concluído no prazo" : "Concluído com atraso";
}

/* O — Status Geral (fiel a =SE(OU(N="Em andamento";N="Pendente");"Pendente";"Concluído")).
   OBS: por essa formula, "N/A" cai em "Concluído" — replicado do Excel. */
export function statusGeral(item, hoje = new Date()) {
  const s = statusEntrega(item, hoje);
  return (s === "Em andamento" || s === "Pendente") ? "Pendente" : "Concluído";
}

/* P — Status Prazo */
export function statusPrazo(item, hoje = new Date()) {
  if (isNA(item.status)) return "N/A";
  const prazo = parseDay(item.prazo_recebimento);
  const entrega = parseDay(item.entrega_efetiva);
  if (!entrega) {
    if (!prazo) return "Pendente";
    return diffDays(hoje, prazo) <= 0 ? "No Prazo" : "Atrasado";
  }
  if (!prazo) return "No Prazo";
  return diffDays(prazo, entrega) >= 0 ? "No Prazo" : "Atrasado";
}

/* Q — Dias de atraso: so para nao entregues e vencidos (fiel a =SE(Entrega>0;"";SE(HOJE()-Prazo<=0;"";HOJE()-Prazo))) */
export function diasAtraso(item, hoje = new Date()) {
  if (parseDay(item.entrega_efetiva)) return null;
  const prazo = parseDay(item.prazo_recebimento);
  if (!prazo) return null;
  const d = diffDays(hoje, prazo);
  return d <= 0 ? null : d;
}
```

- [ ] **Passo 2: verificar via console** — montar 3 itens de teste (sem entrega e no prazo → "Em andamento"; sem entrega e vencido → "Pendente" + dias>0; com entrega ≤ prazo → "Concluído no prazo") e conferir os retornos. Comparar com o que a planilha exibe para linhas reais.

### Task 4.2: Definição das colunas do modelo (entrada + calculadas)

**Files:**
- Create/Modify: `js/planning.js` (constante `PLANNING_COLUMNS`)
- Fonte de estilo dos chips: `util.js` `statusClassFor` + `styles` `.chip`

- [ ] **Passo 1: montar `PLANNING_COLUMNS`** — 13 colunas de entrada (com `filterValue`/`sortKey`/`dateValue` conforme o tipo: `empresa`, `grupo`, `segmento`, `status`, `area_responsavel`, `responsavel` são filtráveis/agrupáveis; `data_solicitacao`, `prazo_recebimento`, `entrega_efetiva`, `data_base` têm `dateValue`) + 4 calculadas read-only cujo `render` usa `statusEntrega/statusGeral/statusPrazo/diasAtraso` e envolve o texto num `<span class="chip ...">` (cor via `statusClassFor`). As calculadas também têm `filterValue`/`sortKey` (para filtrar/agrupar por "No Prazo/Atrasado" etc.), mas **não** `editable`.

- [ ] **Passo 2: verificar (dark+light)** — as 17 colunas aparecem; os chips das calculadas têm cor; filtrar por "Status Prazo = Atrasado" funciona; conferir algumas linhas contra a planilha aberta no Excel.

### Task 4.3: Edição inline das colunas de entrada

**Files:**
- Modify: `js/datagrid.js` (suporte a célula editável) e `js/planning.js` (persistência)
- Fonte de UX: comportamento de edição da grade atual (`grid.js`) para consistência

- [ ] **Passo 1: edição no `DataGrid`** — para colunas com `editable: true`, duplo-clique (ou Enter) abre um input inline (texto, ou `<input type=date>` para as colunas de data, ou `<select>` para `status` com as opções). Ao confirmar, dispara `onRowChange(row, field, value)`; Esc cancela.

- [ ] **Passo 2: persistir** — em `js/planning.js`, o `onRowChange` chama `store.updatePlanningItem(row.id, { [field]: value })`, atualiza o item em memória e **re-renderiza as 4 colunas calculadas** daquela linha (elas dependem de `status`/`prazo_recebimento`/`entrega_efetiva`).

- [ ] **Passo 3: proteger a chave** — ao editar `item_num`/`referencia`/`grupo`/`empresa` (compõem a chave), antes de gravar checar se a nova combinação colide com outra linha do projeto (em memória); se colidir, recusar com toast e reverter a célula. (Alternativa aceita: manter essas 4 editáveis mas exibir aviso.)

- [ ] **Passo 4: verificar (dark+light)** — editar "Entrega efetiva" de uma linha vencida → as colunas Status de entrega/Prazo/Dias de atraso recalculam na hora; recarregar a página mantém o valor (persistiu). Editar `empresa` para colidir com outra chave → recusa com aviso.

- [ ] **Passo 5 (checkpoint): commit — mediante aval**

```
feat(projeto-tabela): colunas do modelo + status calculado pela app + edicao inline com recalculo
```

---

## FASE 5 — Reimport com modal de divergências

> **Entrega verificável:** reimportar uma planilha alterada abre um modal amplo com tabs (Novas linhas · Alterados · Sem mudança · Fora da planilha); o usuário revê e aplica; as edições feitas na app são preservadas por padrão.

### Task 5.1: Diff por chave

**Files:**
- Create: `js/planning_diff.js` (função pura de comparação)

- [ ] **Passo 1: escrever o diff** — dado `atuais` (de `listPlanningItems`) e `novas` (de `parseTableXlsx`), casar pela chave `item_num|referencia|grupo|empresa` e classificar:

```js
/* js/planning_diff.js — compara linhas do banco (atuais) x planilha (novas) pela chave.
   Retorna { novas:[row], alterados:[{atual, nova, campos:[{campo, de, para}]}],
             semMudanca:[row], foraDaPlanilha:[atual] }.
   "Alterados" so considera as colunas de ENTRADA; entrega_efetiva editada na app
   entra como conflito destacado, mas por padrao e PRESERVADA (nao sobrescrita). */
const KEY = (r) => [r.item_num, r.referencia, r.grupo, r.empresa].map((x) => String(x ?? "").trim()).join("|");
const COMPARE = ["descricao", "segmento", "data_base", "status", "data_solicitacao", "prazo_recebimento", "area_responsavel", "responsavel"];
const PRESERVE = ["entrega_efetiva"]; // editada na app -> conflito destacado, preserva por padrao

export function diffPlanning(atuais, novas) {
  const byKey = new Map(atuais.map((r) => [KEY(r), r]));
  const seen = new Set();
  const out = { novas: [], alterados: [], semMudanca: [], foraDaPlanilha: [] };
  for (const nv of novas) {
    const k = KEY(nv); seen.add(k);
    const at = byKey.get(k);
    if (!at) { out.novas.push(nv); continue; }
    const campos = [];
    for (const f of COMPARE) {
      const de = at[f] ?? null, para = nv[f] ?? null;
      if (String(de ?? "") !== String(para ?? "")) campos.push({ campo: f, de, para, conflito: false });
    }
    for (const f of PRESERVE) {
      const de = at[f] ?? null, para = nv[f] ?? null;
      if (de != null && String(de) !== String(para ?? "")) campos.push({ campo: f, de, para, conflito: true });
    }
    if (campos.length) out.alterados.push({ atual: at, nova: nv, campos });
    else out.semMudanca.push(at);
  }
  for (const at of atuais) if (!seen.has(KEY(at))) out.foraDaPlanilha.push(at);
  return out;
}
```

- [ ] **Passo 2: verificar via console** — casos: linha nova, linha com `status` alterado, linha idêntica, e uma linha da app que sumiu da planilha → cada uma cai no bucket certo.

### Task 5.2: Modal de divergências (tabs)

**Files:**
- Modify: `js/planning.js` (substituir o `importFlow` direto da Fase 2)
- Estilo: reusar `.scrim`/`.modal.wide`/`.diff-*` já existentes (ver `showDiffModal` em `app.js:2529`)

- [ ] **Passo 1: montar o modal com tabs** — após `parseTableXlsx` + `diffPlanning`, abrir modal `.modal.wide` com abas:
  - **Novas linhas** (`n`) — lista; checkbox por linha (marcadas por padrão) → inserir.
  - **Alterados** (`n`) — por linha, os campos `de → para`; campos com `conflito:true` (ex.: `entrega_efetiva`) destacados com aviso "editado na app"; opção por linha: **aplicar mudanças da planilha** (preservando os campos `PRESERVE` por padrão) — checkbox de "sobrescrever também os editados na app" desmarcado por padrão.
  - **Sem mudança** (`n`) — informativo, sem ação.
  - **Fora da planilha** (`n`) — linhas na app ausentes do arquivo; ação opcional (manter — default; ou marcar para excluir).
  - Botão "Aplicar selecionadas" + "Cancelar". Nada muda até aplicar.

- [ ] **Passo 2: aplicar** — inserir as novas (`upsertPlanningItems`), atualizar os alterados selecionados (`updatePlanningItem` só com os campos escolhidos, respeitando o preserve), e excluir as "fora da planilha" marcadas (`deletePlanningItems`). Toast com o resumo; re-render.

- [ ] **Passo 3: verificar (dark+light)** — preparar um `.xlsx` com: 2 linhas novas, 1 com `status` mudado, 1 idêntica, e remover 1 linha; após marcar "Entrega efetiva" numa linha na app, reimportar e confirmar que o conflito aparece destacado e a entrega **não** é apagada por padrão. Aplicar e conferir os números no banco.

- [ ] **Passo 4 (checkpoint): commit — mediante aval**

```
feat(projeto-tabela): reimport com modal de divergencias em tabs (novas/alterados/sem mudanca/fora da planilha), preservando edicoes da app
```

---

## FASE 6 — Acabamento e publicação

> **Entrega verificável:** o fluxo inteiro roda em produção; a Central do Projeto reflete o novo modelo.

### Task 6.1: Card do projeto e rota

**Files:**
- Modify: `js/app.js` (`projectCard` ~482; empty state da tabela)

- [ ] **Passo 1:** no `projectCard`, mostrar um selo do tipo ("Tabela" / "Planilha") para diferenciar na landing. Para projeto `kind='tabela'`, os chips de status por contagem (que vêm de `cells`) não se aplicam — esconder ou trocar por "N linhas".
- [ ] **Passo 2: verificar** — a landing distingue os dois tipos; abrir/voltar/F5 funciona para ambos.

### Task 6.2: Revisão de design (painel)

- [ ] **Passo 1:** rodar o checklist Definition of Done (Central §🎨) sobre a tela nova: consultar o DS v2, olhar a tela inteira, contraste WCAG AA em dark+light, ícones coerentes. Ajustar só cor/tipografia se preciso (a estrutura é o port da referência).
- [ ] **Passo 2:** conferir a paridade visual final lado a lado com a aba "Pessoas" do Cronograma.

### Task 6.3: Cache-bust + Central

**Files:**
- Modify: `index.html` (garantir `v=25` em todos os arquivos), `projeto/Central.md`, `projeto/Inventario.md`

- [ ] **Passo 1:** confirmar o cache-bust `v=25` em todos os `<link>`, `<script>`, importmap e no `app.js`.
- [ ] **Passo 2:** atualizar `Central.md` (🟢 Onde estamos) e `Inventario.md` (nova tela + tabela `planning_items` + módulos `planning/datagrid/listview/calc/table_import`) via skill `eqtl-checkpoint` ao fechar a sessão.
- [ ] **Passo 3 (checkpoint): commit + push — mediante aval**

```
feat(projeto-tabela): selo de tipo na landing, revisao de design e publicacao (cache v25)
```

---

## Auto-revisão do plano (cobertura x spec)

- **2 modelos de projeto** → Fase 1 (kind, modal, bifurcação). ✅
- **Carga escolhendo a aba pelas colunas** → Task 2.3 (`detectHeader`/`parseTableXlsx`). ✅
- **Colunas fixas conforme o arquivo** → tabela do cabeçalho + Task 4.2 (`PLANNING_COLUMNS`). ✅
- **Colunas calculadas pela app (mesmo que o usuário envie)** → o import ignora N–Q (não estão no `HEADER_MAP`); Fase 4 calcula. ✅
- **Chave única #+Referência+Grupo+Empresa** → índice único (Task 2.1) + upsert `onConflict` (2.2) + diff por chave (5.1) + proteção na edição (4.3). ✅
- **Datagrid = paridade com Pessoas (toolbar, filtros, agrupamentos, opções)** → Fase 3 (por capacidade, fonte `.tsx`, CSS verbatim). ✅
- **Todas as colunas de entrada editáveis, exceto cálculo** → Task 4.3 (`editable` só nas de entrada; calculadas read-only). ✅
- **Reimport com modal amplo de tabs, preservando edições da app** → Fase 5. ✅
- **Sem guardar listas (empresa/segmento)** → texto livre nas colunas; nenhuma tabela de domínio criada. ✅

**Pontos que dependem de conferência na execução (sinalizados nos passos):**
1. RLS de `planning_items` — replicar o padrão real das outras tabelas (Task 2.1, Passo 2), não assumir `using(true)`.
2. `Status Geral` trata "N/A" como "Concluído" por fidelidade à fórmula do Excel — comportamento replicado e anotado (Task 4.1); se o Eduardo quiser "N/A" fora de "Concluído", é um ajuste de uma linha.
3. Edição das 4 colunas-chave — plano usa recusa em caso de colisão (Task 4.3, Passo 3); alternativa (read-only) fica registrada.
