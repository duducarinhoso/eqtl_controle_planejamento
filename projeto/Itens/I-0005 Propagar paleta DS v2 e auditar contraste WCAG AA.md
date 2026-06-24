---
id: I-0005
tipo: tarefa
status: aberto
prioridade: P2
criado: 2026-06-24
resolvido:
modulo: design-system
fase: Fase 6
origem:
  - "modelos/design-system_v2.html (modificado)"
  - "bootstrap 2026-06-24"
---

A paleta v2 (institucional teal/verde/navy — `--blue: #246b78`, `--green: #71b280`, `--red: #e16464`, fonte Outfit) está em `modelos/design-system_v2.html` mas **ainda não foi propagada** a todos os componentes/telas do app (`styles/tokens.css` + demais). Falta consistência dark+light.

**Ação:** aplicar os tokens v2 em `styles/tokens.css` e telas, usando o modelo como fonte à risca; depois rodar auditoria de contraste (skill `dudu-check-cores`) para garantir WCAG AA (texto ≥ 4.5:1) em dark e light. PRODUCT.md pede "auditável e sério".
