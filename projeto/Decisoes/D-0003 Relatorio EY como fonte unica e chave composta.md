---
id: D-0003
data: 2026-06-24
status: vigente
modulo: integracao-ey
refina: "[[D-0002 EY Canvas - espelho e sync incremental server-side]]"
itens: ["[[I-0001 Criar tabela ey_engagements no Supabase]]", "[[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]]", "[[I-0009 Fazer 1a coleta real EY e validar volumetria]]"]
---

> Refina [[D-0002 EY Canvas - espelho e sync incremental server-side]]: o espelho + sync incremental continuam; mudam a **fonte** e a **chave**.

## Contexto
D-0002 assumiu fonte = JSON da API (`ClientRequests.json`) e chave = `client_request_id`. Ao avançar surgiram dois bloqueios: (1) `ClientRequests.json&quickfilter=3` traz só **174 de 253** ([[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]]); (2) os **documentos** (aba "View by document") **não têm endpoint JSON em lote** — só existem no relatório ou item a item (e abrir item a item foi vetado pelo usuário).

## Alternativas consideradas
- **A — API JSON como fonte:** achar o `quickfilter` que traz 253 + buscar documentos por solicitação (N chamadas por engagement).
- **B — Relatório (.xlsx) como fonte única:** `reports.json/{engId}` traz View by tag (253 completo) + View by document numa só busca, em memória, sem diálogo.

## Escolha e porquê
**B — Relatório como fonte única.** Resolve completude (253) **e** documentos de uma vez; é o "espelho do portal" que o usuário já chama de relatório ("Executar = ter o relatório na base"); dispensa N chamadas por item. Como o relatório **não traz `client_request_id`**, a chave virou a composta **`engagement|#|grupo`** (a chave oficial do projeto antigo `eqtl_auditoria_controle`). O `fetch` do relatório fica **em memória — sem o diálogo "Salvar como"**.

## Rotas descartadas e porquê
- **Corrigir o `quickfilter` da API** p/ trazer 253: descartada — mesmo trazendo, faltariam os documentos detalhados; o relatório resolve os dois.
- **Abrir solicitação a solicitação** p/ pegar documentos: **vetado pelo usuário** — extração é em lote, nível relatório (auto-memory `extracao-em-lote-nao-item`).
- **Parsear o .xlsx no domínio do EY:** bloqueado por CSP (esm.sh barrado) → parse no app/userscript (SheetJS).

## Consequências
- `ey_requests` re-chaveada para `chave` (`eng|#|grupo`); `client_request_id` opcional. `ey_request_changes`/`ey_request_documents` ligam por `chave`. RPCs `ey_sync`/`ey_sync_documents` reescritas e validadas.
- A coleta precisa de **veículo no browser** (userscript com `GM_xmlhttpRequest`) por causa do CSP (parse + gravação). `fetchReportBlob`/`parseReport` em `tools/ey_api.js`; userscript em `tools/ey_userscript.user.js`.
- [[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]] resolvido por aqui (não pela correção do filtro). Documentos viram 1ª-classe (aba View by document).
