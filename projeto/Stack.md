---
data_atualizacao: 2026-06-24
tipo: stack
---

# Stack do Projeto — EQTL Controle de Planejamento

> Portal interno de controle de solicitações de auditoria/planejamento contábil da Equatorial Energia (EQTL) + parceiros EY. Grade colaborativa em tempo real, status semafórico, histórico por célula, integração EY Canvas. Ferramenta de trabalho desktop-first, alta densidade de dados. Fonte de verdade do produto: `PRODUCT.md`.

## 🧱 Núcleo

| Camada | Escolha |
|---|---|
| Frontend | **Vanilla JS (ES Modules)** — sem framework, sem build step |
| Hyperscript | helper `h()` próprio em `js/util.js` (não há JSX/React) |
| Estilo | **CSS puro** com design tokens — `styles/tokens.css`, `app.css`, `login.css`, `home.css` |
| Banco / Auth / Storage / Realtime | **Supabase (Cloud)** |
| Cliente Supabase | `@supabase/supabase-js@2.45.4` via CDN (ESM), auth **PKCE** |
| Deploy | **GitHub Pages** (estático, `.nojekyll`) |
| Dev server | `start.bat` → `python -m http.server 5500` (ES modules exigem `http://`, não `file://`); launch `eqtl-local` em `.claude/launch.json` |

> ⚠️ **Sem framework e sem bundler de propósito.** O app é servido como arquivos estáticos. Não introduzir Node/build/npm sem decisão explícita do Eduardo.

## 📂 Estrutura de arquivos

```
index.html              ← shell: #boot / #auth-root / #app-root; carrega config.js + js/app.js
config.js               ← credenciais Supabase (a partir de config.example.js); NÃO commitar segredo real
config.example.js       ← modelo de config
start.bat               ← servidor local porta 5500
js/
  app.js     (~1950 l)  ← orquestração, rotas (hash), shell, sidebar, dashboards, modais, admin
  store.js   (~650 l)   ← camada de dados Supabase (queries, mutations, RPC)
  grid.js    (~925 l)   ← grade tipo planilha (edição, undo/redo, copy/paste, merge, presença)
  auth.js    (~228 l)   ← UI de auth (login/signup/forgot/reset)
  excel.js   (~322 l)   ← import/export .xlsx (SheetJS para ler, ExcelJS para escrever)
  realtime.js(~131 l)   ← Supabase Realtime: sync de células + presença + online/offline
  supabase.js(~19 l)    ← init do cliente + validação de config
  util.js    (~100 l)   ← h(), $, toast, statusClass, fmtDate, cores estáveis por hash
styles/                 ← tokens.css, app.css, login.css, home.css
modelos/                ← mockups/design system (HTML de referência do Eduardo)
tools/                  ← artefatos da integração EY Canvas (api, snippet, playbook, protótipo)
projeto/                ← esta Central do Projeto (plano + checkpoints)
```

## 🗄️ Supabase — tabelas referenciadas no código

| Tabela | Papel |
|---|---|
| `profiles` | usuários (id, full_name, display_name, email, color, avatar_url, role, must_change_password) |
| `allowed_emails` | allowlist de cadastro |
| `projects` | container de projetos (multi-projeto) |
| `sheets` | abas/planilhas (name, kind index/matrix, position, col_widths, row_heights, frozen_*, project_id) |
| `cells` | células (sheet_id, row, col, value, data_type text/status/number, format jsonb, merge, covered_by) |
| `cell_history` | trilha de auditoria por célula |
| `comments` | comentários por célula |
| `status_options` | lista de status configurável (label, klass, position) |
| `online_status` | heartbeat de presença (user_id, loc, last_seen) |
| `ey_requests` | espelho das solicitações EY (PK `chave` = engagement\|#\|grupo; `client_request_id` opcional; `in_portal`, `content_hash`, `tracked`, datas, contadores de doc, `synced_at`) |
| `ey_engagements` | catálogo de engagements EY (✅ criada e **populada**; `is_active`, `groups`, execução logada) |
| `ey_sync_runs` | log de execuções de sync EY |
| `ey_request_changes` | log de mudanças campo-a-campo (EY) |
| `ey_request_documents` | documentos anexados a uma solicitação (EY) |

### RPCs usadas
`insert_row` · `delete_row` · `insert_col` · `delete_col` (operações atômicas de linha/coluna) · `project_status_summary` · `user_status_activity` · `import_cells` · `ey_sync` · `ey_sync_documents` · `ey_sync_engagements`

> **Deltas 2026-06-25:** `companies.aliases text[]` (De-Para de empresas; rodar `sql/18_company_aliases.sql`) · `status_options.categoria` **planejado** (`sql/19`, ver [[I-0015 ...]]) · `store.loadStatusChanges(sheetIds, opts)` — lê `cell_history` do projeto para o medidor de Usuários restrito ao cruzamento `parseAbas`. O dashboard cruza Empresa×Status pelo `parser.js` (`parseAbas`/`computeEmpresaAreaData`), com cache `getEmpData`.

### Realtime (canais)
`db:sheet:{id}` (postgres_changes em cells/sheets/comments) · `presence:sheet:{id}` (quem edita qual célula) · `presence:app` (online global) · `db:online_status` (heartbeat)

### Storage
Bucket `avatars` (foto de perfil, pasta por `auth.uid()`).

## 🎨 Design / Identidade

- Fonte base de UI: **Roboto** (do DS v2). As demais (Montserrat/Outfit/Plus Jakarta/IBM Plex) ficam só em telas legadas até migrarem.
- Tema **dark + light** via `data-theme` no `<html>` (toggle do modelo, em `js/ds.js`); **claro é o padrão**.
- DS canônico = `modelos/design-system_v2.html`, portado **verbatim** para `styles/design-system.css` + `js/ds.js`; extensões coerentes do app em `styles/app-ds.css`. Paleta institucional **teal/verde/navy** (`--blue:#246b78`, `--green:#71b280`, `--red:#e16464`). Migração por etapas (ver [[D-0004 Migracao 100% para o DS v2 (casa nova)]]); `styles/app.css`/`tokens.css` legados em retirada (grade escopada `.lg-*`).
- Personalidade (PRODUCT.md): institucional, sóbrio, confiável — "centro de comando" corporativo. Anti-referência: SaaS genérico/lúdico, glassmorphism decorativo, dashboards hero-metric.
- Acessibilidade alvo: WCAG AA (texto ≥ 4.5:1), foco visível, navegação por teclado na grade, `prefers-reduced-motion`.

## 🔗 Integração externa

- **EY Canvas → Supabase** (ver `tools/`): fonte = **relatório** (`reports.json/{engId}`, baixado **em memória** via `fetch`, **sem diálogo "Salvar como"**) → `parseReport` lê as abas View by tag + View by document → `ey_sync` + `ey_sync_documents` (diff por hash **server-side**, chave engagement/#/grupo, log de mudanças `ey_request_changes` + execuções `ey_sync_runs`). Veículo: userscript Tampermonkey (`tools/ey_userscript.user.js`, `GM_xmlhttpRequest` fura o CSP). Ver auto-memory `ey-canvas-pipeline` e decisão D-0003.

## 🚀 Deploy & Git

- **GitHub Pages** (estático). Sem CI/CD, sem build.
- **Git é do Eduardo** — o agente descreve os commits em português; o Eduardo executa `add/commit/push`. Continuidade entre máquinas via `git push`/`pull` (por isso `projeto/` e `.claude/skills/` ficam versionados).
- `config.js`, `*.xlsx`, `seed_data.json`, `/usuarios/`, `.env*` no `.gitignore` (segredos/dados sensíveis fora do repo). `.claude/settings.local.json` é ignorado globalmente (machine-local).
