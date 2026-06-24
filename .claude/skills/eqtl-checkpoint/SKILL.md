---
name: eqtl-checkpoint
description: Gera o checkpoint de handoff entre sessões do projeto EQTL Controle de Planejamento. Sintetiza a partir da conversa atual as decisões recentes, o que foi codificado e os próximos passos, e atualiza a Central do Projeto na pasta projeto/ — cria a nota de Entrega da sessão, atualiza o status dos Itens tocados, cria notas de Decisão (incluindo rotas descartadas), atualiza o Central.md e roda o checklist de sincronização. Use SEMPRE que o usuário digitar /eqtl_checkpoint, ou pedir para "fechar a sessão", "fazer o resumo técnico", "atualizar a Central", "salvar o estado do projeto", "fazer o checkpoint", "registrar o que foi feito antes do compact", ou quando estiver encerrando um bloco de trabalho para abrir um chat novo. Dispare mesmo que o usuário não cite o nome do arquivo — o gatilho é a intenção de registrar o progresso da sessão antes de pausar.
---

# Skill: Checkpoint de Handoff — EQTL Controle de Planejamento

Esta skill captura o **estado real de uma sessão de trabalho** e o grava na **Central do Projeto** (`projeto/`), para que a próxima sessão (após `/compact`, um chat novo, ou **outra máquina**) retome exatamente de onde parou.

## Por que esta skill existe

O fluxo do Eduardo é: trabalhar até concluir um bloco → **fechar a sessão** registrando o que foi feito → `git commit` → `/compact` ou continuar em outra máquina → pedir *"analise o `projeto/Central.md` e inicie pelo próximo passo"*. O elo frágil é o registro: se for impreciso, inventado ou desorganizado, a sessão seguinte parte de base errada. Esta skill torna o registro **fiel, estruturado e consistente** com a Central.

Princípio que rege tudo: **registre o que aconteceu de verdade, não o que seria bom ter acontecido.** A fonte é a conversa atual. Se nada foi efetivamente codificado/decidido, diga isso — não preencha com progresso fictício.

## A estrutura da Central (onde cada coisa vai)

```
projeto/
├── Central.md       ← hub: "Onde estamos", "Próximos passos" (VOCÊ atualiza)
├── Itens/           ← uma nota por pendência/ideia/decisão-a-tomar (I-NNNN) — você muda status
├── Decisoes/        ← uma nota por decisão tomada (D-NNNN, ADR-lite) — você cria
├── Entregas/        ← uma nota por sessão de entrega (E-YYYY-MM-DD) — você cria
├── Inventario.md    ← telas/entidades/regras/componentes — você vira status ⏳→✅
├── Roadmap.md · Preferencias.md · Stack.md  ← você toca só quando muda de verdade
├── planos/          ← planos de implementação (skill writing-plans)
└── Arquivo/         ← histórico congelado — NUNCA editar
```

Regra de ouro: **uma nota de Item nunca é apagada nem movida.** Concluiu → `status: resolvido` + `resolvido: <data>` + seção `## Desfecho` linkando a Entrega/Decisão. Abandonou uma rota → `status: descartado` + o porquê no corpo. Assim o rastro e as ramificações ficam pesquisáveis.

## Fonte da verdade: a conversa atual

Releia a sessão e extraia:
1. **Decisões tomadas** — escolhas de modelagem, schema Supabase, RLS, navegação, UX, padrões. Inclua as **alternativas consideradas e por que foram descartadas** (isso vira nota de Decisão).
2. **O que foi codificado/entregue** — telas, módulos JS, funções do `store.js`/`grid.js`/`app.js`, migrations/SQL no Supabase, correções. Concreto: nomes de arquivos, funções, tabelas, RPCs, verificação rodada (preview).
3. **Próximos passos / pendências novas** — o que ficou como "a fazer", decisões em aberto que surgiram.

Você pode ler um arquivo de código pontual para confirmar um nome exato; não faça varredura especulativa.

## Procedimento

### 1. Liste o que vai tocar — antes de editar
Diga, em uma linha, quais notas da Central vai criar/atualizar (Entrega nova, quais Itens, quais Decisões, e o `Central.md`). A invocação da skill autoriza escrever **dentro de `projeto/`** (exceto `Arquivo/`, que é congelado). Nada de "limpezas" fora daí.

### 2. Crie a nota de Entrega da sessão
Se algo foi entregue, crie `projeto/Entregas/E-<DATA> <titulo curto>.md`:
```markdown
---
data: <DATA>
modulo: <modulo>
fase: <Fase N, se aplicável>
itens: ["[[I-XXXX …]]"]   # itens que esta entrega fecha
---

<registro detalhado: arquivos de código, migrations/SQL, decisões locais, verificação executada — a prosa longa mora aqui>
```
Se nada foi concluído, não invente entrega — pule este passo.

### 3. Atualize o status dos Itens tocados
Para cada Item entregue: `status: resolvido`, `resolvido: <DATA>`, e acrescente `## Desfecho` com link para a Entrega/Decisão. Para cada rota abandonada: `status: descartado` + porquê. Para pendência nova surgida na sessão: crie um Item novo em `projeto/Itens/` (`I-NNNN` = próximo id livre; descubra listando a pasta), `status: aberto`, com `origem: "chat <DATA>"`.

### 4. Crie notas de Decisão (com rotas descartadas)
Para cada decisão arquitetural da sessão, crie `projeto/Decisoes/D-NNNN <titulo>.md`:
```markdown
---
id: D-NNNN
data: <DATA>
status: vigente
modulo: <modulo>
itens: ["[[I-XXXX …]]"]
---

## Contexto
## Alternativas consideradas
## Escolha e porquê
## Rotas descartadas e porquê
## Consequências
```
As alternativas descartadas são **registradas**, não descartadas.

### 5. Atualize `Central.md` e rode o checklist de sincronização
- `Central.md`: `data_atualizacao` → `<DATA>`; reescreva "🟢 Onde estamos agora" e "🎯 Próximos passos imediatos" (promova o próximo passo real ao topo do callout ▶️ COMEÇAR AQUI); atualize o rodapé "Última atualização".
- `Inventario.md`: vire o status das linhas afetadas (⏳ → ✅).
- **Checklist de sincronização** (a rede contra defasagem): a sessão mexeu em algo que torna `Stack.md` ou o `Inventario.md` (telas/entidades/componentes) divergente do código? → atualize. Surgiu preferência nova confirmada do Eduardo? → acrescente em `Preferencias.md` **e** salve na auto-memory.

### 6. Datas
Use **a data atual da sessão** em todos os campos de data. Não copie datas antigas.

### 7. Feche com o resumo + os dois quadros para copiar
Entregue um resumo de 2–4 linhas do que registrou e, **na sequência, dois blocos de código** (cercas ```` ``` ````) — eles existem para o Eduardo copiar com um clique, então cada um deve ser autossuficiente e ficar **sozinho dentro da sua própria cerca**, sem prosa misturada.

**Quadro 1 — Texto de retomada (pra colar na próxima sessão / outra máquina).** Um bloco de código com a mensagem que o Eduardo vai colar no chat novo. Deve conter, em poucas linhas: o pedido de ritual (`analise o projeto/Central.md e vamos iniciar pelo próximo passo`) + um resumo curtíssimo de onde paramos e qual é o próximo passo concreto, para a sessão nova já chegar orientada mesmo antes de ler a Central. Exemplo de forma:
````
```
Retomada — EQTL Controle de Planejamento (<DATA>)
Analise o projeto/Central.md e vamos iniciar pelo próximo passo.
Onde paramos: <1 linha do estado real>.
Próximo passo: <ação concreta, ex.: I-0001 criar ey_engagements>.
```
````

**Quadro 2 — Sugestões de commit (lista).** Um segundo bloco de código com uma **lista** do que entrou nesta sessão, para o Eduardo montar o(s) commit(s). Derive os itens do que foi de fato tocado (arquivos/telas/módulos/SQL desta sessão — a mesma matéria-prima do passo 2). Comece com uma sugestão de mensagem de commit em português e, abaixo, os bullets do que mudou. Exemplo de forma:
````
```
Sugestão de commit:
<mensagem curta no imperativo, ex.: "Cria tabela ey_engagements e porta UI de extração">

Inclui nesta sessão:
- <arquivo/área alterada — o que mudou>
- <...>
- projeto/ (Central + Entrega + Itens atualizados pelo checkpoint)
```
````
Se a sessão não produziu código de produto (ex.: só organização/Central), o Quadro 2 lista o que mudou em `projeto/` e nas skills — sem inventar mudanças de código. Não inclua arquivos sensíveis/gitignored (`config.js`, `*.xlsx`, `/usuarios/`, `.env*`) na lista.

Depois dos quadros, lembre o fluxo (fora das cercas):
> Checkpoint gravado. Agora: faça o `git commit` (e `push`, se for continuar em outra máquina), rode `/compact` ou abra um chat novo e cole o Quadro 1.

Você não executa `git`, `/compact` nem abre chat novo — isso é do usuário. Os quadros são sugestões; o Eduardo decide o que entra no commit.

## Sinais de qualidade
- Quem ler o `Central.md` num chat novo, **sem contexto desta conversa**, sabe o que está pronto e qual o próximo passo — sem ambiguidade.
- Nada de entrega fictícia: cada `resolvido` corresponde a algo que de fato aconteceu.
- Toda decisão não-trivial da sessão tem nota em `Decisoes/`, com as rotas descartadas.
- `Central.md` ficou enxuto; o detalhe foi para a Entrega.
- O fechamento traz os **dois quadros** (retomada + sugestões de commit), cada um sozinho dentro da sua cerca ```` ``` ````, prontos para copiar com um clique — sem prosa misturada dentro do bloco.

## Convenções de escrita
Wikilinks `[[Nota]]` para cruzar Itens/Decisões/Entregas (texto puro, sem Obsidian — é só convenção de referência), callouts `> [!important]`, frontmatter YAML, tabelas. Mantenha o mesmo vocabulário visual que a Central já usa.
