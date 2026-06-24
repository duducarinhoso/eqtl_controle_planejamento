---
id: I-0008
tipo: divida-tecnica
status: aberto
prioridade: P3
criado: 2026-06-24
resolvido:
modulo: grade
fase:
origem:
  - "bootstrap 2026-06-24 (varredura de grid.js / sheets.frozen_*)"
---

A tabela `sheets` tem metadados `frozen_rows`/`frozen_cols`, mas o render da grade (`grid.js`) **não congela** linhas/colunas de fato (só os cabeçalhos sticky padrão). Funcionalidade meia-ligada.

**Ação:** decidir se vale implementar o freeze de linhas/colunas configurável ou remover os metadados não usados. Baixa prioridade até alguém pedir.
