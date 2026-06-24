# EQTL Controle de Planejamento

Portal interno de controle de solicitações de auditoria/planejamento contábil da Equatorial Energia (EQTL) + parceiros EY. Grade colaborativa em tempo real, status semafórico, histórico por célula, integração EY Canvas. Visão de produto: `PRODUCT.md`.

## ▶️ Comece por aqui
**Leia `projeto/Central.md`** — é o hub do projeto (onde estamos, próximos passos, itens abertos). Esta Central é o sistema de acompanhamento de plano/checkpoint; mantida pela skill `eqtl-checkpoint`.

- **Stack** (vanilla JS estático + Supabase, sem framework/build): `projeto/Stack.md`
- **Inventário** (telas, módulos, entidades): `projeto/Inventario.md`
- **Roadmap** por fases: `projeto/Roadmap.md`
- **Preferências** do Eduardo: `projeto/Preferencias.md`

## Regras de ouro
- **Git é do Eduardo.** O agente nunca commita/branch/push; descreve em português o que ele deve rodar. A continuidade entre máquinas é por git (`projeto/` e `.claude/skills/` são versionados de propósito).
- **Sem framework, sem build step.** App servido estático (GitHub Pages). Não introduzir Node/npm/bundler sem decisão explícita. Dev local: `start.bat` (porta 5500).
- **Verificação é no browser** (dark + light); não há framework de testes.
- **Usar os modelos de `modelos/` à risca** como fonte de design — não recriar do zero.
- **Alinhar o desenho antes de planejar/executar** quando houver decisões de design abertas.

## Skills do projeto (`.claude/skills/`)
- `eqtl-checkpoint` — fecha a sessão gravando o handoff em `projeto/` (gatilho: `/eqtl_checkpoint` ou "fazer o checkpoint").
- `writing-plans` — escreve planos bite-sized em `projeto/planos/`.
- `executing-plans` — executa um plano com checkpoints.
