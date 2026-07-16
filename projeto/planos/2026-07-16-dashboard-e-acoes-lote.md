---
data: 2026-07-16
tipo: plano
feature: dashboard-tabs-acoes-lote
status: aberto
---

# Dashboard + Tabs + Ações em lote + Edição de data — Plano

> **Execução:** vanilla JS, sem build. **Verificação sempre no browser** (start.bat, 5500, dark+light). Git é do Eduardo — commits mediante aval, mensagem em português. Segue as decisões alinhadas no chat (protótipo v2 aprovado + feedback do Cronograma).

**Goal:** No projeto "tabela", entregar duas abas — **Dashboard** (visão gerencial rica, teal, com filtros, cruzamentos, semáforo, média de atraso, % por empresa e modo apresentação/print) e **Base Gerencial** (o datagrid, agora com seleção múltipla + ações em lote e edição de data em 1 clique).

**Arquitetura:** As colunas calculadas já existem em `js/calc.js`. O Dashboard agrega os `planning_items` **no cliente** (não há backend REST; padrão do Cronograma é server-side, mas aqui é client-side sobre os itens já carregados) e desenha com **SVG/HTML + CSS** (sem lib de gráficos, como o Cronograma). O modo apresentação usa `html2canvas`+`jsPDF` via CDN sob demanda (mesmo padrão do SheetJS). A tab é um seletor no topo do `planning-pane`.

**Spec visual do Dashboard:** o protótipo v2 aprovado (`scratchpad/dashboard_proto.html`) — cabeçalho full-width com logo + título, 8 KPIs numa linha com ícone circular + cor semântica, filtros compactos (dropdowns), cruzamentos Empresa×Status Geral/Prazo, ranking por área/grupo/responsável (top 10 + scroll), média de dias de atraso + saúde, distribuição por segmento, top 5 empresas (%).

**Tech Stack:** Vanilla JS (ES modules, `h()`), Supabase, SVG/CSS, html2canvas + jsPDF (CDN), zoom da UI já existente.

---

## Estrutura de arquivos

**Criar:**
- `js/dashboard.js` — agregações client-side + render do dashboard + filtros interativos
- `js/present.js` — modo apresentação (tela cheia) + copiar imagem/PNG/PDF
- `js/bulk.js` — ações em lote (editar em lote via drawer, exportar, excluir)
- `styles/dashboard.css` — estilos do dashboard (teal, do protótipo v2), escopo `.dash`

**Modificar:**
- `js/planning.js` — seletor de abas (Dashboard | Base Gerencial); monta um ou outro
- `js/datagrid.js` — edição de data em **1 clique** (abre no clique único) + botão limpar (×) no editor
- `js/listview.js` — repassar `selectable` + `bulkActions` (já suporta a barra de seleção)
- `js/calc.js` — expor helper de agregação se necessário (reuso de statusEntrega/geral/prazo/diasAtraso)
- `index.html` — novos módulos no importmap + `dashboard.css` + cache-bust

---

## FASE A — Tabs (Dashboard | Base Gerencial)

> **Entrega:** o projeto tabela abre com duas abas no topo; "Base Gerencial" mostra o datagrid atual, "Dashboard" mostra um placeholder. A aba fica salva por projeto.

### Task A.1: Seletor de abas no planning-pane

**Files:** Modify `js/planning.js`

- [ ] **Passo 1:** na `buildTopbar`, adicionar um seletor de abas (segmented) entre o título e as ações: `Dashboard` · `Base Gerencial`. Estado da aba em `localStorage` (`eqtl.planning.tab.<projectId>`, default `dashboard`).
- [ ] **Passo 2:** `render(pane, project)` passa a montar, conforme a aba ativa: `buildDashboard(project, items)` (Fase C) ou o `ListView` atual (Base Gerencial). Trocar de aba re-renderiza só o corpo (`.planning-body`), mantendo a topbar.
- [ ] **Passo 3 (verificar, dark+light):** as duas abas aparecem; clicar alterna o corpo; recarregar mantém a aba escolhida; a Base Gerencial continua idêntica.

### Task A.2: CSS das abas

**Files:** Modify `styles/app-ds.css`

- [ ] **Passo 1:** `.planning-tabs` (segmented no estilo DS: pílulas ou sublinhado teal para a ativa), coerente com o `.seg`/tabs do modelo.
- [ ] **Passo 2 (verificar):** aba ativa destacada em teal; contraste AA em dark+light.

---

## FASE B — Agregações client-side

> **Entrega:** dado o array de `planning_items` (+ filtros), uma função pura devolve todos os números do dashboard (KPIs, por empresa/área/grupo/segmento/responsável, cruzamentos, média de atraso). Verificável no console.

### Task B.1: `aggregate(items, hoje)`

**Files:** Create `js/dashboard.js` (parte de dados); usa `js/calc.js`

- [ ] **Passo 1:** escrever `aggregate(items, hoje = new Date())` que, para cada item, computa `statusEntrega/statusGeral/statusPrazo/diasAtraso` (de `calc.js`) e acumula:
  - Totais: `total`, por `statusGeral` (Concluído/Pendente/N/A), por `statusPrazo` (No Prazo/Atrasado/N/A), por `statusEntrega`.
  - `pctConclusao` = concluídas/total; `slaMedio` (0 enquanto sem entregas); `atrasadas` = statusPrazo Atrasado.
  - Dimensões: `porEmpresa`, `porArea`, `porGrupo`, `porSegmento`, `porResponsavel` — cada uma `[{label, total, concl, pend, na, prazo, atras}]` ordenada por total desc.
  - Cruzamentos `empresaXGeral`, `empresaXPrazo` (para as barras empilhadas).
  - `atrasoMedioPorSegmento`, `atrasoMedioPorArea` (média de `diasAtraso` > 0; 0 quando não há).
- [ ] **Passo 2 (verificar via console):** `aggregate(items)` com os 258 → `total:258`, `porSegmento` Distribuição 226 / Saneamento 32, `porEmpresa` com 9, `atrasadas:0`, `pctConclusao:0`. Conferir contra os números reais já levantados.

### Task B.2: Aplicar filtros

**Files:** Modify `js/dashboard.js`

- [ ] **Passo 1:** `applyFilters(items, filtros)` — filtra por empresa/área/segmento/grupo/responsável (multi-seleção) e por statusGeral/statusPrazo (derivados). Retorna o subconjunto; o dashboard chama `aggregate(applyFilters(items, f))`.
- [ ] **Passo 2 (verificar):** filtrar por 1 empresa reduz os totais coerentemente (console).

---

## FASE C — Render do Dashboard (visual do protótipo v2)

> **Entrega:** a aba Dashboard mostra o painel completo em teal, fiel ao protótipo v2, com os dados reais.

### Task C.1: `styles/dashboard.css`

**Files:** Create `styles/dashboard.css`; Modify `index.html`

- [ ] **Passo 1:** portar o CSS do protótipo v2 (`scratchpad/dashboard_proto.html`), escopado em `.dash`, mapeando as cores para os tokens do app (teal, navy, semáforo ok/warn/bad/na). Cabeçalho, KPIs com ícone, filtros, grids densos, barras, donut, média de atraso, saúde, top5.
- [ ] **Passo 2:** incluir `dashboard.css` no `index.html` + cache-bust.
- [ ] **Passo 3 (verificar):** carrega sem erro; não afeta outras telas.

### Task C.2: Cabeçalho + KPIs + semáforo

**Files:** Modify `js/dashboard.js`

- [ ] **Passo 1:** `buildDashboard(project, items)` monta: cabeçalho (logo `app_planejamento_logo.png` + título "Dashboard de acompanhamento / Seleções de auditoria externa" + período/atualização/responsável + botões de apresentação) e a **KPI row** (8, ícone circular SVG + cor semântica). Cards de problema (Atrasadas) ficam verdes quando 0 e **vermelhos quando > 0**; bloco de saúde "Todos dentro do prazo ✓" / "N atrasadas ⚠".
- [ ] **Passo 2 (verificar, dark+light):** 8 KPIs numa linha, ícones coloridos, valores reais (258/248/0/0/0/10/0%/0d); semáforo coerente.

### Task C.3: Gráficos (SVG/HTML puro)

**Files:** Modify `js/dashboard.js`

- [ ] **Passo 1:** helpers de barra: `stackedBars` (cruzamentos Empresa×Status Geral/Prazo, com fatia de atraso em vermelho) e `rankBars` (ranking com top 10 + scroll). Donut de composição (conic-gradient ou SVG). Média de dias de atraso (por segmento + top áreas + SLA + saúde). Top 5 empresas (%).
- [ ] **Passo 2 (verificar):** todos os blocos renderizam com os dados reais; barras proporcionais; scroll nas dimensões grandes (15 áreas, 14 grupos, 17 responsáveis).

---

## FASE D — Filtros interativos

> **Entrega:** os dropdowns de filtro recalculam todo o dashboard ao mudar; chips/limpar funcionam.

### Task D.1: Dropdowns de filtro

**Files:** Modify `js/dashboard.js`

- [ ] **Passo 1:** cada filtro (Empresa/Área/Segmento/Grupo/Status geral/Status prazo/Responsável) é um dropdown multi-seleção (popover com checkboxes + busca quando > 8; reusar o padrão do flyout do ListView). Ao aplicar, re-render do dashboard com `aggregate(applyFilters(...))`. "Limpar filtros" zera.
- [ ] **Passo 2 (verificar, dark+light):** filtrar por 2 empresas atualiza KPIs e gráficos; limpar volta ao total; popover fecha ao clicar fora.

---

## FASE E — Modo apresentação / exportar

> **Entrega:** botão que abre o dashboard em tela cheia (1 tela, cabeçalho institucional) e permite copiar a imagem (clipboard), baixar PNG e PDF.

### Task E.1: Tela cheia (apresentação)

**Files:** Create `js/present.js`; Modify `js/dashboard.js`

- [ ] **Passo 1:** `openPresentation(dashEl)` — overlay full-screen (`.dash-present`) com o dashboard renderizado em escala que caiba em uma tela (A4 paisagem), fundo sólido, sem rolagem; botão fechar (Esc).
- [ ] **Passo 2 (verificar):** abre/fecha; cabe numa tela; dark+light.

### Task E.2: Copiar imagem / PNG / PDF

**Files:** Modify `js/present.js`

- [ ] **Passo 1:** carregar `html2canvas` via CDN (`esm.sh`/cdnjs) sob demanda; renderizar o dashboard para canvas.
- [ ] **Passo 2:** **Copiar imagem** → `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`; **PNG** → download do blob; **PDF** → `jsPDF` (CDN) com a imagem numa página paisagem. Toasts de confirmação; fallback claro se o clipboard não for permitido.
- [ ] **Passo 3 (verificar):** copiar imagem cola no e-mail/editor; PNG e PDF baixam com o painel legível. (O clipboard exige gesto do usuário + HTTPS/localhost.)
- [ ] **Passo 4 (checkpoint): commit — mediante aval**

```
feat(projeto-tabela/dashboard): aba Dashboard (KPIs, cruzamentos, filtros, semaforo) + modo apresentacao (copiar imagem/PNG/PDF)
```

---

## FASE F — Base Gerencial: seleção múltipla + ações em lote

> **Entrega:** coluna de check no datagrid; barra de seleção com Editar em lote, Exportar e Excluir.

### Task F.1: Ativar seleção

**Files:** Modify `js/planning.js`

- [ ] **Passo 1:** passar `selectable: true` ao `ListView` da Base Gerencial. A barra `.bulk-bar` (já portada) aparece ao selecionar. O checkbox de header/linha/grupo já funciona.
- [ ] **Passo 2 (verificar):** marcar linhas mostra a barra com contador; "selecionar todos" e por grupo funcionam.

### Task F.2: Ações em lote

**Files:** Create `js/bulk.js`; Modify `js/planning.js`

- [ ] **Passo 1:** `bulkActions(selectedRows, clear)` retorna os botões: **Editar em lote** (abre um drawer/modal: escolher campo — Área · Responsável · Status · Prazo recebimento · Entrega efetiva — informar o valor **ou deixar vazio para limpar**; confirma → aplica a todos via `store.updatePlanningItem` em lote, respeitando a proteção da chave), **Excluir selecionadas** (confirm → `store.deletePlanningItems(ids)`). O **Exportar (Excel)** da seleção já vem do ListView.
- [ ] **Passo 2:** após aplicar, re-render (as calculadas recalculam) + toast com o resumo.
- [ ] **Passo 3 (verificar, dark+light):** selecionar 5 linhas → Editar em lote → Área = "Contabilidade IV" → aplica nas 5 (conferir no banco); limpar Entrega efetiva em lote; Excluir remove as linhas (cascade). Exportar baixa só as selecionadas.

---

## FASE G — Edição de data em 1 clique

> **Entrega:** clicar (1×) numa célula de data já abre o seletor, com um × para limpar rápido — intuitivo.

### Task G.1: Editor de data de 1 clique

**Files:** Modify `js/datagrid.js`, `styles/datagrid.css`

- [ ] **Passo 1:** para colunas `editType === "date"` (e opcionalmente todas editáveis), abrir o editor no **clique único** (não só duplo). Manter duplo-clique também. O editor de data mostra um `<input type=date>` + botão **×** (limpar → grava null) + confirma ao escolher/blur; Esc cancela.
- [ ] **Passo 2:** evitar conflito com seleção — o clique na célula editável abre o editor sem alterar a seleção da linha; clique fora confirma.
- [ ] **Passo 3 (verificar, dark+light):** um clique em "Entrega efetiva" abre o date + ×; escolher a data grava e recalcula; o × limpa e recalcula; um clique noutra célula texto ainda usa duplo-clique (ou 1 clique, conforme decidido).
- [ ] **Passo 4 (checkpoint): commit — mediante aval**

```
feat(projeto-tabela/base): selecao multipla + acoes em lote (editar/excluir/exportar) e edicao de data em 1 clique
```

---

## FASE H — Publicação

- [ ] **Passo 1:** cache-bust final em `index.html`.
- [ ] **Passo 2:** revisão de design (checklist §🎨) no dark+light; conferir a paridade com o protótipo v2.
- [ ] **Passo 3:** atualizar `Central.md`/`Inventario.md` (skill `eqtl-checkpoint`).
- [ ] **Passo 4 (checkpoint): commit + push — mediante aval.**

---

## Auto-revisão (cobertura)

- Duas tabs (Dashboard | Base Gerencial) → Fase A. ✅
- Dashboard rico (KPIs linha+ícones+semáforo, cruzamentos, filtros, média atraso, % empresa, top10+scroll) → Fases B–D (spec = protótipo v2). ✅
- Modo apresentação (tela cheia + copiar imagem + PNG + PDF) → Fase E. ✅
- Seleção múltipla + ações em lote → Fase F. ✅
- Edição de data em 1 clique + limpar → Fase G. ✅
- Logo real no app (não no protótipo) → Task C.2. ✅

**Pontos a conferir na execução:** viabilidade de `html2canvas`/`jsPDF` por CDN sem build (se falhar, PNG via serialização do próprio DOM/SVG); permissão de clipboard (gesto do usuário); performance da agregação client-side em 258 linhas (trivial; escala ok).
