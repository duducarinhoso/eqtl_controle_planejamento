---
id: D-0007
data: 2026-06-25
status: vigente
modulo: parser + cadastro de empresas
itens: ["[[I-0015 Cores de status livres (10) e Status Geral (categoria) por item]]"]
---

# De-Para de empresas (grafias / aliases)

## Contexto
A mesma empresa aparece com grafias diferentes nas abas ("GO" numa, "EQTL GO" noutra), então o parser as conta como empresas distintas. Conserto manual (renomear célula a célula) é destrutivo, não escala e não pega importações futuras. O Eduardo pediu controle central do De-Para.

## Alternativas consideradas
- **De-Para central no cadastro** (cada empresa com "outras grafias"), resolvido no parser para o nome canônico.
- Conserto manual nas células (status quo) — destrutivo, por aba, não ajuda o futuro.
- Normalização agressiva (sem acento) automática — descartada (ver abaixo).

## Escolha e porquê
**De-Para central, não-destrutivo, reversível, global.** Cada empresa pode ter `aliases`; o parser monta um `Map(chave(grafia) → canônico)` e resolve cada célula para o canônico. A planilha fica intacta; remover o alias separa de novo; toda importação futura cai certa.

## Rotas descartadas e porquê
- **Normalização sem acento** (tratar "Pará"="Para"): **descartada** a pedido do Eduardo — a chave mantém acento; "Pará/Para" exigem alias explícito.
- **Match por substring/prefixo:** descartado — "EQTL" engoliria "EQTL MA/PA/GO". Mantido **match exato** (após `key` = minúsculas+trim+colapsa espaços).

## Consequências
`companies.aliases text[]` (rodar `sql/18_company_aliases.sql`). Editor de grafias no cadastro com **unicidade** (alias não pode ser de outra empresa). O "Detectar das abas" passa a oferecer "anexar como grafia". Vale **global** (parser do dashboard e contadores). Registros guardam o **canônico** (dashboard/tooltip/modal mostram o canônico).
