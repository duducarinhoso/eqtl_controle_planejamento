---
id: D-0001
data: 2026-06-24
status: vigente
modulo: arquitetura
itens: []
---

> Decisão **registrada no bootstrap** a partir do estado do código (não tomada nesta sessão). Documentada para que a próxima sessão entenda o porquê do stack.

## Contexto
Portal interno de controle de solicitações de auditoria, usado em desktop pela equipe EQTL/EY. Precisa de grade colaborativa em tempo real, auth, histórico e deploy simples.

## Alternativas consideradas
- SPA com framework (React/Next) + build/bundler.
- **Vanilla JS (ES modules) servido estático + Supabase** como backend gerenciado.

## Escolha e porquê
**Vanilla JS + Supabase, sem framework e sem build step.** O app é um conjunto de arquivos estáticos (`index.html` + `js/*.js` + `styles/*.css`) servido por GitHub Pages; toda a lógica de tempo real, auth, storage e dados fica no Supabase (Realtime, Auth PKCE, RLS, Storage, RPC). Um helper `h()` faz hyperscript no lugar de JSX. Simplicidade de deploy e zero toolchain.

## Rotas descartadas e porquê
- Framework + bundler: traria toolchain (Node/npm/build) que o projeto evita de propósito; o ganho não justifica para o escopo atual.

## Consequências
- Dev local exige servidor `http://` (ES modules) → `start.bat` / launch `eqtl-local` na porta 5500.
- Não há framework de testes; verificação é empírica no browser (dark+light).
- Não introduzir Node/npm/bundler/framework sem decisão explícita do Eduardo.
