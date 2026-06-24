---
id: D-0005
data: 2026-06-24
status: vigente
modulo: Shell / Navegação
itens: ["[[I-0010 Tela do projeto integrada no shell do modelo]]"]
---

## Contexto
O app abria numa tela de **seleção de projeto** e só então mostrava um shell por projeto. O Eduardo quer um portal unificado com **3 divisões de módulos** no sidebar e sem "abrir tela nova" ao escolher um projeto.

## Alternativas consideradas
- Navegação: (A) **3 módulos** num shell permanente (Portal EY / Operações / Administração); (B) manter a home de seleção + shell por projeto.
- Tela do projeto: (A) **integrada** — ao clicar num projeto, permanece no shell do modelo e o conteúdo (dashboard/abas/grade) renderiza no `.content`; (B) **tela dedicada** reconstruída no modelo (sidebar troca para as abas).

## Escolha e porquê
- **3 módulos** (A): Portal EY (relatório/coletas/engagements), Operações (o espelho atual do Excel — Projetos vive aqui), Administração (Cadastros, Usuários, Configurações). A **tela de seleção de projeto deixa de existir** e vira o item "Projetos" dentro de Operações.
- **Tela do projeto integrada** (A, escolha do Eduardo em 2026-06-24): clicar num projeto **não abre nova tela**; o shell do modelo (sidebar dos 3 módulos) permanece, o dashboard vira cards do modelo, as abas viram nav contextual e a **grade (tabela do Excel) abre no `.content`, mantida como está**.

## Rotas descartadas e porquê
- **(B) home de seleção:** dois níveis de navegação desconexos; o Eduardo quer visão panorâmica + micro num shell só.
- **(B) tela dedicada do projeto:** abriria "outra tela" e trocaria o conteúdo da sidebar (some os 3 módulos); contraria "integrar para não abrir nova tela". Mais rápido de fazer, mas pior de experiência.
- **Splash líquida (Auditoria/Cronograma):** mantida como porta de entrada (modelo próprio `01.tela_inicial_v2`); Auditoria → `#/operacoes`. (A sobriedade do glassmorphism da splash é decisão aberta — ver [[I-0013 Alinhar login e splash ao DS v2]].)
- **Notificações no topbar:** descartado adicionar (seriam chrome falso/AI-slop sem sistema real).

## Consequências
- Rotas: `#/operacoes` (Projetos), `#/ey/*`, `#/admin/*`; grade ainda em `#/p/<id>` (escopada `.lg-*`) até a integração de [[I-0010 Tela do projeto integrada no shell do modelo]].
- Papéis Adm/Operador/Visitante mapeados sem quebrar o banco; Administração só para Adm.
- Conta consolidada num único menu no rodapé da sidebar.
