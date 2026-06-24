---
id: I-0002
tipo: tarefa
status: aberto
prioridade: P1
criado: 2026-06-24
resolvido:
modulo: integracao-ey
fase: Fase 5
origem:
  - "tools/ey_executar_preview.html (protótipo)"
  - "bootstrap 2026-06-24"
---

Existe um protótipo da tela "Executar extração EY" em `tools/ey_executar_preview.html` (seletor de engagement, barra de progresso, diálogo de confirmação) que **ainda não foi portado** para o app.

**Estado (2026-06-24):** o backend está **100% pronto** — `ey_engagements` criada+populada, RPCs `ey_sync`/`ey_sync_documents`/`ey_sync_engagements`, `fetchReportBlob`/`parseReport` em `tools/ey_api.js`, e o userscript `tools/ey_userscript.user.js`. **O Eduardo vai montar a UI + botão "Executar"** e testar a coleta pelo botão.

**Ação:** portar o protótipo para uma rota/modal do app, ligando em `store.eySync()` / `store.eySyncDocuments()` / `store.listEyEngagements()` e mostrando o resultado (added/updated/unchanged/removed + `listEySyncRuns`). **Atenção:** `openEyImport()` (colar JSON) ainda espera o formato antigo (`client_request_id`) — alinhar ao fluxo do relatório (chave `eng|#|grupo`). Cruza com [[I-0009 Fazer 1a coleta real EY e validar volumetria]] e [[D-0003 Relatorio EY como fonte unica e chave composta]].

**Antes de executar:** usar os modelos de `modelos/` à risca (auto-memory `usar-modelos-do-usuario`).
