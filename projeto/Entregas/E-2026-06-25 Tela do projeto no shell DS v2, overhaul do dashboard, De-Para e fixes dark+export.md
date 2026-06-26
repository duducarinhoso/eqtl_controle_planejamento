---
data: 2026-06-25
modulo: app (shell, dashboard, grade, export) + parser
fase: Fase 6 (DS v2)
itens: ["[[I-0010 Tela do projeto integrada no shell do modelo]]", "[[I-0011 Migrar telas leves restantes ao DS v2]]", "[[I-0012 Re-tematizar a grade (planilha) ao DS v2]]", "[[I-0005 Propagar paleta DS v2 e auditar contraste WCAG AA]]", "[[I-0015 Cores de status livres (10) e Status Geral (categoria) por item]]"]
---

# Tela do projeto no shell DS v2 + overhaul do dashboard + De-Para + fixes dark/export

Sessão longa, com **deploy em produção** (GitHub Pages, `main`). Verificação foi por **harness** (HTML temporário que carrega as folhas reais) + leitura de estilos computados em dark+light + console limpo a cada passo — **não houve login nesta sessão**, então a validação de **dados reais** (números do dashboard, modal de usuário, perf do `cell_history`, arquivo `.xlsx` exportado) ficou para o Eduardo logado.

## 1. Tela do projeto integrada no shell DS v2 (fecha I-0010)
Abrir um projeto **não troca mais** para o `.lg-app` legado em tela cheia. `mountProject()` agora monta o module shell (`mountModuleShell("ops-proj")`), marca `.app.in-project` + `#mod-content.proj-mode`, e renderiza `buildProjectPane()` no slot:
- `buildProjectRail()` — 2ª coluna (rail de contexto): nav (Dashboard/Solicitações/Busca) + seção "Abas" buscável + rodapé Importar/Exportar/Config. **Reusa os IDs legados** (`#nav-dashboard`, `#nav-solic`, `#sheet-list`, `#exp-bar`) → `renderSidebar`/`showDashboard`/`selectSheet` seguem funcionando.
- `buildProjectPane()` — `.proj-main` com `.proj-head` (`#crumb` + `#presence` + botão de recolher) + `.toolbar` + `#grid-scroll` + `.statusbar`.
- `applyRoute` guard trocado de `.lg-app` → `.proj-shell`. CSS do two-pane (`.app.in-project`, `.proj-shell/.proj-rail/.proj-main`, trava de altura/scroll interno) em `styles/app-ds.css`.
- A **grade** (`grid.js`) foi só **re-hospedada** funcionando no `#grid-scroll` (re-tematização das células = I-0012, segue aberta).

## 2. Overhaul do Dashboard (plano `planos/2026-06-25-dashboard-overhaul.md`, fases P1–P6)
- **P1 — rota/legibilidade/recolher:** `App.view = null` no `mountProject` (Dashboard volta a ser a 1ª tela); rail legível (os descendentes legados de `.sheet-item` usavam `--side-text` azul → sumiam no branco; cobertos `.nm`/`.sub-name`/`.pn-item`/`.pf-btn` → `--text`/`--text-muted`); botão recolher (`.ph-collapse` → `.proj-shell.rail-collapsed`).
- **P2 — tabs:** `showDashboard` default `empresa`; ordem **Empresas · Abas · Usuários** (renomeadas de "Entregas por empresa"/"Visão por status").
- **P3 — tab Empresas:** donut removido (`empDonut` apagado); `table-layout:fixed` + larguras fixas; **linha de total** (`tfoot`); **filtro por empresa** (`App.empCompany`, seleção única, contagem sutil) aplicado a KPIs/matriz/barras.
- **P4 — paleta sóbria (B):** `--st-*` sóbrios (`#2f7d4e`/`#8a6914`/`#246b78`/`#b85c2e`/neutro) escopados em `.proj-main .dash`; chips `.chip.<klass>` sóbrios (globais); re-skin `.kpi-*`/`.umx`/`.dash-*`; correções de dark (`.grid-scroll.dash`/`.dash-tabs`/`umx td.tot` usavam `--workspace-bg`/`--surface-*` fixos claros); densidade (`--gap` 18→12, paddings menores).
- **P5 — números coerentes:** `computeEmpresaAreaData` passou a devolver `bySheetStatus`, `cellIndex` e `byCompanyStatus`; `getEmpData()` cache (invalidado em `refreshSheets` e ao reentrar no dashboard). `renderDashStatus` (tab Abas) conta por `bySheetStatus` (cruzamento `parseAbas`), não mais `loadStatusAggregate` (que somava status soltos). `renderDashUsers` (medidor) passou a cruzar `store.loadStatusChanges` (novo; lê `cell_history` do projeto) com as células válidas do `cellIndex`, **com fallback à RPC** `user_status_activity` se falhar.
- **P6 — Usuários:** `openUserDrill(user)` (modal `.modal.wide`, agrupado empresa→aba→célula com `details/summary`, "Ir à célula" via `goToCell`); `buildMatrix` com avatares clicáveis (`.u-click`) e **nome do usuário na coluna** (`.u-col-nm`, elipse no limite + tooltip).

## 3. Números = itens DISTINTOS (decisão [[D-0006 Numeros do dashboard contam itens distintos]])
Card/chips/tags de empresa/barras e os **Totais (linha e geral)** da matriz contam itens distintos (via `byCompanyStatus`, que conta cada item 1×); **células e total por processo** seguem expandidos (item em aba com +1 Área aparece em cada coluna), com **nota** explicando que a soma das colunas pode passar do total.

## 4. De-Para de empresas / aliases (decisão [[D-0007 De-Para de empresas (grafias-aliases)]])
`js/parser.js`: `key()` = minúsculas+trim+colapsa espaços (**mantém acento**); `parseAbas` monta `companyResolve` (Map grafia→canônico de canônicos + aliases); `parseSheet` resolve cada célula para o **canônico** (matrix e list). UI: editor de "outras grafias" (chips, com **unicidade**) em `openCompaniesManager`; o "Detectar das abas" agora deixa **anexar** rótulo como grafia. Schema: `sql/18_company_aliases.sql` (coluna `companies.aliases text[]`, **não versionado** — Eduardo roda no Supabase). `store.js` não mudou (`loadCompanies` já faz `select("*")`, `upsertCompany` repassa o objeto).

## 5. Fixes de modo escuro (decisão [[D-0008 Grade isolada do tema e drawers theme-aware (dark)]])
- **Grade = espelho do Excel, sempre clara:** o texto-padrão das células herdava `body{color:var(--text)}` e ficava **branco** no dark. Corrigido em `.proj-main #grid-scroll:not(.dash):not(.solic)` (bg `--workspace-bg` + `color:var(--on-surface)`) e `.cc{color:var(--on-surface)}` — fixos. **Formatação POR CÉLULA do usuário (cores inline) continua vencendo**; nada da estrutura muda.
- **Presença:** `.proj-head .pav-name` usava `--on-surface-variant` (fixo escuro) → `var(--text-muted)`.
- **Drawers/modais/menus** (Config, Busca geral, Histórico, Comentários, Equipe, Admin, managers Status/Empresas/Áreas): **remap dos tokens legados** (`--on-surface`, `--surface-*`, `--outline-*`, etc.) para os do DS v2 **só dentro de `[data-theme="dark"] .drawer/.modal/.ctx-menu`** → conserta as 7 telas de uma vez, **sem tocar a grade** (que vive em `.proj-main`).

## 6. Outros
- **Picker de cor do status:** `colorSelect` virou um **grid de swatches** visíveis (`.lm-swatches`/`.lm-sw`, expõe `.value` = klass) no lugar do `<select>`.
- **Export Excel reflete a cor do status:** `excel.exportToXlsx(…, statusFill)`; para `data_type==="status"` grava a **cor real do chip** (`statusFillFor` cria um `.chip.<klass>` e lê via `getComputedStyle`; `rgbToHex`; cache por klass). Antes gravava só o `format` salvo → não pegava a cor do status. Como **lê a cor viva**, segue qualquer mudança futura de paleta.
- **Title Case:** `titleCase()` aplicado aos nomes de exibição (matriz, modal, conta na sidebar, presença) — "ANA LIDIA"/"ana lidia" → "Ana Lidia", conectores em minúsculas. Só exibição.
- **Atalho mobile:** burger no `.topbar` (≤760px, off-canvas do rail global) → toggle `.sidebar.open`; links do menu fecham ao navegar.
- **Cache-bust:** `index.html` `?v=` 16→17→18 a cada deploy.

## Deploys (produção, `main` / GitHub Pages)
Branch `feat/dashboard-overhaul-de-para` → `main` (fast-forward).
- `90c884d` — migração do shell + overhaul + De-Para + 3 planos + `.gitignore` (ignora `credenciais.local.md`/`*.local.md`).
- `740a87f` — Total congelada + cabeçalho 2 linhas, números distintos, atalho mobile, nome na matriz, Title Case, `v17`.
- `dae40b4` — fix da grade no dark, `v18`.

## Pendente (verificado, **ainda NÃO commitado/publicado** — working tree no `main`)
Presença no dark · Configuração/drawers no dark · grid de swatches · **export reflete a cor do status**. → próximo deploy: `v18→v19`.

## Verificação executada
Console **sem erros** a cada mudança; harness com `styles/*.css` reais + `getComputedStyle` em claro e escuro (rail, two-pane, KPIs/matriz, modal, swatches, drawer dark, grade dark, presença, chip→export); `preview_resize` para o burger. Sem login → dados reais não validados nesta sessão.
