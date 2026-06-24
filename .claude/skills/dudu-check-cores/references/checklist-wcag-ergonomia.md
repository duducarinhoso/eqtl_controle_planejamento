# Checklist de auditoria visual — contraste, ergonomia e tipografia

Esta é a régua que a skill usa para **encontrar** problemas. Combina três lentes
profissionais: **Auditoria de Acessibilidade (WCAG)**, **Avaliação Ergonômica de
Interface** (fadiga/carga visual) e **Avaliação Heurística**. O escopo é
exclusivamente **cor, contraste e tipografia** — nunca posicionamento/layout.

> **Cubra todos os tipos de elemento** — cabeçalho, célula, valor, badge/status,
> botão, input, link, ícone-com-significado, divisor — **não só tokens de texto**.
> E mostre cada achado **no contexto** (o elemento cercado pelos vizinhos reais,
> sobre o fundo real), não isolado.

Índice:
1. Contraste (WCAG) — objetivo, calcular com `contrast.py`
2. Ergonomia / fadiga visual
3. Tipografia / legibilidade
4. Modo escuro
5. Classificação de severidade
6. O que pode e o que NÃO pode ser alterado (trava de layout)

---

## 1. Contraste (WCAG 2.x)

Calcule **sempre** com `scripts/contrast.py` (não estime no olho). Limiares:

| Caso | AA | AAA |
|---|---|---|
| Texto normal | **4.5:1** | 7:1 |
| Texto grande (≥24px, ou ≥18.66px se bold) | **3:1** | 4.5:1 |
| Componentes de UI e objetos gráficos | **3:1** | — |

"Componentes/objetos gráficos" (WCAG 1.4.11): bordas de input, ícones que
carregam significado, anel de foco, limites de botão/toggle, fatias/linhas de
gráfico, divisores que comunicam estrutura.

> **Classifique pelo elemento, não pelo token.** O mesmo `--red` pode ser **texto**
> (4.5:1) num valor e **ícone** (3:1) num `:hover` de botão-ícone. Antes de reprovar
> um `color:`, veja se o alvo é texto ou objeto gráfico — senão vira falso-positivo.

- **Alpha / translucidez**: `contrast.py` compõe sobre o fundo real (`--base`). Use.
- **Texto sobre imagem/gradiente**: avalie o pior ponto; se falhar, exija scrim/overlay (cor, não posição).
- **Texto desabilitado**: isento de WCAG, mas se carrega informação relevante, sinalize.
- **Não conta como falha**: logotipos e texto puramente decorativo.

## 2. Ergonomia / fadiga visual (carga cognitiva)

Recomendações de conforto para uso prolongado (sistemas financeiros, painéis densos).
Não são falhas WCAG, mas reduzem fadiga — classifique como `warning`/`info`.

- **Evite preto puro (#000) sobre branco puro (#fff)** em áreas extensas de leitura → halation/brilho. Prefira quase-preto (`#0a0a0a`–`#1a1a1a`) sobre off-white (`#fafafa`–`#f7f7f7`).
- **Saturação alta em grandes superfícies cansa.** Reserve cores muito saturadas para acentos pequenos.
- **Cores vibrantes complementares adjacentes** (vermelho puro + azul puro) causam vibração → evite encostá-las.
- **Hierarquia de texto distinguível, mas não tudo no máximo.** Ex.: primário ~12–16:1, secundário ~7:1, terciário/hint ~4.5:1. Tudo no contraste máximo achata a hierarquia e cansa.
- **Nunca use cor como único meio de informação** (WCAG 1.4.1): status, erro, link, saldo negativo → adicione ícone/texto/sublinhado.
- **Limite cores de acento** e mantenha **cores semânticas consistentes** no sistema todo (erro=vermelho, sucesso=verde, alerta=âmbar, info=azul).
- **Foco visível** (WCAG 2.4.7) com contraste ≥3:1 contra o entorno; nunca remova o anel de foco sem substituto.
- **Brilho / halação no escuro:** branco puro (`#fff`) sobre preto puro (`#000`) "vibra" e força a vista. Prefira texto off-white (`#e6e6e6`–`#cbd5e1`) sobre fundo escuro não-puro. Contraste altíssimo (>~12:1) em **blocos longos** de leitura no escuro cansa — tolerável em labels/células curtas.
- **Cor × fundo REAL:** avalie a cor contra o **fundo da página** (gradiente, imagem, canvas animado), não só a superfície imediata. Cor saturada ou texto sobre fundo "barulhento" cansa; superfície translúcida muda o contraste efetivo → componha (`contrast.py --base`).

## 3. Tipografia / legibilidade

- **Corpo**: ideal ≥16px (web). Tabelas densas podem usar 13–14px; **<12px é sinalizado** (fadiga).
- **line-height do corpo**: 1.4–1.6 (1.5 ótimo). Títulos: 1.1–1.3.
- **Comprimento de linha**: 45–75 caracteres em texto longo.
- **Peso**: hierarquia por peso (400 corpo, 500 labels, 600–700 títulos). Evite pesos 100–200 em texto pequeno (somem no anti-aliasing, principalmente no escuro).
- **ALL CAPS** só em labels curtos (com `letter-spacing`); nunca em blocos longos.
- **Números em colunas de dados**: `font-variant-numeric: tabular-nums` (alinha e evita "pulo" de largura).
- `letter-spacing`: respeite o default; evite tracking apertado em corpo.

> ⚠️ **Reflow**: mudar `font-size`/`line-height` altera a **altura** do texto. Isso é permitido (fonte está no escopo), mas: marque `reflow_risk: true`, só sugira quando a legibilidade realmente falha, e **exija OK explícito por item**. NUNCA mexa em margin/padding/width para "compensar".

> 📐 **Densidade documentada vence a regra genérica.** Antes de sinalizar tamanho de fonte, cheque os docs de design do projeto (`DESIGN.md`, `AGENTS.md`, vault). Densidade alta deliberada (ferramenta de dados / admin) é decisão de produto — não a trate como bug; foque o **contraste** (texto pequeno exige ainda mais).

## 4. Modo escuro (quando existir)

Cada tema tem seus próprios pares — **recalcule o contraste no escuro**, não herde do claro.

- **Fundo da página não deve ser #000 puro**; use superfícies escuras elevadas (`#0b1020`–`#121826`) → menos brilho, mais profundidade.
- **Texto longo não deve ser #fff puro**; prefira `#e6e6e6`–`#cbd5e1` (reduz halation).
- **Desature/clareie cores de marca** para o escuro (saturadas "vibram"). Use variantes tonais, não inversão (Material/HIG).
- **Bordas, divisores e estados** (hover/focus/disabled) devem permanecer visíveis nos dois temas.
- Elevação no escuro costuma ser por **superfície mais clara**, não por sombra.

## 5. Classificação de severidade

- **critical** — reprova WCAG **AA** de contraste em texto/UI essencial; ou cor como único significado de informação crítica (erro, saldo negativo).
- **warning** — conforto/ergonomia/tipografia que aumenta fadiga (preto puro, fonte <12px, hierarquia achatada, saturação alta em superfície grande); ou reprova **AAA** quando o alvo escolhido é AAA.
- **info** — melhoria opcional / consistência fina.

## 6. O que pode e o que NÃO pode ser alterado (trava de layout)

**Permitido (cosmético — não muda a caixa):**
`color`, `background-color`, `background` (cor), `border-color`, `outline-color`,
`fill`, `stroke`, `box-shadow` (cor), `text-decoration-color`, `caret-color`,
`accent-color`, tokens de cor (`--*`), `font-family`, `font-weight`,
`letter-spacing`, `text-decoration` (ex.: sublinhar link).

**Permitido com cautela (muda a altura do texto → `reflow_risk: true`, OK por item):**
`font-size`, `line-height`.

**PROIBIDO (muda posição/arranjo dos elementos):**
`width`, `height`, `min/max-*`, `margin`, `padding`, `gap`, `position`,
`top/right/bottom/left`, `inset`, `display`, `flex-*`, `grid-*`, `float`,
`transform` de posição, `z-index`, `border-width`.

Se um problema **só** se resolve mexendo no proibido, registre como **observação**
no relatório (`info`) — descreva, mas **não aplique**. A promessa da skill é não
mover nada.
