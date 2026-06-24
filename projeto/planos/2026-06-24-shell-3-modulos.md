# Shell de 3 Módulos (Portal EY / Operações / Administração) — Plano de Implementação

> **Para quem executa:** use a skill `executing-plans` para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Objetivo:** Introduzir um shell permanente com um sidebar-rail de 3 módulos (Portal EY · Operações · Administração), mover a landing de Projetos para dentro de Operações, e deixar os demais itens como telas-placeholder — sem tocar em entidades/Supabase e sem desestabilizar a grade.

**Arquitetura:** Um novo "module shell" (`buildModuleShell`) renderiza um rail à esquerda (colapsa 64px → 230px no hover, grupos = módulos, estrutura inspirada em `modelos/design-system_v2.html`, cores via tokens atuais) e um slot de conteúdo `#mod-content` à direita. As telas de hub (EY, Operações→Projetos, Admin→*) montam nesse shell. A **grade** de um projeto (`#/p/<id>`) continua abrindo em tela cheia, exatamente como hoje (rota e código da grade intocados); o botão "↩" da grade passa a voltar para `#/operacoes`. A tela líquida (splash Auditoria/Cronograma) é mantida; **Auditoria** passa a abrir `#/operacoes`.

**Stack tocado:** `js/app.js` (helpers de papel, `buildModuleShell`, placeholders, roteamento, `showProjects`, botão "↩" do `buildShell`), `styles/shell.css` (novo), `index.html` (link do CSS). Sem Supabase, sem migrations.

---

## Decisões já fechadas (não reabrir na execução)

- **Sidebar:** rail único que expande no hover; os 3 módulos são **grupos** (rótulo de seção + itens). Base estrutural: `modelos/design-system_v2.html`. Cores: tokens atuais (`--side-bg1/2`, `--side-text`, `--side-accent`, `--side-line`, `--side-muted`) — paleta teal v2 completa fica para a Fase 6.
- **Porta de entrada:** mantém a tela líquida (`buildHome`). Botão **Auditoria** → `#/operacoes`. **Cronograma** segue inativo.
- **Grade intocada:** abrir um projeto continua tela cheia como hoje; só o destino do "↩" muda (→ `#/operacoes`).
- **Papéis:** `adm`→**Adm**, `operador`→**Operador**, ausência/desconhecido→**Visitante**. Nenhuma mudança no banco nesta fatia; só um mapeamento de exibição + gate de visibilidade do módulo Administração (visível só para Adm).
- **Escopo placeholder:** Portal EY (Solicitações/Executar/Engagements), Administração→Cadastros (abas Pessoas/Áreas/Unidades/Status), Administração→Usuários e Configurações entram como telas "em construção".

---

### Tarefa 1: Helpers de papel e visibilidade de módulo

**Arquivos:**
- Modificar: `js/app.js` (perto de `isAdmin()`, linha ~124)

- [ ] **Passo 1: adicione os helpers logo abaixo de `isAdmin()`**

```js
/* ---- Papéis de acesso (exibição). Banco continua com role 'adm'/'operador'.
   Mapeamento não-destrutivo: adm→Adm, operador→Operador, resto→Visitante. ---- */
function roleKey() {
  const r = (App.profile && App.profile.role) || "";
  if (r === "adm") return "adm";
  if (r === "operador") return "operador";
  return "visitante";
}
function roleLabel() {
  return { adm: "Adm", operador: "Operador", visitante: "Visitante" }[roleKey()];
}
/* quem enxerga o módulo Administração (por ora, só Adm) */
function canSeeAdmin() { return roleKey() === "adm"; }
```

- [ ] **Passo 2: verificação rápida (console)**

No preview, abra o console e rode `App` não está exposto; em vez disso confie na verificação visual das próximas tarefas. Nenhum comportamento muda ainda. (Sem commit isolado; segue na Tarefa 2.)

---

### Tarefa 2: CSS do rail de módulos (`styles/shell.css`)

**Arquivos:**
- Criar: `styles/shell.css`
- Modificar: `index.html` (adicionar `<link>`)

- [ ] **Passo 1: crie `styles/shell.css`**

```css
/* =====================================================================
   EQTL — Module Shell (rail de 3 módulos + slot de conteúdo)
   Estrutura inspirada em modelos/design-system_v2.html; cores via tokens.
   ===================================================================== */
.mshell { display: grid; grid-template-columns: var(--mrail-w, 64px) 1fr; height: 100vh; overflow: hidden; }
.mshell.expand { } /* hover-expand é feito no rail, não no grid */

.mrail {
  position: relative; z-index: 2;
  width: var(--mrail-w, 64px);
  background: linear-gradient(180deg, var(--side-bg1), var(--side-bg2));
  color: var(--side-text);
  border-right: 1px solid var(--side-line);
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  transition: width .26s cubic-bezier(.4,0,.2,1);
}
.mrail:hover, .mrail:focus-within { width: var(--mrail-w-open, 232px); }

/* marca/logo no topo */
.mrail-brand { display: flex; align-items: center; gap: 12px; height: 60px; flex: none; padding: 0 16px; border-bottom: 1px solid var(--side-line); }
.mrail-brand .mb-mark { width: 32px; height: 32px; flex: none; border-radius: 8px; display: grid; place-items: center; background: var(--side-accent); color: #fff; font-weight: 800; font-family: var(--font-ui); }
.mrail-brand .mb-name { white-space: nowrap; font-family: var(--font-ui); font-weight: 700; letter-spacing: .02em; color: #fff; opacity: 0; transform: translateX(-4px); transition: opacity .18s, transform .18s; }
.mrail:hover .mb-name, .mrail:focus-within .mb-name { opacity: 1; transform: none; }

/* corpo rolável com os grupos */
.mrail-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 8px 0; }
.mrail-body::-webkit-scrollbar { width: 6px; }
.mrail-body::-webkit-scrollbar-thumb { background: #ffffff24; border-radius: 999px; }

/* grupo = módulo */
.mrail-group { padding: 4px 0; }
.mrail-group + .mrail-group { border-top: 1px solid var(--side-line); }
.mrail-ghead { display: flex; align-items: center; gap: 14px; height: 44px; padding: 0 22px; cursor: pointer; color: var(--side-text); }
.mrail-ghead .gic { width: 20px; height: 20px; flex: none; display: inline-flex; }
.mrail-ghead .gic svg { width: 20px; height: 20px; stroke-width: 2; }
.mrail-ghead .glabel { white-space: nowrap; font-family: var(--font-ui); font-weight: 700; font-size: 12px; letter-spacing: .04em; opacity: 0; transform: translateX(-4px); transition: opacity .16s, transform .16s; }
.mrail:hover .glabel, .mrail:focus-within .glabel { opacity: 1; transform: none; }
.mrail-group.current .mrail-ghead { color: #fff; }
.mrail-group.current .mrail-ghead .gic { color: var(--side-accent); }

/* itens do grupo (texto; aparecem só expandido) */
.mrail-items { display: flex; flex-direction: column; max-height: 0; overflow: hidden; transition: max-height .22s ease; }
.mrail:hover .mrail-items, .mrail:focus-within .mrail-items { max-height: 320px; }
.mrail-item {
  display: block; width: 100%; text-align: left;
  padding: 8px 22px 8px 56px; border: 0; border-left: 3px solid transparent; background: transparent;
  color: var(--side-muted); font-family: var(--font-ui); font-weight: 600; font-size: 12.5px; white-space: nowrap; cursor: pointer;
  opacity: 0; transition: color .14s, background .14s, opacity .16s;
}
.mrail:hover .mrail-item, .mrail:focus-within .mrail-item { opacity: 1; }
.mrail-item:hover { color: #fff; background: var(--side-line); }
.mrail-item.active { color: #fff; background: var(--side-line); border-left-color: var(--side-accent); }

/* rodapé: usuário + (se admin) engrenagem */
.mrail-foot { flex: none; border-top: 1px solid var(--side-line); padding: 8px; }
.mrail-foot .user-chip { width: 100%; }

/* slot de conteúdo */
.mcontent { position: relative; min-width: 0; height: 100vh; overflow: auto; background: var(--workspace-bg); }

/* tela placeholder "em construção" */
.mplace { max-width: 760px; margin: 0 auto; padding: 48px 28px; }
.mplace .mp-kicker { font-family: var(--font-ui); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--on-surface-variant); }
.mplace h1 { margin: 6px 0 8px; }
.mplace .mp-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; }
.mplace .mp-tab { padding: 6px 12px; border: 1px solid var(--outline-variant); border-radius: 999px; font-family: var(--font-ui); font-weight: 700; font-size: 12px; color: var(--on-surface-variant); }
.mplace .mp-soon { margin-top: 20px; padding: 14px 16px; border: 1px dashed var(--outline-variant); border-radius: var(--r-md); color: var(--on-surface-variant); }

@media (prefers-reduced-motion: reduce) {
  .mrail, .mb-name, .glabel, .mrail-items, .mrail-item { transition: none; }
}
```

- [ ] **Passo 2: defina as larguras do rail em `:root`**

No topo de `styles/shell.css`, antes de `.mshell`, adicione:

```css
:root { --mrail-w: 64px; --mrail-w-open: 232px; }
```

- [ ] **Passo 3: linke o CSS no `index.html`**

Em `index.html`, logo após a linha `<link rel="stylesheet" href="styles/home.css" />`:

```html
  <link rel="stylesheet" href="styles/shell.css" />
```

- [ ] **Passo 4: commit**

```
git add index.html styles/shell.css js/app.js
git commit -m "feat(shell): CSS do rail de módulos e helpers de papel (Adm/Operador/Visitante)"
```

---

### Tarefa 3: `buildModuleShell(activeItem)` + dados dos módulos

**Arquivos:**
- Modificar: `js/app.js` (adicionar antes de `buildShell`, linha ~477)

- [ ] **Passo 1: defina o modelo dos módulos**

```js
/* ============================ MODULE SHELL (3 módulos) ============================ */
/* Ícones inline (stroke=currentColor). Itens apontam para rotas hash. */
const IC = {
  ey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
  ops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>',
};
function moduleModel() {
  const mods = [
    { key: "ey", label: "Portal EY", icon: IC.ey, items: [
      { key: "ey-solic", label: "Solicitações", route: "#/ey/solicitacoes" },
      { key: "ey-exec",  label: "Executar coleta", route: "#/ey/executar" },
      { key: "ey-eng",   label: "Engagements", route: "#/ey/engagements" },
    ] },
    { key: "ops", label: "Operações", icon: IC.ops, items: [
      { key: "ops-proj", label: "Projetos", route: "#/operacoes" },
    ] },
  ];
  if (canSeeAdmin()) {
    mods.push({ key: "admin", label: "Administração", icon: IC.admin, items: [
      { key: "adm-cad",   label: "Cadastros", route: "#/admin/cadastros" },
      { key: "adm-users", label: "Usuários", route: "#/admin/usuarios" },
      { key: "adm-cfg",   label: "Configurações", route: "#/admin/config" },
    ] });
  }
  return mods;
}
/* qual grupo contém o item ativo (para destacar o ícone quando colapsado) */
function moduleOfItem(itemKey) {
  return moduleModel().find((m) => m.items.some((it) => it.key === itemKey)) || null;
}
```

- [ ] **Passo 2: escreva `buildModuleShell(activeItem)`**

```js
/* Monta o shell permanente: rail à esquerda + slot #mod-content à direita.
   activeItem = key do item ativo (ex.: "ops-proj"). */
function buildModuleShell(activeItem) {
  const mods = moduleModel();
  const curMod = moduleOfItem(activeItem);

  const body = h("nav", { class: "mrail-body", "aria-label": "Módulos" });
  mods.forEach((m) => {
    const head = h("div", { class: "mrail-ghead", onClick: () => { if (m.items[0]) go(m.items[0].route); } },
      h("span", { class: "gic", html: m.icon }),
      h("span", { class: "glabel" }, m.label));
    const items = h("div", { class: "mrail-items" });
    m.items.forEach((it) => items.appendChild(
      h("button", { class: "mrail-item" + (it.key === activeItem ? " active" : ""), onClick: () => go(it.route) }, it.label)));
    body.appendChild(h("div", { class: "mrail-group" + (curMod && curMod.key === m.key ? " current" : "") }, head, items));
  });

  const rail = h("aside", { class: "mrail", "aria-label": "Navegação principal" },
    h("div", { class: "mrail-brand" },
      h("span", { class: "mb-mark" }, "A"),
      h("span", { class: "mb-name" }, "Auditoria")),
    body,
    h("div", { class: "mrail-foot" }, userChipEl()));

  const content = h("div", { class: "mcontent", id: "mod-content" });
  return h("div", { class: "mshell" }, rail, content);
}

/* Garante que o module shell está montado em #app-root com o item ativo certo,
   e devolve o slot #mod-content (limpo) para a tela preencher. */
function mountModuleShell(activeItem) {
  $("#auth-root").hidden = true;
  const root = $("#app-root"); root.hidden = false;
  // remonta só se ainda não há shell OU se mudou o item ativo
  let slot = document.getElementById("mod-content");
  const cur = root.querySelector(".mshell");
  if (!cur) { clear(root); root.appendChild(buildModuleShell(activeItem)); slot = document.getElementById("mod-content"); }
  else {
    // atualiza destaque de ativo sem recriar o rail (evita "piscar" no hover)
    cur.querySelectorAll(".mrail-item").forEach((b) => b.classList.toggle("active", b.textContent === labelOfItem(activeItem)));
    cur.querySelectorAll(".mrail-group").forEach((g) => g.classList.remove("current"));
    const cm = moduleOfItem(activeItem);
    if (cm) { const idx = moduleModel().findIndex((m) => m.key === cm.key); const grp = cur.querySelectorAll(".mrail-group")[idx]; if (grp) grp.classList.add("current"); }
  }
  clear(slot);
  return slot;
}
function labelOfItem(itemKey) {
  for (const m of moduleModel()) { const it = m.items.find((x) => x.key === itemKey); if (it) return it.label; }
  return "";
}
```

- [ ] **Passo 3: verificação (parcial)**

Ainda não há rota chamando `mountModuleShell`; a verificação visual vem na Tarefa 5. Confira só que o app continua carregando sem erro de console (recarregue `http://127.0.0.1:5500`).

---

### Tarefa 4: Tela placeholder "em construção"

**Arquivos:**
- Modificar: `js/app.js` (após `buildModuleShell`)

- [ ] **Passo 1: escreva `renderPlaceholder(slot, opts)`**

```js
/* Tela genérica "em construção" dentro do slot do module shell.
   opts = { kicker, title, desc, tabs? } */
function renderPlaceholder(slot, opts) {
  const wrap = h("div", { class: "mplace" },
    h("div", { class: "mp-kicker" }, opts.kicker || ""),
    h("h1", { class: "t-display" }, opts.title || ""),
    h("p", { class: "muted" }, opts.desc || ""));
  if (opts.tabs && opts.tabs.length) {
    const tabs = h("div", { class: "mp-tabs" });
    opts.tabs.forEach((t) => tabs.appendChild(h("span", { class: "mp-tab" }, t)));
    wrap.appendChild(tabs);
  }
  wrap.appendChild(h("div", { class: "mp-soon" }, "🚧 Em construção — esta tela será implementada nas próximas fatias."));
  slot.appendChild(wrap);
}
```

- [ ] **Passo 2: mapeie cada placeholder**

```js
/* Telas-placeholder por item de módulo. */
function showModulePlaceholder(itemKey) {
  const slot = mountModuleShell(itemKey);
  const P = {
    "ey-solic":  { kicker: "Portal EY", title: "Solicitações", desc: "Triagem das solicitações do relatório EY, com Área e Responsável." },
    "ey-exec":   { kicker: "Portal EY", title: "Executar coleta", desc: "Disparo da coleta do relatório EY (sync incremental)." },
    "ey-eng":    { kicker: "Portal EY", title: "Engagements", desc: "Catálogo de engagements EY e seus grupos." },
    "adm-cad":   { kicker: "Administração", title: "Cadastros", desc: "Entidades do processo. Cada uma será uma aba.", tabs: ["Pessoas", "Áreas", "Unidades", "Lista de status"] },
    "adm-users": { kicker: "Administração", title: "Usuários", desc: "Permissões de acesso (Adm · Operador · Visitante) e allowlist de e-mails." },
    "adm-cfg":   { kicker: "Administração", title: "Configurações", desc: "Ajustes gerais da aplicação." },
  };
  renderPlaceholder(slot, P[itemKey] || { kicker: "", title: "Em construção", desc: "" });
}
```

---

### Tarefa 5: Roteamento dos módulos

**Arquivos:**
- Modificar: `js/app.js` (`applyRoute`, linha ~444; helpers `go*`, linha ~425; `buildHome` botão Auditoria, linha ~277)

- [ ] **Passo 1: troque o destino do botão Auditoria na tela líquida**

Em `buildHome` (linha ~277), troque `href="#/projetos"` por `href="#/operacoes"`:

```js
        <a class="liquid-button" href="#/operacoes" aria-label="Abrir Auditoria">
```

- [ ] **Passo 2: adicione helpers de navegação dos módulos** (perto da linha ~426)

```js
function goOperacoes() { go("#/operacoes"); }
```

- [ ] **Passo 3: reescreva o bloco "sem match de projeto" em `applyRoute`**

Localize, em `applyRoute`, o trecho:

```js
  const m = hash.match(/^#\/p\/([^/]+)(?:\/s\/([^/]+))?$/);
  if (!m) {
    if (hash === "#/projetos") {              // entrou na Auditoria: lista de projetos
      if (!(App.project === null && document.querySelector(".landing"))) await showProjects();
    } else {                                  // tela inicial: seleção de módulo
      showHome();
    }
    return;
  }
```

Substitua por:

```js
  const m = hash.match(/^#\/p\/([^/]+)(?:\/s\/([^/]+))?$/);
  if (!m) {
    // ----- Operações: lista de projetos dentro do module shell -----
    if (hash === "#/operacoes" || hash === "#/projetos") { await showProjects(); return; }
    // ----- Portal EY (placeholders) -----
    if (hash === "#/ey" || hash === "#/ey/solicitacoes") { showModulePlaceholder("ey-solic"); return; }
    if (hash === "#/ey/executar")    { showModulePlaceholder("ey-exec"); return; }
    if (hash === "#/ey/engagements") { showModulePlaceholder("ey-eng"); return; }
    // ----- Administração (placeholders; só Adm) -----
    if (hash.startsWith("#/admin")) {
      if (!canSeeAdmin()) { goOperacoes(); return; }
      if (hash === "#/admin" || hash === "#/admin/cadastros") { showModulePlaceholder("adm-cad"); return; }
      if (hash === "#/admin/usuarios") { showModulePlaceholder("adm-users"); return; }
      if (hash === "#/admin/config")   { showModulePlaceholder("adm-cfg"); return; }
      showModulePlaceholder("adm-cad"); return;
    }
    // ----- Tela inicial (splash de seleção de módulo) -----
    showHome();
    return;
  }
```

- [ ] **Passo 4: verificação no preview (dark + light)**

Rodar: `start.bat`, abrir `http://127.0.0.1:5500`, logar.
Esperado:
- A tela líquida aparece. Clicar **Auditoria** → vai para `#/operacoes` e mostra o rail à esquerda com os grupos **Portal EY** e **Operações** (e **Administração** se você for Adm).
- Passar o mouse no rail → expande para ~232px, mostra rótulos dos grupos e os itens.
- Clicar **Portal EY → Solicitações** → placeholder "Solicitações / Em construção".
- Clicar **Administração → Cadastros** → placeholder com as abas Pessoas/Áreas/Unidades/Lista de status.
- Trocar tema (claro/escuro) → rail e placeholders legíveis nos dois.
- Logar como Operador (ou perfil sem `role='adm'`) → grupo **Administração** não aparece; acessar `#/admin/cadastros` na URL redireciona para `#/operacoes`.

---

### Tarefa 6: Projetos dentro de Operações + retorno da grade

**Arquivos:**
- Modificar: `js/app.js` (`showProjects` linha ~311; `buildShell` botão "↩ Outros projetos" linha ~485)

- [ ] **Passo 1: renderize a landing dentro do module shell**

Reescreva `showProjects` para montar o module shell (item `ops-proj`) e preencher `#mod-content` com a landing, em vez de limpar `#app-root`:

```js
async function showProjects() {
  if (!(await ensureProfile())) return;
  App.project = null; App.sheet = null;
  rt.unsubscribeDB(); rt.leavePresence();
  setLoc({ view: "projects" });
  const slot = mountModuleShell("ops-proj");
  slot.appendChild(buildLandingBody());
  await loadLanding();
}
```

- [ ] **Passo 2: separe o corpo da landing do seu chrome de tela cheia**

O `buildLanding` atual cria `.landing > (.landing-top com logo/gear/userChip, .landing-body)`. Dentro do module shell, o rail já fornece marca e usuário, então renderizamos só o corpo. Adicione `buildLandingBody` (e mantenha `buildLanding` para não quebrar nada que ainda o referencie):

```js
function buildLandingBody() {
  const search = h("input", { class: "input proj-search", type: "search", placeholder: "Buscar projeto…",
    oninput: (e) => renderProjectCards(App._projects || [], e.target.value) });
  const grid = h("div", { class: "proj-grid", id: "proj-grid" });
  const head = h("div", { class: "landing-head" },
    h("div", {}, h("div", { class: "t-display" }, "Projetos"),
      h("p", { class: "muted", style: { margin: "2px 0 0" } }, "Selecione um projeto para abrir ou crie um novo.")),
    h("div", { class: "landing-actions" }, search,
      isAdmin() ? h("button", { class: "btn btn-ghost", onClick: openAdminPanel }, "⚙ Usuários") : null,
      h("button", { class: "btn btn-primary", onClick: newProject }, "＋ Novo projeto")));
  return h("div", { class: "landing-body", style: { padding: "28px" } }, head, grid);
}
```

- [ ] **Passo 3: o "↩" da grade volta para Operações**

Em `buildShell` (linha ~485), troque o item:

```js
      h("button", { class: "side-nav-item nav-others", onClick: goProjects }, "↩ Outros projetos"),
```

por:

```js
      h("button", { class: "side-nav-item nav-others", onClick: goOperacoes }, "↩ Operações"),
```

- [ ] **Passo 4: verificação no preview (dark + light)**

Rodar: `http://127.0.0.1:5500`.
Esperado:
- `#/operacoes` mostra os cards de projeto no slot de conteúdo, com o rail à esquerda; busca, "＋ Novo projeto" e (se Adm) "⚙ Usuários" funcionam.
- Clicar um card → abre a **grade em tela cheia** (como hoje), sem o rail. Editar/abrir abas continua igual.
- Na grade, clicar **"↩ Operações"** → volta para `#/operacoes` com os cards.
- F5 em `#/operacoes`, `#/ey/solicitacoes` e `#/p/<id>` restaura a tela certa.
- Dark e light OK.

- [ ] **Passo 5: commit**

```
git add js/app.js
git commit -m "feat(shell): rotas dos 3 módulos, Projetos dentro de Operações e placeholders"
```

---

## Self-Review (cobertura da spec)

- ✅ Rail de 3 módulos como grupos, expande no hover (Tarefas 2–3).
- ✅ Splash mantido; Auditoria → `#/operacoes` (Tarefa 5, passo 1).
- ✅ Projetos movido para dentro de Operações (Tarefa 6).
- ✅ Placeholders para EY, Cadastros (com abas), Usuários, Configurações (Tarefas 4–5).
- ✅ Papéis adm/operador→Adm/Operador + Visitante, sem mexer no banco; Administração só para Adm (Tarefas 1, 5).
- ✅ Grade intocada; só o destino do "↩" muda (Tarefa 6, passo 3).
- ✅ Sem Supabase/migrations nesta fatia.
- ✅ Verificação empírica no browser, dark + light, em cada tarefa de UI.

## Fora de escopo (próximas fatias)
- Aninhar o rail dentro da grade (persistência do rail durante edição).
- Modelagem Supabase de Pessoas/Usuários/Áreas/Unidades e telas reais de Cadastros/Usuários.
- Conteúdo real do Portal EY (portar `tools/ey_executar_preview.html`, tabela de solicitações, mapeamentos).
- Propagação da paleta teal v2 (Fase 6) e auditoria WCAG AA.
