---
id: I-0015
titulo: Cores de status livres (10) + "Status Geral" (categoria) por item
status: aberto
prioridade: P1
frente: Dashboard / Lista de Status
origem: "chat 2026-06-25"
decisoes: []
---

# Cores de status livres + "Status Geral" (categoria) por item

> [!important] Aguardando **confirmação do desenho** pelo Eduardo antes de planejar/implementar. Proposta visual já apresentada no chat (paleta de 10 + linha do editor).

## Objetivo (visão do Eduardo)
Hoje a "Lista de Status" tem 5 cores **semânticas** (verde/âmbar/azul/laranja/cinza = klasses `recebido/pendente/analise/parcial/na`), e a cor **é** a semântica que alimenta os KPIs do dashboard (Concluído/Pendência) e os heatmaps. O Eduardo quer **desacoplar**:
- **Cor** = só identidade visual, **livre** (10 opções num grid de swatches), refletindo em **chip, dashboard, tags, grade e onde mais aparecer**.
- **"Status Geral"** = um campo novo por item (**Concluído / Pendência / N/A**) que passa a ser o que o dashboard usa para os KPIs.

## Proposta (a confirmar)
- **Paleta 10 cores** (sóbria): verde `#2f7d4e`, âmbar `#8a6914`, teal `#246b78`, azul `#2f5fa0`, ciano `#0e7490`, roxo `#5b4b9e`, rosa `#9d3b6b`, coral `#b85c2e`, vermelho `#b3322f`, cinza `#64707a` — cada uma com chip + rampa de heatmap.
- **Schema:** `status_options.categoria` (`concluido`|`pendencia`|`na`) → `sql/19_status_categoria.sql`.
- **Editor (Lista de Status):** grid de swatches (10) + dropdown "Status Geral" por item.
- **Dashboard:** KPIs *Concluído*/*Pendências* somam por `categoria` (não pela cor). Chips/heatmaps usam a cor (klass).
- **Migração sem quebrar:** itens atuais herdam `categoria` pela cor de hoje (verde→Concluído, âmbar/azul/laranja→Pendência, cinza→N/A) se `categoria` vier vazio.

## O que já existe (base)
- O picker já virou **grid de swatches** (5 cores) — ver [[E-2026-06-25 Tela do projeto no shell DS v2, overhaul do dashboard, De-Para e fixes dark+export]].
- O export **lê a cor viva do chip** (`statusFillFor`), então segue automaticamente qualquer mudança de paleta.

## Pendências/decisões em aberto
- Confirmar a paleta de 10 e o conjunto de categorias (Concluído/Pendência/N/A — ou mais?).
- `statusClassFor` vs novo `statusCategoryFor`; ajustar `empKpis`/`renderDashStatus`/`renderDashUsers` para a categoria.
- Rampas de heatmap para as 5 cores novas.
