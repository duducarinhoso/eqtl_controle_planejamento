---
id: I-0001
tipo: tarefa
status: resolvido
prioridade: P1
criado: 2026-06-24
resolvido: 2026-06-24
modulo: integracao-ey
fase: Fase 5
origem:
  - "tools/ey_IMPLEMENTACAO.md §4.2"
  - "bootstrap 2026-06-24 (varredura do código)"
---

O catálogo de engagements da EY (`ey_engagements`) tem o SQL pronto em `tools/ey_IMPLEMENTACAO.md` §4.2 mas **ainda não foi criado** no Supabase. Isso bloqueia o seletor de engagements na UI de extração ([[I-0002 Portar UI de extracao EY para o app]]). A camada de dados já tem `upsertEyEngagements()`/`listEyEngagements()` em `store.js` esperando a tabela.

**Ação:** executar o DDL de `ey_engagements` (+ RPC `ey_sync_engagements`) no Supabase via MCP/console. Verificar com `listEyEngagements()` no app.

## Desfecho (2026-06-24)
`ey_engagements` **criada** no Supabase (+ RPC `ey_sync_engagements`, que registra a execução) e **populada com dados reais**: 2 engagements (FY27 · RESTORE), via run 5 (`[e-mail removido]`, `kind=engagements`). Ver [[E-2026-06-24 EY relatorio-fonte, schema incremental e userscript]].
