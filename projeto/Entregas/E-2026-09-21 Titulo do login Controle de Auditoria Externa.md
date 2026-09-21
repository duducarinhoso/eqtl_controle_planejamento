---
data: 2026-09-21
modulo: Auth / Login
fase: —
itens: []
---

Troca do título da tela de login: **"Portal da Contabilidade" → "Controle de Auditoria Externa"** (pedido do Eduardo).

## O que mudou
- `js/auth.js` (`renderAuth`, painel `.showcase`): `<h2>` do título. O subtítulo "Executiva Contabilidade IV" foi mantido.
- `login-preview.html` (protótipo): `<meta name="description">`, `<title>` da aba e `<h2>` do cabeçalho.

## Commits (publicados no `main`)
- `f302dcb` feat(login): título da tela de login passa a ser "Controle de Auditoria Externa"
- `b5aaecd` feat(login): atualiza título no login-preview para "Controle de Auditoria Externa"

## Verificação
- Não verificada no browser (troca de texto trivial; o Eduardo confere recarregando o login).
- Grep confirmou que não restou "Portal da Contabilidade" no código.
- O `<title>` do `index.html` do app segue "Controle de Solicitações · EQTL" (não alterado; trocar se o Eduardo quiser alinhar ao novo nome).
