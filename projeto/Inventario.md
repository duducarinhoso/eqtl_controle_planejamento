---
data_atualizacao: 2026-06-24
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
| **Workspace da grade** | `app.js` (`buildShell`) + `js/grid.js` + `styles/app.css` | ✅ concluída — sidebar (abas + busca + filtro), topbar (breadcrumb área/SCOT + presença), toolbar (formatação), statusbar (zoom, RT, seleção) |
| **Grade (planilha)** | `js/grid.js` (`class Grid`) | ✅ concluída — edição, undo/redo (200), copy/paste, merge, auto-fit, resize, status semafórico, comentários, presença |
| **Dashboard — aba Status** | `app.js` (`renderDashStatus`) | ✅ concluída — heatmap status×grupo + medidor de entregas (donut) + KPIs |
| **Dashboard — aba Usuários** | `app.js` (`renderDashUsers`) | ✅ concluída — matriz usuário×status + gráfico de atividade diária (RPC `user_status_activity`) |
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

## 🗄️ Entidades Supabase

Ver tabela completa em `Stack.md`. Resumo de prontidão:

| Grupo | Tabelas | Status |
|---|---|---|
| Núcleo da grade | `projects`, `sheets`, `cells`, `cell_history`, `comments`, `status_options` | ✅ no ar |
| Usuários/acesso | `profiles`, `allowed_emails`, `online_status`, bucket `avatars` | ✅ no ar |
| EY Canvas | `ey_requests`, `ey_sync_runs`, `ey_request_changes`, `ey_request_documents` | ✅ no ar |
| EY Canvas | `ey_engagements` | ✅ no ar — criada e **populada** (2 engagements reais; execução logada) |

## 🎨 Design System

| Artefato | Conteúdo | Status |
|---|---|---|
| `styles/tokens.css` | tokens (cores, tipografia, espaçamento) — dark + light | ✅ no app |
| `modelos/design-system.html` | DS v1 (azuis/cianos vibrantes) | 📦 superado pela v2 |
| `modelos/design-system_v2.html` | DS v2 (teal/verde/navy institucional, fonte Outfit) | 🔨 refresh em andamento — paleta nova ainda não propagada a todos os componentes |
| `modelos/00,tela_login.html` | mockup da tela de login | ✅ referência integrada em `auth.js` |
| `modelos/01.tela_inicial_v2.html` | mockup da home (Auditoria + Cronograma) | ✅ referência implementada em `buildHome()` |

> **Princípio (auto-memory `usar-modelos-do-usuario`):** usar exatamente os HTMLs de `modelos/` como fonte do design — não recriar do zero.

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
