---
id: I-0004
tipo: ideia
status: resolvido
prioridade: P3
criado: 2026-06-24
resolvido: 2026-06-24
modulo: integracao-ey
fase: Fase 5
origem:
  - "tools/ey_IMPLEMENTACAO.md §6"
  - "bootstrap 2026-06-24"
---

Hoje a coleta no portal EY é manual: rodar o bookmarklet/snippet no console do EY Canvas e colar o JSON no app. O `ey_IMPLEMENTACAO.md` §6 esboça uma **bridge Tampermonkey** (userscript) que extrairia automaticamente, sem copy/paste.

**Ação (pós-MVP da Fase 5):** decidir se vale construir a bridge ou manter o snippet manual.

## Desfecho (2026-06-24)
**Construída:** `tools/ey_userscript.user.js`. No EY busca o relatório (sem diálogo), parseia com SheetJS (`@require`) e grava via `ey_sync` + `ey_sync_documents` (`GM_xmlhttpRequest`, que fura o CSP), usando o token de sessão do app (captado em `localhost:5500`). Menu "📥 Coletar relatório EY → Supabase". Falta só a 1ª execução real → [[I-0009 Fazer 1a coleta real EY e validar volumetria]]. Ver [[E-2026-06-24 EY relatorio-fonte, schema incremental e userscript]].
