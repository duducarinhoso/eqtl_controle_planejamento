---
id: D-0002
data: 2026-06-24
status: vigente
modulo: integracao-ey
itens:
  - "[[I-0002 Portar UI de extracao EY para o app]]"
  - "[[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]]"
---

> Decisão **registrada no bootstrap** a partir de `tools/ey_IMPLEMENTACAO.md` e do código já em `store.js`. Ver auto-memory `ey-canvas-pipeline`.
>
> [!note] Refinada em 2026-06-24 por [[D-0003 Relatorio EY como fonte unica e chave composta]]: o espelho + sync incremental server-side continuam **vigentes**, mas a **fonte** passou a ser o **relatório** (`reports.json`, não a API `ClientRequests.json`) e a **chave** passou a ser a composta `engagement|#|grupo` (não `client_request_id`). Os trechos abaixo que citam `client_request_id`/API como fonte estão superados por D-0003.

## Contexto
A equipe precisa controlar as solicitações de auditoria que vivem no portal **EY Canvas**. Coletá-las à mão (planilha/Excel) é trabalhoso e desatualiza. O EY Canvas não oferece API pública integrável diretamente do nosso backend.

## Alternativas consideradas
- Continuar exportando Excel do EY Canvas e importando no app.
- **Extrair o JSON das solicitações no navegador autenticado do usuário** (bookmarklet/snippet ou bridge Tampermonkey) e gravar num espelho no Supabase, com sync incremental.

## Escolha e porquê
**Espelho `ey_requests` no Supabase + sync incremental server-side.** A coleta roda no navegador do usuário (já autenticado no EY Canvas, passa MFA) e produz JSON; o app faz upsert idempotente por `client_request_id`. O **diff é calculado no servidor** (RPC `ey_sync`, comparação por hash) — só linhas mudadas são gravadas, e cada mudança vira log campo-a-campo em `ey_request_changes`, com execuções em `ey_sync_runs`. Sem Excel, sem reescrever tudo a cada coleta.

## Rotas descartadas e porquê
- Scraping/integração a partir do nosso servidor: o EY Canvas exige sessão autenticada + MFA do usuário; coleta no browser do próprio usuário é o caminho viável.
- Pipeline via Excel: o que se quer justamente eliminar.

## Consequências
- Backend pronto (`upsertEyRequests`, `eySync`, `ey_*` em `store.js`; RPC `ey_sync`).
- Falta: criar `ey_engagements` ([[I-0001 Criar tabela ey_engagements no Supabase]]), portar a UI de extração ([[I-0002 Portar UI de extracao EY para o app]]), corrigir o filtro que limita a 174/253 ([[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]]) e, opcionalmente, a bridge Tampermonkey ([[I-0004 Bridge Tampermonkey para coleta automatica EY]]).
