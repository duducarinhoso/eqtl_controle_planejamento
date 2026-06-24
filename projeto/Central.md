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

- **🆕 Migração para o Design System v2 — shell, sidebar e Projetos (2026-06-24):** o app começou a "mudar para a casa nova" (`modelos/design-system_v2.html`). Trazidos o CSS (`styles/design-system.css`) e o JS (`js/ds.js`) **verbatim** do modelo; **shell + sidebar + tela Projetos** agora no modelo (claro+escuro): 3 módulos (Portal EY / Operações / Administração), tema com toggle, marca (mascote ↔ logo) e conta consolidada na sidebar. Rodado o **painel de design com cross-review** → paleta de status semântica/distinta, contraste WCAG AA, ícones coerentes. Criada a **disciplina de revisão automática** (checklist Definition of Done em § 🎨 Painel de Design). Grade segue legada (escopada `.lg-*`, migra por último). Detalhe: [[E-2026-06-24 Migracao DS v2 (shell, sidebar, Projetos)]] · decisões [[D-0004 Migracao 100% para o DS v2 (casa nova)]] / [[D-0005 Navegacao em 3 modulos e tela do projeto integrada]].
- **🆕 Painel de skills de design instalado (2026-06-24):** vendorizadas em `.claude/skills/` as skills `impeccable`, `redesign-existing-projects` e `dudu-check-cores` (versionadas → portáveis via git) para agir como **painel de revisão** de visual/estrutura. Roteamento por contexto + protocolo de painel na seção **🎨 Painel de Design** abaixo.
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
- **Design System v2 (Fase 6)** — 🔨 **em migração** (virou o foco): shell + sidebar + Projetos já no modelo; falta a **tela do projeto integrada** ([[I-0010 Tela do projeto integrada no shell do modelo]]), telas leves ([[I-0011 Migrar telas leves restantes ao DS v2]]), **grade** ([[I-0012 Re-tematizar a grade (planilha) ao DS v2]]) e login/splash ([[I-0013 Alinhar login e splash ao DS v2]]). Guarda-chuva: [[I-0005 Propagar paleta DS v2 e auditar contraste WCAG AA]].
- **Cronograma (Fase 7)** — placeholder na home; escopo a definir.
- **Trabalho não commitado** — home, EY (store/import/tools), DS v2 e a própria Central aguardam commit do Eduardo.

## 🎯 Próximos passos imediatos

> [!important] ▶️ COMEÇAR AQUI
> **2026-06-24 — DS v2: próximo é a TELA DO PROJETO INTEGRADA.** Shell, sidebar e tela Projetos já estão no modelo. Próximo passo: **[[I-0010 Tela do projeto integrada no shell do modelo]]** — ao abrir um projeto, **permanecer no shell do modelo** (dashboard em cards `.stat`/`.card` + abas como nav contextual + a **grade/tabela do Excel no `.content`, mantida**), sem abrir tela nova. **Alinhar com o Eduardo, antes de codar,** o layout das abas (tabs no topo vs sub-lista lateral). A cada ajuste, rodar o checklist **Definition of Done** (§ 🎨 Painel de Design): consultar o modelo, revisão holística, cor semântica, ícone↔rótulo, WCAG claro+escuro, cross-review. O **passo-a-passo e o que consultar** estão no próprio item I-0010. Pendência paralela: **commitar/`push`** ([[I-0007 Trabalho em andamento sem commit (home login EY DS v2)]]); EY (I-0002/I-0009) **pausado**.

### Itens abertos (mapa do plano de ajustes)
| Item | Prioridade | Frente |
|---|---|---|
| [[I-0010 Tela do projeto integrada no shell do modelo]] | P1 | Design/Shell ◀ próximo |
| [[I-0007 Trabalho em andamento sem commit (home login EY DS v2)]] | P1 | commit/push |
| [[I-0011 Migrar telas leves restantes ao DS v2]] | P2 | Design |
| [[I-0012 Re-tematizar a grade (planilha) ao DS v2]] | P2 | Design/Grade |
| [[I-0005 Propagar paleta DS v2 e auditar contraste WCAG AA]] | P2 | Design (guarda-chuva) |
| [[I-0002 Portar UI de extracao EY para o app]] | P1 | EY (pausado) |
| [[I-0009 Fazer 1a coleta real EY e validar volumetria]] | P1 | EY (pausado) |
| [[I-0013 Alinhar login e splash ao DS v2]] | P3 | Design |
| [[I-0014 Debitos da migracao DS v2]] | P3 | dívida técnica |
| [[I-0006 Definir escopo do modulo Cronograma]] | P3 | Cronograma |
| [[I-0008 Render de linhas-colunas congeladas na grade]] | P3 | dívida técnica |

> Resolvidos nesta sessão (2026-06-24): [[I-0001 Criar tabela ey_engagements no Supabase]], [[I-0003 Filtro de extracao EY captura so 174 de 253 solicitacoes]], [[I-0004 Bridge Tampermonkey para coleta automatica EY]].

## 🎨 Painel de Design (skills de validação visual)

> [!info] Como funciona
> Três skills foram **vendorizadas** em `.claude/skills/` (versionadas → viajam entre máquinas via git) para agir como **painel de revisão**. Antes de mexer no visual/estrutura: consulte a(s) skill(s) certa(s) pelo contexto; em mudança significativa, rode as três **em paralelo, como agentes** (cada uma uma lente), **sintetize** e só então **aplique** — sempre verificando no browser em **dark e light**.

### ✅ Definition of Done por mudança de UI (rodar SEMPRE, automático)
> Aplicar a **cada** ajuste visual, sem precisar pedir — evita o retrabalho da sessão DS v2 (cores de status iguais, ícone errado, modal branco no dark, busca/perfil fora do lugar). Detalhe em `Preferencias.md` § Disciplina de revisão e auto-memory `design-revisao-automatica`.
> 1. **Consultei o modelo primeiro?** Achei o elemento (ou o mais próximo) em `design-system_v2.html` e reusei estrutura/tipografia/cor/espaçamento. **Não recriei** CSS/tokens/sidebar/botões/tema; **não desviei "no olho".**
> 2. **Olhei a TELA INTEIRA**, não só o que mudei (incoerências, elementos fora do lugar, oportunidades)?
> 3. **Cor com semântica + distinção?** Escolhida pela função; estados distinguíveis; reconciliada com cores já existentes (`STATUS_RAMP` em `app.js`).
> 4. **Ícone combina com o rótulo/ação?**
> 5. **Contraste WCAG AA (≥4.5:1) conferido em claro E escuro?** (fonte branca exige fundo escuro o bastante)
> 6. **Verifiquei no browser (5500) nos dois temas** antes de concluir?
> 7. **Mudança significativa → cross-review:** ≥2 lentes, **uma revisando o trabalho da outra** (não só em paralelo) — foi o que destravou os achados que faltavam.

### As três lentes
| Skill | Lente | Quando |
|---|---|---|
| `impeccable` | Estrutura · UX · hierarquia · layout · motion · UX copy | construir/reformular componente ou fluxo; crítica de UX; auditoria técnica (a11y/perf/responsivo); polish. Sub-comandos: `critique`, `audit`, `polish`, `colorize`, `typeset`, `layout`, `harden`, `craft`/`shape`… |
| `redesign-existing-projects` | Qualidade de redesign · anti-AI-slop | elevar tela existente; achar padrão genérico, estado faltando (loading/empty/error), inconsistência. Ciente de vanilla CSS e dashboards. |
| `dudu-check-cores` | Cor · contraste · tipografia (WCAG AA) | tela difícil de ler/cansativa, contraste, paleta, fadiga, brilho, dark vs light. **Gera preview antes/depois e pede autorização**; toca só cor/fonte, nunca layout. |

### Roteamento por contexto
| O assunto é… | Consulte |
|---|---|
| Contraste, cores, paleta, legibilidade, fadiga, dark/light | **dudu-check-cores** (sozinha basta) |
| Redesenhar/elevar tela existente · "parece genérico" · faltam estados | **redesign-existing-projects** + **impeccable** (`audit`/`polish`) |
| Construir/reformular componente ou fluxo · hierarquia · layout · motion · UX copy | **impeccable** (sub-comando pelo intento) |
| Propagar DS v2 + auditar contraste ([[I-0005 Propagar paleta DS v2 e auditar contraste WCAG AA]]) | **dudu-check-cores** (contraste) + **impeccable** (`extract`/`colorize`/`typeset`) + **redesign** (consistência) |
| Mudança visual/estrutural **significativa** | **painel completo** → protocolo abaixo |

### Protocolo do painel (mudança significativa)
1. **Validar antes de ajustar** — dispare as 3 lentes **em paralelo (como agentes)** sobre o escopo: A = impeccable (`critique` + `audit`), B = redesign (auditoria), C = dudu (cor/contraste, com preview).
2. **Sintetizar** — juntar achados, remover sobreposição, priorizar (crítico → atenção → opcional).
3. **Aprovar** — apresentar plano + preview antes/depois (do dudu); o Eduardo decide o que aplicar.
4. **Aplicar** — ajustes **literais e mínimos**; dudu só cor/fonte; não inventar elementos.
5. **Verificar** — browser (porta 5500), **dark e light**; reportar o que ficou de fora.

> [!warning] Guard-rails (de `Preferencias.md`)
> - **Identidade institucional, sóbria e confiável.** Evitar os modos "espetáculo" (impeccable `overdrive`/`delight`/`bolder`; upgrades de grain/glassmorphism/parallax do redesign) salvo pedido explícito — a ferramenta some na tarefa.
> - **impeccable exige Node** nos helpers `.mjs` (`scripts/context.mjs` etc.). Sem Node, usar a **orientação de design** da skill em modo manual; **não** introduzir Node no produto (regra "sem build step").
> - **Fonte de design = `modelos/`** (DS v2 `design-system_v2.html`), usados à risca.

## 🗺️ Navegação
- **Roadmap** por fases → `Roadmap.md`
- **Inventário** (telas/módulos/entidades) → `Inventario.md`
- **Stack** técnico → `Stack.md`
- **Preferências** do Eduardo → `Preferencias.md`
- **Painel de Design** (cor/estrutura/UX) → seção 🎨 acima · skills em `.claude/skills/`
- **Decisões** → `Decisoes/` · **Entregas** → `Entregas/` · **Itens** → `Itens/` · **Planos** → `planos/`

---
*Última atualização: 2026-06-24 (painel de skills de design vendorizado + roteamento na Central).*
