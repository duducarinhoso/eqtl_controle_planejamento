---
id: I-0005
tipo: tarefa
status: aberto
prioridade: P2
criado: 2026-06-24
resolvido:
modulo: design-system
fase: Fase 6
origem:
  - "modelos/design-system_v2.html (modificado)"
  - "bootstrap 2026-06-24"
---

A paleta v2 (institucional teal/verde/navy — `--blue: #246b78`, `--green: #71b280`, `--red: #e16464`, fonte Outfit) está em `modelos/design-system_v2.html` mas **ainda não foi propagada** a todos os componentes/telas do app (`styles/tokens.css` + demais). Falta consistência dark+light.

**Ação:** aplicar os tokens v2 em `styles/tokens.css` e telas, usando o modelo como fonte à risca; depois rodar auditoria de contraste (skill `dudu-check-cores`) para garantir WCAG AA (texto ≥ 4.5:1) em dark e light. PRODUCT.md pede "auditável e sério".

## Progresso (2026-06-24)
Virou uma **migração estruturada** (não só tokens): ver [[D-0004 Migracao 100% para o DS v2 (casa nova)]] e a entrega [[E-2026-06-24 Migracao DS v2 (shell, sidebar, Projetos)]]. **Feito:** Etapa 0 (CSS/JS do modelo verbatim) + Etapa 1 (shell + sidebar do modelo) + Etapa 2 parcial (tela **Projetos** no modelo) + painel de design (cross-review) com correções de cor/contraste (WCAG AA conferido) e da disciplina de revisão. **Fica aberto** — desdobrado em: [[I-0010 Tela do projeto integrada no shell do modelo]] (próximo), [[I-0011 Migrar telas leves restantes ao DS v2]], [[I-0012 Re-tematizar a grade (planilha) ao DS v2]], [[I-0013 Alinhar login e splash ao DS v2]], [[I-0014 Debitos da migracao DS v2]]. Correção: a fonte base passou a ser **Roboto** (não Outfit) e o tema **claro** é o padrão.

## Progresso (2026-06-25)
Grande avanço de contraste/paleta no overhaul: **paleta de status sóbria (B)** unificada (`#2f7d4e`/`#8a6914`/`#246b78`/`#b85c2e`/neutro) em chips/dashboard; correções de **dark mode** em vários pontos que vazavam tokens legados fixos (rail, dashboard, presença, drawers/modais, grade — ver [[D-0008 Grade isolada do tema e drawers theme-aware (dark)]]); legibilidade WCAG AA conferida por harness (claro+escuro). Detalhe: [[E-2026-06-25 Tela do projeto no shell DS v2, overhaul do dashboard, De-Para e fixes dark+export]]. **Segue aberto** (guarda-chuva): a re-tematização da grade ([[I-0012 Re-tematizar a grade (planilha) ao DS v2]]), Admin/telas leves restantes ([[I-0011 Migrar telas leves restantes ao DS v2]]) e login/splash ([[I-0013 Alinhar login e splash ao DS v2]]).
