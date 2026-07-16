---
id: D-0011
data: 2026-07-16
status: vigente
modulo: Shell / UI
---

## Contexto
O Eduardo pediu o "padrão de alta densidade com ajuste de tamanhos" do Cronograma — para mostrar muita informação na tela. No Cronograma é a CSS `zoom` no `<html>` (default 0.8), com controle "Aa" e persistência.

## Alternativas consideradas
- **Zoom global** no `<html>` (padrão Cronograma) — afeta o app inteiro.
- **Zoom escopado só à tela tabela** — resto do app intocado; mas os popovers do datagrid (portal no body) ficariam em tamanho diferente (inconsistência).

## Escolha e porquê
**Zoom global** (`js/uizoom.js` + script anti-flash no `index.html`), default 80%, controle "Aa" (`js/zoomctl.js`) no topbar, persistido em `localStorage["eqtl-ui-zoom"]`. Todo container full-height passou a usar `var(--app-vh) = calc(100dvh / var(--app-zoom))` (senão a tela corta, pois `zoom` não expande a viewport). Popovers portalizados do datagrid dividem `getBoundingClientRect` por `appZoom()`.

## Rotas descartadas e porquê
- Escopar só à tabela: geraria menus/popovers em escala diferente do resto; menos fiel ao Cronograma. Recusado.

## Consequências
- **Exceção: a tela de login não usa o zoom** — `suspendZoom()` no `showAuth`, `initZoom()` ao montar o app autenticado (o zoom cortava o login). Confirmado pelo Eduardo: "o contexto do zoom não se aplica à tela de login".
- Colisão de nome resolvida: já existia `setZoom` (zoom da grade); o novo é importado como `setUiZoom`/via `zoomctl.js`.
- `--app-vh` trocou `100vh`/`100dvh` em `design-system.css`, `app-ds.css`, `home.css`, `app.css`, `solic.css`.
