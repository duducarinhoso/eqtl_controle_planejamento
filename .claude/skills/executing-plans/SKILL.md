---
name: executing-plans
description: Use when you have a written implementation plan (in projeto/planos/) to execute with review checkpoints.
---

# Executing Plans — EQTL Controle de Planejamento

## Overview

Carregue o plano, revise criticamente, execute as tarefas, reporte ao concluir.

**Anuncie no início:** "Estou usando a skill executing-plans para implementar este plano."

## O Processo

### Passo 1: carregar e revisar o plano
1. Leia o arquivo do plano em `projeto/planos/`.
2. Revise criticamente — identifique dúvidas ou preocupações.
3. Se houver preocupações: levante com o Eduardo antes de começar.
4. Se não: crie um TodoWrite com as tarefas e prossiga.

### Passo 2: executar as tarefas
Para cada tarefa:
1. Marque como in_progress.
2. Siga cada passo exatamente (o plano tem passos bite-sized).
3. Rode as verificações como especificado — **no preview/browser** (porta 5500), em dark e light quando a UI mudar. Não pule verificação.
4. Marque como completed.

### Passo 3: concluir
Depois de todas as tarefas executadas e verificadas:
- Rode uma verificação final do fluxo completo no preview.
- Atualize o checkpoint (skill `eqtl-checkpoint`) se o bloco de trabalho fechou.
- Descreva ao Eduardo o `git commit` a fazer (git é dele).

## Quando parar e pedir ajuda

**PARE imediatamente quando:**
- Bater num bloqueio (dependência faltando, comportamento não reproduz, instrução ambígua).
- O plano tiver lacunas críticas que impedem começar.
- Você não entender uma instrução.
- A verificação falhar repetidamente.

**Peça esclarecimento em vez de adivinhar.**

## Quando revisitar passos anteriores

**Volte ao Passo 1 (Revisão) quando:**
- O Eduardo atualizar o plano com base no seu feedback.
- A abordagem de fundo precisar ser repensada.

**Não force a passagem por bloqueios** — pare e pergunte.

## Lembre
- Revise o plano criticamente primeiro.
- Siga os passos exatamente.
- Não pule verificações (preview, dark + light).
- Pare quando bloqueado, não adivinhe.
- Git é do Eduardo: descreva o commit, não execute.
- Nunca comece implementação direto no `main` sem o consentimento explícito do Eduardo.
