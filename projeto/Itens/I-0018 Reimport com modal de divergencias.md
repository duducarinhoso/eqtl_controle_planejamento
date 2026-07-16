---
id: I-0018
status: aberto
prioridade: P2
frente: Projeto tabela / import
origem: "chat 2026-07-16"
---

# I-0018 — Reimport com modal de divergências

Hoje reimportar a planilha faz **carga direta** (upsert idempotente por chave — `store.upsertPlanningItems`). Falta o **modal amplo com tabs** para o usuário rever as divergências e decidir o que aplicar:
- **Novas linhas** · **Alterados** (campo a campo, destacando conflito com o que foi editado na app) · **Sem mudança** · **Fora da planilha** (existe na app, sumiu do arquivo).
- **Preservar por padrão** as edições feitas na app (ex.: Entrega efetiva).

Já existe um molde: `showDiffModal` (grade, `app.js`). Plano original: `projeto/planos/2026-07-16-projeto-tabela-datagrid.md` (Fase 5).
