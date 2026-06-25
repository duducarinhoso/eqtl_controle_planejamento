---
data_atualizacao: 2026-06-25
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

### Disciplina de revisão de design (aplicar AUTOMÁTICO em toda mudança de UI) — *origem: revisão DS v2, 2026-06-24*
O Eduardo cansou de retrabalho por eu ajustar elemento isolado sem consultar o modelo nem olhar a tela toda. Em cada mudança visual, sem precisar pedir (versão operacional = checklist em `Central.md` § 🎨 Painel de Design):
- **Consultar o modelo COMPLETO primeiro.** Antes de criar/ajustar qualquer elemento, achar o equivalente (ou o mais próximo) em `design-system_v2.html` e seguir estrutura/tipografia/cor/espaçamento. **Não recriar** o que já existe (CSS, tokens, sidebar, botões, tema); **não desviar "no olho".**
- **Revisão holística:** a cada screenshot, olhar a **tela inteira**, não só o que mudou — caçar incoerências, elementos fora do lugar, oportunidades.
- **Cor com semântica e distinção:** escolher pela função/significado; estados **claramente distinguíveis**; reconciliar com cores já existentes (ex.: `STATUS_RAMP`). Nada de "colorir sem olhar o conteúdo".
- **Coerência ícone↔rótulo** (errei com engrenagem no botão "Usuários").
- **WCAG AA (≥4.5:1) em claro E escuro**, calculado; fonte branca exige fundo escuro o bastante; verificar nos dois temas no browser.
- **Cross-review** em mudança significativa: ≥2 lentes/skills, **uma revisando o trabalho da outra**, antes de dar por pronto.
- **Decisões de marca/conta (confirmadas):** sidebar colapsada mostra o **mascote** (`modelos/.../ivy_programando.png`) e expandida mostra a **logo** (`app_planejamento_logo.png`); menu de **conta único**, no **rodapé da sidebar** (não duplicar no topbar).

## Stack & arquitetura

- **Vanilla JS, sem framework e sem build step, de propósito.** App servido como arquivos estáticos (GitHub Pages). Não introduzir Node/npm/bundler/framework sem decisão explícita.
- **Verificação é empírica, no browser** (servidor local porta 5500 / `start.bat`), em dark e light. Não há framework de testes; nunca pedir ao Eduardo para "testar manualmente" sem verificar primeiro.

## Git & comunicação

- **Git: o agente pode fazer qualquer operação, desde que o Eduardo concorde.** Commit, branch, merge e push liberados mediante aval explícito dele (mensagem de commit em português); nada no git acontece sem que ele concorde. — *origem: ajuste 2026-06-25 (antes: commit/push só quando pedido; antes disso, git era exclusivo do Eduardo)*
- **Continuidade entre máquinas via git.** Por isso `projeto/` e `.claude/skills/` ficam **versionados** (fora do `.gitignore`); o checkpoint + push fecham a sessão, o pull + leitura do `Central.md` abrem a próxima.
- **Tudo em português**, mensagens de commit incluídas (sem Conventional Commits em inglês obrigatório).
- **Não inventar fatos na Central.** Só entra o que foi confirmado pelo Eduardo ou já está implementado; em dúvida, perguntar. Sincronizar Central ↔ código é dever.
