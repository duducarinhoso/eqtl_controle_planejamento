---
id: I-0012
titulo: Re-tematizar a grade (planilha) ao DS v2 e aposentar o CSS legado
status: aberto
prioridade: P2
frente: Design / Grade
origem: "chat 2026-06-24"
decisoes: ["[[D-0004 Migracao 100% para o DS v2 (casa nova)]]"]
---

# Re-tematizar a grade (planilha) ao DS v2

A grade é a **única superfície sem equivalente no modelo** (é planilha) e a mais densa/arriscada → fica **por último**. Hoje vive escopada em `.lg-app/.lg-sidebar/.lg-topbar` (`app.css`) + `.grid` (`grid.js`).

**O que fazer:** re-tematizar **consultando os tokens do modelo** (cores de célula/borda/cabeçalho via `--card-bg/--border/--grid-line/--text`, tipografia Roboto, status pelas badges `st-*`), mantendo a densidade e o comportamento (teclado/scroll/zoom/merge/presença). Ao concluir, remover o CSS legado da grade e os `tokens.css`/`app.css` antigos quando **ninguém mais os usar**.

**Depende de** [[I-0010 Tela do projeto integrada no shell do modelo]] (a grade passa a viver no `.content` do shell). **Consultar:** Definition of Done (Central § Painel de Design); `styles/design-system.css` (tokens); `styles/app.css` (regras `.lg-*` e `.grid` a migrar).
