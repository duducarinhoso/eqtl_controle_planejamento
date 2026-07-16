---
data_atualizacao: 2026-06-25
tipo: inventario
---

# 📚 Inventário do Sistema

> Telas, módulos de código, entidades Supabase e componentes. Mantido em dia pela skill `eqtl-checkpoint` (status ⏳→🔨→✅). Levantado por varredura do código em 2026-06-24 (bootstrap da Central).

## 🖥️ Telas / Visões

| Tela / Visão | Onde no código | Status |
|---|---|---|
| **Login / Signup / Esqueci / Reset** | `js/auth.js` (`renderAuth`) + `styles/login.css` | ✅ concluída — 4 fluxos; reset por `type=recovery` na URL; toggle de senha; tradução de erros |
| **Troca de senha no 1º acesso** | `app.js` (`forceChangePassword`) — `must_change_password` | ✅ concluída |
| **Home / Seletor de módulos** | `app.js` (`showHome`/`buildHome`) + `styles/home.css` | 🔨 entregue — painel **Auditoria** ativo (→ `#/projetos`) + **Cronograma** inativo (`aria-disabled`, "em construção") |
| **Projetos (landing)** | `app.js` (`showProjects`/`buildLanding`/`projectCard`) | ✅ concluída — grade de cards, busca, criar/editar/excluir, chips de status por contagem |
| **Workspace do projeto** | `app.js` (`buildProjectPane`/`buildProjectRail`) + `js/grid.js` + `styles/app-ds.css` | ✅ migrado ao **shell DS v2** (2026-06-25): rail de contexto + dashboard + Solicitações + grade no `.content`; grade re-hospedada (células = I-0012). `buildShell` legado órfão (T6) |
| **Grade (planilha)** | `js/grid.js` (`class Grid`) | ✅ concluída — edição, undo/redo (200), copy/paste, merge, auto-fit, resize, status semafórico, comentários, presença |
| **Projeto tabela — Base Gerencial** (modelo `kind='tabela'`) | `js/planning.js` + `js/datagrid.js` + `js/listview.js` + `styles/datagrid.css` | ✅ datagrid vanilla (paridade DataTable/ListView do Cronograma): busca, filtrar choice/data, agrupar, classificar, exportar, chips, virtualização, resize, sticky; edição inline + colunas calculadas (`calc.js`). Falta: seleção/lote (I-0016), data 1-clique (I-0017), reimport modal (I-0018) |
| **Projeto tabela — Dashboard** | `js/planning.js` (abas) + `js/dashboard.js` + `js/present.js` + `styles/dashboard.css` | ✅ agrega `planning_items` no cliente; KPIs+semáforo, donut, cruzamentos Empresa×Status, ranking área/grupo (scroll), média de atraso, top 5 empresas; filtros interativos; apresentação (copiar imagem/PNG/PDF via CDN) |
| **Densidade da UI (zoom "Aa")** | `js/uizoom.js` + `js/zoomctl.js` + script anti-flash no `index.html` | ✅ zoom global no `<html>` (default 80%), controle no topbar, persiste; `--app-vh` nos full-height; login em 100% |
| **Dashboard — aba Empresas** (1ª/default) | `app.js` (`renderDashEmpresa` + `computeEmpresaAreaData`/`getEmpData`) | ✅ matriz Empresa×Processo (Total congelado, cabeçalho 2 linhas, linha de total) + filtro por empresa + barras; **números por itens distintos** (D-0006); cruzamento `parseAbas` |
| **Dashboard — aba Abas** (ex-"Visão por status") | `app.js` (`renderDashStatus`) | ✅ KPIs por status com drill por aba; conta pelo **cruzamento** `parseAbas` (não mais `loadStatusAggregate`) |
| **Dashboard — aba Usuários** | `app.js` (`renderDashUsers` + `openUserDrill`) | ✅ medidor restrito ao cruzamento (`cell_history` ∩ células válidas via `store.loadStatusChanges`, fallback RPC) + **modal de drill** empresa→aba→célula |
| **Admin — Usuários** | `app.js` (`openAdminPanel`) + `store.js` | ✅ concluída — listar/criar/editar/reset/avatar/role + allowlist de e-mails |
| **Perfil / menu do usuário** | `app.js` (`openUserMenu`, `changeMyPhoto`) | ✅ concluída — foto, gerenciar lista de status, sair |
| **Gerenciar lista de status** | `app.js` (`openStatusManager`) + `store.js` (`status_options`) | ✅ concluída — CRUD da lista semafórica configurável |
| **Busca global de células** | `app.js` (busca) + `store.js` (`searchCells`/`searchCellsExact`) | ✅ concluída |
| **Config / Settings** | `app.js` (`openConfig`) | 🟡 parcial — modal de toggles (tema etc.); escopo a definir |
| **Importar Excel (.xlsx)** | `app.js` (`openExcelImport`) + `js/excel.js` + `store.js` (`importWorkbook`) | ✅ concluída — preserva fonte/fill/borda/merge/larguras |
| **Exportar Excel (.xlsx)** | `app.js` (`enterExportMode`) + `excel.js` (`exportToXlsx`) | ✅ concluída |
| **Importar EY (colar JSON)** | `app.js` (`openEyImport`) | 🟡 legado — espera o formato antigo (`client_request_id`); a fonte agora é o **relatório** (chave eng/#/grupo) — alinhar ao portar a UI |
| **Executar extração EY** | protótipo `tools/ey_executar_preview.html` · backend em `store.eySync`/`eySyncDocuments` + `tools/ey_api.js` + `tools/ey_userscript.user.js` | ⏳ pendente — backend pronto; Eduardo vai montar a UI + botão e fazer a 1ª coleta (I-0002 / I-0009) |
| **Cronograma (módulo)** | placeholder em `buildHome()` | ⏳ não iniciado |

## 🧩 Módulos de código (responsabilidade)

| Módulo | Responsabilidade | Status |
|---|---|---|
| `js/app.js` | orquestração, rotas hash (`#/projetos`, `#/p/{id}`, `#/p/{id}/s/{sid}`), shell, sidebar, toolbar, dashboards, modais, admin, presença, zoom/gridlines | ✅ maduro |
| `js/store.js` | toda I/O Supabase: profiles, projects, sheets, cells, history, comments, status_options, online_status, EY (`upsertEyRequests`/`eySync`/`listEy*`) | ✅ maduro |
| `js/grid.js` | grade: storage de células, undo/redo, seleção/navegação, render, edição, copy/paste, formatação, merge, status menu, presença, spill, auto-fit, atalhos | ✅ maduro |
| `js/auth.js` | UI dos 4 fluxos de auth | ✅ |
| `js/excel.js` | import (`parseXlsxFull`) + export (`exportToXlsx`) com formatação | ✅ |
| `js/realtime.js` | canais Realtime (sheet/presence/app/online) | ✅ |
| `js/supabase.js` | init do cliente + `isConfigured` | ✅ |
| `js/util.js` | helpers (`h`, `$`, `toast`, `statusClass`, `fmtDate`, cores por hash, status defaults) | ✅ |
| `js/planning.js` | view do modelo tabela: abas Dashboard/Base Gerencial, carga/reimport, colunas + edição inline + proteção da chave | ✅ |
| `js/datagrid.js` | datagrid vanilla (port do `DataTable.tsx`): auto-fit, resize, sticky, ordenação, seleção, grupos, virtualização, edição inline | ✅ |
| `js/listview.js` | toolbar vanilla (port do `ListView.tsx`): busca, filtrar choice/data, agrupar, classificar, exportar, chips, seleção em lote, persistência | ✅ |
| `js/calc.js` | 4 colunas calculadas (Status de entrega/Geral/Prazo, Dias de atraso) fiéis às fórmulas do Excel | ✅ |
| `js/table_import.js` | leitura tipada do `.xlsx` (SheetJS) + detecção da aba pelas colunas | ✅ |
| `js/dashboard.js` | agregação client-side + render do painel gerencial (SVG/CSS teal) + filtros interativos | ✅ |
| `js/present.js` | modo apresentação (tela cheia) + copiar imagem/PNG/PDF (html2canvas/jsPDF por CDN) | ✅ |
| `js/uizoom.js` / `js/zoomctl.js` | densidade da UI (zoom no `<html>`) + controle "Aa" | ✅ |

## 🗄️ Entidades Supabase

Ver tabela completa em `Stack.md`. Resumo de prontidão:

| Grupo | Tabelas | Status |
|---|---|---|
| Núcleo da grade | `projects` (+ coluna `kind`), `sheets`, `cells`, `cell_history`, `comments`, `status_options` | ✅ no ar |
| Modelo tabela | `planning_items` (13 col. de entrada + auditoria; índice único `project_id,item_num,referencia,grupo,empresa`) — `sql/22` | ✅ no ar (aplicado) |
| Usuários/acesso | `profiles`, `allowed_emails`, `online_status`, bucket `avatars` | ✅ no ar |
| EY Canvas | `ey_requests`, `ey_sync_runs`, `ey_request_changes`, `ey_request_documents` | ✅ no ar |
| EY Canvas | `ey_engagements` | ✅ no ar — criada e **populada** (2 engagements reais; execução logada) |

## 🎨 Design System

| Artefato | Conteúdo | Status |
|---|---|---|
| `modelos/design-system_v2.html` | **DS canônico** — teal/navy institucional, **Roboto**, dark+light via `data-theme` (a "casa") | ✅ fonte de verdade |
| `styles/design-system.css` | CSS do DS v2 **verbatim** do modelo (classes + tokens + temas) | ✅ no app (canônico) |
| `js/ds.js` | JS do DS v2 verbatim (charts/gauges/sparklines, `setupSidebar`, `toggleTheme`) | ✅ no app (canônico) |
| `styles/app-ds.css` | elementos do app coerentes com o DS (`.menu-group`, botões, inputs, badges `.st-*`, modais/menus/toasts, marca) | ✅ no app |
| `styles/app.css` | estilos **legados** — grade escopada em `.lg-*`; sai quando a grade migrar | 🔨 em retirada |
| `styles/tokens.css` | tokens **legados** (navy/gold) — só p/ a grade legada e o semáforo `--status-*` | 🔨 em retirada |
| `app_planejamento_logo.png` + `modelos/mascote_projetos_inovacao/ivy_figurinhas/ivy_programando.png` | logo (sidebar expandida) + mascote **Ivy** (sidebar colapsada) | ✅ no shell |
| `modelos/00,tela_login.html` | mockup do login | ✅ em `auth.js` (alinhar ao DS v2 → I-0013) |
| `modelos/01.tela_inicial_v2.html` | splash (Auditoria/Cronograma) | ✅ em `buildHome()` (Auditoria → `#/operacoes`) |
| `modelos/design-system.html` | DS v1 | 📦 superado |

> **Apagados nesta migração** (recriavam o que o modelo já tem): `styles/shell.css`, `styles/v2-tokens.css`, `styles/v2-kit.css`.
> **Princípio:** usar o `design-system_v2.html` **por completo** — consultar e reusar o elemento pronto, não recriar. Ver auto-memory `usar-modelos-do-usuario` + `design-revisao-automatica` e o checklist Definition of Done em `Central.md` § 🎨 Painel de Design.

## 🛠️ Regras de negócio / lógica notável (no código)

| Regra | Onde | Status |
|---|---|---|
| Status semafórico (texto → cor) | `util.js` `statusClassFor` + `status_options` no banco | ✅ |
| Undo/redo atômico por lote | `grid.js` `_writeCells`/`undoStack` | ✅ |
| Paste single-cell preenche seleção (fill Excel) | `grid.js` `pasteClipboard` | ✅ |
| Heartbeat de presença (20s) + poll online (15s) | `app.js` `startPresence` + `store.heartbeat` | ✅ |
| Índice de aba (área/SCOT/Client Portal) lido da aba "Solicitações" | `store.js` `loadSheetIndex` | ✅ |
| Sync EY incremental (diff por hash, server-side; chave eng/#/grupo; fonte = relatório) | RPCs `ey_sync`/`ey_sync_documents`/`ey_sync_engagements` + `store.eySync` | ✅ backend validado / 🟡 UI |
| Extração EY sem diálogo (relatório em memória via `fetch` `reports.json`) | `tools/ey_api.js` (`fetchReportBlob`/`parseReport`) + `tools/ey_userscript.user.js` | ✅ provado — falta 1ª coleta real |
