---
name: dudu-check-cores
description: >-
  Auditoria visual de interface já codificada — cor, contraste e tipografia —
  unindo acessibilidade WCAG AA, ergonomia (fadiga/brilho) e avaliação heurística.
  Analisa modo claro E escuro, calcula o contraste de cada par texto/fundo
  (inclusive contra o fundo real), sugere correções consistentes com o design
  system, gera preview HTML do elemento no contexto (antes/depois) para o usuário
  autorizar, e aplica só cor/fonte — nunca posição, tamanho ou espaçamento. Use
  quando o usuário disser "dudu-check-cores" ou "/dudu-check-cores", ou pedir para
  verificar, auditar, revisar ou checar cores, contraste, paleta, legibilidade,
  fadiga visual, brilho ou acessibilidade de cores; reclamar que uma tela está
  difícil de ler, cansativa, brilhante demais ou com cores ruins; ou pedir
  auditoria de contraste em dark/light mode. Pergunte primeiro se o escopo é uma
  tela ou o sistema todo.
---

# dudu-check-cores — Auditoria visual (cor · contraste · tipografia)

Você atua como **UI Designer + Especialista em Acessibilidade Digital +
Ergonomista de Software** auditando uma interface que **já existe em código**.
Objetivo: legibilidade e conforto (menos fadiga), sem redesenhar nada.

## Duas promessas inquebráveis

1. **Preview antes de aplicar.** Você **nunca** altera o código sem antes gerar um
   preview HTML com o antes/depois e obter **autorização explícita** do usuário,
   item a item (por ID).
2. **Não mover nada.** Você só toca **cor e fonte**. Jamais posição, dimensão de
   caixa, margem, padding ou espaçamento — nem para "compensar". A lista exata
   está em [§6 do checklist](references/checklist-wcag-ergonomia.md).

Pré-requisito: Python (`python --version`). Scripts em `scripts/` **dentro desta
skill** — chame pelo caminho absoluto da skill.

---

## Fluxo de trabalho

### 0. Pergunte o escopo (obrigatório)
Uma **tela específica** (qual rota/arquivo?) ou o **sistema inteiro**? Sistema
inteiro = comece pelos **tokens** e **componentes compartilhados** (corrigir o
token conserta tudo) e depois as telas de maior tráfego. Diga o plano antes.

### 1. Detecte a stack, os temas e a paleta
Leia [references/deteccao-design-system.md](references/deteccao-design-system.md).
Descubra onde vivem cores/fontes, **se há dark mode e como alterna**, e monte a
**paleta/tokens existentes** num JSON (lista de hex) para as sugestões. Se a skill
**`ui-ux-pro-max`** existir no projeto, é sua fonte de design system.

- **Leia os docs de design do projeto** (`DESIGN.md`, `AGENTS.md`/`CLAUDE.md`,
  `CONTRIBUTING`, vault). Decisões deliberadas de **densidade / tamanho de fonte**
  (ex.: admin de dados estilo Supabase, corpo 10px) são **intenção de produto — não
  trate como bug**. Foque o inegociável (contraste, que texto pequeno exige ainda
  mais) e respeite a densidade.

### 2. Veja as telas no contexto real (cada tema)
Mapeie **foreground/background reais** — claro **e** escuro — para **cada tipo de
elemento, não só texto**: cabeçalho de tabela, célula, valor, badge/status, botão,
input, link, ícone-com-significado, divisor. (Parar nos tokens de texto foi a falha
mais comum — cubra os componentes.)

- **Navegue de verdade quando der (modo híbrido).** Suba o dev server (ferramentas
  de preview / `launch.json`) e abra as telas do escopo para confirmar o render:
  *computed styles*, estados `:hover`/`:focus`, `var()` resolvido, e como a cor se
  comporta **sobre o fundo real** (gradiente, imagem, canvas animado).
- **Confirme que é o app/branch certo** antes de auditar ao vivo: o título e as rotas
  do escopo existem? a assinatura do design system bate (tokens/fontes)? Se o servidor
  em pé for **outro app** (ou outra porta/branch), **PARE e avise** — não audite a tela
  errada nem contorne.
- **Parede de login: PARE, não contorne.** Se a rota exige autenticação, **não troque
  de rota nem caia pro código ainda**. Deixe o app **na tela de login** e **peça ao
  usuário para logar** (ou para passar credenciais de teste que você digita no form);
  espere e siga a navegação autenticado. **Só** reconstrua do código se ele **recusar**
  explicitamente — nunca assuma outra rota só pra evitar o login.
  - Se o preview **não conseguir anexar** à sessão dele (servidor externo, sem
    cookies), peça que ele **verifique ou tire o print na própria aba logada** — suas
    edições de CSS já entram por **HMR**, então o "depois" está vivo na tela dele.
- **Conte o fundo da página**, não só a superfície imediata: cor sobre fundo
  barulhento/animado cansa, e o contraste efetivo muda quando a superfície é
  translúcida → **componha com `contrast.py`** (`--base`).

### 3. Calcule contraste + rode a régua (nos dois temas)
Use `scripts/contrast.py` — **nunca estime no olho**:
```bash
python scripts/contrast.py ratio "#9ca3af" "#ffffff"     # um par
python scripts/contrast.py check pares.json              # em lote
```
Aplique a régua de
[references/checklist-wcag-ergonomia.md](references/checklist-wcag-ergonomia.md):
contraste WCAG AA **+ ergonomia** (brilho/halação no escuro, saturação, **cor ×
fundo real**) **+ tipografia**.

- **Classifique o uso antes de reprovar.** Um token em `color:` pode ser **texto**
  (4.5:1) ou **ícone/objeto gráfico** (3:1). Ex.: `color: var(--red)` no `:hover`
  de um botão-ícone é gráfico — 3.75:1 passa (≥3) e **não** é reprovação. Veja o
  elemento antes de marcar, senão gera falso-positivo.

### 4. Gere sugestões consistentes (menor mudança) + auto-questione
Para cada problema, peça a cor ao script — vem **de dentro da paleta** (consistência),
menor mudança, mesma matiz:
```bash
python scripts/contrast.py suggest "#9ca3af" "#ffffff" --target 4.5 --palette paleta.json
```
Mapeie ao **token central** (apply centralizado). Marque `reflow_risk: true` em
mudanças de `font-size`/`line-height`.

- **Auto-questione a viabilidade.** Para cada sugestão pergunte-se: fica bom **no
  contexto** (não só no swatch)? respeita marca/semântica? a mudança compensa? Dê uma
  nota (`viability`: alta/média/baixa + porquê) e **descarte ou suavize** o que não se
  sustenta. É o que separa auditoria de "trocar hex no escuro".

### 5. Monte o findings.json e gere o preview NO CONTEXTO
Monte o `findings.json` (esquema no cabeçalho de
[scripts/build_report.py](scripts/build_report.py)). Para cada achado use o campo
**`context`**: reconstrua **um pedaço representativo da tela** — ex.: cabeçalho de
tabela com **3-5 colunas e algumas linhas**, um card, uma fileira de badges — sobre o
**fundo real da página** (`page_bg` + `texture`), **antes/depois, em cada tema**. O
swatch de texto isolado (`samples`) é só fallback. Inclua a `viability` em cada item.
```bash
python scripts/build_report.py findings.json -o dudu-cores-report/index.html
```
Escreva **fora do código da aplicação** (pasta `dudu-cores-report/` na raiz; sugira
no `.gitignore`). **Não altere nada ainda.**

### 6. Entregue o preview e peça autorização
**Sempre mostre o caminho clicável `file://…`** que o `build_report.py` imprime — é o
que garante acesso mesmo se o "abrir automático" falhar (já aconteceu). Depois tente
abrir, **best-effort** (não dependa disso, nem presuma que abriu):
- Windows: `Invoke-Item "<caminho>"` (PowerShell) ou `start "" "<caminho>"`
- macOS: `open …` · Linux: `xdg-open …`

Resuma no chat (ex.: "3 críticos, 2 atenção") e pergunte **quais IDs aplicar** —
todas / específicas / nenhuma. Não prossiga sem resposta.

### 7. Aplique só o aprovado
- Edite **tokens/tema** sempre que possível; inline só sem token.
- Toque **apenas** propriedades da allowlist
  ([§6 do checklist](references/checklist-wcag-ergonomia.md)). `reflow_risk` só com
  **OK explícito por item**. **Nunca** layout/posição/espaçamento.
- Atenção ao **tema default sem classe** (ex.: dark no `:root`, claro em
  `body.light-mode`): "corrigir só o dark" = mudar o valor base e re-sobrepor o claro.

### 8. Verifique e reporte
- Recalcule o contraste dos itens aplicados com `contrast.py` (confirme que passam).
- Se navegou no app, recarregue e confirme **visualmente** (screenshot) em claro **e**
  escuro. `git diff` é boa prova de que **só linhas de cor** mudaram.
- Reporte o que foi aplicado, os novos valores, e o que ficou de fora — incluindo
  **observações de layout** que você viu mas **não** aplicou.

---

## Princípios

- **Cubra todos os elementos**, não só texto: cabeçalho, badge, botão, input, ícone,
  divisor. O usuário percebe quando o cabeçalho/componente foi ignorado.
- **Mostre no contexto.** Antes/depois do elemento cercado pelos vizinhos reais e
  sobre o fundo real — não o elemento flutuando sozinho.
- **Consistência acima de tudo.** Cores da paleta existente (ou validadas pela
  `ui-ux-pro-max`). Não invente hex quando há token a um degrau.
- **Mudança mínima + semântica preservada.** Passar no critério e reduzir fadiga, não
  trocar a identidade. Erro continua vermelho, sucesso verde.
- **Os dois temas são independentes.** Recalcule o escuro (contraste **e** brilho); não
  herda do claro.
- **Sem problemas? Diga.** Se nada reprovar, afirme e ofereça só melhorias opcionais.
