# Dashboard (aba Usuários) — números clicáveis, fix do modal e gráfico de entregas — Plano de Implementação

> **Para quem executa:** este projeto **não tem framework de testes** (regra de ouro do `CLAUDE.md`: "Verificação é no browser, dark + light"). Onde um plano TDD pediria um teste automatizado, aqui o passo de verificação é **abrir em `http://localhost:5500`, logar com as credenciais de QA, abrir um projeto → aba Usuários e conferir nos dois temas**. Cada tarefa termina rodando o checklist **Definition of Done** (§ 🎨 Painel de Design da Central). Steps com checkbox (`- [ ]`).

**Goal:** Na aba **Usuários** do dashboard: tornar **todos os números** das duas tabelas clicáveis (abrindo o drill de entregas filtrado pelo cruzamento), **corrigir a deformatação** do modal de entregas e adicionar um **gráfico de linha** (estilo "Earnings Graph") com **uma linha por pessoa**, **tags rosto+nome** que filtram só o gráfico e o **total** exibido como número grande e tênue no cabeçalho.

**Architecture:** Tudo vive em `js/app.js` (vanilla, sem módulos novos) + CSS em `styles/app-ds.css`. O drill atual `openUserDrill(user)` é generalizado para `openDeliveriesDrill(ctx)` aceitando filtros `{userId|userIds, status, day, since}`, reusando o agrupamento empresa→aba→célula já existente. As tabelas (`buildMatrix`/`buildDaily`) passam a montar células e totais com `onClick` que chamam o drill com o contexto certo. O gráfico usa **Chart.js 4.4.1** (já carregado global em `index.html`) replicando o padrão de `js/ds.js` (gradiente de área, `tension .45`, `pointRadius 0`).

**Tech Stack:** Vanilla JS estático, Chart.js 4.4.1 (global `window.Chart`), CSS com tokens do DS v2 (`--blue`, `--grid-line`, `--text-dim`, `--card-bg`, `--border`, `--hover`, `--font`). Sem build step.

**Decisões de design já alinhadas (Eduardo, 2026-06-25):**
1. **Tudo clicável** — cada cruzamento abre o drill filtrado; totais de coluna = usuário inteiro; totais de linha (status) = todos os usuários daquele status; total geral = tudo.
2. **Uma linha por pessoa** no gráfico; tags ligam/desligam a linha de cada pessoa.
3. **Total** mostrado como **número grande e tênue no cabeçalho** do card do gráfico (reflete as pessoas visíveis).

Default assumido: o gráfico fica **abaixo do card "Entregas por dia", só na aba Usuários**, no estilo Earnings Graph.

**Mapa de arquivos:**
- Modificar: `js/app.js` — `heatTd` (assinatura + onClick), novos helpers `usersSince`/`totTd`/`cssVar`/`colorToRgba`, refactor `openUserDrill`→`openDeliveriesDrill`, `buildMatrix`/`buildDaily` (wiring de clique), `renderDashUsers` (chamar o card do gráfico), nova `buildDeliveryChartCard`.
- Modificar: `styles/app-ds.css` — fix do modal (`.modal.u-drill-modal`, `.u-drill`), estilos do card do gráfico (`.u-chart-head`, `.u-chart-total`, `.u-chart-wrap`, `.u-chart-tags`, `.dchip`).
- Modificar: `index.html` — bump de cache `?v=18`→`?v=19` (só no fim, para publicar).

---

## Task 1: Generalizar o drill — `openDeliveriesDrill(ctx)` + helper `usersSince`

**Files:**
- Modify: `js/app.js` — substituir `openUserDrill` (atual em ~1540-1596) e adicionar `usersSince`.

- [ ] **Step 1: Adicionar o helper `usersSince` logo antes de `openUserDrill`**

Insere acima do bloco do drill (perto da linha 1539, depois de `function kpi(...)`):

```js
/* início do período selecionado (7/30 dias) ou null em "Tudo" — para o drill bater com os números da tabela */
function usersSince() {
  const d = App.usersPeriod === "7" ? 7 : App.usersPeriod === "30" ? 30 : null;
  return d ? new Date(Date.now() - d * 86400000) : null;
}
```

- [ ] **Step 2: Substituir `openUserDrill` por `openDeliveriesDrill` + wrapper**

Troca toda a função `async function openUserDrill(user) { ... }` (1542-1596) por:

```js
/* P6 — modal amplo de drill de entregas (mudanças de status em células do
   cruzamento Empresa×Status), agrupadas por empresa → aba, expansíveis até a célula.
   ctx: { title, user?, userId?, userIds?(Set), status?, day?(YYYY-MM-DD), since?(Date) } */
async function openDeliveriesDrill(ctx = {}) {
  const { title = "Entregas", user = null, userId = null, userIds = null, status = null, day = null, since = null } = ctx;
  const scrim = h("div", { class: "scrim" });
  const close = () => scrim.remove();
  const bodyEl = h("div", { class: "u-drill" }, h("div", { class: "spinner", style: { margin: "40px auto" } }));
  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-primary", onClick: close }, "Fechar"));
  const headIcon = user ? avatarEl(user, 32)
    : status ? h("span", { class: "chip " + (statusClassFor(status) || "na") }, status)
    : null;
  const head = h("div", { class: "u-drill-head" }, headIcon, h("h3", { style: { margin: 0 } }, title));
  const modal = h("div", { class: "modal wide u-drill-modal" }, head, bodyEl, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);

  let data, changes;
  try {
    data = await getEmpData();
    const opts = {};
    if (userId) opts.userId = userId;
    if (since) opts.since = since;
    changes = await store.loadStatusChanges(App.sheets.map((s) => s.id), opts);
  } catch (e) { clear(bodyEl); bodyEl.appendChild(h("p", { class: "muted", style: { padding: "20px" } }, "Erro ao carregar: " + (e.message || e))); return; }

  const statusSet = new Set(getStatusOptions().map((s) => String(s).trim().toLowerCase()));
  const wantStatus = status ? normStatusLabel(status).toLowerCase() : null;
  const byEmp = new Map();   // empresa -> Map(sheetName -> {sheetId, items:[{row,col,status,changed_at}]})
  let total = 0;
  for (const ch of changes) {
    const nv = String(ch.new_value || "").trim(); if (!nv || !statusSet.has(nv.toLowerCase())) continue;
    if (wantStatus && normStatusLabel(nv).toLowerCase() !== wantStatus) continue;
    if (day && String(ch.changed_at).slice(0, 10) !== day) continue;
    if (userIds && !userIds.has(ch.changed_by)) continue;
    const ci = data.cellIndex.get(ch.sheet_id + ":" + ch.row + ":" + ch.col); if (!ci) continue;
    total++;
    if (!byEmp.has(ci.empresa)) byEmp.set(ci.empresa, new Map());
    const sm = byEmp.get(ci.empresa);
    if (!sm.has(ci.sheetName)) sm.set(ci.sheetName, { sheetId: ci.sheetId, items: [] });
    sm.get(ci.sheetName).items.push({ row: ch.row, col: ch.col, status: nv, changed_at: ch.changed_at });
  }

  clear(bodyEl);
  if (!total) { bodyEl.appendChild(h("p", { class: "muted", style: { padding: "24px", textAlign: "center" } }, "Sem entregas (mudanças de status em células do cruzamento) para este filtro.")); return; }
  bodyEl.appendChild(h("p", { class: "sub", style: { margin: "0 0 12px" } }, `${total} entrega(s) em ${byEmp.size} empresa(s). Expanda uma aba para ver as células e ir direto nelas.`));

  [...byEmp.keys()].sort((a, b) => a.localeCompare(b, "pt")).forEach((emp) => {
    const sm = byEmp.get(emp);
    let empTot = 0; sm.forEach((v) => empTot += v.items.length);
    const grp = h("div", { class: "ud-emp" });
    grp.appendChild(h("div", { class: "ud-emp-h" }, h("span", { class: "ud-emp-nm" }, emp), h("span", { class: "ud-emp-n" }, String(empTot))));
    [...sm.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt")).forEach(([sheetName, info]) => {
      const det = h("details", { class: "ud-aba" });
      det.appendChild(h("summary", {}, h("span", { class: "ud-aba-nm" }, sheetName), h("span", { class: "ud-aba-n" }, String(info.items.length))));
      const list = h("div", { class: "ud-cells" });
      info.items.sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at))).forEach((it) => {
        list.appendChild(h("div", { class: "ud-cell" },
          h("span", { class: "chip " + (statusClassFor(it.status) || "na") }, it.status),
          h("span", { class: "ud-when" }, fmtDate(it.changed_at)),
          h("button", { class: "btn btn-ghost btn-sm", onClick: () => { close(); goToCell(App.project.id, info.sheetId, it.row, it.col); } }, "Ir à célula")));
      });
      det.appendChild(list);
      grp.appendChild(det);
    });
    bodyEl.appendChild(grp);
  });
}

/* wrapper compatível: cabeçalhos de linha/coluna continuam chamando openUserDrill(u) */
function openUserDrill(user) {
  return openDeliveriesDrill({ title: "Entregas de " + (user.name || "—"), user, userId: user.id, since: usersSince() });
}
```

Notas: o filtro de status compara via `normStatusLabel(...).toLowerCase()` (mesma normalização da matriz, ex.: `na`→`N/A`); o filtro de dia usa `String(changed_at).slice(0,10)` (idêntico ao usado em `renderDashUsers`/`buildDaily`, garantindo que o número clicado bate com o conteúdo).

- [ ] **Step 3: Verificar no browser (cabeçalhos ainda funcionam)**

`http://localhost:5500` → login QA → abrir projeto → aba **Usuários**. Clicar no **avatar de uma pessoa** (coluna) e no **nome de uma pessoa** (linha em Usuário×Status). Esperado: modal "Entregas de X" abre e lista as entregas. (A correção visual do modal é a Task 3 — aqui só valide que abre e popula.)

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "refactor(dashboard): generaliza drill de entregas (openDeliveriesDrill) com filtros usuario/status/dia"
```

---

## Task 2: Tornar **todos os números** clicáveis em `buildMatrix` e `buildDaily`

**Files:**
- Modify: `js/app.js` — `heatTd` (~1532), novo `totTd`, `buildMatrix` (~1693), `buildDaily` (~1736).

- [ ] **Step 1: Estender `heatTd` para aceitar `onClick` e adicionar `totTd`**

Substitui a função `heatTd` (1532-1537) por:

```js
function heatTd(v, ramp, max, onClick) {
  const cell = h("div", { class: "hcell" }, v ? String(v) : "·");
  if (v) { const ratio = v / (max || 1); const i = ratio <= 0.34 ? 0 : ratio <= 0.67 ? 1 : 2; cell.style.background = ramp[i]; cell.style.color = ramp[3]; }
  else cell.style.color = "#aab2bd";
  const attrs = (v && onClick) ? { class: "u-click", title: "Ver entregas", onClick } : {};
  return h("td", attrs, cell);
}
/* célula de total clicável (col/linha/geral); só clica se houver valor */
function totTd(n, onClick) {
  const attrs = (n && onClick) ? { class: "tot u-click", title: "Ver entregas", onClick } : { class: "tot" };
  return h("td", attrs, String(n));
}
```

- [ ] **Step 2: Reescrever `buildMatrix` com cliques em células e totais**

Substitui toda `function buildMatrix(...)` (1693-1734) por:

```js
function buildMatrix(orient, users, statuses, count, mmax, total, rowByUser, colByStatus) {
  const wrap = h("div", { class: "u-tablewrap" });
  const table = h("table", { class: "umx" });
  const allIds = new Set(users.map((u) => u.id));
  const cellDrill = (u, st) => openDeliveriesDrill({ title: "Entregas de " + u.name + " · " + st, user: u, userId: u.id, status: st, since: usersSince() });
  const userDrill = (u) => openDeliveriesDrill({ title: "Entregas de " + u.name, user: u, userId: u.id, since: usersSince() });
  const statusDrill = (st) => openDeliveriesDrill({ title: "Entregas · " + st, status: st, userIds: allIds, since: usersSince() });
  const allDrill = () => openDeliveriesDrill({ title: "Todas as entregas", userIds: allIds, since: usersSince() });
  if (orient === "su") {
    const head = h("tr", {}, h("th", { class: "rh" }, "Status"));
    users.forEach((u) => head.appendChild(h("th", { class: "u-click u-col", title: "Ver entregas de " + u.name, onClick: () => userDrill(u) }, avatarEl(u, 24), h("span", { class: "u-col-nm" }, u.name))));
    head.appendChild(h("th", {}, "Total"));
    table.appendChild(h("thead", {}, head));
    const tb = h("tbody", {});
    statuses.forEach((st) => {
      const ramp = rampFor(st);
      const tr = h("tr", {}, h("td", { class: "rh" }, h("span", { class: "chip " + (statusClassFor(st) || "na") }, st)));
      users.forEach((u) => tr.appendChild(heatTd((count[u.id] || {})[st] || 0, ramp, mmax, () => cellDrill(u, st))));
      tr.appendChild(totTd(colByStatus(st), () => statusDrill(st)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const tf = h("tr", {}, h("td", { class: "rh" }, "Total"));
    users.forEach((u) => tf.appendChild(totTd(rowByUser(u.id), () => userDrill(u))));
    tf.appendChild(totTd(total, allDrill));
    table.appendChild(h("tfoot", {}, tf));
  } else {
    const head = h("tr", {}, h("th", { class: "rh" }, "Pessoa"));
    statuses.forEach((st) => head.appendChild(h("th", { class: "u-click", title: "Ver entregas · " + st, onClick: () => statusDrill(st) }, h("span", { class: "chip " + (statusClassFor(st) || "na") }, st))));
    head.appendChild(h("th", {}, "Total"));
    table.appendChild(h("thead", {}, head));
    const tb = h("tbody", {});
    users.forEach((u) => {
      const tr = h("tr", {}, h("td", { class: "rh u-click", title: "Ver entregas de " + u.name, onClick: () => userDrill(u) }, avatarEl(u, 24), h("span", { class: "u-nm" }, u.name)));
      statuses.forEach((st) => tr.appendChild(heatTd((count[u.id] || {})[st] || 0, rampFor(st), mmax, () => cellDrill(u, st))));
      tr.appendChild(totTd(rowByUser(u.id), () => userDrill(u)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const tf = h("tr", {}, h("td", { class: "rh" }, "Total"));
    statuses.forEach((st) => tf.appendChild(totTd(colByStatus(st), () => statusDrill(st))));
    tf.appendChild(totTd(total, allDrill));
    table.appendChild(h("tfoot", {}, tf));
  }
  wrap.appendChild(table);
  return wrap;
}
```

- [ ] **Step 3: Reescrever `buildDaily` com cliques em células e totais**

Substitui toda `function buildDaily(...)` (1736-1761) por:

```js
function buildDaily(users, dias, perDay, dmax) {
  const wrap = h("div", { class: "u-tablewrap" });
  const table = h("table", { class: "umx" });
  const ramp = STATUS_RAMP.recebido;
  const allIds = new Set(users.map((u) => u.id));
  const fmtDay = (iso) => { const p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : iso; };
  const userDrill = (u) => openDeliveriesDrill({ title: "Entregas de " + u.name, user: u, userId: u.id, since: usersSince() });
  const dayDrill = (d) => openDeliveriesDrill({ title: "Entregas · " + fmtDay(d), day: d, userIds: allIds, since: usersSince() });
  const cellDrill = (u, d) => openDeliveriesDrill({ title: "Entregas de " + u.name + " · " + fmtDay(d), user: u, userId: u.id, day: d, since: usersSince() });
  const head = h("tr", {}, h("th", { class: "rh" }, "Pessoa"));
  dias.forEach((d) => head.appendChild(h("th", { class: "u-click", title: "Ver entregas · " + fmtDay(d), onClick: () => dayDrill(d) }, fmtDay(d))));
  head.appendChild(h("th", {}, "Total"));
  table.appendChild(h("thead", {}, head));
  const tb = h("tbody", {});
  users.forEach((u) => {
    const tr = h("tr", {}, h("td", { class: "rh u-click", title: "Ver entregas de " + u.name, onClick: () => userDrill(u) }, avatarEl(u, 24), h("span", { class: "u-nm" }, u.name)));
    let t = 0;
    dias.forEach((d) => { const v = (perDay[u.id] || {})[d] || 0; t += v; tr.appendChild(heatTd(v, ramp, dmax, () => cellDrill(u, d))); });
    tr.appendChild(totTd(t, () => userDrill(u)));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  const tf = h("tr", {}, h("td", { class: "rh" }, "Total/dia"));
  let gt = 0;
  dias.forEach((d) => { let c = 0; users.forEach((u) => { c += (perDay[u.id] || {})[d] || 0; }); gt += c; tf.appendChild(totTd(c, () => dayDrill(d))); });
  tf.appendChild(totTd(gt, () => openDeliveriesDrill({ title: "Todas as entregas", userIds: allIds, since: usersSince() })));
  table.appendChild(h("tfoot", {}, tf));
  wrap.appendChild(table);
  return wrap;
}
```

- [ ] **Step 4: Garantir o ponteiro de cursor nas células de total clicáveis (CSS)**

Em `styles/app-ds.css`, perto da linha 433 (já existe `table.umx th.u-click, table.umx td.rh.u-click{ cursor:pointer; }`), trocar por uma regra que cubra também `td.u-click` e `td.tot.u-click`:

```css
table.umx th.u-click, table.umx td.u-click{ cursor:pointer; }
table.umx td.rh.u-click:hover .u-nm{ color:var(--blue); }
table.umx td.u-click:hover .hcell{ box-shadow:inset 0 0 0 1.5px var(--blue); }
table.umx td.tot.u-click:hover{ color:var(--blue); }
table.umx th.u-click:hover{ background:var(--hover); }
```

- [ ] **Step 5: Verificar no browser (dark + light)**

Aba Usuários. Conferir: clicar numa **célula interna** (ex.: Renan × Recebido) abre o modal só com aquele cruzamento; o número de entregas no topo do modal **bate** com o número da célula. Clicar num **Total de coluna** (pessoa) abre tudo daquela pessoa; **Total de linha** (status) abre todos os usuários daquele status; **Total geral** abre tudo. Repetir na tabela **Entregas por dia** (célula = pessoa+dia; Total/dia = todos do dia). Alternar **Status×Usuário / Usuário×Status** e conferir que os cliques continuam corretos. Hover mostra cursor de clique e realce.

- [ ] **Step 6: Commit**

```bash
git add js/app.js styles/app-ds.css
git commit -m "feat(dashboard): todos os numeros das tabelas de usuarios abrem o drill filtrado pelo cruzamento"
```

---

## Task 3: Corrigir a **deformatação** do modal de entregas

**Files:**
- Modify: `styles/app-ds.css` — regra de `.u-drill` (linha 436) + nova regra `.modal.u-drill-modal`.

Causa: o `.modal` é um bloco com `padding` fixo e sem `max-height`/flex; o `.u-drill` tem `max-height` própria e os filhos (flex items) **encolhem** (`flex-shrink:1`), comprimindo as linhas de empresa, e quando o modal fica mais alto que a viewport o `place-items:center` do `.scrim` **corta o topo**. Solução: o modal do drill vira **coluna flex limitada à viewport**, com **header/rodapé fixos** e **corpo rolável**; os filhos do corpo ganham `flex:0 0 auto` para não comprimir.

- [ ] **Step 1: Ajustar `.u-drill` (linha 436)**

Trocar:

```css
.u-drill{ display:flex; flex-direction:column; gap:10px; max-height:min(64vh,560px); overflow:auto; }
```

por:

```css
.u-drill{ display:flex; flex-direction:column; gap:10px; min-height:0; overflow:auto; }
.u-drill > *{ flex:0 0 auto; }   /* impede a compressão das linhas de empresa */
.u-drill-head{ display:flex; align-items:center; gap:10px; }
```

- [ ] **Step 2: Adicionar a regra do modal do drill (logo após o bloco do `.u-drill`, ~linha 452)**

```css
/* modal do drill de entregas: coluna flex limitada à viewport — header/rodapé fixos, corpo rola */
.modal.u-drill-modal{ display:flex; flex-direction:column; max-height:calc(100vh - 56px); }
.modal.u-drill-modal > *{ flex:0 0 auto; }
.modal.u-drill-modal > .u-drill{ flex:1 1 auto; min-height:0; }
```

- [ ] **Step 3: Verificar no browser (dark + light)**

Abrir o modal por uma pessoa com muitas entregas (ex.: Renan, 382). Esperado: o modal **não corta o topo**, fica centralizado e dentro da viewport; o **header ("Entregas de X") e o botão Fechar ficam fixos**; a lista de empresas rola dentro do corpo **sem comprimir** linhas; nenhuma linha "escapa" para fora do card. Conferir em janela baixa (altura reduzida) e nos dois temas. Expandir uma aba (`<details>`) e rolar.

- [ ] **Step 4: Commit**

```bash
git add styles/app-ds.css
git commit -m "fix(dashboard): modal de entregas nao deforma mais (coluna flex, corpo rolavel, sem corte do topo)"
```

---

## Task 4: Gráfico de **entregas ao longo do tempo** (Earnings Graph) + tags por pessoa + total no cabeçalho

**Files:**
- Modify: `js/app.js` — helpers `cssVar`/`colorToRgba`, nova `buildDeliveryChartCard`, e chamada em `renderDashUsers` (após `card2`).
- Modify: `styles/app-ds.css` — estilos do card do gráfico.

- [ ] **Step 1: Adicionar helpers de cor (uma vez), perto de `colorFromString`/topo dos helpers de dashboard (ex.: antes de `usersSince`)**

```js
/* lê uma CSS var do :root (cor do tema atual) */
function cssVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
/* converte qualquer cor CSS (hex/nome/rgb) em rgba(...,a) via normalização do canvas */
function colorToRgba(c, a) {
  const cx = (colorToRgba._cx || (colorToRgba._cx = document.createElement("canvas").getContext("2d")));
  cx.fillStyle = "#000"; cx.fillStyle = c; const s = cx.fillStyle;
  if (s[0] === "#") { const n = parseInt(s.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  return s.replace(/rgba?\(([^)]+)\)/, (_, p) => { const [r, g, b] = p.split(",").map((x) => x.trim()); return `rgba(${r},${g},${b},${a})`; });
}
```

- [ ] **Step 2: Adicionar `buildDeliveryChartCard` (logo após `buildDaily`, ~linha 1761)**

```js
/* card do gráfico: itens entregues por dia, UMA linha por pessoa (cor da pessoa),
   tags rosto+nome que ligam/desligam só a linha, total tênue no cabeçalho.
   `days` = todos os dias com atividade no período (sem o cap de 21 da tabela). */
function buildDeliveryChartCard(container, users, days, perDay) {
  if (App._deliveryChart) { try { App._deliveryChart.destroy(); } catch (_) {} App._deliveryChart = null; }
  const card = h("div", { class: "u-card" });
  const totalNode = h("span", { class: "v" }, "0");
  card.appendChild(h("div", { class: "u-chart-head" },
    h("div", {}, h("h3", {}, "Entregas ao longo do tempo"),
      h("span", { class: "sub" }, "itens entregues por dia · uma linha por pessoa")),
    h("div", { class: "u-chart-total" }, totalNode, h("span", { class: "l" }, "no período"))));
  const canvas = h("canvas");
  card.appendChild(h("div", { class: "u-chart-wrap" }, canvas));
  const tagsRow = h("div", { class: "u-chart-tags" });
  card.appendChild(tagsRow);
  container.appendChild(card);

  if (typeof Chart === "undefined" || !days.length) {
    card.appendChild(h("p", { class: "muted", style: { padding: "0 16px 16px" } }, "Sem dados para o gráfico."));
    return;
  }

  const fmtDay = (iso) => { const p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : iso; };
  const labels = days.map(fmtDay);
  const colorOf = (u) => u.color || colorFromString(u.id || u.name);
  const userTotal = (u) => days.reduce((s, d) => s + ((perDay[u.id] || {})[d] || 0), 0);
  const visible = new Set(users.map((u) => u.id));   // todos visíveis por padrão

  const updateTotal = () => { let t = 0; users.forEach((u) => { if (visible.has(u.id)) t += userTotal(u); }); totalNode.textContent = String(t); };

  let chart;
  const draw = () => {
    if (chart) { try { chart.destroy(); } catch (_) {} }
    const grid = cssVar("--grid-line") || "rgba(128,128,128,.15)";
    const txt = cssVar("--text-dim") || "#94a3b8";
    const areaFill = (color) => (ctx) => {
      const { ctx: c, chartArea } = ctx.chart; if (!chartArea) return colorToRgba(color, .2);
      const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, colorToRgba(color, .22)); g.addColorStop(1, colorToRgba(color, 0)); return g;
    };
    chart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets: users.map((u) => { const col = colorOf(u); return {
        label: u.name, data: days.map((d) => (perDay[u.id] || {})[d] || 0),
        borderColor: col, backgroundColor: areaFill(col), fill: true, tension: .45, pointRadius: 0, borderWidth: 2,
        hidden: !visible.has(u.id) }; }) },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: txt, precision: 0 } },
          x: { grid: { display: false }, border: { display: false }, ticks: { color: txt, maxRotation: 0, autoSkip: true } } } }
    });
    App._deliveryChart = chart;
  };
  draw();
  updateTotal();

  users.forEach((u, i) => {
    const chip = h("button", { class: "dchip", title: "Mostrar/ocultar " + u.name, onClick: () => {
      if (visible.has(u.id)) visible.delete(u.id); else visible.add(u.id);
      chip.classList.toggle("off", !visible.has(u.id));
      chart.setDatasetVisibility(i, visible.has(u.id));
      chart.update();
      updateTotal();
    } }, avatarEl(u, 20), h("span", {}, u.name));
    tagsRow.appendChild(chip);
  });

  // re-tema: reconstrói o gráfico com as cores do tema atual; solta o observer quando o canvas sai da tela
  const obs = new MutationObserver(() => { if (!canvas.isConnected) { obs.disconnect(); return; } draw(); });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
```

- [ ] **Step 3: Chamar o card em `renderDashUsers`, depois do `card2`**

Em `renderDashUsers`, logo após `body.appendChild(card2);` (linha ~1690), adicionar:

```js
  // gráfico de entregas ao longo do tempo (todos os dias do período, não só os 21 da tabela)
  buildDeliveryChartCard(body, users, [...daySet].sort(), perDay);
```

- [ ] **Step 4: Adicionar os estilos do card do gráfico em `styles/app-ds.css` (após o bloco `.u-card`/`.u-tablewrap`, ~linha 232)**

```css
/* ---- gráfico de entregas ao longo do tempo (aba Usuários) ---- */
.u-chart-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:12px 16px 0; }
.u-chart-head h3{ font-size:14px; font-weight:500; color:var(--text); }
.u-chart-head .sub{ font-size:11.5px; color:var(--text-dim); }
.u-chart-total{ text-align:right; line-height:1; flex:none; }
.u-chart-total .v{ font-size:26px; font-weight:300; color:var(--text-dim); font-variant-numeric:tabular-nums; }
.u-chart-total .l{ display:block; font-size:10.5px; color:var(--text-muted); margin-top:3px; }
.u-chart-wrap{ position:relative; width:100%; min-width:0; height:230px; padding:8px 16px 2px; }
.u-chart-tags{ display:flex; flex-wrap:wrap; gap:7px; padding:10px 16px 16px; }
.u-chart-tags .dchip{ cursor:pointer; border:1px solid var(--border); background:transparent; color:var(--text);
  border-radius:999px; padding:3px 11px 3px 3px; font:500 12px var(--font); display:inline-flex; align-items:center; gap:7px; transition:opacity .14s ease, border-color .14s ease; }
.u-chart-tags .dchip:hover{ border-color:var(--text-dim); }
.u-chart-tags .dchip.off{ opacity:.4; }
```

- [ ] **Step 5: Verificar no browser (dark + light)**

Aba Usuários, abaixo de "Entregas por dia": gráfico de linha estilo Earnings Graph com **uma linha por pessoa** (cor = avatar), área em gradiente, linhas suaves sem pontos. **Total tênue** no cabeçalho à direita ("no período"). **Tags** com rosto+nome: clicar **liga/desliga só a linha** daquela pessoa (matriz e tabelas **não mudam**) e o **total do cabeçalho acompanha** as pessoas visíveis. Trocar **7/30/Tudo** rebuild o gráfico. **Alternar tema** (claro↔escuro): grade e textos do gráfico recolorem. Verificar console sem erros de Chart.js.

- [ ] **Step 6: Commit**

```bash
git add js/app.js styles/app-ds.css
git commit -m "feat(dashboard): grafico de entregas ao longo do tempo (Earnings Graph) com tags por pessoa e total no cabecalho"
```

---

## Task 5: Verificação holística + bump de cache + checkpoint

**Files:**
- Modify: `index.html` — `?v=18` → `?v=19` em todos os `<link>`, no `config.js`/`ds.js`, no importmap e no `app.js`.

- [ ] **Step 1: Rodar o checklist Definition of Done (§ 🎨 Painel de Design da Central)**

1. Consultei o modelo (Earnings Graph em `design-system_v2.html`/`ds.js`) e reusei estrutura/tensão/gradiente. 2. Olhei a TELA INTEIRA da aba Usuários (KPIs, matriz, por dia, gráfico) — coerência. 3. Cor: linha = cor da pessoa (= avatar), status com `STATUS_RAMP`. 4. Ícones/rótulos coerentes (tags = rosto+nome). 5. Contraste WCAG AA em claro **e** escuro (total tênue ainda legível; grade do gráfico discreta mas visível). 6. Verifiquei no browser nos dois temas. 7. Mudança significativa → considerar cross-review das lentes de design se algo destoar.

- [ ] **Step 2: Bump de cache em `index.html`**

Trocar todas as ocorrências de `?v=18` por `?v=19` (linhas 15-22, 35, 38, 47-55, 60). Isso força o navegador de todos a rebaixar os arquivos novos ao publicar.

- [ ] **Step 3: Verificação final no browser**

Hard-reload (Ctrl+Shift+R) em `http://localhost:5500`. Repetir os fluxos das Tasks 2/3/4 nos dois temas. Conferir o console limpo.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "chore: bump de cache ?v=19 (dashboard usuarios: numeros clicaveis, fix do modal, grafico)"
```

- [ ] **Step 5: Checkpoint do projeto**

Rodar a skill `eqtl-checkpoint` (ou `/eqtl_checkpoint`) para registrar a entrega na Central (`projeto/`), atualizar itens tocados e o `Central.md`.

---

## Self-Review (cobertura do spec)

- **Req 1 (números clicáveis, mesma info do drill, filtrado pela tabela):** Tasks 1 + 2 — `openDeliveriesDrill` com filtros + wiring de TODAS as células e totais (incl. coluna=usuário, linha=status, geral=tudo), com `since` do período para os números baterem.
- **Req 2 (modal deforma ao abrir):** Task 3 — modal vira coluna flex limitada à viewport, corpo rolável, filhos sem compressão.
- **Req 3 (gráfico de linha por dia + total sutil + tags rosto+nome filtrando só o gráfico):** Task 4 — `buildDeliveryChartCard`, uma linha por pessoa, total tênue no cabeçalho que acompanha as tags, tags com avatar+nome, filtro só no chart.
- **Req 4 (usar o modelo "Earnings Graph"):** Task 4 — mesma receita do `ds.js` (line, `tension .45`, `pointRadius 0`, `fill` com gradiente de área, `legend` off), tokens `--grid-line`/`--text-dim`.
- **Sem placeholders:** todo passo de código traz o código completo. **Consistência de tipos:** `openDeliveriesDrill(ctx)`, `usersSince()`, `totTd`, `heatTd(v,ramp,max,onClick)`, `buildDeliveryChartCard(container,users,days,perDay)`, `cssVar`/`colorToRgba` usados com as mesmas assinaturas em todas as tarefas.
- **Riscos conhecidos:** (a) na tabela "Entregas por dia", o Total da linha (capada a 21 dias) pode divergir do drill do usuário (que usa o período inteiro) quando há >21 dias com atividade — aceitável e consistente com a Matriz; o gráfico usa todos os dias do período de propósito. (b) Período "Tudo" com muitos dias: o eixo X usa `autoSkip` do Chart.js.
