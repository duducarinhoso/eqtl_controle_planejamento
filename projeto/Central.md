---
data_atualizacao: 2026-06-24
tipo: hub-projeto
---

# 🎯 Central do Projeto — EQTL Controle de Planejamento

> [!tip] Ritual de retomada (chat novo / outra máquina)
> 1. `git pull` (se trocou de máquina). 2. Peça: *"analise o `projeto/Central.md` e vamos iniciar pelo próximo passo."*

> [!info] Como esta Central funciona
> Cada pendência/ideia/decisão-a-tomar é uma nota em `Itens/` (`I-NNNN`), com `status` no frontmatter — a nota **nunca** é apagada nem movida ao fechar; só muda de status (`aberto`→`resolvido`/`descartado`). Cada decisão tomada vira uma nota em `Decisoes/` (`D-NNNN`, ADR-lite com rotas descartadas). Cada sessão de entrega vira uma nota em `Entregas/`. Planos de implementação ficam em `planos/`. O sistema é mantido pela skill `eqtl-checkpoint`. Wikilinks `[[...]]` são só convenção de referência (texto puro).

## 🟢 Onde estamos agora

- **🆕 EY: relatório como fonte única + schema incremental + userscript (2026-06-24):** `ey_engagements` **criada e populada** (2 engagements reais); descoberto o `reports.json` (baixa o relatório **em memória, sem diálogo "Salvar como"**); banco **re-arquitetado p/ o relatório como fonte**, chave `engagement|#|grupo`, com RPCs `ey_sync`/`ey_sync_documents`/`ey_sync_engagements` validadas + log de mudanças e de execuções (quem/quando/o quê); `tools/ey_api.js` (`fetchReportBlob`/`parseReport`) e `tools/ey_userscript.user.js` prontos. **Ainda sem coletar solicitações/documentos** (`ey_requests`=0) — o Eduardo vai montar a UI + botão "Executar" e fazer a 1ª coleta. Detalhe: [[E-2026-06-24 EY relatorio-fonte, schema incremental e userscript]] · decisão [[D-0003 Relatorio EY como fonte unica e chave composta]].
- **🆕 Central do Projeto + skills montadas (2026-06-24, SEM código de produto):** bootstrap do sistema de acompanhamento (igual ao `new_bull_sistema`, adaptado a este app vanilla JS + Supabase). Criadas as skills `eqtl-checkpoint`, `writing-plans`, `executing-plans` em `.claude/skills/`, e a pasta `projeto/` (Central, Inventário, Roadmap, Stack, Preferências, Itens I-0001..I-0008, Decisões D-0001/D-0002, Entrega do bootstrap). Estado atual levantado por varredura factual do código. `projeto/` e `.claude/skills/` ficam **versionados** (fora do `.gitignore`) para continuar em outra máquina via git. Detalhe: [[E-2026-06-24 Bootstrap da Central do Projeto e skills]].

### Produto — o que já está no ar (✅, levantado do código)
- **Auth completo** (login/signup/esqueci/reset + troca no 1º acesso) — `auth.js`.
- **Grade colaborativa** tipo planilha — `grid.js`: edição, undo/redo, copy/paste (fill Excel), formatação, merge, auto-fit, resize, status semafórico, comentários, histórico por célula.
- **Tempo real & presença** — `realtime.js`: sync de células, presença por célula, online/offline, marcador na célula.
- **Projetos + Abas** — multi-projeto, landing de cards, índice de aba (área/SCOT/Client Portal).
- **Dashboards em abas** (Status / Usuários) — heatmap, medidor de entregas, atividade por usuário.
- **Admin** — usuários, allowlist, avatar, roles; **lista de status configurável** (gerenciar lista).
- **Excel** — import/export `.xlsx` com formatação preservada.
- **Home / seletor de módulos** (Auditoria ativo · Cronograma inativo).

### Produto — em andamento / pendente (🔨/⏳)
- **Integração EY Canvas (Fase 5)** — backend **completo e validado** (relatório como fonte; `ey_engagements` populada; RPCs `ey_sync`/`ey_sync_documents`/`ey_sync_engagements`; userscript). Falta: **portar a UI + botão "Executar"** ([[I-0002 Portar UI de extracao EY para o app]]) e a **1ª coleta real** de solicitações/documentos ([[I-0009 Fazer 1a coleta real EY e validar volumetria]]). Filtro 174/253 resolvido pela troca de fonte ([[D-0003 Relatorio EY como fonte unica e chave composta]]).
- **Design System v2 (Fase 6)** — paleta institucional teal/navy em `modelos/design-system_v2.html`; falta propagar a todos os componentes + auditar contraste WCAG AA.
- **Cronograma (Fase 7)** — placeholder na home; escopo a definir.
- **Trabalho não commitado** — home, EY (store/import/tools), DS v2 e a própria Central aguardam commit do Eduardo.

## 🎯 Próximos passos imediatos

> [!important] ▶️ COMEÇAR AQUI
> **2026-06-24 — EY: backend pronto, falta a tela.** O backend da Fase 5 está completo e validado. Próximo passo: o **Eduardo vai montar a UI + botão "Executar"** ([[I-0002 Portar UI de extracao EY para o app]]) — usando os modelos de `modelos/` à risca e o protótipo `tools/ey_executar_preview.html` como referência — e depois **disparar a 1ª coleta real** pelo botão (ou pelo userscript `tools/ey_userscript.user.js`), validando a volumetria por grupo e o cruzamento do que mudou ([[I-0009 Fazer 1a coleta real EY e validar volumetria]]). Pendência paralela do Eduardo: **commitar/`push`** o trabalho ([[I-0007 Trabalho em andamento sem commit (home login EY DS v2)]]).

### Itens abertos (mapa do plano de ajustes)
| Item | Prioridade | Frente |
|---|---|---|
| [[I-0007 Trabalho em andamento sem commit (home login EY DS v2)]] | P1 | commit/push |
| [[I-0002 Portar UI de extracao EY para o app]] | P1 | EY |
| [[I-0009 Fazer 1a coleta real EY e validar volumetria]] | P1 | EY |
| [[I-0005 Propagar paleta DS v2 e auditar contraste WCAG AA]] | P2 | Design |
| [[I-0006 Definir escopo do modulo Cronograma]] | P3 | Cronograma |
| [[I-0008 Render de linhas-colunas congeladas na grade]] | P3 | dívida técnica |

> Resolvidos nesta sessão (2026-06-24): [[I-0001 Criar tabela ey_engagements no Supabase]], [[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]], [[I-0004 Bridge Tampermonkey para coleta automatica EY]].

## 🗺️ Navegação
- **Roadmap** por fases → `Roadmap.md`
- **Inventário** (telas/módulos/entidades) → `Inventario.md`
- **Stack** técnico → `Stack.md`
- **Preferências** do Eduardo → `Preferencias.md`
- **Decisões** → `Decisoes/` · **Entregas** → `Entregas/` · **Itens** → `Itens/` · **Planos** → `planos/`

---
*Última atualização: 2026-06-24 (EY: relatório como fonte, schema incremental e userscript).*
