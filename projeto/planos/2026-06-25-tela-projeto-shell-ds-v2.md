# Tela do Projeto no Shell DS v2 (Dashboard + Solicitações + grade) — Plano de Implementação

> **Para quem executa:** use a skill `executing-plans` para implementar tarefa a tarefa, verificando no browser (porta 5500) em **dark + light** e rodando o checklist **Definition of Done** (`Central.md` § 🎨 Painel de Design) a cada tarefa de UI. Os passos usam checkbox (`- [ ]`) para rastreio. Git é do Eduardo: o agente descreve o commit, ele aprova/executa.

**Objetivo:** Ao abrir um projeto (`#/p/<id>`), **permanecer no shell do Design System v2** (rail global dos 3 módulos, Operações ativo) em vez de trocar para o `.lg-app` legado em tela cheia — renderizando o **rail de contexto do projeto** + o Dashboard, a tabela Solicitações e a grade dentro do `.content` do modelo.

**Arquitetura:** Insight central — **preservar os IDs/seletores que as telas já usam** (`#grid-scroll`, `#sheet-list`, `#crumb`, `#presence`, `.toolbar`, `#nav-dashboard`, `#nav-solic`). Assim `showDashboard`/`renderDashStatus`/`renderDashUsers`/`showSolicitacoes`/`selectSheet`/`renderSidebar`/`renderCrumb`/`renderAppPresence` continuam funcionando **sem reescrita**. A migração é (1) trocar o invólucro: `mountProject()` passa a montar o module shell + um **two-pane** (`.proj-shell` = rail de contexto + `.proj-main`) dentro de `#mod-content`, em vez de `buildShell()`/`.lg-app`; (2) re-skin de Dashboard e Solicitações para os tokens do modelo via `styles/app-ds.css`. A **grade-planilha** (`table.grid` de `grid.js`) é só **re-hospedada funcionando** no `#grid-scroll` — suas células ficam com a pele legada e são re-tematizadas por último (item **I-0012**, fora deste plano).

**Stack tocado:** `js/app.js` (`mountProject`, `applyRoute` ~590, novo `buildProjectPane`/`buildProjectRail`, ajuste de `showDashboard`/`showSolicitacoes`/`selectSheet` só onde escrevem em `#crumb`), `styles/app-ds.css` (layout do two-pane + rail + re-skin do dashboard/solic), `styles/design-system.css` (tokens — só leitura). Sem Supabase, sem migrations, sem build. A tabela `solic.js`/`solic.css` **já tem** a camada "Retematização DS v2" no rodapé — não recriar.

---

## Decisões já fechadas (não reabrir na execução) — alinhadas com o Eduardo em 2026-06-25

- **Navegação = RAIL DE CONTEXTO do projeto** (2ª coluna dentro de `#mod-content`), reusando a estrutura `.menu`/`.menu-group` do modelo: nav (Dashboard / Solicitações / Busca geral) + seção **"Abas"** buscável (~41 sheets) + rodapé (Importar / Exportar / Configuração). **NÃO** usar tabs horizontais nem dropdown.
- **Escopo desta fase = shell integrado + Dashboard + tabela Solicitações.** A grade-planilha entra apenas como **re-hospedagem funcional**; re-tematização das células = I-0012 (próxima fase).
- **Dashboard = RE-SKIN fiel, sem inventar gráficos.** KPIs (`renderDashStatus`) viram cards `.stat`; heatmaps (`renderDashStatus` drill, matriz `renderDashUsers`, entregas/dia) viram `.tbl` em `.card`, re-skin por tokens. Cor de status pela `STATUS_RAMP` semântica / badges `.st-*`. **NÃO** adicionar Chart.js (donut/barras).
- **Header do projeto:** rail mostra nome do projeto + voltar (→ `#/operacoes`); `.proj-main` tem uma faixa com o breadcrumb dinâmico (`#crumb`) + presença (`#presence`). O **topbar/page-row do modelo ficam ocultos no modo projeto** (a faixa do projeto os substitui — workspace é mais denso que os hubs, por decisão). Conta do usuário **só** no rodapé do rail global (sem duplicar).
- **Statusbar e toolbar** aparecem **só na visão de grade** (escondidas em Dashboard/Solicitações).

---

### Tarefa 1: CSS do two-pane do projeto + rail de contexto (`styles/app-ds.css`)

**Arquivos:**
- Modificar: `styles/app-ds.css` (acrescentar ao fim)

- [ ] **Passo 1: trave a altura no modo projeto e descreva o two-pane**

Ao fim de `styles/app-ds.css`, adicione:

```css
/* =====================================================================
   TELA DO PROJETO no shell DS v2 (I-0010). O projeto vive dentro de
   #mod-content como um two-pane: rail de contexto + área de trabalho.
   Trava a altura (scroll interno) só no modo projeto; os hubs seguem
   com page-scroll normal.
   ===================================================================== */
.app.in-project{ height:100vh; overflow:hidden; }
.app.in-project .topbar, .app.in-project .page-row{ display:none; }  /* a faixa do projeto os substitui */
.app.in-project .main{ min-height:0; }
#mod-content.proj-mode{ flex:1; min-height:0; padding:0; gap:0; display:block; overflow:hidden; }

.proj-shell{ display:flex; height:100%; min-height:0; }
.proj-rail{
  width:240px; flex:none; min-height:0; display:flex; flex-direction:column;
  background:var(--card-bg); border-right:1px solid var(--border); overflow:hidden;
}
.proj-main{ flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--bg); }
```

- [ ] **Passo 2: estilo do rail de contexto (header, nav, abas, rodapé)**

Continue no mesmo arquivo:

```css
/* header do rail: voltar + nome do projeto */
.proj-rail .pr-head{ display:flex; align-items:center; gap:8px; height:52px; flex:none;
  padding:0 12px; border-bottom:1px solid var(--border); }
.proj-rail .pr-back{ border:0; background:transparent; color:var(--text-muted); cursor:pointer;
  display:grid; place-items:center; width:28px; height:28px; border-radius:6px; flex:none; }
.proj-rail .pr-back:hover{ background:var(--hover); color:var(--text); }
.proj-rail .pr-name{ font-weight:500; font-size:13px; color:var(--text);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* nav contextual (reusa a linguagem do .menu do modelo) */
.proj-nav{ padding:8px 8px 4px; display:flex; flex-direction:column; gap:2px; flex:none; }
.proj-nav .pn-item{ display:flex; align-items:center; gap:10px; height:36px; padding:0 10px;
  border:0; background:transparent; border-radius:6px; color:var(--text-muted);
  font-family:var(--font); font-size:13px; text-align:left; cursor:pointer; width:100%; }
.proj-nav .pn-item svg{ width:17px; height:17px; flex:none; }
.proj-nav .pn-item:hover{ background:var(--hover); color:var(--text); }
.proj-nav .pn-item.active{ background:color-mix(in srgb, var(--blue) 12%, transparent);
  color:var(--blue); font-weight:500; box-shadow:inset 2px 0 0 var(--blue); }

/* seção "Abas": rótulo + busca + lista rolável (ocupa o resto do rail) */
.proj-abas{ display:flex; flex-direction:column; min-height:0; flex:1; border-top:1px solid var(--divider); margin-top:6px; }
.proj-abas .pa-top{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px 4px; flex:none; }
.proj-abas .pa-lab{ font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-dim); }
.proj-abas .pa-add{ border:0; background:transparent; color:var(--text-muted); font-size:18px; line-height:1; cursor:pointer; width:22px; height:22px; border-radius:5px; }
.proj-abas .pa-add:hover{ background:var(--hover); color:var(--text); }
.proj-abas .side-search{ margin:0 10px 6px; height:30px; padding:0 10px; flex:none;
  background:var(--input-bg); border:1px solid var(--input-border); border-radius:6px;
  color:var(--text); font-family:var(--font); font-size:12px; outline:none; }
.proj-abas .side-search:focus{ border-color:var(--blue); }
.proj-abas #sheet-list{ flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:0 6px 8px; }

/* item de aba (reaproveita #sheet-list de renderSidebar) */
.proj-rail .sheet-item{ display:flex; align-items:center; gap:8px; padding:6px 9px; border-radius:6px; cursor:pointer; color:var(--text-muted); }
.proj-rail .sheet-item:hover{ background:var(--hover); color:var(--text); }
.proj-rail .sheet-item.active{ background:color-mix(in srgb, var(--blue) 12%, transparent); color:var(--text); }
.proj-rail .sheet-item .col{ display:flex; flex-direction:column; min-width:0; flex:1; }
.proj-rail .sheet-item .nm{ font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.proj-rail .sheet-item .sub-name{ font-size:10.5px; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.proj-rail .sheet-item .badge{ font-size:9.5px; padding:1px 6px; background:var(--hover); color:var(--text-muted); border-radius:999px; }
.proj-rail .sheet-item .row-menu{ border:0; background:transparent; color:var(--text-dim); cursor:pointer; opacity:0; }
.proj-rail .sheet-item:hover .row-menu{ opacity:1; }
.proj-rail .sheet-empty{ padding:14px 12px; font-size:12px; color:var(--text-dim); }

/* rodapé do rail: Importar / Exportar / Configuração */
.proj-foot{ flex:none; border-top:1px solid var(--border); padding:8px; display:flex; flex-direction:column; gap:2px; }
.proj-foot .pf-btn{ display:flex; align-items:center; gap:9px; height:32px; padding:0 10px; border:0; background:transparent;
  border-radius:6px; color:var(--text-muted); font-family:var(--font); font-size:12.5px; text-align:left; cursor:pointer; width:100%; }
.proj-foot .pf-btn:hover{ background:var(--hover); color:var(--text); }
.proj-foot .exp-bar{ margin-top:4px; }
```

- [ ] **Passo 3: estilo da faixa de trabalho (`.proj-main`) — header + grid-scroll + statusbar**

Continue no mesmo arquivo:

```css
/* faixa-topo da área de trabalho: breadcrumb dinâmico + presença */
.proj-head{ display:flex; align-items:center; gap:12px; height:52px; flex:none;
  padding:0 18px; border-bottom:1px solid var(--border); }
.proj-head .crumb{ font-size:14px; font-weight:500; color:var(--text); }
.proj-head .crumb .crumb-name{ color:var(--text); }
.proj-head .presence{ margin-left:auto; display:flex; align-items:center; }

/* área que troca de conteúdo (dashboard / solicitações / grade) */
.proj-main #grid-scroll{ flex:1; min-height:0; overflow:auto; }
.proj-main .toolbar{ flex:none; }
.proj-main .statusbar{ flex:none; }
/* toolbar/statusbar só na grade: em dashboard/solic o #grid-scroll ganha .dash/.solic */
.proj-main #grid-scroll.dash ~ .statusbar,
.proj-main #grid-scroll.solic ~ .statusbar{ display:none; }

@media (prefers-reduced-motion: reduce){ .proj-nav .pn-item, .proj-rail .sheet-item{ transition:none; } }
```

- [ ] **Passo 4: verificação**

Ainda não há JS montando o `.proj-shell` — nada muda visualmente. Recarregue `http://127.0.0.1:5500` e confirme **sem erro de console** e que a tela de Projetos (Operações) continua normal. (Sem commit isolado; segue na Tarefa 2.)

---

### Tarefa 2: `buildProjectRail()` + `buildProjectPane()` em `js/app.js`

**Arquivos:**
- Modificar: `js/app.js` (adicionar logo acima de `buildShell`, ~linha 770)

- [ ] **Passo 1: ícones do rail de contexto (Feather, stroke 2, coerentes com o modelo)**

Acima de `buildShell`, adicione:

```js
/* ============================ SHELL DO PROJETO (DS v2) ============================ */
/* Ícones inline para o rail de contexto do projeto (coerentes com ITEM_IC). */
const PROJ_IC = {
  dash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  solic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>',
  back:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  imp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  exp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/></svg>',
  cfg:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};
```

- [ ] **Passo 2: `buildProjectRail()` — nav + abas + rodapé (reusa handlers e IDs existentes)**

```js
/* Rail de contexto do projeto: nav (Dashboard/Solicitações/Busca) + Abas + rodapé.
   Mantém os IDs que o resto do app já usa: #nav-dashboard, #nav-solic, #sheet-list, #exp-bar. */
function buildProjectRail() {
  const navItem = (id, icon, label, on, extra) => {
    const a = h("button", { class: "pn-item", id, onClick: on });
    a.innerHTML = icon + '<span>' + escapeHtml(label) + '</span>';
    if (extra) a.appendChild(extra);
    return a;
  };
  const nav = h("div", { class: "proj-nav" },
    navItem("nav-dashboard", PROJ_IC.dash, "Dashboard", () => goProject(App.project.id)),
    navItem("nav-solic", PROJ_IC.solic, "Solicitações", () => showSolicitacoes()),
    navItem(null, PROJ_IC.search, "Busca geral", () => openGlobalSearch()));

  const sheetList = h("div", { class: "sheet-list", id: "sheet-list" });
  const abas = h("div", { class: "proj-abas" },
    h("div", { class: "pa-top" },
      h("span", { class: "pa-lab" }, "Abas"),
      h("button", { class: "pa-add", title: "Nova aba", onClick: newSheet }, "+")),
    h("input", { class: "side-search", type: "search", placeholder: "Buscar aba…", value: App.sheetFilter || "",
      oninput: (e) => { App.sheetFilter = e.target.value; renderSidebar(); } }),
    sheetList);

  const footBtn = (icon, label, on, id) => {
    const b = h("button", { class: "pf-btn", id, onClick: on });
    b.innerHTML = icon + '<span>' + escapeHtml(label) + '</span>';
    return b;
  };
  const foot = h("div", { class: "proj-foot" },
    isAdmin() ? footBtn(PROJ_IC.imp, "Importar Excel", openExcelImport) : null,
    footBtn(PROJ_IC.exp, "Exportar", enterExportMode, "btn-export"),
    footBtn(PROJ_IC.cfg, "Configuração", openConfig),
    h("div", { class: "exp-bar", id: "exp-bar", hidden: true }));

  return h("aside", { class: "proj-rail", "aria-label": "Navegação do projeto" },
    h("div", { class: "pr-head" },
      h("button", { class: "pr-back", title: "Voltar para Operações", "aria-label": "Voltar para Operações",
        onClick: goOperacoes, html: PROJ_IC.back }),
      h("span", { class: "pr-name", title: App.project ? App.project.name : "" }, App.project ? App.project.name : "")),
    nav, abas, foot);
}
```

- [ ] **Passo 3: `buildProjectPane()` — two-pane completo (rail + área com toolbar/#grid-scroll/statusbar)**

```js
/* Área de trabalho do projeto montada dentro de #mod-content (modo projeto). */
function buildProjectPane() {
  const crumb = h("div", { class: "crumb", id: "crumb" }, "—");
  const presence = h("div", { class: "presence", id: "presence" });
  const head = h("div", { class: "proj-head" }, crumb, presence);

  const toolbar = buildToolbar();

  const gridScroll = h("div", { class: "grid-scroll", id: "grid-scroll", tabindex: "0" });
  gridScroll.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(App.zoom + (e.deltaY < 0 ? 10 : -10));
  }, { passive: false });

  const statusbar = h("div", { class: "statusbar" },
    h("span", { class: "rt", id: "rt-status" }, h("span", { class: "dot" }), h("span", {}, "Conectando…")),
    h("span", { id: "sel-info" }, ""),
    h("div", { class: "spacer", style: { flex: 1 } }),
    h("span", { id: "sheet-info" }, ""),
    h("div", { class: "zoom-ctl" },
      h("button", { class: "zbtn", title: "Diminuir zoom", onClick: () => setZoom(App.zoom - 10) }, "−"),
      h("input", { type: "range", id: "zoom-range", min: "50", max: "200", step: "10", value: String(App.zoom),
        oninput: (e) => setZoom(parseInt(e.target.value, 10)) }),
      h("button", { class: "zbtn", title: "Aumentar zoom", onClick: () => setZoom(App.zoom + 10) }, "+"),
      h("span", { id: "zoom-label", class: "zoom-label", title: "Redefinir para 100%", onClick: () => setZoom(100) }, App.zoom + "%")));

  const main = h("div", { class: "proj-main" }, head, toolbar, gridScroll, statusbar);
  return h("div", { class: "proj-shell" }, buildProjectRail(), main);
}
```

- [ ] **Passo 4: verificação**

Ainda sem rota chamando `buildProjectPane`; só confira que o app recarrega sem erro de console. (Sem commit isolado; segue na Tarefa 3.)

---

### Tarefa 3: Roteamento — abrir projeto monta o shell DS v2

**Arquivos:**
- Modificar: `js/app.js` (`mountProject` ~554; `applyRoute` condição ~590; `mountModuleShell` ~717 — limpar flags do modo projeto)

- [ ] **Passo 1: `mountModuleShell` reseta o modo projeto ao montar um hub**

Em `mountModuleShell` (~717), logo após `const root = $("#app-root"); root.hidden = false;`, adicione a limpeza das flags (para que sair do projeto para um hub desfaça o lock de altura):

```js
  document.querySelector(".app")?.classList.remove("in-project");
  const _mc = document.getElementById("mod-content"); if (_mc) _mc.classList.remove("proj-mode");
```

- [ ] **Passo 2: reescreva `mountProject` para usar o module shell + two-pane**

Substitua a função inteira (`async function mountProject(project){ … }`, ~554-562) por:

```js
async function mountProject(project) {
  App.project = project;
  App.sheetFilter = "";
  const slot = mountModuleShell("ops-proj");          // rail global, Operações ativo
  document.querySelector(".app")?.classList.add("in-project");
  slot.classList.add("proj-mode");
  slot.appendChild(buildProjectPane());               // rail de contexto + área de trabalho
  await refreshSheets();
}
```

- [ ] **Passo 3: atualize o guard de remontagem em `applyRoute`**

Em `applyRoute` (~590), troque o seletor que detectava o shell legado:

```js
  if (!App.project || String(App.project.id) !== pid || !document.querySelector("#app-root .lg-app")) {
```

por:

```js
  if (!App.project || String(App.project.id) !== pid || !document.querySelector("#app-root .proj-shell")) {
```

- [ ] **Passo 4: verificação no preview (dark + light)**

Rodar `start.bat`, abrir `http://127.0.0.1:5500`, logar, clicar num projeto.
Esperado:
- O **rail global** dos 3 módulos continua à esquerda (Operações destacado); o app **não** vira mais tela cheia legada.
- À direita do rail global aparece o **rail de contexto** (nome do projeto + voltar; Dashboard/Solicitações/Busca; "Abas" com busca + lista; rodapé Importar/Exportar/Config).
- A área de trabalho mostra o Dashboard (próxima tarefa cuida da pele); editar/abrir aba ainda funciona; **Ctrl+roda** dá zoom só na grade.
- **Voltar** (← no rail) e clicar **Operações** no rail global voltam para a lista de projetos sem travar a altura.
- F5 em `#/p/<id>` e `#/p/<id>/s/<sid>` restaura a tela certa; dark e light sem erro.

- [ ] **Passo 5: commit**

```
git add js/app.js styles/app-ds.css
git commit -m "feat(projeto): tela do projeto integrada no shell DS v2 (rail de contexto + two-pane)"
```

---

### Tarefa 4: Re-skin do Dashboard (KPIs → `.stat`, heatmaps → `.tbl`/`.card`)

**Arquivos:**
- Modificar: `js/app.js` (`renderDashStatus` ~1140-1156: markup do card KPI; os 3 pontos que escrevem em `#crumb` — ver Passo 4)
- Modificar: `styles/app-ds.css` (re-skin theme-aware de `.dash-*`, `.kpi-*`, `.u-*`, `.umx`)

- [ ] **Passo 1: re-skin theme-aware do dashboard (tokens do modelo)**

Ao fim de `styles/app-ds.css`, adicione:

```css
/* ===== Re-skin do Dashboard do projeto (DS v2) — sem inventar gráficos ===== */
.proj-main .dash{ padding:18px; }
.dash-tabs{ display:flex; gap:6px; margin-bottom:16px; }
.dash-tabs .dtab{ height:32px; padding:0 14px; border:1px solid var(--border); background:var(--card-bg);
  border-radius:999px; color:var(--text-muted); font-family:var(--font); font-size:12.5px; cursor:pointer; }
.dash-tabs .dtab.on{ background:var(--blue); border-color:transparent; color:#fff; font-weight:500; }
.dash-body .sub{ color:var(--text-muted); font-size:12.5px; margin:0 0 14px; }

/* KPIs como cards .stat do modelo (faixa r-4) */
.kpi-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:var(--gap); }
.kpi-card{ background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius);
  box-shadow:var(--shadow); padding:16px 18px; display:flex; flex-direction:column; gap:6px; min-width:0; }
.kpi-card .chip{ align-self:flex-start; }
.kpi-card .val{ font-size:23px; font-weight:700; color:var(--text); line-height:1; }
.kpi-card .lbl{ font-size:12px; color:var(--text-muted); }
.kpi-card .bar{ height:4px; border-radius:4px; opacity:.9; }
.kpi-sheets{ display:flex; flex-direction:column; gap:2px; margin-top:8px; overflow:auto; }
.kpi-sheets .srow{ display:flex; justify-content:space-between; gap:8px; padding:4px 6px; border-radius:5px;
  font-size:12px; color:var(--text-muted); cursor:pointer; }
.kpi-sheets .srow:hover{ background:var(--hover); color:var(--text); }
.kpi-sheets .srow .cnt{ font-variant-numeric:tabular-nums; color:var(--text-dim); }

/* chips de status (recebido/pendente/analise/parcial/na) — usa as cores st-* já definidas */
.dash .chip, .u-card .chip{ display:inline-flex; align-items:center; border-radius:999px; padding:2px 10px;
  font-size:11px; font-weight:600; }
.chip.recebido{ background:#2f7d4e; color:#fff; }
.chip.pendente{ background:#8a6914; color:#fff; }
.chip.analise{ background:#246b78; color:#fff; }
.chip.parcial{ background:#b85c2e; color:#fff; }
.chip.na{ background:transparent; color:var(--text-muted); box-shadow:inset 0 0 0 1px var(--border); }

/* heatmaps/matrizes como .tbl dentro de .card */
.u-kpis{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:var(--gap); margin-bottom:var(--gap); }
.u-kpi{ background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius); padding:14px 16px; }
.u-kpi .l{ font-size:12px; color:var(--text-muted); margin-bottom:4px; }
.u-kpi .v{ font-size:20px; font-weight:700; color:var(--text); }
.dash-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.dash-head h2{ font-size:16px; font-weight:500; color:var(--text); }
.dash-ctrls{ display:flex; gap:8px; flex-wrap:wrap; }
.seg{ display:inline-flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.seg .seg-b{ border:0; background:var(--card-bg); color:var(--text-muted); font-size:12px; padding:6px 12px; cursor:pointer; }
.seg .seg-b.on{ background:var(--blue); color:#fff; }
.u-card{ background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); margin-bottom:var(--gap); overflow:hidden; }
.u-card-h{ display:flex; align-items:baseline; gap:10px; padding:14px 18px 0; }
.u-card-h h3{ font-size:14px; font-weight:500; color:var(--text); }
.u-card-h .sub{ font-size:11.5px; color:var(--text-dim); }
.u-tablewrap{ overflow:auto; padding:12px 18px 18px; }
table.umx{ width:100%; border-collapse:collapse; font-size:12px; }
table.umx th{ position:sticky; top:0; background:var(--card-bg); color:var(--table-head); font-weight:500;
  text-align:center; padding:6px 8px; border-bottom:1px solid var(--divider); white-space:nowrap; }
table.umx th.rh, table.umx td.rh{ text-align:left; }
table.umx td{ padding:3px 6px; border-bottom:1px solid var(--divider); color:var(--text-muted); text-align:center; }
table.umx td.tot, table.umx tfoot td{ font-weight:600; color:var(--text); font-variant-numeric:tabular-nums; }
table.umx .hcell{ min-width:34px; border-radius:4px; padding:4px 6px; font-variant-numeric:tabular-nums; }
.u-nm{ color:var(--text); }
```

- [ ] **Passo 2: a faixa de KPIs vira cards `.stat` (markup em `renderDashStatus`)**

Em `renderDashStatus` (~1144-1155), o card hoje é montado como `kpi-card` com `chip/val/lbl/bar/sheetsBox`. Para alinhar ao modelo, troque o bloco de montagem do card por uma estrutura `.stat`-like com ícone semântico. Localize:

```js
    const card = h("div", { class: "kpi-card" });
    const sheetsBox = h("div", { class: "kpi-sheets" });
```

e o trecho que monta o cabeçalho do card:

```js
    card.appendChild(h("span", { class: "chip " + cls }, label));
    card.appendChild(h("div", { class: "val" }, String(a.total)));
    card.appendChild(h("div", { class: "lbl" }, `${a.sheets.size} aba(s)`));
    card.appendChild(h("div", { class: "bar", style: { background: `var(--st-${cls})` } }));
    card.appendChild(sheetsBox);
```

Substitua **apenas** o cabeçalho (mantendo `sheetsBox` e o resto) por uma linha "stat" (chip + valor grande + sublabel) — sem barra de cor solta (o chip já carrega a cor):

```js
    card.appendChild(h("div", { class: "kpi-top" },
      h("span", { class: "chip " + cls }, label),
      h("div", { class: "val" }, String(a.total))));
    card.appendChild(h("div", { class: "lbl" }, `${a.sheets.size} aba(s) · clique para abrir`));
    card.appendChild(sheetsBox);
```

E acrescente ao CSS do Passo 1 (mesmo arquivo):

```css
.kpi-card .kpi-top{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
```

> Observação: `--st-*` (usado pela barra antiga) não é redefinido aqui; remover a barra evita depender desse token legado. A cor passa a vir do chip `.st-*`/`.chip.<cls>`.

- [ ] **Passo 3: o breadcrumb do dashboard escreve no `#crumb` da faixa do projeto**

Os 3 lugares que escrevem em `#crumb` (`showDashboard` ~1101, `selectSheet`/`renderCrumb`, `showSolicitacoes` ~2529) **continuam válidos** porque `#crumb` agora existe na `.proj-head`. Nenhuma mudança de código é necessária — apenas confirme no preview que o texto aparece. (Passo de verificação, não de edição.)

- [ ] **Passo 4: verificação no preview (dark + light)**

Abrir um projeto → Dashboard.
Esperado:
- A aba **Visão por status** mostra os KPIs como cards do modelo (chip de status + total + "N aba(s)"), grid responsivo; clicar numa aba dentro do card abre a aba.
- A aba **Usuários** mostra os 4 KPIs (`.u-kpi`), a **matriz** status×usuário e **entregas por dia** como tabelas dentro de `.card`, com cabeçalho fixo e heatmap legível.
- Chips de status com cor semântica e contraste AA; segmentos (7/30/Tudo, orientação) no estilo do modelo.
- **Dark e light** OK; rodar o checklist Definition of Done.

- [ ] **Passo 5: commit**

```
git add js/app.js styles/app-ds.css
git commit -m "feat(dashboard): re-skin do dashboard do projeto ao DS v2 (KPIs .stat, heatmaps em cards)"
```

---

### Tarefa 5: Solicitações + grade hospedadas na área de trabalho

**Arquivos:**
- Modificar: `styles/app-ds.css` (encaixe da tela Solicitações e da grade dentro de `.proj-main`)
- Verificação de `selectSheet`/`showSolicitacoes` (sem edição de lógica)

- [ ] **Passo 1: a tela Solicitações (`.gp-root`) preenche o `#grid-scroll`**

`showSolicitacoes` já cria `.solic-host` e chama `openSolic`, e `solic.css` traz a camada DS v2. Garanta o encaixe de altura no novo host adicionando ao fim de `styles/app-ds.css`:

```css
/* a tela Solicitações ocupa toda a área e rola por dentro da própria tabela */
.proj-main #grid-scroll.solic{ padding:0; overflow:hidden; display:flex; }
.proj-main #grid-scroll.solic .solic-host{ flex:1; min-width:0; min-height:0; display:flex; }
.proj-main #grid-scroll.solic .gp-root.grade-view{ flex:1; min-width:0; }
```

- [ ] **Passo 2: a grade (`table.grid`) continua hospedada e funcional no `#grid-scroll`**

`selectSheet` monta a `Grid` em `$("#grid-scroll")` — que agora vive na `.proj-main`. Como mantivemos o id `#grid-scroll`, a grade carrega sem mudança de JS. As células ficam com a **pele legada** (`app.css`), por decisão (I-0012). Apenas garanta o scroll/zoom dentro do novo container — sem CSS novo além do `.proj-main #grid-scroll{flex:1;min-height:0;overflow:auto}` da Tarefa 1.

- [ ] **Passo 3: verificação no preview (dark + light)**

- **Solicitações** (nav do rail): a tabela aparece com cabeçalho teal do DS v2 (já mapeado), busca/Filtros/Agrupar/Ordenar/Status/＋Linha funcionando; "Ver aba original" e o olho de "Aba" navegam; toolbar e statusbar **escondidas** nesta visão.
- **Abrir uma aba** (lista do rail): a grade-planilha aparece com toolbar em cima e statusbar embaixo; edição, undo/redo, copy/paste, merge, **zoom (Ctrl+roda e slider)**, teclado e scroll funcionam dentro do novo container; presença por célula aparece.
- Trocar entre Dashboard → Solicitações → aba mantém o rail global e o de contexto fixos.
- Dark e light OK; Definition of Done.

- [ ] **Passo 4: commit**

```
git add styles/app-ds.css
git commit -m "feat(projeto): encaixe da tela Solicitações e da grade na área de trabalho do shell DS v2"
```

---

### Tarefa 6: Aposentar o shell legado `.lg-*` não usado (limpeza)

**Arquivos:**
- Modificar: `js/app.js` (remover `buildShell` e helpers órfãos, se nada mais os referenciar)
- Modificar: `styles/app.css` (remover regras `.lg-app/.lg-sidebar/.lg-topbar/.workspace` **se** sem uso) — **manter** `.grid`/`.grid-scroll`/`.toolbar`/`.statusbar`/`.dash-*`/`.kpi-*`/`.umx` (ainda usados)

- [ ] **Passo 1: confirmar que `buildShell` ficou órfão**

Rodar uma busca por referências antes de remover:

```
grep -rn "buildShell\|lg-app\|lg-sidebar\|lg-topbar\|toggleSidebar\|collapse-btn" js/ styles/
```

Esperado: `buildShell`/`.lg-*` só aparecem na própria definição (substituída por `buildProjectPane`). Se houver outras referências, **não remover** ainda; anotar em `I-0014 Débitos da migração DS v2`.

- [ ] **Passo 2: remover `buildShell` e o CSS `.lg-*` órfão**

Remova a função `buildShell` (e `toggleSidebar`/`userChipEl` se ficarem órfãos) de `js/app.js`, e os blocos `.lg-app/.lg-sidebar/.lg-topbar/.workspace` de `styles/app.css`. **Não tocar** nas regras da grade (`table.grid`, `.grid-scroll`, `.toolbar`, `.statusbar`), do dashboard (`.dash-*`, `.kpi-*`, `.u-*`, `.umx`) nem da solic — ainda em uso.

- [ ] **Passo 3: verificação no preview (dark + light)**

Repetir o fluxo completo (Projetos → abrir projeto → Dashboard → Solicitações → abrir aba → editar → voltar). Nada deve regredir. Console limpo. Dark e light OK.

- [ ] **Passo 4: commit**

```
git add js/app.js styles/app.css
git commit -m "chore(projeto): aposenta o shell legado .lg-* (grade segue legada até I-0012)"
```

---

## Self-Review (cobertura da spec)

- ✅ Abrir projeto permanece no shell DS v2 (rail global, Operações ativo) — Tarefas 2–3.
- ✅ Navegação = rail de contexto (nav + Abas buscável + Importar/Exportar/Config), reusando `#nav-*`/`#sheet-list`/`#exp-bar` — Tarefas 1–2.
- ✅ Dashboard re-skin fiel: KPIs `.stat`, heatmaps `.tbl`/`.card`, cor `.st-*` semântica; sem charts novos — Tarefa 4.
- ✅ Solicitações no `.content` (pele DS v2 já existente em `solic.css`) — Tarefa 5.
- ✅ Grade só re-hospedada e funcional (zoom/teclado/scroll/presença); células re-tematizadas depois (I-0012) — Tarefa 5.
- ✅ Presença + breadcrumb na faixa do projeto; conta só no rail global — Tarefas 2–3.
- ✅ Statusbar/toolbar só na grade — Tarefas 1, 5.
- ✅ Sem framework/build/Supabase; verificação no browser dark+light + Definition of Done a cada tarefa de UI.

## Fora de escopo (próximas fatias)

- **I-0012** — Re-tematizar as **células da grade** (`table.grid` de `grid.js`) aos tokens do modelo e aposentar `tokens.css`/`app.css` legados quando ninguém mais os usar.
- **I-0011** — Telas leves restantes (modais/config) ao DS v2.
- **I-0013** — Login/splash ao DS v2.
- Eventuais débitos achados na limpeza → registrar em **I-0014**.
```
