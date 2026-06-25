# Mapa do fluxo EY — do acesso até emitir o relatório

Objetivo: descrever **cada etapa** do caminho no navegador, com uma **assinatura detectável**,
para que ao clicar em "Executar" o sistema abra uma aba e **saiba em que passo o usuário está**
(precisa logar? já logado? escolhendo engagement? na tela do relatório?) até a finalização.

> Status: **em construção** (preenchido durante o walkthrough guiado pelo usuário).
> Não capturamos senha/MFA — só sinais estruturais (URL, título, marcadores de tela, tokens).

## Como o rastreador identifica a etapa
A cada verificação, lê uma "assinatura" da aba e casa com os estados abaixo (de baixo p/ cima — o
estado mais avançado que casar vence). Sinais usados:
- `location.host` + `location.pathname` (sinal primário)
- `document.title`
- presença de marcadores na tela (campos, botões, textos)
- token MSAL no `localStorage` do **origin do app** (logado?) e seu `expiresOn`
- `engagementId` na URL (quando aparece)

Identificadores fixos do ambiente:
- Tenant Azure AD: `5b973f99-77df-4beb-b27d-aa0c70b8482c`
- App **Canvas** (`eycanvas.ey.com`): client_id `f66aa824-4a9c-4a93-9e61-a2946fcab2da`
- App **Client Portal** (`eycanvasclientportal-us.ey.com`): token com escopo `eygs.onmicrosoft.com/cea-prd-us-app`
- API de dados das solicitações: `eycanvasapp-us.ey.com/api/v2/...` (ver [[ey-canvas-pipeline]])

---

## Estados (máquina de etapas)

| # | Etapa | Tipo | Como detectar | Ação para avançar | Dados coletados |
|---|-------|------|---------------|-------------------|-----------------|
| 0 | **Entrada** — abre `https://eycanvas.ey.com/` | transitório | host `eycanvas.ey.com` por instantes; decide redirecionar | aguardar redirecionamento | — |
| 1 | **Login Microsoft (senha)** | 🔴 gate (usuário) | host `login.microsoftonline.com`, path `/{tenant}/oauth2/v2.0/authorize`, título "Entrar em sua conta", campo `input[type=password]`, heading "Insira a senha" | usuário digita a senha e clica "Entrar" | client_id do Canvas `f66aa824-…`; redirect_uri `https://eycanvas.ey.com/` |
| 2 | **MFA — PingID** | 🔴 gate (usuário) | host `authenticator.pingone.eu`, path `/pingid/ppm/auth`, título "PingID", heading "Azure AD" + "Digite o código…", campo de código, botão "Iniciar Sessão" | usuário digita o código do autenticador e clica "Iniciar Sessão" | — |
| 3 | **Canvas logado — Home / Painel** | ✅ marco | host `eycanvas.ey.com`, path `/`, título "EY Canvas Client Portal", texto "Bem-vindo …"; token `cea-prd-us-app` no localStorage (não expirado) | clicar "Visualizar solicitações" do engagement | lista de engagements (2): FY27=ENG-A, RESTORE FY26=ENG-B |
| 4 | _(a mapear)_ Lista de solicitações do engagement | — | provável host `eycanvasclientportal-us.ey.com`, path `/requests/...?engagementid=` | abrir menu ▸ relatório | engagementId aparece na URL |
| 6 | _(a mapear)_ **Tela de emitir relatório** | 🎯 final | … | clicar "Gerar relatório" (ou pular via API) | — |

Legenda: 🔴 gate = pode travar/depende do usuário · ✅ marco = "logado/ok" · 🎯 final = destino.

---

## Log do walkthrough
1. `GET https://eycanvas.ey.com/` (sem sessão no Canvas) → **redirect** para `login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` → tela **"Insira a senha"** (conta já preenchida). → **Etapa 1**.
   - _Usuário digitou a senha →_ **redirect** para MFA.
2. Senha OK → **MFA PingID** em `authenticator.pingone.eu/pingid/ppm/auth` (Azure AD via PingID). → **Etapa 2**.
   - _Esperado a seguir: concluído o MFA, redireciona para `https://eycanvas.ey.com/` (Canvas logado)._
3. MFA OK → **Canvas logado** em `eycanvas.ey.com/` (painel "Bem-vindo Eduardo", lista de engagements). → **Etapa 3**. Tokens MSAL presentes (incl. `cea-prd-us-app`). → daqui o usuário clica "Visualizar solicitações".

## ⚠️ Notas importantes (afetam a EXTRAÇÃO)
- O painel mostra **253 Total** (FY27) = Excepcional **174** + Enviada **60** + Aceito **19**. O snippet atual usa `quickfilter=3` e traz só as **174**. Para espelhar **tudo (253)**, ajustar o filtro da API (ex.: outro `quickfilter`/`filtertype`, ou somar os baldes). **Confirmar a regra na tela do relatório.**
- Logar em `eycanvas.ey.com` já gera o token `cea-prd-us-app` usado pela API — então a extração funciona a partir daqui.

## Catálogo de engagements (capturado na Etapa 3)
Endpoint que monta o painel da home (lista TODOS a que o usuário tem acesso):
`GET https://eycanvasapp.ey.com/api/v2/engagements.json` (host GLOBAL, sem `-us`; token de escopo `cea-prd-app`).
Campos por item: `EngagementId, EngagementName, Domain, EngagementStatusId, IsEngagementDeactivatedRead, Groups[], AppUrl, AudienceUrl`.
- `Domain` = host regional que serve aquele engagement (aqui `https://eycanvasclientportal-us.ey.com/`) → diz ao automatizador para qual host ir (e qual API `-us` usar).
- `Groups[]` = times do engagement (com Users). Atenção: é OUTRO conceito de "grupo" — o FY27 tem 19 times; já o `clientGroupName` das solicitações (CEA, CEEE, CSA, EQTL AL/GO/Holdings/MA/PA/PI = 9) é o que vira `group_name` na tabela.

| EngagementId | Nome | Domain | StatusId |
|---|---|---|---|
| ENG-A | FY27 - Grupo Equatorial S.A. - AUD 2026 | eycanvasclientportal-us.ey.com | 1 (ativo) |
| ENG-B | RESTORE - FY26 - GRUPO EQUATORIAL AUD 2025 | eycanvasclientportal-us.ey.com | 7 (restore) |

→ Útil no "Executar": chamar este endpoint para o usuário **escolher o engagement** e descobrir o host de destino, antes de extrair.

**Rota é genérica por `engagementid`** (testado): extrair o engagement ENG-B a partir da própria home (`eycanvas.ey.com`) deu `HTTP 200`, `totalCount 0` (RESTORE FY26 está vazio). Mesmo endpoint/host/token do ENG-A — só troca o `engagementid`. A home já chama `eycanvasapp-us.ey.com`, então a extração funciona de qualquer uma das telas logadas.

## TODO — persistir engagements no banco (⛔ NÃO executar agora; fazer após mapear)
Motivo: engagements podem **sumir** da lista depois (encerrados/arquivados). Queremos um catálogo no
banco que **registra novos automaticamente** e **mantém os que sumiram** (apenas marcados, sem apagar).

Tabela a criar depois — `public.ey_engagements`:
- `engagement_id` bigint **PK**
- `name` text
- `domain` text  — host regional (define a API a usar)
- `status_id` int  — 1=ativo, 7=restore, …
- `is_active` bool  — true se veio na última sincronização
- `groups` jsonb  — nomes dos times (opcional)
- `first_seen_at` timestamptz default now()
- `last_seen_at` timestamptz
- `raw` jsonb

Sincronização (a cada vez que a lista é lida):
1. `GET https://eycanvasapp.ey.com/api/v2/engagements.json` (token `cea-prd-app`).
2. UPSERT por `engagement_id` (atualiza name/domain/status/groups, `last_seen_at`, `is_active=true`).
3. Os que **não** vieram nesta rodada → `is_active=false` (preserva histórico; não apaga).

UI de seleção (antes do "Executar"): listar `ey_engagements` (ativos primeiro); usuário marca **1 ou mais**;
para cada selecionado → extrai as solicitações → grava em `ey_requests` (ligadas por `engagement_id`).

Região/host: derivar a API regional do `domain` do engagement (`…clientportal-us…` → `…app-us…`).
Hoje os 2 engagements são `-us`.
