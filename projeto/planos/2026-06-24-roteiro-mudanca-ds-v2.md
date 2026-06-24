# Roteiro Mestre — Mudança para o Design System v2 (a "casa nova")

> **Regra de ouro desta mudança:** `modelos/design-system_v2.html` está **pronto**. NÃO criar botão, cor, tema, tipografia, efeito, CSS, sidebar — nada disso. Para **cada** elemento, seguir a árvore de decisão abaixo, consultando o modelo como dicionário/agenda **antes** de criar qualquer coisa.
>
> Supera os planos `2026-06-24-shell-3-modulos.md` (estrutura/rotas aproveitadas) e `2026-06-24-ds-v2-fundacao-base.md` (**descartado** — eu havia recriado CSS/tokens/tema que já existem no modelo).

## Árvore de decisão (aplicar a cada componente)

1. **Já tem lugar no modelo?** → usar o componente do modelo **como está**, só ajustando textos/dados. Não estilizar.
2. **Não tem, mas tem algo parecido?** → usar o parecido para manter a mesma estética.
3. **Não tem nada parecido?** → consultar como o design funciona (tokens, espaçamento, tipografia, sombras do modelo) e criar algo **coerente** com o estilo.

## Interpretação de "fazer uma cópia do modelo e alimentar os dados"

O app é uma SPA em vanilla JS (rotas hash, Supabase, realtime, grade) — um único HTML estático copiado não hospeda essa lógica. O equivalente fiel:
- O **`<style>` do modelo vira o CSS do app** (cópia **verbatim** para um arquivo) e o **`<script>` do modelo vira um módulo do app** (cópia verbatim: charts, gauges, sparklines, indicador da sidebar, `toggleTheme`).
- As telas do app passam a **emitir a marcação/classes do modelo**, preenchidas com dados reais.
- Ou seja: moramos dentro do CSS/estrutura/JS do modelo; só escrevemos o **encaixe de dados**.

---

## 📍 Progresso

- ✅ **Etapa 0** — CSS/JS do modelo trazidos verbatim (`styles/design-system.css`, `js/ds.js`); recriações minhas removidas.
- ✅ **Etapa 1** — Shell + Sidebar do modelo (`.app`/`.sidebar`/`.topbar`/`.content`), 3 módulos no `.menu` (+ `.menu-group` em `app-ds.css`), indicador deslizante, menu do usuário, toggle de tema. Grade legada escopada para `.lg-*`.
- ✅ **Etapa 2 (parcial — Projetos)** — tela Projetos no modelo: `.card`, `.badge` de status, botões coerentes (`app-ds.css`), busca única (topbar), claro+escuro ok.
- ▶️ **PRÓXIMO — Tela do projeto integrada (decisão de 2026-06-24):** ao clicar num projeto **não abre nova tela**; permanece no shell do modelo (sidebar dos 3 módulos visível, Operações), o **dashboard** vira cards do modelo, as **abas** viram painel contextual, e a **grade (tabela do Excel)** abre no `.content` — mantida como está. Refatora `mountProject`/`buildShell`/`showDashboard`/`selectSheet` para renderizar no `.content` do modelo em vez do `.lg-app` de tela cheia.

## 📖 Dicionário: cada peça do app → destino no modelo

Legenda: ✅ tem lugar · 🟡 tem parecido · 🔧 não tem (consultar o estilo) · 🗂️ modelo próprio (login/splash)

| Peça do app | Decisão | Onde mora no modelo |
|---|---|---|
| **Shell (sidebar + main)** | ✅ | `.app` + `.sidebar` (colapsa, `.sidebar-lights`, `.brand`, `.menu` + `.menu-indicator`, `.sidebar-foot` + `.sidebar-user-menu`) + `.main` |
| Itens de menu (3 módulos) | ✅ | `.menu a` (ícone + `.menu-label`); ajustar rótulos/links para Portal EY / Operações / Administração e seus itens |
| Topbar (título + caminho) | ✅ | `.page-row` (`h1` + `.crumb`) e `.topbar` (`.search`, `.user`) |
| Menu do usuário (perfil/sair) | ✅ | `.sidebar-foot` + `.sidebar-user-menu` (trocar "My Profile/Settings/Logout" por Perfil/Gerenciar lista/Sair) |
| Alternar tema | ✅ | `.theme-toggle` + `toggleTheme()` do modelo (não criar) |
| Presença online (quem está) | 🟡 | cluster de avatares estilo `.user`/`.comment img`; consultar estilo se faltar |
| **Projetos (landing de cards)** | ✅ | `.card` em `.row`; título via `.page-row`; busca via `.search` |
| Chips de status no card | ✅ | `.badge` (variantes de cor) |
| **Admin → Usuários (lista)** | ✅ | `.tbl` "Customers List" (#, Nome, Usuário, E-mail, Status) + `.badge` de papel + avatar |
| **Dashboard Status** (KPIs, entregas) | ✅ | `.stat` (KPIs) + `.donut-wrap`/`.gauge` (entregas) + `.legend` |
| Heatmap status×grupo | 🔧 | sem equivalente → consultar tokens (`--grid-line`, cores) e fazer coerente; ou `.tbl` com células coloridas |
| **Dashboard Usuários** (matriz, atividade) | ✅ | `.tbl` (matriz) + `.chart-wrap` (atividade) |
| **Placeholders** (EY/Cadastros/…) | ✅ | `.page-row` + `.card` (estado vazio) |
| **EY → Solicitações** (triagem) | ✅ | `.tbl` + `.badge`; contadores em `.stat` |
| **EY → Executar coleta** | 🟡 | `.card` + botão (estilo do modelo); consultar estilo |
| Gerenciar lista de status (CRUD) | 🟡 | `.tbl`/lista + campos (estilo do modelo) |
| **Modais / toasts / menus de contexto** | 🔧 | modelo não tem → consultar superfícies (`--card-bg`, `--border`, sombras) e vestir coerente |
| Toolbar / statusbar (grade) | 🔧 | sem equivalente → consultar estilo (botões/tipografia do modelo) |
| **Grade / planilha** | 🔧 | sem equivalente (é planilha) → consultar tokens/tipografia/bordas e construir coerente — **por último** |
| **Login** | 🗂️ | modelo próprio `00,tela_login.html` (manter; alinhar paleta) |
| **Splash (Auditoria/Cronograma)** | 🗂️ | modelo próprio `01.tela_inicial_v2.html` (manter) |

---

## 🪜 Etapas (cada uma verificável no browser, claro + escuro)

> Ordem pensada para você **ver as coisas aparecerem na casa nova** cedo, com a grade (mais arriscada) por último.

### Etapa 0 — Mudança (trazer a casa)
- Copiar **verbatim** o `<style>` do modelo para `styles/design-system.css` e o `<script>` (charts/gauges/sparks/sidebar/`toggleTheme`) para `js/ds.js`.
- Usar o sistema de tema do **próprio modelo** (`data-theme` + `.theme-toggle`).
- **Descartar o que recriei**: `styles/shell.css`, `styles/v2-tokens.css`, `styles/v2-kit.css`, o controlador/botão de tema e o rail próprio no `app.js`.
- Resultado: o CSS/JS do modelo carregados e disponíveis; nada do app quebra (telas ainda não migradas seguem com `app.css` até a sua vez).

### Etapa 1 — Shell + Sidebar (primeiro "ver na casa")
- Emitir o `.app`/`.sidebar`/`.topbar`/`.content` do modelo; nossos 3 módulos nos `.menu a`; usuário real no `.sidebar-foot`; toggle do modelo.
- Reusar `setupSidebar()` (indicador deslizante) e a estrutura tal qual.

### Etapa 2 — Telas leves
Projetos (`.card`/`.row`) · Placeholders (`.page-row`/`.card`) · Admin Usuários (`.tbl`/`.badge`) · Dashboards (`.stat`/charts/`.tbl`) · Gerenciar status.

### Etapa 3 — Primitivos sem equivalente
Modais, toasts, menus de contexto, toolbar — vestir consultando as superfícies/tokens do modelo.

### Etapa 4 — Grade (planilha)
Re-tematizar consultando o design system (tokens/tipografia/bordas). Ao fim, remover `app.css`/`tokens.css` antigos quando ninguém mais usar.

### Etapa 5 — Login / Splash
Ajuste fino de paleta aos modelos próprios.

---

## Verificação
Empírica no browser (porta 5500), **claro e escuro**, a cada etapa. Cada etapa = um plano de execução próprio (writing-plans) detalhando o encaixe de dados, sem inventar estilo.

## Git
Do Eduardo. Descrevo os commits por etapa.
