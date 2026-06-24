---
id: I-0009
tipo: tarefa
status: aberto
prioridade: P1
criado: 2026-06-24
resolvido:
modulo: integracao-ey
fase: Fase 5
origem:
  - "chat 2026-06-24"
---

A infraestrutura está pronta (schema + RPCs `ey_sync`/`ey_sync_documents` + `fetchReportBlob`/`parseReport` em `tools/ey_api.js` + userscript) e `ey_engagements` já tem os 2 engagements reais. **Ainda não houve coleta de solicitações/documentos** — `ey_requests` e `ey_request_documents` estão vazias.

**Ação:** disparar a **1ª coleta real** (relatório → `ey_sync` + `ey_sync_documents`) pelo botão "Executar" que o Eduardo vai montar (ou pelo userscript `tools/ey_userscript.user.js`). Depois:
1. Conferir volumetria por grupo em `ey_requests`/`ey_request_documents` (esperado FY27 = 253; RESTORE = 0).
2. Rodar de novo para validar o **cruzamento do que mudou** (added/updated/unchanged/removed + `ey_request_changes`).

Depende de [[I-0002 Portar UI de extracao EY para o app]]. Cruza com [[D-0003 Relatorio EY como fonte unica e chave composta]].
