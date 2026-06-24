---
id: I-0003
tipo: bug
status: resolvido
prioridade: P2
criado: 2026-06-24
resolvido: 2026-06-24
modulo: integracao-ey
fase: Fase 5
origem:
  - "tools/ey_IMPLEMENTACAO.md §8"
  - "bootstrap 2026-06-24"
---

A extração atual usa `quickfilter=3` na chamada à API do EY Canvas, que retorna **só as solicitações de status "Exceptional"** (174), não o total (~253). É preciso ajustar o parâmetro de filtro para capturar **todas** as solicitações.

**Ação:** investigar os parâmetros de `quickfilter` na API, testar a chamada que traz o conjunto completo e validar a contagem (253).

## Desfecho (2026-06-24)
Resolvido **trocando a fonte**, não o filtro: a fonte virou o **relatório** (`reports.json`), cuja aba "View by tag" traz o conjunto **completo (253)**. A rota "corrigir o `quickfilter`" foi **descartada** (mesmo trazendo 253, faltariam os documentos). Ver [[D-0003 Relatorio EY como fonte unica e chave composta]].
