---
id: I-0014
titulo: Débitos da migração DS v2 (CSS morto, composição do topbar, cache-bust)
status: aberto
prioridade: P3
frente: Design / dívida técnica
origem: "chat 2026-06-24"
decisoes: ["[[D-0004 Migracao 100% para o DS v2 (casa nova)]]"]
---

# Débitos da migração DS v2

Itens menores levantados na revisão, para faxina:
- **CSS morto** em `styles/app.css`: bloco da landing legada (`.landing*`, `.proj-card{background:#fff}`, `.landing-top`, `.landing-gear`, `.pc-*`) — confirmado **sem uso** no JS; remover.
- **Composição do topbar:** com a conta movida para a sidebar, o topbar ficou só com a busca encostada à direita (lado esquerdo vazio). Decidir: ancorar a busca à esquerda, deixá-la ocupar a largura, ou repensar o topbar. (Decisão de desenho aberta.)
- **Cache-bust `?v=N`** em `app.js`/`ds.js` no `index.html`: foi só para furar o cache do browser durante a migração — limpar/normalizar antes de "fechar" a Fase 6.
- **Badge vermelho do modelo** (branco sobre `--red #e16464` = 3.38) reprova WCAG — só importa se criarmos um status "Rejeitado/Erro"; aí escurecer o red/ink.
- **Mascote no rail (38px):** validar legibilidade; SVG (`ivy_programando.svg`) disponível como alternativa ao PNG.
