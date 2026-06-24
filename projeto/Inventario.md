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
