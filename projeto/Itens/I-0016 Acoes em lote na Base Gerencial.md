---
id: I-0016
status: aberto
prioridade: P2
frente: Projeto tabela / Base Gerencial
origem: "chat 2026-07-16"
---

# I-0016 — Ações em lote na Base Gerencial

No datagrid do modelo tabela, permitir **selecionar vários itens** (a coluna de check + a barra de seleção já estão portadas no `js/datagrid.js`/`js/listview.js`, mas `selectable` ainda não foi ligado no `planning.js`) e **aplicar ações em lote**:
- **Editar em lote** — escolher um campo (Área · Responsável · Status · Prazo recebimento · Entrega efetiva), informar o valor **ou deixar vazio para limpar**, aplicar a todos os selecionados (respeitando a proteção da chave).
- **Exportar seleção** (Excel) — já vem do ListView.
- **Excluir selecionadas** — `store.deletePlanningItems(ids)`.

Referência: `useBulkFlow`/`BulkEditDrawer` do Cronograma. Plano: `projeto/planos/2026-07-16-dashboard-e-acoes-lote.md` (Fase F).
