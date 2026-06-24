---
data: 2026-06-24
modulo: integracao-ey
fase: Fase 5
itens: ["[[I-0001 Criar tabela ey_engagements no Supabase]]", "[[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]]", "[[I-0004 Bridge Tampermonkey para coleta automatica EY]]"]
---

Sessão dedicada à integração EY Canvas: a fonte de verdade virou o **relatório**, o schema incremental no Supabase foi completado e validado, e o veículo de coleta (userscript) foi construído. **Engagements já coletados de verdade**; solicitações/documentos ainda não (→ [[I-0009 Fazer 1a coleta real EY e validar volumetria]]).

## Descobertas (API EY Canvas)
- **Catálogo:** `GET https://eycanvasapp.ey.com/api/v2/engagements.json` (host global, token `cea-prd-app`) — lista todos os engagements (id, nome, `Domain`, `Groups`).
- **Solicitações:** `ClientRequests.json?...&engagementid=` (token `cea-prd-us-app`); `quickfilter=3` traz só 174 ("Exceptional").
- **Relatório:** `GET https://eycanvasapp-us.ey.com/api/v2/reports.json/{engId}?engagementid={engId}` devolve o **.xlsx** (abas View by tag + View by document). Buscado por `fetch` fica **em memória — SEM o diálogo "Salvar como"** (provado: ~153 KB, assinatura `PK\x03\x04`). O diálogo só aparece quando o navegador *baixa* (clicar em "Gerar relatório").
- **Auth/CSP:** a API exige token Azure AD (MSAL) da sessão logada; o domínio do EY bloqueia por CSP **tanto** carregar SheetJS (esm.sh) **quanto** falar com o Supabase → coleta+parse+gravação precisam de um veículo no browser (userscript com `GM_xmlhttpRequest`).

## Decisão da sessão
**Relatório como fonte única** (ver [[D-0003 Relatorio EY como fonte unica e chave composta]]): traz o conjunto completo (253) + os documentos numa só busca sem diálogo. Como o relatório não tem `client_request_id`, a chave passou a ser a composta **`engagement|#|grupo`** (a chave oficial do projeto antigo).

## Banco (Supabase `scsxisjvtfsqayujfgvd`)
- **`ey_engagements`** criada (+ RPC `ey_sync_engagements`) e **populada com dados reais**: 2 engagements (8780577 FY27 ativo · 8647880 RESTORE), execução registrada (run 5, `eduardo.rocha@equatorialenergia.com.br`, `kind=engagements`).
- **`ey_requests` re-chaveada**: PK `chave` (`eng|#|grupo`); `client_request_id` agora opcional; novas colunas `in_portal`, `content_hash`, `tracked` (jsonb dos 8 campos rastreados), `first_seen_at`, `received_first_seen`, `priority`, `tag_name`, `ey_documents`, `client_documents`.
- **`ey_request_documents`** (aba View by document, 1:N) — ligada pela `chave`; `document_name/type`, `file_extension`, `uploaded_by`, `upload_date`.
- **`ey_request_changes`** (log campo-a-campo) e **`ey_sync_runs`** (histórico: `kind`, `run_by_label`, `source`, contadores → quem/quando/o quê).
- **RPCs:** `ey_sync` (chaveada por `chave`; diff por hash → grava só deltas; loga mudanças; marca `in_portal=false` quem sumiu), `ey_sync_documents` (substitui docs do engagement, liga por chave, conta `unmatched`), `ey_sync_engagements`. Todas `SECURITY DEFINER`, `grant authenticated`.
- **Validação ponta-a-ponta** (dados de teste, depois apagados): carga inicial → repetição (`unchanged`, 0 escrita) → mudança+sumiço (`updated`+`removed` + log campo-a-campo) → documentos ligando por chave + órfão ignorado → `received_first_seen` congelado. Banco limpo (só os 2 engagements reais permanecem).

## Código (`eqtl_controle_planejamento`)
- **`tools/ey_api.js`** — funções canônicas: `getToken`, `listEngagements`, `regionalApi`, `fetchRequests`/`mapRequest`, `detectState`/`currentSignature`, **`fetchReportBlob`** (baixa o .xlsx em memória) e **`parseReport(buf, XLSX)`** (lê as 2 abas mapeando por nome de coluna — espelha `reader.py` do projeto antigo).
- **`js/store.js`** — `eySync`, `eySyncEngagements`, `eySyncDocuments`, `listEyEngagements`, `listEySyncRuns`, `listEyRequestChanges`, `listEyRequestDocuments` (+ `upsertEyRequests`/`listEyRequests`).
- **`tools/ey_userscript.user.js`** — bridge Tampermonkey: no EY busca o relatório → `parseReport` (SheetJS via `@require`) → `ey_sync` + `ey_sync_documents` via `GM_xmlhttpRequest`, usando o **token de sessão do app** (capturado em `localhost:5500`). Menu "📥 Coletar relatório EY → Supabase"; mostra o que mudou.
- **`tools/ey_IMPLEMENTACAO.md`** / **`tools/ey_fluxo_mapa.md`** — playbook e mapa de estados (login → MFA PingID → Canvas logado) atualizados.

## Verificação
- DB: contagens conferidas (`engagements=2`, `requests=0`, `documents=0`, `sync_runs=1`); volumetria na fonte p/ FY27 = **253** (174 recebidas + 60 enviadas + 19 aceitas; 9 grupos com demanda).
- JS: `node --check` em `store.js`, `ey_api.js`, `ey_userscript.user.js` — OK.

## Pendente (próximo passo)
- **1ª coleta real** de solicitações + documentos → [[I-0009 Fazer 1a coleta real EY e validar volumetria]]. O Eduardo vai **montar a UI + botão "Executar"** e testar a coleta pelo botão.
- `openEyImport()` (colar JSON) ainda espera o formato antigo (`client_request_id`) — alinhar ao fluxo do relatório ao portar a UI ([[I-0002 Portar UI de extracao EY para o app]]).
