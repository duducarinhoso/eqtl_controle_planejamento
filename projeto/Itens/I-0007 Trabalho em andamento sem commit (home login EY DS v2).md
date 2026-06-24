---
id: I-0007
tipo: pendencia
status: aberto
prioridade: P1
criado: 2026-06-24
resolvido:
modulo: geral
fase:
origem:
  - "git status no bootstrap 2026-06-24"
---

No bootstrap da Central, a working tree tinha trabalho **modificado e não commitado**:
- `index.html` (fonte Outfit + link para `styles/home.css`)
- `js/app.js` (home/seletor de módulos `showHome`/`buildHome`; `openEyImport`)
- `js/store.js` (~100 linhas de funções EY: `upsertEyRequests`, `eySync`, `listEy*`)
- `modelos/design-system_v2.html` (refresh de paleta teal/navy)
- **não rastreados:** `styles/home.css`, `tools/` (artefatos EY), `.claude/` (skills + launch)

**Ação:** o Eduardo decide o agrupamento e commita (git é dele). Sugestão de commits temáticos: (1) home + seletor de módulos, (2) integração EY (store + import + tools/), (3) DS v2 paleta, (4) Central do projeto + skills (`projeto/` + `.claude/`). Fazer `push` para levar à outra máquina.

> Este item fecha quando o trabalho estiver commitado e empurrado.
