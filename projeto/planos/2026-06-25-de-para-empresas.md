# De-Para de Empresas (grafias/aliases) — Plano de Implementação

> **Para quem executa:** skill `executing-plans`. Verificação no browser (5500) dark+light + Definition of Done. Schema muda → roda SQL no Supabase (passo do Eduardo). Git é do Eduardo.

**Goal:** Resolver na fonte o problema de uma mesma empresa aparecer com grafias diferentes nas abas ("GO" vs "EQTL GO"): cada empresa na **Lista de Empresas** ganha **outras grafias (aliases)**; o parser passa a casar qualquer grafia e a contabilizar sob o **nome canônico**. Não-destrutivo (a planilha fica intacta), reversível, e pega importações futuras automaticamente.

**Architecture:** Um campo `aliases` na empresa (banco) → o parser monta um `Map(chave(grafia) → nome canônico)` de canônicos + aliases e resolve cada célula para o canônico. Vale **global** (parser do dashboard e demais usos de empresa). UI no cadastro + extensão do "Detectar das abas".

**Tech Stack:** Supabase (`companies`), Vanilla JS (`js/parser.js`, `js/store.js`, `js/app.js`), DS v2.

---

## Decisões fechadas (Eduardo, 2026-06-25)
- **Normalização = minúsculas + trim + colapsar espaços; MANTÉM acento** (`"Pará" ≠ "Para"` salvo alias explícito).
- **Match exato** (não substring) — preservar.
- **Abrangência = global** (uma definição empresa+aliases para todo o app).
- **Descoberta = estender "Detectar das abas"** para sugerir anexar rótulos não-casados como grafia de uma empresa existente.
- **Canônico nos registros**: o parser guarda o nome canônico (dashboard/tooltip/modal mostram o canônico).

---

## Fase A — Schema: `companies.aliases`

### Tarefa A.1: SQL (Eduardo roda no Supabase)
- [ ] Criar `sql/18_company_aliases.sql` com:
```sql
alter table public.companies add column if not exists aliases text[] not null default '{}';
```
- [ ] Eduardo roda no SQL Editor. (Sem isso, as fases seguintes não persistem aliases.)

---

## Fase B — Dados + parser (o coração)

### Tarefa B.1: `store` lê/grava aliases
**Arquivos:** `js/store.js` (`loadCompanies`, `upsertCompany`/`addCompanies`)
- [ ] `loadCompanies` passa a trazer `aliases` no `select` (ou `select("*")`). `upsertCompany` aceita `{ label, position, aliases }`.
- [ ] Verificar: console sem erro; `getCompanies()` devolve objetos com `.label` e `.aliases` (array).

### Tarefa B.2: `parser` resolve grafias → canônico
**Arquivos:** `js/parser.js`
- [ ] Adicionar a chave de normalização (sem acento):
```js
const key = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
```
- [ ] `parseAbas` monta o mapa de resolução de empresas (canônico + aliases) e passa para `parseSheet`:
```js
const companyResolve = new Map();
(companies || []).forEach((x) => {
  const label = typeof x === "string" ? x : x.label;
  if (!label) return;
  companyResolve.set(key(label), label);
  (Array.isArray(x.aliases) ? x.aliases : []).forEach((a) => { if (a) companyResolve.set(key(a), label); });
});
```
- [ ] `parseSheet(sheet, cells, companyResolve, statusSet)`: troca `companySet` por `companyResolve`.
  - `isCompany(s) = companyResolve.has(key(s))`.
  - Empresa do registro = **canônico**: matrix → `colCompany.set(c, companyResolve.get(key(val(headerRow,c))))`; list → `emp = companyResolve.get(key(val(r, compCol)))`. (E `companies:[...]` do retorno = nomes canônicos distintos.)
- [ ] Verificar: numa aba com "GO" aliasado para "EQTL GO", os registros saem como "EQTL GO"; a matriz agrupa numa linha só. (Validação real = logado.)

### Tarefa B.3: chamadas do parser passam companies com aliases
**Arquivos:** `js/app.js` (`computeEmpresaAreaData`, `computeAbaStatusCounts`)
- [ ] Já chamam `parseAbas(..., getCompanies(), ...)`. Como `getCompanies()` agora traz aliases (B.1) e `parseAbas` os consome (B.2), nada mais muda aqui. Conferir.

---

## Fase C — UI do cadastro (editor de grafias)

### Tarefa C.1: campo "outras grafias" por empresa
**Arquivos:** `js/app.js` (gerenciador da Lista de Empresas), `styles/app-ds.css`
- [ ] Em cada linha de empresa, um editor de chips "outras grafias": ler `company.aliases`, adicionar (input + Enter/"+"), remover (x no chip); salvar via `store.upsertCompany({ id, aliases })`.
- [ ] **Unicidade:** ao adicionar uma grafia, rejeitar (toast) se `key(grafia)` já é canônico ou alias de **outra** empresa.
- [ ] Após salvar, invalidar o cache do cruzamento (`App._empData = null`) para o dashboard refletir.
- [ ] CSS dos chips coerente com o DS v2 (reusar `.badge`/chips existentes). Verificar dark+light.

---

## Fase D — Detector sugere anexar grafia

### Tarefa D.1: "Detectar das abas" oferece "anexar como grafia de…"
**Arquivos:** `js/app.js` (`detectCompanyCandidates` + UI do detector)
- [ ] Para cada rótulo candidato (não-casado) que **parece** empresa, além de "criar nova", oferecer um seletor "anexar como grafia de [empresa existente]".
- [ ] Ao anexar: `upsertCompany({ id: alvo, aliases:[...antigos, candidato] })` + invalidar cache. Verificar.

---

## Self-Review
- Recorrência de importações: resolvida (alias central pega grafias futuras) — Fase B.
- Controle do De-Para: Lista de Empresas (Fase C) + detector (Fase D).
- Não-destrutivo/reversível: o parser só mapeia; remover alias separa de novo.
- Global: parser é a fonte única usada pelo dashboard e contadores — Fase B.

## Riscos
- **Colisão de alias** → unicidade na C.1.
- **Match exato** preservado (sem substring) → não engole "EQTL MA/PA".
- **Acento mantido** (decisão) → "Pará/Para" exigem alias explícito se aparecerem as duas grafias.
- Schema novo (`aliases`) precisa do SQL aplicado antes (Fase A).
