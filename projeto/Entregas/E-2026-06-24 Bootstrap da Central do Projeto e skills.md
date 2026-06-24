---
data: 2026-06-24
modulo: processo
fase:
itens:
  - "[[I-0001 Criar tabela ey_engagements no Supabase]]"
  - "[[I-0002 Portar UI de extracao EY para o app]]"
  - "[[I-0007 Trabalho em andamento sem commit (home login EY DS v2)]]"
---

# Bootstrap da Central do Projeto + skills de checkpoint e planos

Sessão de **organização, sem código de produto**. A pedido do Eduardo, montou-se em `eqtl_controle_planejamento` o mesmo sistema de acompanhamento de plano/checkpoint usado no projeto `new_bull_sistema`, adaptado a este app (vanilla JS estático + Supabase).

## O que foi criado

### Skills (em `.claude/skills/`, versionadas)
- **`eqtl-checkpoint`** — adaptada da `new-bull-checkpoint`: grava o handoff da sessão na pasta `projeto/` (Entrega + Itens + Decisões + Central + checklist de sync). Gatilho: `/eqtl_checkpoint` ou "fechar a sessão", "fazer o checkpoint" etc.
- **`writing-plans`** — adaptada: planos bite-sized salvos em `projeto/planos/`; verificação empírica no browser (sem framework de testes); respeita "alinhar antes de executar".
- **`executing-plans`** — adaptada: executa o plano com checkpoints; git é do Eduardo.

### Central do Projeto (em `projeto/`, versionada)
- `Central.md` — hub (onde estamos + próximos passos).
- `Inventario.md` — telas, módulos de código, entidades Supabase, design system (levantado por varredura do código).
- `Roadmap.md` — 7 fases (0–4 entregues; 5 EY e 6 DS v2 em andamento; 7 Cronograma não iniciado).
- `Stack.md` — stack factual (vanilla JS, Supabase, tabelas, RPCs, canais Realtime).
- `Preferencias.md` — preferências do Eduardo (modelos à risca, git é dele, sóbrio/institucional, sem framework).
- `Itens/` — I-0001..I-0008 (8 itens abertos mapeando os ajustes/implementações pendentes).
- `Decisoes/` — D-0001 (vanilla JS estático) e D-0002 (EY espelho + sync incremental), registradas a partir do estado do código.
- `Entregas/` — esta nota.
- `planos/` — vazio (README explicando o fluxo writing-plans).
- `Arquivo/` — congelado (vazio).

## Como o estado atual foi levantado
Varredura factual do código por agente de exploração: `index.html`, `js/*.js` (app/store/grid/auth/excel/realtime/supabase/util), `modelos/`, `tools/`, e `git log`. Nada de progresso fictício — o que está como ✅ foi confirmado no código; o que está ⏳/🔨 idem.

## Verificação
Conferido que `projeto/` e `.claude/skills/` **não** estão no `.gitignore` (só `.claude/settings.local.json` é ignorado globalmente, por ser machine-local) → o sistema viaja para a outra máquina via `git push`/`pull`.

## Próximo passo
Eduardo commita o trabalho em andamento ([[I-0007 Trabalho em andamento sem commit (home login EY DS v2)]]) + esta Central, faz `push`, e na sequência podemos atacar a Fase 5 (EY): [[I-0001 Criar tabela ey_engagements no Supabase]] → [[I-0002 Portar UI de extracao EY para o app]] → [[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]].
