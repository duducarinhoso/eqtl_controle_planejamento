---
id: D-0006
data: 2026-06-25
status: vigente
modulo: dashboard
itens: ["[[I-0010 Tela do projeto integrada no shell do modelo]]"]
---

# Números do dashboard contam itens DISTINTOS

## Contexto
A tab "Empresas" usa a regra **multivalorada**: um item cuja aba pertence a mais de uma Área conta em **cada coluna de processo** (espelha como o usuário marca). Isso fazia o card "Itens mapeados" (3219, distintos) divergir da tag "Todas" e do total da matriz (5395, ocorrências). O Eduardo apontou a incoerência.

## Alternativas consideradas
- **A — régua = itens distintos (3219):** card, chips, tags de empresa, barras e os Totais (linha/geral) da matriz contam itens distintos; só as células e o total por processo expandem.
- **B — tudo por ocorrência (5395):** auto-consistente, mas "Itens mapeados" deixaria de ser o número real de itens.
- **C — manter os dois com rótulos:** sem mudar números, só rotular.

## Escolha e porquê
**A.** O número-régua tem que ser o de **itens distintos** (verdadeiro, ideal para auditoria) e bater em todo lugar. Implementado via `byCompanyStatus` (do `parseAbas`, conta cada item 1× por empresa): `empScopedByStatus`, `empCompanyFilter`, totais de linha/geral da matriz e `empBars` passaram a usá-lo. As **células** e o **total por processo** (`tfoot`) seguem expandidos.

## Rotas descartadas e porquê
B e C — B esconde o número real de itens; C deixa dois números confusos lado a lado.

## Consequências
Card = tags = totais de linha = total geral = 3219 (todos distintos). A **soma das colunas** (por processo) pode passar do total geral — um item em +1 processo aparece em cada coluna. Há **nota** na matriz explicando isso. Trade-off aceito.
