---
data: 2026-07-16
modulo: Operações / Projetos
fase: "Modelo de projeto 'tabela' (novo)"
itens: ["[[I-0016 Acoes em lote na Base Gerencial]]", "[[I-0017 Edicao de data em 1 clique]]", "[[I-0018 Reimport com modal de divergencias]]"]
decisoes: ["[[D-0009 Segundo modelo de projeto (tabela) com datagrid vanilla]]", "[[D-0010 SheetJS no lugar de ExcelJS (slicers)]]", "[[D-0011 Densidade global (zoom da UI) exceto login]]", "[[D-0012 Rota do projeto por slug do nome]]"]
---

# Entrega — Modelo de projeto "tabela" (datagrid vanilla) + Dashboard + densidade + slug

Sessão longa (2026-07-16). Nasceu a **2ª opção de modelo de projeto**: além da grade (espelho do Excel), agora há a **tabela estruturada** — o usuário carrega a aba "Lista de pedidos", vira uma tabela de colunas fixas com status calculado pela aplicação, num datagrid com paridade ao do projeto irmão (Cronograma). No fim entraram o **Dashboard gerencial** e a correção do zoom no login. **Publicado no `main`/GitHub Pages** (commits `88ad503`, `fddac0a`, `118d75d`, `5b11e53`, `0f4171f`, `4140ef4`; cache `v=24 → v=40`).

## O que foi codificado

### Fase 1 — Tipo de projeto (grade | tabela) — `88ad503`
- `sql/21_project_kind.sql`: coluna `projects.kind` (`grade`|`tabela`, default `grade`, check). **Aplicada** no Supabase (projeto `scsxisjvtfsqayujfgvd`).
- `store.createProject` aceita `kind`; `newProject` (`app.js`) ganhou o seletor de modelo; `mountProject` bifurca por `kind` → `js/planning.js` (view do modelo tabela). Estilo do seletor em `app-ds.css`.

### Fase 2 — Persistência + carga — `fddac0a`
- `sql/22_planning_items.sql`: tabela `planning_items` (13 colunas de entrada + auditoria) com **índice único** `(project_id, item_num, referencia, grupo, empresa)` — a chave que bloqueia/atualiza no reimport. RLS `to authenticated`. **Aplicada** (via conexão direta — ver abaixo).
- `store`: `planningAvailable/list/upsert/update/deletePlanningItems` (upsert idempotente por `onConflict` da chave).
- `js/table_import.js`: **detecção da aba pelas colunas** (não pede a aba ao usuário) + leitura **tipada** (datas). Usa **SheetJS** (`getXLSX`), não ExcelJS — ver [[D-0010 SheetJS no lugar de ExcelJS (slicers)]].

### Fase 3 — Datagrid vanilla — `118d75d`
- `js/datagrid.js` (port do `DataTable.tsx`): colunas tipadas, auto-fit por medição em canvas, redimensionar, sticky, ordenação, seleção, agrupamento colapsável, virtualização.
- `js/listview.js` (port do `ListView.tsx`): toolbar completa (busca, filtrar choice/data + calendário, agrupar, classificar, exportar, chips, seleção em lote), persistência da visão em `localStorage`.
- `styles/datagrid.css`: CSS da referência **escopado em `.dg`**, tokens **mapeados ao DS teal do app** (herda cor + tema).

### Rota por slug — `5b11e53`
- `#/p/<slug-do-nome>` (ex.: `#/p/2tri2026-tabela-demo`) em vez do UUID; `applyRoute` resolve por slug **OU** id (links antigos abrem). Ver [[D-0012 Rota do projeto por slug do nome]].

### Fase 4 — Calculadas + edição inline + densidade + topbar — `0f4171f`
- `js/calc.js`: 4 colunas calculadas fiéis às fórmulas do Excel (Status de entrega/Geral/Prazo, Dias de atraso) — chips read-only.
- Edição inline das colunas de entrada (texto/data/select) com recálculo e persistência; **proteção da chave** (recusa colisão).
- **Densidade global** (padrão Cronograma): `js/uizoom.js` (zoom no `<html>`, default 80%, persiste), script anti-flash, `--app-vh` nos containers full-height, controle "Aa" (`js/zoomctl.js`) no topbar; popovers do datagrid compensados por `appZoom`. Ver [[D-0011 Densidade global (zoom da UI) exceto login]].
- Topbar do projeto tabela: voltar aos Projetos + nome + densidade + tema.

### Dashboard + fix zoom no login — `4140ef4`
- Duas **abas** no projeto tabela: **Dashboard** | **Base Gerencial** (persistida por projeto).
- `js/dashboard.js`: agrega os `planning_items` **no cliente** (reusa `calc.js`) e desenha em HTML/SVG + CSS (sem lib, como o Cronograma). 8 KPIs com **ícone + semáforo**, donut, cruzamentos Empresa × Status Geral/Prazo, ranking por área/grupo (top + scroll), média de dias de atraso + saúde, top 5 empresas (%). **Filtros interativos** (popover multi-seleção) recalculam tudo. Corrigido o N/A que caía em "Concluído" (categoriza por `statusEntrega`, não `statusGeral`). Ver [[D-0013 Dashboard client-side, teal, enxugando redundancias]] (racional no plano).
- `js/present.js`: **modo apresentação** (tela cheia) + **copiar imagem / PNG / PDF** via `html2canvas`/`jsPDF` por CDN (sem build).
- `styles/dashboard.css` (escopo `.dash`, teal, dois temas).
- **Fix:** o zoom da UI **não se aplica à tela de login** — `suspendZoom()` no `showAuth`, `initZoom()` ao montar o app autenticado (resolvia a tela de login cortada pelo zoom).

## Decisões de alinhamento (com o Eduardo, nesta sessão)
- Modelo tabela: colunas fixas conforme a "Lista de pedidos"; chave `# + Referência + Grupo + Empresa`; colunas calculadas pela app; **sem guardar listas** (empresa/segmento = texto livre); detecção da aba pelas colunas; reimport com modal de divergências (a fazer).
- Datagrid: **vanilla, paridade total** com o React do Cronograma (regra de ouro: sem framework/build) — ver [[D-0009 Segundo modelo de projeto (tabela) com datagrid vanilla]].
- Todas as colunas de entrada editáveis; as calculadas read-only.
- Densidade: **global** (app inteiro, default 80%), padrão Cronograma; login fica em 100%.
- Dashboard: **rico** (replicando o modelo do Eduardo, organizado, sem redundância), filtros compactos, top 10 + scroll, ícones + semáforo, cabeçalho com destaque + logo; protótipo v2 aprovado antes de implementar.

## Infra / operação
- **`.env` local** (gitignored) com a `DATABASE_URL` do Postgres (fornecida pelo Eduardo) — usada para aplicar `sql/21`/`sql/22` por `psycopg2` quando o conector MCP do Supabase caiu. Não versionado.
- Projeto de demonstração **"2TRI2026 — Tabela (demo)"** (`59ff3572-…`) criado no banco com as **258 linhas** para o Eduardo testar o datagrid/dashboard.

## Verificação (browser, dark+light)
- Fase 1: seletor de modelo, criação de projeto tabela, `kind='tabela'` no banco, rota/reload — OK (confirmado em produção pelo Eduardo).
- Fase 2: parse 258 linhas + detecção da aba + upsert idempotente (reimport não duplica) — OK.
- Fase 3: render, virtualização, ordenação, agrupamento (9 grupos), filtro choice + data, chips, tema teal — OK.
- Fase 4: 17 colunas, calculadas batendo com o Excel, edição inline com recálculo + persistência, proteção da chave — OK.
- Slug: card→slug na URL; abre por slug e por UUID (fallback); grade e tabela — OK.
- Dashboard: KPIs corretos (258/248/0/0/0/10/0%/0d), donut, cruzamentos, filtros (CEA→31), apresentação (captura `html2canvas` OK), dark — OK.
- Zoom login: login em 100% (não corta), app em 80% — OK.

## Pendências desta frente
- [[I-0016 Acoes em lote na Base Gerencial]] — seleção múltipla + editar/excluir/exportar em lote.
- [[I-0017 Edicao de data em 1 clique]] — clicar (1×) na célula de data já abre o seletor + limpar fácil.
- [[I-0018 Reimport com modal de divergencias]] — tabs Novas/Alterados/Sem mudança/Fora da planilha, preservando edições da app.
