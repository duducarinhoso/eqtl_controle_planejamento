---
id: D-0009
data: 2026-07-16
status: vigente
modulo: Operações / Projetos
itens: ["[[I-0016 Acoes em lote na Base Gerencial]]", "[[I-0017 Edicao de data em 1 clique]]", "[[I-0018 Reimport com modal de divergencias]]"]
---

## Contexto
O app tinha um único modelo de projeto: grade tipo planilha (espelho do Excel, abas `sheets` + células `cells`). O Eduardo quis uma **2ª opção**: carregar a "Lista de pedidos" e trabalhá-la como **tabela estruturada** de colunas fixas, com status calculado pela aplicação — o objetivo é sair do Excel e usar o app. Pediu **exatamente** o datagrid da aba "Pessoas" do projeto irmão `eqtl_cronograma_fechamento`.

## Alternativas consideradas
- **Introduzir React/Vite** para reusar os componentes `.tsx` como estão. Quebra a regra de ouro (sem framework/sem build; app estático no GitHub Pages) e muda a arquitetura de deploy.
- **Datagrid vanilla — só o essencial** (busca/filtrar/agrupar sem virtualização/resize).
- **Datagrid vanilla — paridade total** (reescrever `DataTable.tsx` + `ListView.tsx` em vanilla, reusando o CSS verbatim).

## Escolha e porquê
**2º modelo `projects.kind='tabela'`** com dados numa tabela relacional nova (`planning_items`, colunas fixas + chave única `# + Referência + Grupo + Empresa`), colunas calculadas no cliente (`calc.js`), e **datagrid vanilla de paridade total** (`js/datagrid.js` + `js/listview.js`) reusando o CSS da referência escopado em `.dg` e mapeado ao DS teal. Descoberta central: o datagrid da referência é **React**; o app é vanilla — então "usar exatamente" virou **portar fielmente** o comportamento, mantendo a regra "sem build".

## Rotas descartadas e porquê
- React/build: contraria [[D-0001 Vanilla JS estatico sobre Supabase, sem framework]] e o deploy estático. Recusado.
- Datagrid "essencial": o Eduardo pediu paridade (toolbar completa + virtualização/resize/sticky). Recusado.
- Guardar listas (empresas/segmentos) neste modelo: desnecessário agora — viram texto livre usado só em filtro/agrupamento.

## Consequências
- Bifurcação por `kind` em `createProject`/`mountProject`/`applyRoute`; view em `js/planning.js`.
- Base para o Dashboard (agrega `planning_items`) e para as pendências [[I-0016]]/[[I-0017]]/[[I-0018]].
- O datagrid vanilla é reutilizável em outras telas do app.
