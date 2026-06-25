# Dashboard "Entregas por empresa" — Plano de Implementação

> **Para quem executa:** SUB-SKILL recomendada: `executing-plans` (do projeto) para implementar tarefa a tarefa, com checkpoint de revisão entre elas. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Adicionar uma 3ª sub-aba ao Dashboard — "Entregas por empresa" — com matriz Empresa × Processo(Área), filtro de status, gráfico de entregas por empresa e KPIs, navegando direto à célula do item.

**Architecture:** Tudo dentro de `js/app.js` (mesmo lugar dos dashboards `renderDashStatus`/`renderDashUsers`), reusando o parser (`parseAbas`), os helpers de cor (`STATUS_RAMP`/`rampFor`/`statusClassFor`) e a navegação (`goToCell`) já existentes. Os dados saem do cruzamento `parseAbas` (empresa×status por aba) × campo **Área** das Solicitações (`sheet_link → area`). CSS novo, escopado em `.dash-emp`, em `styles/app-ds.css`.

**Tech Stack:** Vanilla JS (ES modules, helper `h()`), Supabase (`store.*`), Design System v2 (`styles/design-system.css` tokens + `styles/app-ds.css`), SVG/CSS para gráficos (sem Chart.js), sem build step.

---

## ⚠️ Verificação neste projeto (regra de ouro)

**Não há runner de testes.** Onde um plano padrão diria "rodar pytest", aqui leia: **verificar no browser em `http://127.0.0.1:5500`, nos temas escuro E claro**, e rodar o checklist **Definition of Done** (`projeto/Central.md` § 🎨 Painel de Design). Servidor: `start.bat` (ou o preview `eqtl-local` na 5500). Para asserts rápidos de dados, usar `preview_eval` no console da página.

## Decisões adotadas (recomendadas e aprovadas; validar com dado real na execução)

1. **Área multivalorada** — uma aba pode ter +de uma Área nas Solicitações. O item conta em **cada** coluna de Área a que a aba pertence (espelha como o usuário marca). Aba sem Área cai numa coluna **"(sem área)"**.
2. **Clique "direto na aba"** — quando a Área agrupa várias abas, o clique abre **o primeiro item** daquela célula (sua aba + célula via `goToCell`). Se há filtro de status ativo, abre o primeiro item **daquele status**.
3. **Nomes reais** — empresas vêm de `getCompanies()`; processos do campo **Área**. Nada hardcoded.

## File Structure

- **Modificar `js/app.js`** — adicionar: `computeEmpresaAreaData()` (camada de dados), `renderDashEmpresa(body)` + sub-render (`empKpis`, `empFilters`, `empMatrix`, `empBars`, `empDonut`, `empTip`, `empGoTo`), a constante `RAMP_TOTAL`, e a 3ª aba em `showDashboard()`. Tudo junto dos dashboards atuais (mesmo padrão do arquivo).
- **Modificar `styles/app-ds.css`** — bloco novo escopado em `.dash-emp` (KPIs, filtros, matriz/heatmap, barras, donut, tooltip), portado do mockup `mockups/dashboard_entregas_empresa.html`.
- **Referência viva (não editar):** `js/parser.js` (`parseAbas`), `js/util.js` (`getCompanies`/`getStatusOptions`/`statusClassFor`), `mockups/dashboard_entregas_empresa.html` (spec visual validada).

> Âncoras por **string de código** (o `app.js` está em evolução; localize pelo trecho, não pela linha).

---

### Task 1: Camada de dados — `computeEmpresaAreaData()`

**Files:**
- Modify: `js/app.js` (adicionar a função perto de `computeAbaStatusCounts` — procure por `async function computeAbaStatusCounts`)

- [ ] **Step 1: Adicionar a função de dados**

Cole logo após a função `computeAbaStatusCounts` (que termina com `return m;`):

```js
/* Cruza parseAbas (empresa×status por aba) com o campo Área das Solicitações
   (sheet_link → area[]). Retorna empresas, áreas (processos) e a matriz de
   contagens com alvos de navegação (sheetId/row/col) por célula. */
async function computeEmpresaAreaData() {
  // 1) mapa aba(nome) -> Set(áreas) a partir das Solicitações
  let solic = App._solicRows;
  if (!Array.isArray(solic)) { try { solic = await store.loadSolicitacoes(App.project); } catch (_) { solic = []; } }
  const abaToAreas = new Map();
  for (const r of solic) {
    const aba = String(r.sheet_link || "").trim(); if (!aba) continue;
    if (!abaToAreas.has(aba)) abaToAreas.set(aba, new Set());
    (Array.isArray(r.area) ? r.area : []).filter(Boolean).forEach((a) => abaToAreas.get(aba).add(a));
  }
  // 2) parser: empresa × status por aba (mesma chamada do computeAbaStatusCounts)
  const parsed = await parseAbas(App.sheets, (id) => store.loadCells(id), getCompanies(), getStatusOptions());
  // 3) cruza: matrix[empresa][área] = { status:Map(label->qtd), total, targets:[{sheetId,row,col,status}] }
  const empresas = new Set(), areas = new Set();
  const matrix = new Map();
  const cell = (emp, area) => {
    if (!matrix.has(emp)) matrix.set(emp, new Map());
    const row = matrix.get(emp);
    if (!row.has(area)) row.set(area, { status: new Map(), total: 0, targets: [] });
    return row.get(area);
  };
  for (const { sheet, res } of parsed.perSheet) {
    const aba = String(sheet.name || "").trim();
    let abaAreas = [...(abaToAreas.get(aba) || [])];
    if (!abaAreas.length) abaAreas = ["(sem área)"];
    for (const rec of res.records) {
      empresas.add(rec.empresa);
      for (const area of abaAreas) {
        areas.add(area);
        const c = cell(rec.empresa, area);
        c.status.set(rec.status, (c.status.get(rec.status) || 0) + 1);
        c.total++;
        c.targets.push({ sheetId: sheet.id, row: rec.row, col: rec.col, status: rec.status });
      }
    }
  }
  const byArea = (a, b) => a === "(sem área)" ? 1 : b === "(sem área)" ? -1 : a.localeCompare(b, "pt");
  return {
    empresas: [...empresas].sort((a, b) => a.localeCompare(b, "pt")),
    areas: [...areas].sort(byArea),
    matrix, byStatus: parsed.byStatus, total: parsed.total,
  };
}
```

- [ ] **Step 2: Verificar no browser (console)**

Abrir um projeto → Dashboard. No `preview_eval` (ou DevTools), depois de a função existir, rode um teste manual temporário não é trivial (é módulo). Em vez disso, valide na Task 2 quando a aba chamar a função. Por ora, confirme que **não há erro de sintaxe**: recarregue a página e cheque `preview_console_logs` (nenhum erro de parse no `app.js`).
Expected: app carrega normalmente; nenhum erro novo no console.

- [ ] **Step 3: Commit (com aval do Eduardo)**

```bash
git add js/app.js
git commit -m "feat(dashboard): camada de dados empresa x area (parseAbas x campo Area)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 3ª aba + esqueleto `renderDashEmpresa` (estados loading/empty/erro)

**Files:**
- Modify: `js/app.js` (em `showDashboard()` — procure `tabs.appendChild(mkTab("users", "Usuários"));` e o dispatch `if (App.dashTab === "users") return renderDashUsers(body);`)

- [ ] **Step 1: Registrar a aba**

Logo após a linha `tabs.appendChild(mkTab("users", "Usuários"));`, adicione:

```js
  tabs.appendChild(mkTab("empresa", "Entregas por empresa"));
```

- [ ] **Step 2: Despachar a aba**

Troque o trecho de dispatch:

```js
  if (App.dashTab === "users") return renderDashUsers(body);
  return renderDashStatus(body, gs);
```

por:

```js
  if (App.dashTab === "users") return renderDashUsers(body);
  if (App.dashTab === "empresa") return renderDashEmpresa(body);
  return renderDashStatus(body, gs);
```

- [ ] **Step 3: Esqueleto da render (com estados)**

Adicione perto de `renderDashStatus` (após o fim de `renderDashUsers` ou `renderDashStatus`):

```js
let RAMP_TOTAL = ["#E2EEEC", "#AFD2C9", "#6FB0A2", "#0c3530"]; // rampa neutra (teal) p/ "Todos"

async function renderDashEmpresa(body) {
  if (!App.empFilter) App.empFilter = "all";
  clear(body);
  body.appendChild(h("div", { class: "spinner", style: { margin: "50px auto" } }));
  let data;
  try { data = await computeEmpresaAreaData(); }
  catch (e) { clear(body); body.appendChild(h("p", { class: "muted", style: { padding: "28px" } }, "Erro ao carregar: " + (e.message || e))); return; }
  if (App.view !== "dashboard" || App.dashTab !== "empresa") return;
  clear(body);

  if (!data.empresas.length) {
    body.appendChild(h("div", { class: "dash-emp" },
      h("div", { class: "emp-empty" },
        h("h3", {}, "Nada para mostrar ainda"),
        h("p", {}, "Cadastre as empresas (Configuração → Lista de Empresas) e confira a leitura das abas. O dashboard lê os status reais das planilhas cruzados com o campo Área das Solicitações."))));
    return;
  }

  const wrap = h("div", { class: "dash-emp" });
  body.appendChild(wrap);
  // placeholders preenchidos nas próximas tasks
  wrap.appendChild(h("div", { class: "emp-kpis", id: "emp-kpis" }));
  const main = h("div", { class: "emp-main" });
  const mxCard = h("div", { class: "card" },
    h("div", { class: "card-head" }, h("h3", {}, "Matriz · Empresa × Processo"), h("span", { class: "hint", id: "emp-hint" }, "")),
    h("div", { class: "card-body" },
      h("div", { class: "emp-filters", id: "emp-filters" }),
      h("div", { class: "emp-mx-scroll" }, h("table", { class: "emp-mx", id: "emp-mx" })),
      h("p", { class: "emp-note" }, "Clique (ou Enter) numa célula → abre a aba e seleciona a célula do item.")));
  const rail = h("div", { class: "emp-rail" },
    h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", {}, "Entregas por empresa"), h("span", { class: "hint" }, "ordenado por pendências")), h("div", { class: "card-body" }, h("div", { class: "emp-bars", id: "emp-bars" }))),
    h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", {}, "Distribuição por status")), h("div", { class: "card-body" }, h("div", { class: "emp-dist", id: "emp-dist" }))));
  main.appendChild(mxCard); main.appendChild(rail);
  wrap.appendChild(main);

  App._empData = data;
  empPaint();        // Task 4+ preenche
  empBars(data);     // Task 6
  empDonut(data);    // Task 6
}

/* re-render que depende do filtro (filtros + matriz + hint) */
function empPaint() {
  const data = App._empData; if (!data) return;
  empKpis(data);                                  // Task 3
  empFilters(document.getElementById("emp-filters"), data); // Task 4
  empMatrix(document.getElementById("emp-mx"), data);       // Task 4
  const sel = App.empFilter;
  const hint = document.getElementById("emp-hint");
  if (hint) hint.textContent = "Mostrando: " + (sel === "all" ? "total de itens" : "status " + sel);
}
```

> Nas próximas tasks definimos `empKpis`, `empFilters`, `empMatrix`, `empBars`, `empDonut`. Até lá, defina stubs vazios para a página não quebrar:

```js
function empKpis() {}
function empFilters() {}
function empMatrix() {}
function empBars() {}
function empDonut() {}
function empTip() {}
```

- [ ] **Step 4: Verificar no browser (escuro + claro)**

Abrir projeto → Dashboard → clicar **"Entregas por empresa"**. 
Expected: a aba aparece e fica ativa; sem erros no console; aparece o esqueleto (cards "Matriz", "Entregas por empresa", "Distribuição por status"); se o projeto não tiver empresas/status reconhecidos, aparece o estado vazio "Nada para mostrar ainda". Conferir nos 2 temas.

- [ ] **Step 5: Commit (com aval do Eduardo)**

```bash
git add js/app.js
git commit -m "feat(dashboard): aba 'Entregas por empresa' (esqueleto + estados)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Faixa de KPIs

**Files:**
- Modify: `js/app.js` (substituir o stub `function empKpis() {}`)

- [ ] **Step 1: Implementar `empKpis`**

```js
function empKpis(data) {
  const host = document.getElementById("emp-kpis"); if (!host) return;
  let total = 0, recebido = 0, pend = 0;
  for (const [, label] of data.byStatus ? data.byStatus.entries() : []) {}
  // agrega por classe de status
  data.byStatus.forEach((qtd, label) => {
    total += qtd;
    const cls = statusClassFor(label) || "na";
    if (cls === "recebido") recebido += qtd;
    else if (cls === "pendente" || cls === "analise" || cls === "parcial") pend += qtd;
  });
  const pct = total ? Math.round(recebido / total * 100) : 0;
  const processos = data.areas.filter((a) => a !== "(sem área)").length;
  const ico = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${p}</svg>`;
  const card = (cls, p, label, val) => h("div", { class: "card stat" },
    h("div", { class: "ico " + cls, html: ico(p) }),
    h("div", {}, h("div", { class: "s-label" }, label), h("div", { class: "s-value", html: val })));
  clear(host);
  host.appendChild(card("c-total", '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/>', "Itens mapeados", String(total)));
  host.appendChild(card("c-ok", '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>', "Concluído (Recebido)", `${recebido}<small>${pct}%</small>`));
  host.appendChild(card("c-pend", '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>', "Pendências (ação)", String(pend)));
  host.appendChild(card("c-emp", '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>', "Empresas", String(data.empresas.length)));
  host.appendChild(card("c-proc", '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', "Processos (Áreas)", String(processos)));
}
```

> Limpe a linha morta `for (const [, label] ...) {}` — foi deixada por engano; **não** a inclua. A agregação correta é só o `data.byStatus.forEach(...)`.

- [ ] **Step 2: Verificar no browser**

Recarregar a aba "Entregas por empresa".
Expected: 5 cards de KPI com números coerentes (itens mapeados = soma; % de concluído; pendências; nº empresas; nº processos). Conferir escuro+claro.

- [ ] **Step 3: Commit (com aval do Eduardo)**

```bash
git add js/app.js
git commit -m "feat(dashboard): KPIs de entregas por empresa

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Filtro de status + matriz Empresa × Processo

**Files:**
- Modify: `js/app.js` (substituir os stubs `empFilters` e `empMatrix`)

- [ ] **Step 1: Implementar `empFilters`**

```js
function empFilters(host, data) {
  if (!host) return;
  const byKey = new Map(); let totAll = 0;
  data.byStatus.forEach((qtd, label) => { byKey.set(label, qtd); totAll += qtd; });
  clear(host);
  const chip = (key, label, n, cls) => {
    const b = h("button", { class: "fchip" + (App.empFilter === key ? " on" : ""), "data-k": key },
      h("span", { class: "dot " + (cls || "") }),
      h("span", { class: "lb" }, label),
      h("span", { class: "n" }, String(n)));
    b.addEventListener("click", () => { App.empFilter = key; empPaint(); });
    return b;
  };
  host.appendChild(chip("all", "Todos", totAll, "all"));
  getStatusOptions().forEach((label) => { if (byKey.has(label)) host.appendChild(chip(label, label, byKey.get(label), statusClassFor(label) || "na")); });
}
```

- [ ] **Step 2: Implementar `empMatrix`**

```js
function empMatrix(table, data) {
  if (!table) return;
  const sel = App.empFilter;            // "all" | label de status
  const statuses = getStatusOptions();
  // escala (máximo) para a intensidade da rampa
  let max = 1;
  data.empresas.forEach((emp) => data.areas.forEach((area) => {
    const c = data.matrix.get(emp)?.get(area); if (!c) return;
    const v = sel === "all" ? c.total : (c.status.get(sel) || 0);
    if (v > max) max = v;
  }));
  const idxOf = (v) => { const r = v / (max || 1); return r <= 0.34 ? 0 : r <= 0.67 ? 1 : 2; };

  clear(table);
  // thead
  const trh = h("tr", {}, h("th", { class: "corner rh" }, "Empresa"));
  data.areas.forEach((a) => trh.appendChild(h("th", { title: a }, a)));
  trh.appendChild(h("th", { class: "col-tot" }, "Total"));
  table.appendChild(h("thead", {}, trh));
  // tbody
  const tb = h("tbody", {});
  data.empresas.forEach((emp) => {
    const tr = h("tr", {}, h("th", { class: "rh" }, emp));
    let rowTot = 0; const rowComp = new Map();
    data.areas.forEach((area) => {
      const c = data.matrix.get(emp)?.get(area);
      const v = !c ? 0 : (sel === "all" ? c.total : (c.status.get(sel) || 0));
      if (c) { rowTot += c.total; c.status.forEach((q, st) => rowComp.set(st, (rowComp.get(st) || 0) + q)); }
      const td = h("td", {});
      if (!c || v === 0) { td.appendChild(h("div", { class: "emp-cell empty" }, "·")); tr.appendChild(td); return; }
      const ramp = sel === "all" ? RAMP_TOTAL : rampFor(sel);
      const i = idxOf(v);
      let compHtml = "";
      if (sel === "all") {
        compHtml = '<div class="comp">' + statuses.map((st) => {
          const q = c.status.get(st) || 0; if (!q) return "";
          return `<i style="background:var(--st-${statusClassFor(st) || "na"});width:${q / c.total * 100}%"></i>`;
        }).join("") + "</div>";
      }
      const cellEl = h("div", { class: "emp-cell has", tabindex: "0", role: "button",
        style: { background: ramp[i], color: ramp[3] },
        html: `<span>${v}</span>${compHtml}` });
      cellEl.addEventListener("click", () => empGoTo(c));
      cellEl.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); empGoTo(c); } });
      cellEl.addEventListener("mouseenter", (e) => empTip(e, emp, area, c));
      cellEl.addEventListener("mousemove", (e) => empTip(e, emp, area, c, true));
      cellEl.addEventListener("mouseleave", empTipHide);
      td.appendChild(cellEl); tr.appendChild(td);
    });
    // total + minibar
    const bar = statuses.map((st) => { const q = rowComp.get(st) || 0; return q ? `<i style="background:var(--st-${statusClassFor(st) || "na"});width:${q / rowTot * 100}%"></i>` : ""; }).join("");
    tr.appendChild(h("td", { class: "tot td-tot" }, h("div", { class: "emp-cell tot-cell" }, h("span", {}, String(rowTot)), h("span", { class: "minibar", html: bar }))));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
}
```

> `empGoTo`, `empTip`, `empTipHide` entram na Task 5 (deixe stubs por enquanto: `function empGoTo(){} function empTip(){} function empTipHide(){}`).

- [ ] **Step 3: Verificar no browser (escuro + claro)**

Recarregar a aba.
Expected: chips de filtro (Todos + um por status presente) com contagens; clicar num chip recolore a matriz e atualiza o hint; em "Todos" cada célula mostra o total + barrinha de composição; com um status selecionado, mostra só aquele status na rampa daquela cor; coluna "Total" com minibar. Contraste OK nos 2 temas.

- [ ] **Step 4: Commit (com aval do Eduardo)**

```bash
git add js/app.js
git commit -m "feat(dashboard): matriz empresa x processo com filtro de status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Navegação direta à célula + tooltip

**Files:**
- Modify: `js/app.js` (substituir os stubs `empGoTo`, `empTip`, `empTipHide`)

- [ ] **Step 1: Implementar a navegação**

```js
function empGoTo(c) {
  if (!c || !c.targets.length) return;
  const sel = App.empFilter;
  const t = (sel !== "all" && c.targets.find((x) => x.status === sel)) || c.targets[0];
  goToCell(App.project.id, t.sheetId, t.row, t.col);
}
```

- [ ] **Step 2: Implementar o tooltip flutuante**

```js
function empTipHide() { const t = document.getElementById("emp-tip"); if (t) t.classList.remove("show"); }
function empTipEl() {
  let t = document.getElementById("emp-tip");
  if (!t) { t = h("div", { id: "emp-tip" }); document.body.appendChild(t); }
  return t;
}
function empTip(e, emp, area, c, moveOnly) {
  const t = empTipEl();
  if (!moveOnly) {
    const rows = getStatusOptions().filter((st) => c.status.get(st)).map((st) =>
      `<div class="tt-r"><span class="sw" style="background:var(--st-${statusClassFor(st) || "na"})"></span>${escapeHtml(st)}<span class="v">${c.status.get(st)}</span></div>`).join("");
    t.innerHTML = `<div class="tt-h">${escapeHtml(emp)} · ${escapeHtml(area)}</div>${rows}<div class="tt-f">Clique → abrir a aba na célula</div>`;
    t.classList.add("show");
  }
  const pad = 14, w = t.offsetWidth, hh = t.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + hh > innerHeight - 8) y = e.clientY - hh - pad;
  t.style.left = x + "px"; t.style.top = y + "px";
}
```

> O `#emp-tip` é criado uma vez no `<body>` e reusado. Ao sair da aba não precisa removê-lo (fica oculto). Opcional: em `showDashboard`, no início, `document.getElementById("emp-tip")?.classList.remove("show")`.

- [ ] **Step 3: Verificar no browser**

Recarregar a aba. Passar o mouse numa célula → tooltip com a composição de status. Clicar numa célula → **abre a aba e seleciona a célula** do item (a grade rola/seleciona row/col). Com filtro de status ativo, o clique abre o item daquele status. Conferir escuro+claro.
Expected: navegação leva exatamente à célula; tooltip legível e sem vazar da tela.

- [ ] **Step 4: Commit (com aval do Eduardo)**

```bash
git add js/app.js
git commit -m "feat(dashboard): navegacao direta a celula + tooltip de composicao

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Gráfico "Entregas por empresa" (barras) + donut "Distribuição"

**Files:**
- Modify: `js/app.js` (substituir os stubs `empBars` e `empDonut`)

- [ ] **Step 1: Implementar `empBars`**

```js
function empBars(data) {
  const host = document.getElementById("emp-bars"); if (!host) return;
  const statuses = getStatusOptions();
  const isPend = (st) => { const k = statusClassFor(st) || "na"; return k === "pendente" || k === "analise" || k === "parcial"; };
  const rows = data.empresas.map((emp) => {
    const agg = new Map(); let tot = 0;
    data.areas.forEach((area) => { const c = data.matrix.get(emp)?.get(area); if (!c) return; c.status.forEach((q, st) => agg.set(st, (agg.get(st) || 0) + q)); tot += c.total; });
    let pend = 0; agg.forEach((q, st) => { if (isPend(st)) pend += q; });
    return { emp, agg, tot, pend };
  }).filter((r) => r.tot > 0).sort((a, b) => b.pend - a.pend);
  clear(host);
  rows.forEach((r) => {
    const seg = statuses.map((st) => { const q = r.agg.get(st) || 0; return q ? `<i style="background:var(--st-${statusClassFor(st) || "na"});width:${q / r.tot * 100}%" title="${escapeHtml(st)}: ${q}"></i>` : ""; }).join("");
    const row = h("div", { class: "bar-row" },
      h("div", { class: "top" }, h("span", { class: "nm" }, r.emp), h("span", { class: "tt", html: `<b>${r.pend}</b> pend · ${r.tot} itens` })),
      h("div", { class: "track", html: seg }));
    row.addEventListener("click", () => { App.empFilter = "all"; empPaint(); toast(`Empresa: ${r.emp} — ${r.tot} itens, ${r.pend} pendência(s).`); });
    host.appendChild(row);
  });
}
```

- [ ] **Step 2: Implementar `empDonut`**

```js
function empDonut(data) {
  const host = document.getElementById("emp-dist"); if (!host) return;
  const statuses = getStatusOptions().filter((st) => data.byStatus.get(st));
  let tot = 0; statuses.forEach((st) => tot += data.byStatus.get(st));
  const r = 54, c = 2 * Math.PI * r, cx = 70, cy = 70; let off = 0, parts = "";
  statuses.forEach((st) => {
    const v = data.byStatus.get(st), len = v / (tot || 1) * c;
    parts += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--st-${statusClassFor(st) || "na"})" stroke-width="17" stroke-dasharray="${len - 2} ${c - len + 2}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len;
  });
  const svg = `<svg viewBox="0 0 140 140" width="138" height="138">${parts}<text x="70" y="66" text-anchor="middle" class="dn-num">${tot}</text><text x="70" y="84" text-anchor="middle" class="dn-lab">itens</text></svg>`;
  const leg = statuses.map((st) => {
    const v = data.byStatus.get(st), pc = tot ? Math.round(v / tot * 100) : 0;
    return `<div class="row"><span class="sw" style="background:var(--st-${statusClassFor(st) || "na"})"></span><span class="lb">${escapeHtml(st)}</span><span class="vl">${v}</span><span class="pc">${pc}%</span></div>`;
  }).join("");
  clear(host);
  host.appendChild(h("div", { class: "donut", html: svg }));
  host.appendChild(h("div", { class: "dleg", html: leg }));
}
```

- [ ] **Step 3: Verificar no browser (escuro + claro)**

Recarregar a aba.
Expected: barras empilhadas por empresa, ordenadas por pendências (mais críticas no topo), com "X pend · Y itens"; donut com a distribuição total + legenda com % por status. Clicar numa barra mostra um toast. Conferir os 2 temas.

- [ ] **Step 4: Commit (com aval do Eduardo)**

```bash
git add js/app.js
git commit -m "feat(dashboard): barras por empresa + donut de distribuicao de status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: CSS — portar o visual do mockup (escopo `.dash-emp`)

**Files:**
- Modify: `styles/app-ds.css` (anexar bloco no fim, comentado)

- [ ] **Step 1: Anexar o CSS**

Cole no fim de `styles/app-ds.css` (usa os tokens do DS v2 já carregados; semáforo `--st-*` vem de `tokens.css`):

```css
/* ===== Dashboard "Entregas por empresa" (portado de mockups/dashboard_entregas_empresa.html) ===== */
.dash-emp{padding:18px 22px 40px}
.dash-emp .emp-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--gap);margin-bottom:var(--gap)}
@media (max-width:1080px){.dash-emp .emp-kpis{grid-template-columns:repeat(2,1fr)}}
.dash-emp .stat .ico.c-total{background:var(--blue)}
.dash-emp .stat .ico.c-ok{background:var(--st-recebido)}
.dash-emp .stat .ico.c-pend{background:var(--st-pendente);color:#3a1f02}
.dash-emp .stat .ico.c-emp{background:var(--purple)}
.dash-emp .stat .ico.c-proc{background:var(--cyan)}
.dash-emp .s-value small{font-size:12.5px;font-weight:500;color:var(--text-dim);margin-left:2px}

.dash-emp .emp-main{display:grid;grid-template-columns:1.62fr 1fr;gap:var(--gap);align-items:start}
.dash-emp .emp-rail{display:flex;flex-direction:column;gap:var(--gap)}
@media (max-width:1080px){.dash-emp .emp-main{grid-template-columns:1fr}}
.dash-emp .card-head .hint{font-size:11.5px;color:var(--text-dim)}
.dash-emp .emp-note{margin-top:12px;font-size:11.5px;color:var(--text-dim);line-height:1.6}

/* filtros */
.dash-emp .emp-filters{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:6px}
.dash-emp .fchip{cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted);border-radius:999px;padding:5px 11px 5px 9px;font:500 12px var(--font);display:inline-flex;align-items:center;gap:7px;transition:all .14s ease}
.dash-emp .fchip .dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--blue)}
.dash-emp .fchip .dot.recebido{background:var(--st-recebido)}
.dash-emp .fchip .dot.pendente{background:var(--st-pendente)}
.dash-emp .fchip .dot.analise{background:var(--st-analise)}
.dash-emp .fchip .dot.parcial{background:var(--st-parcial)}
.dash-emp .fchip .dot.na{background:var(--st-na)}
.dash-emp .fchip .lb{color:var(--text)}
.dash-emp .fchip .n{color:var(--text-dim);font-variant-numeric:tabular-nums}
.dash-emp .fchip:hover{border-color:var(--text-dim);color:var(--text)}
.dash-emp .fchip.on{border-color:transparent;background:var(--hover);box-shadow:inset 0 0 0 1.5px var(--blue)}

/* matriz */
.dash-emp .emp-mx-scroll{overflow-x:auto;margin-top:4px}
.dash-emp table.emp-mx{border-collapse:separate;border-spacing:0;width:100%;font-variant-numeric:tabular-nums}
.dash-emp .emp-mx th,.dash-emp .emp-mx td{padding:0}
.dash-emp .emp-mx thead th{position:sticky;top:0;background:var(--card-bg);z-index:2;font-size:11px;font-weight:500;color:var(--text-dim);text-align:center;padding:0 4px 9px;vertical-align:bottom;line-height:1.25}
.dash-emp .emp-mx thead th.corner{text-align:left}
.dash-emp .emp-mx th.col-tot,.dash-emp .emp-mx td.tot{border-left:1px solid var(--divider)}
.dash-emp .emp-mx th.rh{position:sticky;left:0;z-index:1;background:var(--card-bg);text-align:left;font-size:12.5px;font-weight:500;color:var(--text);padding:0 14px 0 2px;white-space:nowrap;vertical-align:middle}
.dash-emp .emp-mx tbody tr{height:40px}
.dash-emp .emp-mx tbody tr:hover .rh{color:var(--blue)}
.dash-emp .emp-cell{position:relative;height:34px;margin:2px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;cursor:pointer;user-select:none;background:var(--input-bg);color:var(--text-dim);transition:transform .12s ease,box-shadow .12s ease;outline:none}
.dash-emp .emp-cell.empty{cursor:default;opacity:.5;font-weight:400}
.dash-emp .emp-cell.has:hover{transform:translateY(-1px);box-shadow:0 0 0 2px var(--card-bg),0 0 0 3.5px var(--blue)}
.dash-emp .emp-cell.has:focus-visible{box-shadow:0 0 0 2px var(--card-bg),0 0 0 3.5px var(--blue)}
.dash-emp .emp-cell .comp{position:absolute;left:5px;right:5px;bottom:3px;height:3px;border-radius:2px;display:flex;overflow:hidden;opacity:.92}
.dash-emp .emp-cell .comp i{height:100%}
.dash-emp .emp-cell.tot-cell{background:transparent;cursor:default;flex-direction:column;gap:3px;font-weight:700;color:var(--text)}
.dash-emp .minibar{width:54px;height:5px;border-radius:3px;display:flex;overflow:hidden;background:var(--divider)}
.dash-emp .minibar i{height:100%}

/* barras */
.dash-emp .emp-bars{display:flex;flex-direction:column;gap:11px}
.dash-emp .bar-row{cursor:pointer}
.dash-emp .bar-row .top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}
.dash-emp .bar-row .nm{font-size:12.5px;color:var(--text)}
.dash-emp .bar-row .tt{font-size:11.5px;color:var(--text-dim);font-variant-numeric:tabular-nums}
.dash-emp .bar-row .tt b{color:var(--st-pendente);font-weight:700}
.dash-emp .track{height:14px;border-radius:4px;display:flex;overflow:hidden;background:var(--divider)}
.dash-emp .track i{height:100%;transition:filter .14s ease}
.dash-emp .bar-row:hover .track i{filter:brightness(1.08)}

/* donut */
.dash-emp .emp-dist{display:flex;align-items:center;gap:18px}
.dash-emp .dn-num{font-size:24px;font-weight:700;fill:var(--text)}
.dash-emp .dn-lab{font-size:10.5px;fill:var(--text-dim)}
.dash-emp .dleg{display:flex;flex-direction:column;gap:9px;flex:1}
.dash-emp .dleg .row{display:flex;align-items:center;gap:9px;font-size:12.5px}
.dash-emp .dleg .row .sw{width:11px;height:11px;border-radius:3px;flex:none}
.dash-emp .dleg .row .lb{color:var(--text-muted);flex:1}
.dash-emp .dleg .row .vl{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.dash-emp .dleg .row .pc{color:var(--text-dim);font-size:11px;width:38px;text-align:right}

/* estado vazio */
.dash-emp .emp-empty{padding:48px 28px;text-align:center;color:var(--text-muted)}
.dash-emp .emp-empty h3{color:var(--text);font-weight:500;margin-bottom:8px}
.dash-emp .emp-empty p{max-width:520px;margin:0 auto;font-size:13px;line-height:1.6}

/* tooltip (global, fora do .dash-emp pois vive no body) */
#emp-tip{position:fixed;z-index:60;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease;background:var(--card-bg);border:1px solid var(--border);border-radius:7px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:10px 12px;min-width:178px;font-size:12px}
#emp-tip.show{opacity:1;transform:translateY(0)}
#emp-tip .tt-h{font-weight:600;color:var(--text);margin-bottom:7px;font-size:12.5px}
#emp-tip .tt-r{display:flex;align-items:center;gap:8px;color:var(--text-muted);margin:3px 0}
#emp-tip .tt-r .sw{width:9px;height:9px;border-radius:50%;flex:none}
#emp-tip .tt-r .v{margin-left:auto;color:var(--text);font-weight:600}
#emp-tip .tt-f{margin-top:8px;padding-top:7px;border-top:1px solid var(--divider);color:var(--blue);font-size:11px;font-weight:500}
```

- [ ] **Step 2: Verificar no browser (escuro + claro)**

Recarregar a aba. 
Expected: visual praticamente idêntico ao mockup `mockups/dashboard_entregas_empresa.html` nos 2 temas; matriz com rolagem horizontal se faltar largura; foco visível ao tabular nas células.

- [ ] **Step 3: Commit (com aval do Eduardo)**

```bash
git add styles/app-ds.css
git commit -m "feat(dashboard): estilos da aba entregas por empresa (DS v2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Auditoria de cor/contraste (`dudu-check-cores`) + polimento de estados

**Files:**
- Modify: `styles/app-ds.css` e/ou `js/app.js` (só se a auditoria apontar)

- [ ] **Step 1: Rodar a skill `dudu-check-cores`** sobre a aba "Entregas por empresa" (escopo = uma tela), nos 2 temas. Focar:
  - células do heatmap (texto da rampa sobre as tintas — as rampas são as mesmas de `renderDashUsers`, já validadas, mas reconfirmar);
  - `--text-dim` em micro-rótulos (hint, `.n`, `.pc`, legenda) — token do DS fica ~3.5:1; aceitar (texto secundário/decorativo) ou subir p/ `--text-muted` onde for leitura importante;
  - chips de filtro (`.fchip.on` com `box-shadow inset`), donut e barras.

- [ ] **Step 2: Aplicar só os ajustes de cor/fonte que a skill recomendar** (preview antes/depois → aprovação do Eduardo). Não mexer em layout/tamanho.

- [ ] **Step 3: Conferir estados** — loading (spinner), vazio ("Nada para mostrar ainda"), erro (mensagem). Forçar o vazio num projeto sem empresas reconhecidas.

- [ ] **Step 4: Definition of Done** (`Central.md` § 🎨): consultei o modelo? olhei a tela toda? cor semântica/distinta? ícone↔rótulo? WCAG AA claro+escuro conferido? verifiquei nos 2 temas no 5500?

- [ ] **Step 5: Commit (com aval do Eduardo)** — se houve ajuste.

```bash
git add styles/app-ds.css js/app.js
git commit -m "fix(dashboard): contraste e estados da aba entregas por empresa (WCAG AA)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Atualizar a Central do projeto + fechamento

**Files:**
- Modify: `projeto/Inventario.md` (linha de Telas/Visões), `projeto/Central.md` (Onde estamos / Itens)

- [ ] **Step 1:** Em `projeto/Inventario.md`, na tabela "Telas / Visões", acrescentar a linha:
  `| **Dashboard — aba Entregas por empresa** | app.js (renderDashEmpresa) + styles/app-ds.css | ✅ — matriz Empresa×Processo(Área), filtro de status, barras por empresa, donut, navegação direta à célula |`
- [ ] **Step 2:** Rodar a skill `eqtl-checkpoint` (ou atualizar manualmente) para registrar a Entrega e o status dos itens.
- [ ] **Step 3: Commit final (com aval do Eduardo)**

```bash
git add projeto/
git commit -m "docs(projeto): registra a aba Entregas por empresa na Central

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (feita)

- **Cobertura da spec:** matriz Empresa×Processo(Área) ✅ (T1, T4) · filtro de status ✅ (T4) · navegação direta à célula ✅ (T5, reusa `goToCell`) · gráfico por empresa ✅ (T6) · KPIs ✅ (T3) · donut distribuição ✅ (T6) · sem prazo/SLA ✅ (fora de escopo) · DS v2 + dark/light + WCAG ✅ (T7, T8) · sem build step ✅ (SVG/CSS, sem Chart.js).
- **Placeholders:** os stubs vazios são **temporários e intencionais** (cada um é substituído por código completo na sua task). Removida a linha morta do `empKpis` (Task 3 Step 1 avisa para não incluí-la).
- **Consistência de nomes:** `computeEmpresaAreaData`, `renderDashEmpresa`, `empPaint`, `empKpis`, `empFilters`, `empMatrix`, `empBars`, `empDonut`, `empGoTo`, `empTip`/`empTipHide`/`empTipEl`, `RAMP_TOTAL`, `App.empFilter`, `App._empData` — usados igual em todas as tasks. Estrutura da célula: `{ status:Map, total, targets:[{sheetId,row,col,status}] }` consistente entre T1, T4 e T5.
- **Reuso (não-placeholder):** `parseAbas`, `getCompanies`, `getStatusOptions`, `statusClassFor`, `STATUS_RAMP`/`rampFor`, `goToCell`, `h`/`$`/`clear`/`toast`/`escapeHtml` — todos já existem e estão importados em `app.js`.

## Riscos / pontos a validar com dado real
- **Performance:** `parseAbas` lê as células de todas as abas. Se ficar pesado, cachear (ex.: reaproveitar `App._abaCounts`/uma flag) — adiar até medir (YAGNI).
- **Área↔aba:** depende de as Solicitações estarem semeadas (`sheet_link`/`area`). Sem isso, tudo cai em "(sem área)" — o estado vazio e a coluna "(sem área)" cobrem o caso.
- **Mapeamento de status→classe:** `statusClassFor` cobre os 5 padrões; status fora do padrão caem em `na` (cinza) — aceitável.
