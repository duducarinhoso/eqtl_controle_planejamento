---
id: D-0004
data: 2026-06-24
status: vigente
modulo: Design System
itens: ["[[I-0005 Propagar paleta DS v2 e auditar contraste WCAG AA]]"]
---

## Contexto
A UI inicial foi feita às pressas (navy/gold, Plus Jakarta/IBM Plex, light-only) só para sair da planilha. Existe um design system **pronto e completo** em `modelos/design-system_v2.html` (teal/navy institucional, Roboto, dark+light via `data-theme`, sidebar colapsável, cards, tabelas, badges, charts). O Eduardo quer **morar nele** e abandonar o estilo antigo: "só dá pra avançar depois que nos mudarmos".

## Alternativas consideradas
- **(A) Portar o CSS/JS do modelo como folha canônica** e migrar as telas para as classes/estrutura dele.
- **(B) Camada de alias** — manter os nomes de token atuais e só re-apontar valores para o v2.
- **(C) Recriar componentes "parecidos"** com o v2 (foi o que eu comecei a fazer, errado).

## Escolha e porquê
**(A).** O `<style>` e o `<script>` do modelo viram `styles/design-system.css` e `js/ds.js` (cópia **verbatim**); as telas passam a emitir as **classes/estrutura do modelo**, preenchidas com dados reais. Regra: ao precisar de um elemento, **consultar o modelo e reusar** o que já existe — nunca recriar (CSS, tokens, sidebar, botões, tema). Tema **claro por padrão** (menos choque que o dark do arquivo), com o toggle do próprio modelo. **Roboto** como fonte base. **Grade (planilha) por último** (superfície mais densa/arriscada).

## Rotas descartadas e porquê
- **(B) Alias:** mais rápido, mas o app continuaria "falando a língua antiga"; não se reusa a estrutura pronta — contraria o pedido de usar o modelo por completo. (Usei um alias só como **ponte temporária** na Etapa 0, depois substituída pelas classes do modelo.)
- **(C) Recriar parecido:** gerou retrabalho (recriei `shell.css`/`v2-tokens.css`/`v2-kit.css` que duplicavam o modelo — **apagados**). Aprendizado virou a [[D-0004 Migracao 100% para o DS v2 (casa nova)]]/disciplina de revisão.

## Consequências
- Migração por etapas (roteiro em `planos/2026-06-24-roteiro-mudanca-ds-v2.md`): 0 (trazer a casa) → 1 (shell/sidebar) → 2 (telas leves) → grade → login/splash.
- Nasce a **disciplina de revisão de design automática** (consultar o modelo antes, revisão holística, cor semântica, ícone↔rótulo, WCAG claro+escuro, cross-review) — `Preferencias.md` + auto-memory `design-revisao-automatica` + checklist na Central.
- Elementos sem equivalente no modelo (grade, modais, `.menu-group`) são criados **consultando os tokens/estética** do modelo (branch 3 da árvore de decisão), não inventados.
- Convive com o legado durante a transição: a **grade fica escopada em `.lg-*`** até migrar; `app.css/tokens.css` antigos saem quando ninguém mais os usar.
