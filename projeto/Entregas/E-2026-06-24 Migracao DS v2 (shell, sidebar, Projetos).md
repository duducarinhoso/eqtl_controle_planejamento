---
data: 2026-06-24
modulo: Design System / Shell
fase: Fase 6 (Polimento de UI / DS v2)
itens: ["[[I-0005 Propagar paleta DS v2 e auditar contraste WCAG AA]]", "[[I-0010 Tela do projeto integrada no shell do modelo]]"]
decisoes: ["[[D-0004 Migracao 100% para o DS v2 (casa nova)]]", "[[D-0005 Navegacao em 3 modulos e tela do projeto integrada]]"]
---

# Migração para o Design System v2 — shell, sidebar e tela Projetos

Sessão longa. Começou pela reestruturação em 3 módulos e virou uma **migração de 100% da UI para `modelos/design-system_v2.html`** (a "casa nova"). Entregue: o shell + a sidebar + a tela Projetos **no modelo, em claro e escuro**, mais a disciplina de revisão de design. A **grade (planilha)** segue legada de propósito (migra por último).

## O que foi codificado

**Etapa 0 — trazer a casa (verbatim do modelo):**
- `styles/design-system.css` (NOVO) = cópia **verbatim** do `<style>` do `design-system_v2.html` (tokens `:root` + `[data-theme="dark"]/[="light"]`, classes `.app/.sidebar/.menu/.topbar/.page-row/.content/.card/.stat/.tbl/.badge`).
- `js/ds.js` (NOVO) = cópia verbatim do `<script>` do modelo (charts/gauges/sparklines, `setupSidebar` com indicador deslizante, `toggleTheme`). Única adaptação: **não auto-executa** o init (SPA) — exporta as funções em `window` (`window.setupSidebar/renderAll/toggleTheme/...`).
- `index.html`: `data-theme="light"` no `<html>`; Roboto + Chart.js (CDN) + `design-system.css` + `app-ds.css`; **removidos** `shell.css`, `v2-tokens.css`, `v2-kit.css`. Cache-bust `?v=N` em `app.js`/`ds.js` durante a migração (limpar no fim).
- **Apagados** (recriações minhas que duplicavam o modelo): `styles/shell.css`, `styles/v2-tokens.css`, `styles/v2-kit.css`.

**Etapa 1 — shell + sidebar do modelo (`js/app.js`):**
- `buildModuleShell()` reescrito para emitir o `.app > .sidebar + .main` do modelo: `.sidebar` (rail 64→230px no hover, `.sidebar-lights`, marca, `.menu` + `#sidebarIndicator`, `.sidebar-foot` com menu do usuário), `.topbar`, `.page-row` (título + crumb), `.content` (id `mod-content`). `mountModuleShell()` reusa o shell e chama `window.setupSidebar()`.
- 3 módulos como grupos no `.menu` (Portal EY / Operações / Administração), via `.menu-group` (elemento novo coerente em `app-ds.css`, pois o menu do modelo é flat). Ícones por item em `ITEM_IC`. Administração só para Adm (`canSeeAdmin`).
- **Grade legada escopada para `.lg-*`**: no `app.css`, `.app/.sidebar/.topbar` (e descendentes) → `.lg-app/.lg-sidebar/.lg-topbar`; no `buildShell()` e `toggleSidebar()`/`applyRoute()` idem. Assim o `.sidebar` do modelo não colide com o da grade. A grade abre em tela cheia como antes; "↩ Operações" volta.
- Helpers de papel: `roleKey/roleLabel/canSeeAdmin` (adm→Adm, operador→Operador, resto→Visitante) — sem mexer no banco.

**Etapa 2 — tela Projetos no modelo:**
- `projectCard()` → `.card` do modelo (`.card-head h3` + `.card-body`), badges de status, ações em `.card-act` (SVG). `buildLandingBody()` sem título/busca duplicados (busca fica no topbar). Estados **empty/error** em `.card`. `buildLanding()` (landing full-screen legada) **removida** (estava morta).
- Tela inicial líquida (splash) mantida; **Auditoria → `#/operacoes`**. Rotas novas: `#/operacoes`, `#/ey/*`, `#/admin/*`.

**Painel de design (cross-review) + correções aplicadas:**
- Rodado o painel (impeccable + redesign + dudu) e depois um **cross-review** (uma lente revisando a outra) — foi o que pegou os achados que faltavam.
- `app-ds.css`: kit de botões completo (`.btn/-primary/-ghost/-danger/-sm/-icon/:disabled`) em tokens do modelo; `.input`/`textarea`/`.field label` tematizados; superfícies `.modal/.ctx-menu/.toast` (corrigiu modal/menu **brancos no dark**); `.content .muted`→`--text-muted`; `.menu-group`→`--side-text` (contraste); `.page-row h1` uppercase; `.topbar .user .u-name`→`--text`.
- **Paleta de status semântica e distinta** (corrigida após feedback "cores parecidas"; alinhada às famílias do `STATUS_RAMP`; fonte branca legível): `.st-recebido #2f7d4e` · `.st-pendente #8a6914` · `.st-analise #246b78` · `.st-parcial #b85c2e` (texto `#fff`) · `.st-na` outline (`--text-muted` + borda). WCAG AA ~5:1.
- **Ícones revisados** (Feather, stroke 2); engrenagem **de verdade** em Configurações; botão "Usuários" passou de engrenagem → **ícone de pessoas**.
- **Marca:** sidebar colapsada mostra o **mascote** (`modelos/mascote_projetos_inovacao/ivy_figurinhas/ivy_programando.png`); expandida faz crossfade para a **logo** (`app_planejamento_logo.png`). Classes `.brand-mascot`/`.brand-logo-full` em `app-ds.css`.
- **Conta consolidada** num único menu, no **rodapé da sidebar** (removido o perfil duplicado do topbar).

## Verificação
Browser (porta 5500), logado, **claro e escuro**: shell/sidebar/Projetos coerentes com o modelo; modal "Novo projeto" temando; badges distintos e legíveis; grade intacta após o escopo `.lg-*`; zero erros de console. (Limitação recorrente: reiniciar o preview derruba a sessão → precisa relogar.)

## Processo registrado
Criada a **disciplina de revisão de design automática** (consultar o modelo antes, revisão holística, cor semântica/distinta, ícone↔rótulo, WCAG claro+escuro, cross-review) — em `Preferencias.md`, auto-memory `design-revisao-automatica` e no checklist **Definition of Done** da Central (§ 🎨 Painel de Design). Ver [[D-0004 Migracao 100% para o DS v2 (casa nova)]] e [[D-0005 Navegacao em 3 modulos e tela do projeto integrada]].

## Pendências/ramificações
Próximo: [[I-0010 Tela do projeto integrada no shell do modelo]] (objetivo principal). Depois: [[I-0011 Migrar telas leves restantes ao DS v2]], [[I-0012 Re-tematizar a grade (planilha) ao DS v2]], [[I-0013 Alinhar login e splash ao DS v2]], [[I-0014 Debitos da migracao DS v2]]. Trabalho não commitado → [[I-0007 Trabalho em andamento sem commit (home login EY DS v2)]].
