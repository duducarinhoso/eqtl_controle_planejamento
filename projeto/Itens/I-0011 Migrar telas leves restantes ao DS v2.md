---
id: I-0011
titulo: Migrar telas leves restantes ao DS v2 (Admin Usuários, Gerenciar status, Dashboards)
status: aberto
prioridade: P2
frente: Design
origem: "chat 2026-06-24"
decisoes: ["[[D-0004 Migracao 100% para o DS v2 (casa nova)]]"]
---

# Migrar telas leves restantes ao DS v2

Telas que ainda estão no estilo legado e têm equivalente direto no modelo (Etapa 2 do roteiro, continuação):
- **Admin → Usuários** (`openAdminPanel`/`adminUserRow`): usar a `.tbl` "Customers List" do modelo + `.badge` de papel + avatar.
- **Gerenciar lista de status** (`openStatusManager`): `.tbl`/lista + kit de form (`.input`/`.btn`).
- **Dashboards** (Status/Usuários) — em parte coberto por [[I-0010 Tela do projeto integrada no shell do modelo]] (são o dashboard do projeto); se houver dashboard fora do projeto, idem `.stat`/`.card`/charts.
- **Modais** restantes (novo/editar projeto, etc.): já herdam `.modal` tematizado; revisar caso a caso.

**Consultar:** modelo (`.tbl` linhas ~438-447, `.badge` ~382-393, `.stat` ~316-328) e o checklist Definition of Done (Central § Painel de Design). Aplicar a disciplina de revisão (cor semântica, ícone↔rótulo, WCAG claro+escuro).
