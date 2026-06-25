# Dashboard Overhaul (reanálise pós-migração) — Plano de Implementação

> **Para quem executa:** skill `executing-plans`. Verificação no browser (5500) em **dark+light** + Definition of Done (`Central.md` § 🎨). Sem framework de testes. Onde não houver login, verificar via harness que carrega as folhas reais. Git é do Eduardo: descrever cada commit, ele aprova.

**Goal:** Reorganizar e corrigir o Dashboard do projeto (3 tabs) após a migração ao shell DS v2 — bug de rota, legibilidade, recolher rail, reestruturação das tabs, nova tab "Empresas" (matriz/filtros/total), coerência de paleta, coerência dos números (cruzamento Empresa×Status), e modal de drill-down em Usuários.

**Architecture:** Tudo em `js/app.js` (dashboards + shell) + `styles/app-ds.css` (estilos DS v2). Os números passam a sair do `parseAbas` (parser.js) — cruzamento Empresa×Status — como fonte única. Sem build, sem framework.

**Tech Stack:** Vanilla JS (helper `h()`), Supabase (`store.*`), DS v2 (`design-system.css` tokens + `app-ds.css`), SVG/CSS.

---

## Decisões fechadas (Eduardo, 2026-06-25) — não reabrir

- **Paleta = B (DS sóbrio)**: Recebido `#2f7d4e` · Pendente `#8a6914` · Em análise `#246b78` · Parcial `#b85c2e` · N/A neutro (borda). Aplicar em **todas** as tabs (chips, bolinhas, barras, minibarras, ícones KPI, e reconciliar com as rampas do heatmap). Substitui os `--st-*` vívidos legados na tab Empresas.
- **#12 contagem = Abas + Usuários agora**: fonte = `parseAbas` (só conta status no cruzamento Empresa×Status; ignora palavras soltas).
- **Filtro de empresa (#7) = seleção única (toggle)**, contagem sutil, aplicado a KPIs + matriz + barras da tab Empresas.
- **Tab Usuários (#11) = modal amplo + revisão de layout/utilidade** no mesmo passo.
- **Ordem/nome das tabs**: **Empresas** (ex-"Entregas por empresa", 1ª e default) · **Abas** (ex-"Visão por status") · **Usuários**.

---

## Fase 1 — Grupo A: bug de rota + legibilidade + recolher rail

### Tarefa 1.1: Dashboard volta a ser a 1ª tela do projeto
**Arquivos:** `js/app.js` (`mountProject` ~554)
- [ ] `mountProject` reseta a view para forçar o render após reconstruir o shell. Após `App.sheetFilter = "";` adicionar:
```js
  App.view = null;        // shell foi reconstruído: não deixar o guard de applyRoute pular o render
```
- [ ] (default da tab vem na Fase 2). Verificar: Projetos → abrir projeto A → Dashboard aparece; voltar a Projetos → abrir projeto B → Dashboard aparece (não fica em branco).

### Tarefa 1.2: Legibilidade do rail do projeto (texto claro demais no branco)
**Arquivos:** `styles/app-ds.css` (bloco `.proj-*`)
- [ ] Primários para `--text` (eram `--text-muted`); secundários ficam em `--text-muted` (nunca `--text-dim` para texto de leitura):
```css
.proj-nav .pn-item{ color:var(--text); }            /* era --text-muted */
.proj-rail .sheet-item{ color:var(--text); }        /* nome da aba legível */
.proj-rail .sheet-item .sub-name{ color:var(--text-muted); }   /* era --text-dim */
.proj-foot .pf-btn{ color:var(--text); }            /* era --text-muted */
.proj-abas .pa-lab{ color:var(--text-muted); }      /* rótulo ABAS: era --text-dim */
```
- [ ] Auditoria do resto (já mapeado nesta reanálise; manter): sub-names, micro-rótulos do dashboard já tratados na R1. Verificar rail em dark+light: nav e abas com contraste AA.

### Tarefa 1.3: Recolher o rail (voltar a solução que existia)
**Arquivos:** `js/app.js` (`buildProjectPane` `.proj-head`), `styles/app-ds.css`
- [ ] Botão de colapso no início da `.proj-head` (ao lado do título/crumb):
```js
  const collapseBtn = h("button", { class: "ph-collapse", title: "Recolher/expandir o menu", "aria-label": "Recolher menu",
    onClick: () => document.querySelector(".proj-shell")?.classList.toggle("rail-collapsed"),
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>' });
  const head = h("div", { class: "proj-head" }, collapseBtn, crumb, presence);
```
- [ ] CSS: ocultar o rail quando colapsado.
```css
.proj-head .ph-collapse{ border:0; background:transparent; color:var(--text-muted); cursor:pointer; width:30px; height:30px; border-radius:6px; display:grid; place-items:center; }
.proj-head .ph-collapse:hover{ background:var(--hover); color:var(--text); }
.proj-head .ph-collapse svg{ width:18px; height:18px; }
.proj-shell.rail-collapsed .proj-rail{ display:none; }
```
- [ ] Verificar: clicar recolhe/expande o rail; conteúdo ocupa a largura toda; dark+light.

---

## Fase 2 — Grupo B: reestruturar as tabs

### Tarefa 2.1: Renomear, reordenar e default
**Arquivos:** `js/app.js` (`showDashboard` ~1190-1205)
- [ ] Default da 1ª tab = empresas: `if (!App.dashTab) App.dashTab = "empresa";`
- [ ] Reordenar + renomear os `mkTab`:
```js
  tabs.appendChild(mkTab("empresa", "Empresas"));
  tabs.appendChild(mkTab("status", "Abas"));
  tabs.appendChild(mkTab("users", "Usuários"));
```
- [ ] Dispatch já cobre as 3 chaves. Verificar: ao entrar no projeto abre "Empresas"; as 3 tabs trocam certo.

---

## Fase 3 — Grupo C: tab "Empresas"

### Tarefa 3.1: Remover o donut "Distribuição por status"
**Arquivos:** `js/app.js` (`renderDashEmpresa` — remover o 2º card do `.emp-rail` e a chamada `empDonut`; manter `empDonut` morto ou removê-lo)
- [ ] No `rail`, manter só o card "Entregas por empresa" (barras). Remover o card "Distribuição por status" e a chamada `empDonut(data)`.
- [ ] Remover o CSS `.dash-emp .emp-dist/.donut/.dn-*/.dleg` (ou deixar sem uso). Verificar: a tab não mostra mais o donut; a coluna de barras ocupa o espaço.

### Tarefa 3.2: Matriz com largura de coluna padronizada
**Arquivos:** `styles/app-ds.css` (`.dash-emp .emp-mx`)
- [ ] `table-layout:fixed` + largura igual por coluna de processo (a 1ª coluna Empresa fixa maior; Total fixa):
```css
.dash-emp table.emp-mx{ table-layout:fixed; }
.dash-emp .emp-mx th.rh, .dash-emp .emp-mx td:first-child{ width:170px; }
.dash-emp .emp-mx thead th:not(.rh):not(.col-tot){ width:84px; }
.dash-emp .emp-mx th.col-tot, .dash-emp .emp-mx td.tot{ width:92px; }
```
- [ ] Verificar: todas as colunas de processo com a mesma largura; rótulos longos quebram/elipse sem desalinhar.

### Tarefa 3.3: Linha de Total no rodapé da matriz
**Arquivos:** `js/app.js` (`empMatrix`)
- [ ] Após o `tbody`, montar um `tfoot` com total por processo (soma da coluna, respeitando o filtro de status/empresa) + total geral, reusando a minibar de composição. (código: somar por área ao varrer; espelhar a `tot-cell`.)
- [ ] Verificar: rodapé "Total" com a soma de cada processo e o total geral; alinhado às colunas.

### Tarefa 3.4: Filtro por empresa (tags, seleção única, contagem sutil)
**Arquivos:** `js/app.js` (`renderDashEmpresa` + novo `empCompanyFilter`), `styles/app-ds.css`
- [ ] Estado `App.empCompany` (`null`=todas | nome). Barra de tags **abaixo dos KPIs e acima do `.emp-main`**, uma tag por empresa com a contagem total sutil; "Todas" reseta.
- [ ] `empPaint` passa a filtrar KPIs/matriz/barras por `App.empCompany` (quando setado, matriz mostra só a linha da empresa; barras só ela; KPIs recomputados).
- [ ] CSS das tags: pílula sóbria, contagem em `--text-dim`/tabular, ativa com `inset box-shadow var(--blue)` (igual aos `fchip`).
- [ ] Verificar: clicar numa empresa foca tudo nela; clicar de novo/"Todas" volta; contagem sutil; dark+light.

---

## Fase 4 — Grupo D: paleta sóbria (B) coerente em todas as tabs

### Tarefa 4.1: Unificar o semáforo na paleta B
**Arquivos:** `styles/app-ds.css`
- [ ] Definir o semáforo como tokens sóbrios e usá-los em TODA cor de status (substitui os `--st-*` vívidos só onde a tab Empresas usa). Escopar na área do dashboard para não mexer na grade:
```css
.proj-main .dash{ --st-recebido:#2f7d4e; --st-pendente:#8a6914; --st-analise:#246b78; --st-parcial:#b85c2e; --st-na:#6b7b74; }
.dash-emp .stat .ico.c-pend{ color:#fff; }     /* âmbar sóbrio pede ícone branco */
```
- [ ] Conferir que dots/barras/minibarras/ícones KPI/chips usam o mesmo semáforo; reconciliar com as rampas `STATUS_RAMP` (que já são as famílias verde/âmbar/azul/coral/cinza). Verificar contraste (dudu-check-cores), dark+light.

### Tarefa 4.2: Revisão estética das tabs Abas e Usuários
**Arquivos:** `js/app.js` / `styles/app-ds.css` (pontual)
- [ ] Olhar as 3 tabs lado a lado: tipografia, espaçamento (densidade R1 mantida), cor de status única, headers de card, chips. Ajustes literais para alinhar ao modelo. Verificar dark+light.

---

## Fase 5 — Grupo E: coerência dos números (#12) — cruzamento Empresa×Status

### Tarefa 5.1: Tab "Abas" passa a contar pelo `parseAbas`
**Arquivos:** `js/app.js` (`renderDashStatus`)
- [ ] Trocar a fonte: em vez de `store.loadStatusAggregate`, usar `computeEmpresaAreaData()` (ou um `parseAbas` agregado por aba×status) para montar a visão por status/aba — só registros do cruzamento. Reaproveitar o cache (`App._empData`) quando possível (perf).
- [ ] Verificar: os totais da tab Abas batem com os da tab Empresas (mesmo grand total); somem as contagens infladas por palavras soltas.

### Tarefa 5.2: Tab "Usuários" restrita ao cruzamento
**Arquivos:** `js/app.js` (`renderDashUsers`), possivelmente `js/store.js`
- [ ] O medidor vem da RPC `user_status_activity` (histórico, conta toda mudança). Para restringir ao cruzamento: carregar `cell_history` do projeto e **intersectar** com as células válidas (`parseAbas` → `records` com `sheetId/row/col`); contar só mudanças cujas (sheet,row,col) estão no conjunto válido.
- [ ] **Risco/perf:** isso troca a RPC agregada por leitura de histórico + interseção no cliente. Medir volume; se pesado, cachear o conjunto válido e paginar. Validar com dado real (precisa login).
- [ ] Verificar: o medidor passa a contar só entregas em células do cruzamento; números coerentes com Abas/Empresas.

---

## Fase 6 — Grupo F: tab Usuários — modal de drill-down + layout

### Tarefa 6.1: Modal amplo ao clicar num usuário
**Arquivos:** `js/app.js` (`renderDashUsers` + novo `openUserDrill`), `styles/app-ds.css`
- [ ] Clicar na linha/avatar do usuário abre modal amplo: resumo por **empresa** e por **aba** das mudanças do usuário; cada item expansível até a **célula** alterada (lista row/col) com ação "ir para a célula" (`goToCell`).
- [ ] Fonte: `cell_history` filtrado por `changed_by`=usuário, cruzado com `parseAbas` (empresa/aba da célula). Reusar o modal base (`openModal`) com largura ampla.
- [ ] Verificar: abre o modal; resumo por empresa/aba; expandir mostra células; clicar leva à célula na grade; dark+light.

### Tarefa 6.2: Revisão de utilidade/layout dos cards de Usuários
**Arquivos:** `js/app.js` (`renderDashUsers`), `styles/app-ds.css`
- [ ] Avaliar os KPIs/matriz atuais: manter os úteis, melhorar rótulos, alinhar ao modelo. Ajustes literais. Verificar dark+light.

---

## Self-Review (cobertura dos 13 pedidos)
- #2 rota ✅ (1.1) · #3 legibilidade ✅ (1.2) · #13 recolher ✅ (1.3) · #8 ordem ✅ (2.1) · #9 nomes ✅ (2.1) · #5 remover donut ✅ (3.1) · #4 largura coluna ✅ (3.2) · #6 total ✅ (3.3) · #7 filtro empresa ✅ (3.4) · #1 paleta ✅ (4.1) · #10 estética tabs ✅ (4.2) · #12 números ✅ (5.1, 5.2) · #11 modal usuário ✅ (6.1, 6.2).

## Riscos
- **5.2 (Usuários × cruzamento)** é o ponto mais arriscado (troca RPC por histórico+interseção). Validar volume/perf com dado real; se necessário, faseá-lo melhor.
- **Paleta**: confirmar contraste AA dos 5 status em chips (texto branco) e como fills, nos 2 temas.
