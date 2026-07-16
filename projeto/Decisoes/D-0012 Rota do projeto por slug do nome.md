---
id: D-0012
data: 2026-07-16
status: vigente
modulo: Roteamento
---

## Contexto
A URL do projeto usava o UUID cru (`#/p/59ff3572-…`). O Eduardo quis um link mais familiar, com o nome do projeto.

## Alternativas consideradas
- **Slug derivado do nome em runtime** (sem migração).
- **Slug fixo no banco** (coluna `slug` única, imutável).

## Escolha e porquê
**Slug derivado do nome em runtime** (`slugify`/`slugForProject` em `app.js`): `#/p/<slug-do-nome>` (ex.: `#/p/2tri2026-tabela-demo`). O `applyRoute` resolve por **slug OU por id** (links antigos com UUID continuam abrindo). Vale para grade e tabela. Sem migração.

## Rotas descartadas e porquê
- Slug fixo no banco: exigiria migração + geração/backfill; o ganho (link imutável ao renomear) não compensa agora. Registrado como alternativa.

## Consequências
- Trade-offs aceitos: renomear o projeto **muda o link**; dois projetos de nome idêntico → o 2º abre só pelo UUID (fallback).
- `newProject` passou a inserir o projeto novo na lista em memória (para o slug funcionar na navegação imediata).
