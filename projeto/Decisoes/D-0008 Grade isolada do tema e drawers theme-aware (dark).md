---
id: D-0008
data: 2026-06-25
status: vigente
modulo: grade + drawers/modais (UI legada no shell DS v2)
itens: ["[[I-0012 Re-tematizar a grade (planilha) ao DS v2]]", "[[I-0011 Migrar telas leves restantes ao DS v2]]"]
---

# Grade isolada do tema; drawers/modais theme-aware via remap de tokens

## Contexto
Com o app migrado ao shell DS v2 (dark+light), a **UI legada** (grade, drawers, modais, menus) usa tokens legados FIXOS de `tokens.css` (`--on-surface`, `--surface-*`, `--outline-*`, `--workspace-bg`). No **dark** isso vazava: texto das células da grade ficava branco; títulos/inputs dos drawers sumiam; nome da presença sumia.

## Alternativas consideradas
- Redefinir os tokens legados globalmente para o dark — **descartada**: escureceria a **grade**, que precisa ficar clara (espelho do Excel).
- Tornar tudo theme-aware elemento a elemento — caro e propenso a erro.
- **Escopar** o conserto por contêiner (grade ≠ drawers/modais).

## Escolha e porquê
Dois escopos distintos, regra de ouro: **"dentro da aba (grade) não muda estrutura nem cores"**.
- **Grade = espelho do Excel, SEMPRE clara**, independente do tema: `.proj-main #grid-scroll:not(.dash):not(.solic)` fixa bg/`color`; `.cc` usa `--on-surface` (escuro fixo). A **formatação inline por célula** do usuário continua vencendo.
- **Drawers/modais/menus = theme-aware**: remap dos tokens legados para os do DS v2 **só** em `[data-theme="dark"] .drawer, .modal, .ctx-menu`. Por serem custom properties, **tudo lá dentro herda** o tema de uma vez — sem tocar a grade (que vive em `.proj-main`, fora desses contêineres).

## Rotas descartadas e porquê
Remap global dos tokens — quebraria o requisito da grade clara.

## Consequências
A grade fica como uma **ilha clara** no app escuro (intencional). Drawers/modais (Config, Busca, Histórico, Comentários, Equipe, Admin, managers) ficam legíveis no dark com uma única regra de remap. A re-tematização **própria** das células da grade ([[I-0012 Re-tematizar a grade (planilha) ao DS v2]]) segue à parte.
