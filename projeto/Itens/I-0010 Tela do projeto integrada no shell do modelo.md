---
id: I-0010
titulo: Tela do projeto integrada no shell do modelo (dashboard + abas + grade)
status: aberto
prioridade: P1
frente: Design / Shell
origem: "chat 2026-06-24"
decisoes: ["[[D-0005 Navegacao em 3 modulos e tela do projeto integrada]]"]
---

# Tela do projeto integrada no shell do modelo

> [!important] É o **próximo objetivo** (objetivo principal apontado pelo Eduardo). Decisão já tomada: **integrada, sem abrir nova tela** ([[D-0005 Navegacao em 3 modulos e tela do projeto integrada]]).

## Objetivo
Ao clicar num projeto (hoje `#/p/<id>`), **permanecer no shell do modelo** (sidebar dos 3 módulos visível, Operações ativo) em vez de abrir o `.lg-app` legado em tela cheia. No `.content` do modelo renderizar:
- **Dashboard do projeto** em **cards do modelo** (`.stat` para KPIs, `.card` para os blocos) — hoje é `showDashboard()` no estilo legado.
- **Abas** (sheets) como **navegação contextual** dentro do conteúdo (não na sidebar global) — ao escolher uma aba, abre a grade.
- **Grade (tabela que espelha o Excel)** no `.content`, **mantida como está** (com toolbar/zoom/statusbar) — é a única superfície que NÃO se re-tematiza agora.

## O que fazer (passos)
1. Roteamento `#/p/<id>` e `#/p/<id>/s/<sid>`: em vez de `mountProject()`→`buildShell()` (`.lg-app` full-screen), montar o **module shell** (`mountModuleShell("ops-proj")` ou um item próprio) e renderizar o projeto no `#mod-content`.
2. **Dashboard** (`showDashboard`/`renderDashStatus`/`renderDashUsers`): reescrever para `.stat`/`.card`/`.tbl` do modelo + charts via `js/ds.js` (`window.renderAll()` após montar os canvases). Cores dos status pela paleta semântica (`STATUS_RAMP` / badges `st-*`).
3. **Abas**: desenhar a nav contextual no `.content` (decisão de layout aberta — ver abaixo). Reusar `App.sheets`, `renderSidebar`/`sheetInfo` adaptados.
4. **Grade**: re-hospedar a `Grid` (de `js/grid.js`) num container dentro do `.content`, com a toolbar (`buildToolbar`) e a statusbar. Manter a TABELA legada (não re-tematizar células agora). Conferir teclado/scroll/zoom dentro do novo container.
5. Cabeçalho do projeto: nome + voltar, via `.page-row` (título/breadcrumb do modelo).

## Decisão de layout a alinhar ANTES de codar
**Onde ficam as abas** no `.content`? Opções: (a) faixa de tabs horizontais no topo do conteúdo; (b) sub-lista à esquerda dentro do `.content` (rail global + sub-rail de abas + grade); (c) dropdown (`.mini-select`). São ~41 abas no projeto real → (b) ou (a) com busca. Alinhar com o Eduardo (ele prefere decidir desenho antes de executar).

## O que consultar
- **Modelo `modelos/design-system_v2.html`**: `.stat` (KPIs), `.card`/`.card-head`/`.card-body`, `.tbl`, `.page-row`/`.crumb`, `.row` (grids responsivos), `.mini-select`. Os charts/gauges/sparklines já estão em `js/ds.js`.
- **Código atual**: `js/app.js` (`mountProject`, `buildShell`, `showDashboard`, `renderDashStatus`, `renderDashUsers`, `selectSheet`, `renderSidebar`); `js/grid.js` (classe `Grid`); `STATUS_RAMP` (`app.js` ~linha 1083) e badges `.badge.st-*` (`app-ds.css`) para cor de status.
- **Roteiro**: `projeto/planos/2026-06-24-roteiro-mudanca-ds-v2.md` (este item é a "Etapa do projeto integrado").
- **Disciplina de revisão**: checklist **Definition of Done** em `Central.md` § 🎨 Painel de Design (aplicar a cada ajuste: consultar modelo, revisão holística, cor semântica, ícone↔rótulo, WCAG claro+escuro, cross-review).

## Critério de conclusão
Abrir um projeto mantém o shell do modelo; dashboard e abas no estilo do modelo (claro+escuro), grade funcionando no `.content` (edição/zoom/teclado ok); sem erros; verificado no browser. A grade legada `.lg-*` pode então ser aposentada (parte de [[I-0012 Re-tematizar a grade (planilha) ao DS v2]]).
