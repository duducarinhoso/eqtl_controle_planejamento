# EY → Supabase · Playbook de implementação ("Executar extração")

> **Para que serve:** tudo que mapeamos e alinhamos, pronto para virar um **botão no app**
> ligado a uma **tabela do Supabase**. Quando você disser “implementar”, siga o **§7 (checklist)**.
>
> **Estado atual:** mapeamento + protótipo prontos. No banco, **só `ey_requests` foi criada**.
> `ey_engagements` e `ey_sync_runs` estão com SQL pronto aqui, **ainda não executado**.

> ✅ **ATUALIZAÇÃO (jun/2026) — o NÚCLEO INCREMENTAL já está no banco e validado.**
> Criadas na produção: `ey_requests` (turbinada: `in_portal`, `content_hash`, `tracked`,
> `first_seen_at`, `received_first_seen`, `priority`, `tag_name`), `ey_engagements`,
> `ey_request_changes`, `ey_sync_runs`, e a RPC **`ey_sync(p_engagement_id bigint, p_rows jsonb)`**.
> Funções em `js/store.js`: `eySync`, `upsertEyEngagements`, `listEyEngagements`,
> `listEySyncRuns`, `listEyRequestChanges`. As §4/§5 abaixo são **referência do que foi feito**.
> Falta: ligar à UI (**partir de `modelos/`**, não recriar) + resolver §8 (174 vs 253) + popular
> `ey_engagements` (via `EY.listEngagements()`→`upsertEyEngagements`).
>
> **Contrato `ey_sync`** — faz a varredura/diff no servidor e grava só deltas:
> entrada `{ p_engagement_id, p_rows: linhas de EY.mapRequest }` · saída
> `{ run_id, added, updated, unchanged, removed, total }`. Iguais → 0 escrita;
> sumidas → `in_portal=false` (só se extrato ≠ vazio); mudanças → `ey_request_changes`.

## TL;DR — quando chamar, faça nesta ordem
1. Rodar o SQL do **§4.2** (`ey_engagements`) e, se quiser histórico, **§4.3** (`ey_sync_runs`).
2. Colar as funções do **§5** em `js/store.js`.
3. Escolher/instalar o **bridge de detecção** do **§6** (userscript Tampermonkey — recomendado).
4. Integrar o **protótipo** (`tools/ey_executar_preview.html`) como tela/rota do app (**§7**).
5. Resolver a pendência **174 vs 253** (**§8**).

---

## 0. Mapa de arquivos (o que já existe)
| Arquivo | Papel |
|---|---|
| `tools/ey_fluxo_mapa.md` | Estados/assinaturas do caminho (login → MFA → logado) + catálogo de engagements |
| `tools/ey_api.js` | **Rotas + funções canônicas**: `getToken`, `listEngagements`, `fetchRequests`, `mapRequest`, `detectState` |
| `tools/ey_export_snippet.js` | Extrator pronto p/ rodar hoje (console **+ bookmarklet**) → copia JSON |
| `tools/ey_executar_preview.html` | **Protótipo de UX**: seleção de engagements + barra de progresso + caixa de confirmação + extração |
| `js/store.js` | Já tem `upsertEyRequests()` e `listEyRequests()` (tabela `ey_requests`) |
| `js/app.js` | Já tem o menu **“Importar da EY (colar JSON)…”** (`openEyImport`) |

---

## 1. Arquitetura (decisão-chave — não esquecer)
- A API de dados do EY (`eycanvasapp-us.ey.com`) exige **token Azure AD (MSAL)** que só existe na **aba logada do portal**. Renova sozinho enquanto logado; **backend isolado não consegue** (login Microsoft + **MFA PingID**).
- O **app (origin Supabase) NÃO** consegue ler a aba do EY nem chamar a API do EY (**CSP + cross-origin**).
- **Logo:** a **detecção do estado** e a **extração** rodam no **lado EY** (userscript/extensão). O **app mostra a barra de progresso** e grava no Supabase (sessão autenticada dele). O botão **“Continuar execução”** é o **fallback manual** que funciona sem bridge.

```
[Aba EY: userscript]  --detecta estado + extrai via API-->  (GM storage / POST)
        |                                                        |
        v                                                        v
[App: barra de progresso] <----- estado ----              [Supabase: ey_requests]
```

---

## 2. Rotas / API (resumo — detalhes em `ey_api.js`)
| O quê | Rota | Auth (token) |
|---|---|---|
| Lista de engagements | `GET https://eycanvasapp.ey.com/api/v2/engagements.json` | `cea-prd-app` (global) |
| Solicitações (paginado) | `GET https://eycanvasapp-us.ey.com/api/v2/ClientRequests.json?…&engagementid=<ID>&take=100&skip=<página>` | `cea-prd-us-app` (regional) |
| Token | `localStorage` chave `*-accesstoken-*` (campo `.secret`, `.expiresOn`) | — |
- Host regional vem do `Domain` do engagement (`clientportal-us` → `app-us`). Hoje ambos são `-us`.
- Resposta de ClientRequests: `{ totalCount, clientRequestList:[…], received, sent, accepted, … }`.

---

## 3. Estados detectáveis (rastreador) — resumo de `ey_fluxo_mapa.md`
| Estado | Reconhece por | Tipo |
|---|---|---|
| `opening` | abrindo `eycanvas.ey.com` | transitório |
| `login` | host `login.microsoftonline.com` (campo senha) | 🔴 gate |
| `mfa` | host `authenticator.pingone.eu/pingid/ppm/auth` | 🔴 gate |
| `ready` | host `eycanvas.ey.com`/`*clientportal-us*` **+ token `cea-prd-us-app`** | ✅ pronto |
Função pronta: `EY.detectState(EY.currentSignature())`. Clique impulsivo em engagement = continua `ready` (resiliente).

---

## 4. Tabelas no Supabase
RLS (padrão do projeto): `_read` = SELECT p/ `authenticated` (`using true`); `_write` = ALL p/ `authenticated` (`auth.role()='authenticated'`).

### 4.1 `ey_requests` — ✅ JÁ CRIADA (DDL p/ referência)
Espelho cru das solicitações. PK `client_request_id`; `group_name` = entidade/“aba”; coluna `raw jsonb`.
Já tem índices (`engagement_id`, `engagement_id,group_name`, `status`) e RLS. Funções em `store.js` (§5).

### 4.2 `ey_engagements` — ⛔ A CRIAR (SQL pronto)
Catálogo de engagements: registra novos e **mantém os que sumirem** (`is_active=false`, sem apagar).
```sql
create table if not exists public.ey_engagements (
  engagement_id  bigint primary key,
  name           text,
  domain         text,                 -- define a API regional
  status_id      int,                  -- 1=ativo, 7=restore…
  is_active      boolean not null default true,   -- veio na última sincronização?
  groups         jsonb,                -- nomes dos times
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  raw            jsonb
);
alter table public.ey_engagements enable row level security;
create policy ey_engagements_read  on public.ey_engagements for select to authenticated using (true);
create policy ey_engagements_write on public.ey_engagements for all to authenticated
  using (auth.role()='authenticated') with check (auth.role()='authenticated');
comment on table public.ey_engagements is 'Catálogo de engagements do EY Canvas; is_active=false marca os que sumiram da lista.';
```

### 4.3 `ey_sync_runs` — 🟡 OPCIONAL (histórico de execuções; útil p/ a barra de progresso)
```sql
create table if not exists public.ey_sync_runs (
  id             bigint generated always as identity primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  run_by         uuid references public.profiles(id),
  engagement_ids bigint[],
  total_upserted int,
  status         text default 'running',   -- running | done | error
  message        text
);
alter table public.ey_sync_runs enable row level security;
create policy ey_sync_runs_read  on public.ey_sync_runs for select to authenticated using (true);
create policy ey_sync_runs_write on public.ey_sync_runs for all to authenticated
  using (auth.role()='authenticated') with check (auth.role()='authenticated');
```

**Resumo:** criar `ey_engagements` (necessária) e, se quiser histórico, `ey_sync_runs` (opcional). `ey_requests` já existe.

---

## 5. Funções de dados (colar em `js/store.js` quando criar as tabelas)
`upsertEyRequests()` e `listEyRequests()` **já existem**. Adicionar:
```js
/* ===================== CATÁLOGO EY (ey_engagements) ===================== */
export async function upsertEyEngagements(list, { deactivateMissing = true } = {}) {
  if (!Array.isArray(list) || !list.length) return { upserted: 0 };
  const nowIso = new Date().toISOString();
  const rows = list.map((e) => ({
    engagement_id: e.engagement_id, name: e.name, domain: e.domain, status_id: e.status_id,
    groups: e.groups || null, is_active: true, last_seen_at: nowIso, raw: e.raw || null,
  }));
  const { error } = await supabase.from("ey_engagements").upsert(rows, { onConflict: "engagement_id" });
  if (error) throw error;
  if (deactivateMissing) {   // os que NÃO vieram nesta rodada -> inativos (não apaga)
    const ids = rows.map((r) => r.engagement_id);
    await supabase.from("ey_engagements").update({ is_active: false })
      .not("engagement_id", "in", "(" + ids.join(",") + ")");
  }
  return { upserted: rows.length };
}
export async function listEyEngagements({ activeOnly = false } = {}) {
  let q = supabase.from("ey_engagements").select("*").order("is_active", { ascending: false }).order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
```

---

## 6. Bridge de detecção (esqueleto Tampermonkey — recomendado)
GM storage é **compartilhado entre abas/origens** → a aba do EY reporta o estado e a aba do app lê.
`GM_xmlhttpRequest` **fura o CSP** → dá p/ extrair e gravar direto. Esqueleto a completar com `EY` de `ey_api.js`:
```js
// ==UserScript==
// @name         EY Extração — bridge
// @match        https://eycanvas.ey.com/*
// @match        https://eycanvasclientportal-us.ey.com/*
// @match        https://login.microsoftonline.com/*
// @match        https://authenticator.pingone.eu/*
// @match        http://localhost:5500/*        // a tela do app (ajuste à URL real)
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      eycanvasapp-us.ey.com
// @connect      scsxisjvtfsqayujfgvd.supabase.co
// ==/UserScript==
/* … colar o objeto EY de tools/ey_api.js aqui … */
(function () {
  const onEY = /ey\.com|pingone\.eu|microsoftonline\.com/.test(location.host);
  if (onEY) {
    // reporta o estado da aba EY a cada 1,5s
    setInterval(() => GM_setValue("ey_state", JSON.stringify({ ...EY.currentSignature(), t: Date.now() })), 1500);
    // ao receber "extrair" do app (GM_getValue('ey_cmd')): EY.fetchRequests(...) -> POST Supabase via GM_xmlhttpRequest
  } else {
    // na aba do app: lê o estado e dispara evento p/ a barra de progresso
    setInterval(() => window.dispatchEvent(new CustomEvent("ey:state",
      { detail: JSON.parse(GM_getValue("ey_state", "{}")) })), 1000);
  }
})();
```
Alternativa sem instalar nada (v1): manter o **fluxo de hoje** — bookmarklet (`ey_export_snippet.js`) copia JSON → app: “Importar da EY (colar JSON)”.

---

## 7. Integrar ao app (quando virar botão)
1. **SQL** §4.2 (+ §4.3 opcional).
2. **store.js**: colar §5.
3. **Menu** (`js/app.js`, perto de `openEyImport`): novo item admin **“Executar extração EY…”** → abre a tela do protótipo.
4. **Tela**: portar `tools/ey_executar_preview.html` para o app (mesmos componentes `h()`/`openModal`). Ao abrir: `listEngagements()` → `upsertEyEngagements()` → render da seleção a partir de `listEyEngagements()`.
5. **Progresso**: trocar a simulação por `EY.detectState()` alimentado pelo bridge (§6); a caixa “Continuar execução” aciona a extração (`EY.fetchRequests` por engagement) → `upsertEyRequests`.
6. (Opcional) registrar a execução em `ey_sync_runs`.

---

## 8. Pendências / decisões abertas
- **174 vs 253:** `quickfilter=3` traz só as “Excepcional/recebidas” (174 no FY27). Descobrir o filtro que traz **todas as 253** (testar outros `quickfilter`/`filtertype`, ou somar os baldes recebidas+enviadas+aceitas). Ajustar `EY.fetchRequests({quickfilter})`.
- **Bridge:** Tampermonkey (rápido) **vs** extensão dedicada (mais robusto p/ vários usuários).
- **URL do app** no `@match` do userscript (hoje `localhost:5500`; trocar pela URL de produção).
