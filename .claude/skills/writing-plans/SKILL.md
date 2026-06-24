---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task in the EQTL app, before touching code. Produz um plano de implementação em tarefas bite-sized, salvo em projeto/planos/.
---

# Writing Plans — EQTL Controle de Planejamento

## Overview

Escreva planos de implementação completos assumindo que o engenheiro tem **zero contexto** do nosso código e gosto duvidoso. Documente tudo: quais arquivos tocar em cada tarefa, o código, como verificar. Entregue o plano todo como tarefas pequenas. DRY. YAGNI. Commits frequentes.

Assuma um dev competente que sabe quase nada do nosso domínio (controle de solicitações de auditoria/planejamento da EQTL, integração EY Canvas) nem do nosso stack (vanilla JS + ES modules + Supabase, sem framework).

**Anuncie no início:** "Estou usando a skill writing-plans para criar o plano de implementação."

**Salve os planos em:** `projeto/planos/AAAA-MM-DD-<nome-da-feature>.md`

## Antes de escrever o plano: alinhar

O Eduardo prefere **alinhar o desenho antes de planejar/executar** (ver `projeto/Preferencias.md`). Se há decisões de design em aberto, apresente escopo + decisões com recomendação e **decida com ele** antes de escrever o plano. Não parta para execução às pressas.

## Scope Check

Se a spec cobre subsistemas independentes, sugira quebrar em planos separados — um por subsistema. Cada plano deve produzir software funcional e verificável por si só.

## File Structure

Antes de definir tarefas, mapeie quais arquivos serão criados ou modificados e a responsabilidade de cada um. No nosso app os módulos são grandes (`app.js`, `store.js`, `grid.js`) — siga os padrões já estabelecidos; não reestruture por conta própria, mas se um arquivo que você está mexendo cresceu demais, um split pontual no plano é razoável. Arquivos que mudam juntos vivem juntos.

## Bite-Sized Task Granularity

**Cada passo é uma ação (2–5 minutos):**
- "Escreva a função X em store.js" — passo
- "Ligue o botão no app.js" — passo
- "Verifique no preview (browser) que Y acontece" — passo
- "Commit" — passo

## Plan Document Header

**Todo plano DEVE começar com:**

```markdown
# [Nome da Feature] — Plano de Implementação

> **Para quem executa:** use a skill executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Objetivo:** [uma frase do que isto constrói]

**Arquitetura:** [2–3 frases sobre a abordagem]

**Stack tocado:** [arquivos/tabelas Supabase/RPCs principais]

---
```

## Task Structure

````markdown
### Tarefa N: [Nome do Componente]

**Arquivos:**
- Criar: `caminho/exato/arquivo.js`
- Modificar: `js/store.js` (função `xyz`)
- Supabase: tabela/RPC/migration `nome` (se houver)

- [ ] **Passo 1: escreva o código**

```js
export async function minhaFuncao(args) {
  // implementação completa, não pseudocódigo
}
```

- [ ] **Passo 2: ligue na UI**

(código exato do wiring em app.js)

- [ ] **Passo 3: verifique no preview**

Rodar: abrir `http://127.0.0.1:5500` (start.bat), reproduzir o fluxo.
Esperado: [comportamento observável concreto, dark + light]

- [ ] **Passo 4: commit**

```
git add <arquivos>
git commit -m "feat: <descrição em português>"
```
````

## Verificação neste projeto

**Não há framework de testes.** A verificação é **empírica, no browser**, via o servidor local (`start.bat` / launch `eqtl-local`, porta 5500) e as ferramentas de preview. Todo passo de código que altera comportamento visível deve ter um passo de verificação no preview descrevendo o fluxo e o resultado esperado (em dark e light quando a UI mudar). Para mudanças de dados Supabase, descreva a query/RPC e o resultado esperado. Nunca peça ao usuário para "testar manualmente" sem você mesmo verificar primeiro.

## No Placeholders

Todo passo contém o conteúdo real. **Falhas de plano** — nunca escreva:
- "TBD", "TODO", "implementar depois"
- "Adicione tratamento de erro apropriado" / "trate os edge cases" (sem mostrar como)
- "Escreva a verificação" (sem o fluxo concreto)
- "Similar à Tarefa N" (repita o código — podem ler fora de ordem)
- Referências a funções/tabelas não definidas em nenhuma tarefa

## Self-Review

Depois de escrever o plano, releia a spec com olhos novos:
1. **Cobertura da spec:** cada requisito tem uma tarefa? Liste lacunas e adicione tarefas.
2. **Scan de placeholder:** procure os red flags acima e corrija.
3. **Consistência de nomes:** funções/tabelas/colunas usadas em tarefas posteriores batem com as definidas antes? (`saveCell` numa tarefa e `salvarCelula` em outra é bug.)

## Execution Handoff

Depois de salvar o plano:

**"Plano completo e salvo em `projeto/planos/<arquivo>.md`. Quer que eu execute agora (skill executing-plans, em lotes com checkpoints para revisão) ou prefere revisar o plano antes?"**

Lembre que git é do Eduardo — você descreve os commits, ele executa.
