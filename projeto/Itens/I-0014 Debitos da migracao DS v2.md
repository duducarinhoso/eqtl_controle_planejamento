---
id: I-0014
titulo: Débitos da migração DS v2 (CSS morto, composição do topbar, cache-bust)
status: aberto
prioridade: P3
frente: Design / dívida técnica
origem: "chat 2026-06-24"
atualizado: 2026-06-24
decisoes: ["[[D-0004 Migracao 100% para o DS v2 (casa nova)]]"]
---

# Débitos da migração DS v2

Itens menores levantados na revisão, para faxina (✅ resolvido / ⏳ pendente):

- ⏳ **CSS morto** em `styles/app.css`: bloco da landing legada (`.landing*`, `.proj-card{background:#fff}`, `.landing-top`, `.landing-gear`, `.pc-*`) — confirmado **sem uso** no JS; remover.
- ⏳ **Composição do topbar:** com a conta movida para a sidebar, o topbar ficou só com a busca encostada à direita (lado esquerdo vazio). Decidir: ancorar a busca à esquerda, deixá-la ocupar a largura, ou repensar o topbar. (Decisão de desenho aberta.)
- ⏳ **Cache-bust `?v=N`** em `app.js`/`ds.js` no `index.html`: foi só para furar o cache do browser durante a migração — limpar/normalizar antes de "fechar" a Fase 6. (Nesta sessão subiu para `app.js?v=11` ao ajustar a logo e a guarda do `renderAll`; `ds.js` segue em `v=4`.)
- ⏳ **Badge vermelho do modelo** (branco sobre `--red #e16464` = 3.38) reprova WCAG — só importa se criarmos um status "Rejeitado/Erro"; aí escurecer o red/ink.
- ✅ **Mascote no rail:** agora **46px e centralizado** (era 38px) — legibilidade validada no browser. A logo expandida também ficou maior e centralizada (180×65, igual à tela de projetos), em header de marca de 88px; tudo escopado em `.sidebar .brand` (não afeta a sidebar legada). SVG `ivy_programando.svg` segue como alternativa ao PNG. Resolvido em `styles/app-ds.css`.
- ✅ **Toggle de tema poluía o console** (achado nesta sessão): `toggleTheme()` do modelo dispara `renderAll() → buildCharts()`, que tenta montar os gráficos/medidores **DEMO do modelo** (`#lastWeekChart`/`#topProductsChart`/`#leadsChart`, `.g-svg`/`.spark`) — inexistentes no app — e o Chart.js loga `Failed to create chart` em toda tela sem esses elementos. Resolvido em `js/app.js` com guarda em `window.renderAll` (só executa o original se houver alvos do modelo), **sem tocar no `ds.js` verbatim**. Verificado: 0 erros ao trocar tema, inclusive com canvas genérico presente (simulando dashboard do app). Quando a grade/dashboards migrarem ao DS v2 e usarem esses elementos, a guarda volta a deixar passar automaticamente.
