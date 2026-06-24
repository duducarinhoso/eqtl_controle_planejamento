---
data_atualizacao: 2026-06-24
tipo: roadmap
---

# 🚦 Roadmap por fases

> Fases por dependência. Critério de conclusão = o que precisa ser verdadeiro para a fase contar como ✅. Levantado no bootstrap (2026-06-24).

| Fase | Escopo | Dependência | Critério de conclusão | Status |
|---|---|---|---|---|
| **0 — Fundação** | Vanilla JS + Supabase + deploy GitHub Pages + auth (login/signup/forgot/reset) | — | App estático no ar, login funcional, sessão persistida | ✅ entregue |
| **1 — Grade colaborativa (Auditoria)** | Projetos · Abas · Grade tipo planilha · status semafórico · copy/paste · formatação · merge · histórico por célula · comentários | 0 | Editar a grade ponta-a-ponta com persistência e auditoria | ✅ entregue |
| **2 — Tempo real & presença** | Sync de células · presença por célula · online/offline · marcador na célula | 1 | Dois usuários veem edições e presença ao vivo | ✅ entregue |
| **3 — Visão gerencial** | Dashboard em abas (Status/Usuários) · medidor de entregas · heatmap · atividade por usuário | 1 | Dashboards com dados reais da grade | ✅ entregue |
| **4 — Excel & administração** | Import/export .xlsx com formatação · admin de usuários · allowlist · avatar · lista de status configurável | 1 | Carga inicial via Excel + gestão de usuários operacional | ✅ entregue |
| **5 — Integração EY Canvas** | Espelho `ey_requests` · sync incremental · UI de extração guiada · catálogo de engagements · bridge de coleta | 1 | Importar solicitações da EY → grade/painel, com sync e log de mudanças, sem colagem manual | 🔨 **em andamento** (backend ✅; UI/infra pendentes — ver Itens) |
| **6 — Polimento de UI / DS v2** | Propagar paleta institucional (teal/navy) · refinar login · consistência de tokens dark+light · acessibilidade WCAG AA | 1 | DS v2 aplicado em todas as telas; auditoria de contraste verde | 🔨 em andamento |
| **7 — Cronograma** | Segundo módulo (placeholder na home) — escopo a definir | 0 | A definir com o Eduardo | ⏳ não iniciado |

## Frentes / objetivos transversais

- **Frente A — Confiabilidade da grade colaborativa:** é o coração do produto; ajustes de teclado/scroll/resize/presença continuam evoluindo (ver commits recentes). Débitos técnicos viram Itens.
- **Frente B — EY Canvas (retorno direto):** tirar o time da coleta manual de solicitações no portal EY. Atravessa Fase 5; é o maior valor de negócio aberto. Ver `tools/ey_IMPLEMENTACAO.md` e auto-memory `ey-canvas-pipeline`.
- **Frente C — Identidade institucional (DS v2):** o app precisa "parecer auditável e sério" (PRODUCT.md). Atravessa Fase 6.

## Próximo marco sugerido

Fechar a **Fase 5 (EY)** o suficiente para o time parar de colar JSON na mão: (1) criar a tabela `ey_engagements`, (2) portar o protótipo `tools/ey_executar_preview.html` para uma rota/modal do app, (3) resolver o filtro de extração (174 vs 253 solicitações). Detalhe nos Itens I-0001..I-0004.
