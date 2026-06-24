---
data_atualizacao: 2026-06-24
tipo: preferencias
---

# 🎚️ Preferências do Eduardo

> O que o Eduardo já confirmou sobre **como** trabalhar e decidir neste projeto. Cada item tem origem rastreável. A skill `eqtl-checkpoint` acrescenta aqui toda preferência nova confirmada na sessão. Preferências universais valem também para os outros projetos do Eduardo.

## Processo & decisão

- **Estruturar o plano com calma antes de executar — não partir pra execução às pressas.** Mesmo quando ele diz "faça um plano e execute", se houver decisões de design abertas, ele prefere **alinhar primeiro** (escopo + decisões com recomendação, decidir) e **só depois** escrever o plano e executar. — *origem: preferência transversal do Eduardo (projeto New Bull, 2026-06-18)*
- **Propor antes de executar.** Análise de pendência = alternativas + recomendação + pergunta final antes de tocar no código.
- **Sinalizar requisitos descartados ao ofertar opções.** Quando uma opção abre mão de algo que ele já pediu/documentou, dizer isso na hora, na descrição da opção.
- **Agir como crítico — questionar a necessidade real, construir enxuto.** Perguntar "isso precisa existir agora? tem consumidor?"; não trazer/guardar mais do que o necessário; adiar camadas sem consumidor.
- **Extração da EY é sempre em lote (nível relatório/engagement), nunca abrindo solicitações item a item.** "Executar = ter o relatório na base"; não navegar/abrir itens individuais para coletar dados. — *origem: auto-memory `extracao-em-lote-nao-item` (chat 2026-06-24)*

## Modelos & design

- **Usar exatamente os HTMLs de `modelos/`, não recriar do zero.** Quando o Eduardo aponta um modelo (`design-system_v2.html`, `00,tela_login.html`, `01.tela_inicial_v2.html`), usar **o conteúdo dele** como fonte — não a paráfrase nem a minha interpretação. — *origem: auto-memory `usar-modelos-do-usuario`*
- **Quando o Eduardo manda um arquivo como fonte (PDF/xlsx/print/HTML), LER o arquivo e executar com base nele.** Seguir à risca (ordem, nomes, o que aparece); não cortar itens nem adicionar os que não estão lá.
- **Ajustes de UI literais — não inventar elementos.** Ao pedir um ajuste (redimensionar, mover, recolorir), fazer **só aquilo**; não adicionar cards/seções "pra aproveitar o espaço".
- **Identidade institucional, sóbria e confiável** (PRODUCT.md). Anti-referência: SaaS genérico colorido/lúdico, glassmorphism decorativo espalhado, dashboards hero-metric. A ferramenta some na tarefa: densidade e clareza acima de espetáculo.

## Stack & arquitetura

- **Vanilla JS, sem framework e sem build step, de propósito.** App servido como arquivos estáticos (GitHub Pages). Não introduzir Node/npm/bundler/framework sem decisão explícita.
- **Verificação é empírica, no browser** (servidor local porta 5500 / `start.bat`), em dark e light. Não há framework de testes; nunca pedir ao Eduardo para "testar manualmente" sem verificar primeiro.

## Git & comunicação

- **Git é exclusivo do Eduardo.** O agente nunca commita/branch/merge/push; só descreve em português o que ele deve rodar. — *origem: preferência transversal*
- **Continuidade entre máquinas via git.** Por isso `projeto/` e `.claude/skills/` ficam **versionados** (fora do `.gitignore`); o checkpoint + push fecham a sessão, o pull + leitura do `Central.md` abrem a próxima.
- **Tudo em português**, mensagens de commit incluídas (sem Conventional Commits em inglês obrigatório).
- **Não inventar fatos na Central.** Só entra o que foi confirmado pelo Eduardo ou já está implementado; em dúvida, perguntar. Sincronizar Central ↔ código é dever.
