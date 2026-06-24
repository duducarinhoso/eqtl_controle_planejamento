# Detecção de design system, temas e fontes (stack-agnóstico)

Objetivo: achar **onde** cores/fontes/tokens vivem, **como** o dark/light é
alternado, e mapear um valor solto de volta ao **token central** — para aplicar a
correção uma vez e propagá-la (apply centralizado), mantendo consistência.

## Passo 1 — Identificar a stack de estilo

Procure (Glob/Grep):

| Stack | Onde olhar |
|---|---|
| **Tailwind** | `tailwind.config.{js,ts,cjs,mjs}` → `theme.colors`, `fontFamily`, `fontSize`; classes no JSX (`text-gray-400`, `bg-white`, `dark:bg-slate-900`) |
| **CSS variables** | `globals.css`/`app.css` → `:root{ --... }`, blocos `.dark` / `[data-theme="dark"]` / `@media (prefers-color-scheme: dark)` |
| **shadcn/ui** | tokens HSL em `:root` e `.dark` (`--background`, `--foreground`, `--primary`, `--muted-foreground`…), usados como `hsl(var(--token))` |
| **CSS Modules** | `*.module.css` (valores locais/hardcoded) |
| **styled-components / emotion** | `ThemeProvider` + objeto `theme` (`theme.colors…`), template literals |
| **MUI / Chakra** | `createTheme({ palette })` / `extendTheme` |
| **Vue / Svelte** | `<style>`, vars CSS, ou config equivalente |

## Passo 2 — Mapear os temas

- **Tailwind**: `darkMode: 'class'` (toggle por classe `.dark` no `<html>`) vs `'media'` (prefers-color-scheme).
- Descubra **onde cada tema define os valores**: normalmente `:root` (claro) e `.dark` (escuro) trocam as **mesmas** variáveis. Para auditar o escuro, leia os valores do bloco `.dark`.
- `hsl(var(--x))` / `color-mix()`: o valor real está na variável → resolva para hex antes de calcular (ou passe o `hsl()` direto: o `contrast.py` aceita).
- Sem dark mode? Audite só o claro.
- **Tema default sem classe:** se o dark é o default (em `:root`) e o claro é override (`body.light-mode` / `.light`), **não existe seletor `.dark`**. Para corrigir **só o dark**, mude o **valor base** e re-sobreponha o claro (base → cor acessível no dark; `body.light-mode .x` → valor original). Vale o inverso se o claro for o default.

## Passo 3 — Coletar os pares cor/fundo reais (por elemento no escopo)

- **foreground** = cor do texto/ícone; **background** = a superfície **imediatamente atrás** (o card/input/botão real, não a raiz da página).
- Cuidado com herança e com bg translúcido sobre outra superfície → **componha** (`contrast.py` faz isso com `--base`).
- **Modo híbrido**: se o dev server estiver rodando, use o preview para pegar *computed styles* e confirmar o que o código sugere — sobreposições, estados `:hover`/`:focus`, valores resolvidos de `var()`. O código diz a intenção; o preview confirma o render.

## Passo 4 — Montar a paleta para sugestões consistentes

- Reúna a **escala existente** (todas as `gray-50..950` do Tailwind, ou todos os `--tokens`) num JSON e passe para `contrast.py suggest --palette`. Assim a correção é escolhida **dentro da paleta** — consistência, não invenção.
- Se a skill **`ui-ux-pro-max`** existir no projeto, consulte-a para validar paletas e pares de fonte coerentes com o tipo de produto:
  `python3 skills/ui-ux-pro-max/scripts/search.py "<contexto>" --domain color`
  Ela é a **base de conhecimento** de design system; a `dudu-check-cores` audita e aplica.
- Se houver `design-system/MASTER.md` (persistido pela ui-ux-pro-max), leia-o: é a fonte da verdade dos tokens.

## Passo 5 — Mapear valor → token (apply centralizado)

- Achou `#9ca3af` solto reprovando? Descubra **qual token** deveria estar ali (ex.: `--text-muted`) e corrija o **token**, não cada uso.
- Sem token e criar um foge do escopo? Use o token existente mais próximo; só edite inline em último caso.
- **Tailwind**: classe `text-gray-400` hardcoded → troque a classe (`text-gray-500`) **ou** ajuste a cor custom no config, se for um token do projeto. Prefira o token custom quando existir.

## Armadilhas

- Não confunda a cor da **raiz** com a **superfície real** atrás do texto.
- Resolva `hsl(var())` e `color-mix()` antes de calcular.
- **Audite os estados**: `hover`/`focus`/`disabled`/`selected` têm cores próprias — principalmente **foco** (2.4.7) e **disabled** (legibilidade).
- **Gradientes/imagens de fundo**: avalie o pior ponto.
- O mesmo token pode ter valor diferente por tema — audite **os dois**.
