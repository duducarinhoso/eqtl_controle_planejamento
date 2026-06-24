# Fundação DS v2 — Base (tokens · tema · kit) — Plano de Implementação

> **Para quem executa:** use a skill `executing-plans`. Passos com checkbox (`- [ ]`).

**Objetivo:** Trazer o design system do `modelos/design-system_v2.html` para dentro do app como base canônica — tokens (dark+light via `data-theme`), fonte Roboto, tema claro padrão com toggle persistido, e o kit de primitivos (botões, inputs, modais, toasts, chips, cards, tabelas, badges) re-skinado na linguagem v2 — de modo que o app inteiro "mude de cara" já nesta fatia, sem reescrever cada tela.

**Arquitetura:** Dois CSS novos carregados **por último** (vencem a cascata): `styles/v2-tokens.css` (tokens v2 + Roboto + uma **camada-ponte temporária** que reaponta os nomes de token antigos → valores v2, para telas ainda não migradas recolorirem sozinhas) e `styles/v2-kit.css` (componentes v2 canônicos `.card/.tbl/.badge/.stat` + re-skin dos primitivos compartilhados `.btn/.input/.field/.chip/.modal/.toast/.ctx-menu`). Um controlador de tema em `app.js` grava `data-theme` no `<html>` (padrão `light`, persistido em `localStorage`), com bootstrap inline no `<head>` para não piscar (FOUC). A grade e demais telas continuam funcionando: recolorem pela ponte; a migração estrutural (classes v2) vem nas fatias seguintes.

**Stack tocado:** `styles/v2-tokens.css` (novo), `styles/v2-kit.css` (novo), `index.html` (bootstrap de tema + Roboto + links), `js/app.js` (controlador de tema + toggle no rodapé do rail). Sem Supabase.

> **Fonte da verdade:** copie os blocos de token **verbatim** de `modelos/design-system_v2.html` (linhas citadas). Não reinvente valores.

---

## Decisões já fechadas (não reabrir)
- Portar o CSS do v2 como **folha canônica** (classes + tokens + `data-theme` + Roboto). A ponte old→v2 é **temporária** (removida quando nenhuma tela usar nomes antigos).
- **Tema padrão claro** (v2 light) + toggle persistido.
- **Roboto** como fonte base de UI.
- **Status semafórico** (`--status-*`/`--st-*`) **permanece** com as hues atuais (são cores de dado, não chrome de marca).
- Esta fatia **não** reescreve a estrutura do rail (continua o `shell.css` atual, que recolore pela ponte). O rail vira o `.sidebar` do v2 na **próxima** fatia.

---

### Tarefa 1: Tokens v2 + Roboto + bootstrap de tema (sem FOUC)

**Arquivos:**
- Criar: `styles/v2-tokens.css`
- Modificar: `index.html`

- [ ] **Passo 1: crie `styles/v2-tokens.css` com os tokens v2 verbatim**

Copie de `modelos/design-system_v2.html`:
- o bloco `:root { … }` das **linhas 12–25** (paleta `--blue/--cyan/--green/--red…`, `--side-w`, `--radius:6px`, `--gap`, `--font: 'Roboto',…`);
- o bloco `[data-theme="dark"] { … }` das **linhas 27–49**;
- o bloco `[data-theme="light"] { … }` das **linhas 51–73**.

Cole os três no topo de `styles/v2-tokens.css`, nesta ordem.

- [ ] **Passo 2: adicione a camada-ponte (old → v2) e o override do `body`**

No fim de `styles/v2-tokens.css`, acrescente (reaponta os nomes antigos para os valores v2; `var(--bg)` etc. resolvem por tema porque `data-theme` está no `<html>`):

```css
/* ---- PONTE TEMPORÁRIA: nomes de token antigos → valores v2 ----
   Remover conforme cada tela passa a usar as classes/tokens v2. ---- */
:root {
  --font-brand: var(--font);
  --font-ui: var(--font);

  --workspace-bg: var(--bg);
  --surface: var(--card-bg);
  --surface-bright: var(--card-bg);
  --surface-container-lowest: var(--card-bg);
  --surface-container-low: var(--hover);
  --surface-container: var(--hover);
  --surface-container-high: var(--hover);
  --surface-container-highest: var(--hover);
  --background: var(--bg);
  --on-surface: var(--text);
  --on-surface-variant: var(--text-muted);
  --inverse-surface: var(--text);
  --inverse-on-surface: var(--card-bg);
  --outline: var(--border);
  --outline-variant: var(--border);

  --primary: var(--blue);
  --primary-container: var(--blue);
  --surface-tint: var(--blue);
  --on-primary-container: #fff;
  --secondary: var(--text-muted);
  --error: var(--red);

  /* rail atual (shell.css) recolore para o v2 */
  --side-bg1: #0b303a;
  --side-bg2: #061d23;
  --side-line: rgba(113,178,128,.15);
  --side-accent: var(--cyan);
  --side-accent-2: var(--blue);
  --side-text: #a3c4bb;
  --side-muted: #7fa49b;
}
body { font-family: var(--font); background: var(--bg); color: var(--text); }
```

- [ ] **Passo 3: no `index.html`, bootstrap de tema sem FOUC + Roboto + link do CSS**

No `<head>`, **logo após** a tag `<title>…</title>`, antes de qualquer `<link rel="stylesheet">`, insira o bootstrap inline (define o tema antes do CSS pintar):

```html
  <script>try{document.documentElement.setAttribute('data-theme',localStorage.getItem('eqtl_theme')||'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}</script>
```

Na linha de fontes do Google, **acrescente Roboto** (troque a linha `<link href="https://fonts.googleapis.com/css2?family=Montserrat…">` para incluir Roboto):

```html
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Montserrat:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600&family=Plus+Jakarta+Sans:wght@400;600;700;800&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">
```

Depois da linha `<link rel="stylesheet" href="styles/shell.css" />`, adicione (v2 carrega por último para vencer a cascata):

```html
  <link rel="stylesheet" href="styles/v2-tokens.css" />
```

- [ ] **Passo 4: verificação no preview**

Recarregar `http://127.0.0.1:5500`. Esperado: fundo do app vira o claro v2 (`#edf5f0`), texto Roboto, e o rail/telas recolorem para teal/verde (via ponte). Sem flash de tema ao recarregar. Console sem erros.

---

### Tarefa 2: Controlador de tema + toggle no rodapé do rail

**Arquivos:**
- Modificar: `js/app.js` (helpers perto de `isAdmin()`; `boot()`; `buildModuleShell` rodapé), `styles/shell.css` (estilo do botão)

- [ ] **Passo 1: adicione o controlador de tema** (em `app.js`, junto dos helpers de papel)

```js
/* ---- Tema (data-theme no <html>, persistido). Padrão: claro. ---- */
function currentTheme() { return document.documentElement.getAttribute("data-theme") || "light"; }
function setTheme(t) { localStorage.setItem("eqtl_theme", t); document.documentElement.setAttribute("data-theme", t); }
function toggleTheme() { setTheme(currentTheme() === "dark" ? "light" : "dark"); }
```

- [ ] **Passo 2: garanta o tema no boot** (idempotente com o bootstrap inline)

No início de `boot()` (primeira linha dentro da função), adicione:

```js
  if (!document.documentElement.getAttribute("data-theme")) setTheme(localStorage.getItem("eqtl_theme") || "light");
```

- [ ] **Passo 3: adicione o botão de tema no rodapé do rail**

Em `buildModuleShell`, troque a linha do rodapé:

```js
    h("div", { class: "mrail-foot" }, userChipEl()));
```

por:

```js
    h("div", { class: "mrail-foot" }, userChipEl(),
      h("button", { class: "mrail-theme", title: "Alternar tema claro/escuro", "aria-label": "Alternar tema", onClick: toggleTheme,
        html: '<svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="ic-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>' })));
```

- [ ] **Passo 4: estilo do botão em `styles/shell.css`** (no fim do arquivo)

```css
.mrail-foot { display: flex; align-items: center; gap: 8px; }
.mrail-foot .user-chip { flex: 1 1 auto; min-width: 0; }
.mrail-theme { flex: 0 0 auto; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--side-line); border-radius: 8px; background: transparent; color: var(--side-text); cursor: pointer; }
.mrail-theme:hover { background: var(--side-line); color: #fff; }
.mrail-theme svg { width: 18px; height: 18px; }
.mrail-theme .ic-moon { display: none; }
[data-theme="dark"] .mrail-theme .ic-sun { display: none; }
[data-theme="dark"] .mrail-theme .ic-moon { display: block; }
```

- [ ] **Passo 5: verificação no preview**

Em `#/operacoes`, clicar no botão de tema no rodapé do rail. Esperado: alterna claro↔escuro instantaneamente; o ícone troca (sol no claro, lua no escuro); ao recarregar a página, o tema escolhido **persiste**. Console sem erros.

---

### Tarefa 3: Kit base v2 (re-skin dos primitivos + classes v2 canônicas)

**Arquivos:**
- Criar: `styles/v2-kit.css`
- Modificar: `index.html` (link, por último)

- [ ] **Passo 1: crie `styles/v2-kit.css` — re-skin dos primitivos compartilhados (linguagem v2)**

```css
/* =====================================================================
   EQTL — Kit base v2 (re-skin dos primitivos + componentes canônicos).
   Carregado por ÚLTIMO: vence app.css nas classes compartilhadas.
   ===================================================================== */

/* ---- Botões ---- */
.btn { border-radius: var(--radius); border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text); }
.btn:hover { background: var(--hover); }
.btn-primary { background: var(--blue); color: #fff; border-color: transparent; }
.btn-primary:hover { background: var(--blue); filter: brightness(1.07); }
.btn-ghost { background: transparent; border-color: var(--border); }
.btn-ghost:hover { background: var(--hover); }
.btn-danger { background: var(--red); color: #fff; border-color: transparent; }
.btn-danger:hover { filter: brightness(.94); }

/* ---- Campos ---- */
.input { background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text); border-radius: var(--radius); }
.input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 22%, transparent); }
.field label { color: var(--text-muted); }

/* ---- Chips de status (theme-aware: mistura com o card, não com #fff) ---- */
.chip { background: color-mix(in srgb, currentColor 16%, var(--card-bg)); }

/* ---- Modal / toast / menu de contexto ---- */
.modal { background: var(--card-bg); color: var(--text); border: 1px solid var(--border); box-shadow: 0 18px 50px rgba(0,0,0,.28); }
.toast { background: var(--card-bg); color: var(--text); border: 1px solid var(--border); }
.toast.err { background: var(--red); color: #fff; border-color: transparent; }
.ctx-menu { background: var(--card-bg); border: 1px solid var(--border); color: var(--text); }
.ctx-menu button:hover { background: var(--hover); }
.ctx-menu .sep { background: var(--border); }
.ctx-menu button.danger { color: var(--red); }
```

- [ ] **Passo 2: acrescente os componentes v2 canônicos** (para telas futuras usarem) — copie de `modelos/design-system_v2.html`, adaptando só o seletor se preciso:
  - `.card`, `.card-head`, `.card-body`, `.card-pad` — **linhas 295–304**
  - `.stat` e variantes — **linhas 316–328**
  - `.tbl` — **linhas 438–447**
  - `.badge` e variantes — **linhas 382–393**
  - `.legend` — **linhas 331–333**
  - `.mini-select` — **linhas 307–314**

Cole esses blocos verbatim no fim de `styles/v2-kit.css`.

- [ ] **Passo 3: linke `v2-kit.css` por último no `index.html`**

Após a linha `<link rel="stylesheet" href="styles/v2-tokens.css" />`:

```html
  <link rel="stylesheet" href="styles/v2-kit.css" />
```

- [ ] **Passo 4: verificação no preview (claro + escuro)**

1. Em `#/operacoes`, clicar **＋ Novo projeto** → o modal abre com cara v2 (fundo `--card-bg`, borda, botão primário teal). Cancelar.
2. Os botões "⚙ Usuários" e "＋ Novo projeto" e o input de busca seguem a paleta v2.
3. Abrir um projeto → a grade ainda funciona; seus botões/inputs/menus de contexto (clique direito numa aba) aparecem na paleta v2.
4. Alternar para **escuro**: modais, inputs, chips e menus ficam legíveis (sem branco "estourado"). Os chips de status do card de projeto continuam distinguíveis.
5. Console sem erros.

> Nota honesta a registrar: telas ainda não migradas (sobretudo a **grade**) podem ter arestas no **escuro** por causa de cores hardcoded no `app.css`; elas serão resolvidas na fatia de cada tela. O **claro** (padrão) deve ficar coerente.

---

### Tarefa 4: Verificação final + commit

- [ ] **Passo 1: fluxo completo no preview (claro e escuro)**

Splash → Auditoria → `#/operacoes` (cards) → abrir projeto (grade) → "↩ Operações" → placeholders (EY/Cadastros). Em ambos os temas: sem erro de console; nada "quebrado" no claro; toggle persiste.

- [ ] **Passo 2: commit** (git é do Eduardo — descrever)

```
git add index.html styles/v2-tokens.css styles/v2-kit.css styles/shell.css js/app.js projeto/planos/2026-06-24-ds-v2-fundacao-base.md
git commit -m "feat(ds-v2): fundacao do design system v2 (tokens, tema claro/escuro, Roboto e kit base)"
```

---

## Self-Review (cobertura)
- ✅ Tokens v2 (dark+light) portados verbatim + `data-theme` no `<html>`.
- ✅ Tema claro padrão, toggle persistido, sem FOUC.
- ✅ Roboto como fonte base.
- ✅ Kit base re-skinado (btn/input/field/chip/modal/toast/ctx-menu) + componentes v2 canônicos (card/stat/tbl/badge/legend/mini-select) disponíveis.
- ✅ Ponte old→v2 recolore telas não migradas; marcada como temporária.
- ✅ Verificação no browser em claro e escuro.
- ✅ Grade intocada estruturalmente (migra por último).

## Próximas fatias (fora deste plano)
1. **Shell v2** — reescrever o rail para o `.sidebar` do v2 (indicador deslizante, rodapé com menu do usuário, topbar `.page-row`/`.crumb`); aposentar `shell.css`.
2. **Telas leves** — Projetos (`.card`/`.row`), Admin Usuários (`.tbl`/`.badge`), Gerenciar status, Dashboards (`.stat`/charts).
3. **Grade** — re-tematização da planilha; remover a ponte e o `app.css`/`tokens.css` antigos quando ninguém mais os usar.
4. **Login / splash** — ajuste fino de paleta ao v2.
