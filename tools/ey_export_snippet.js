/* =============================================================================
   EY Canvas Client Portal  →  exportador de solicitações (tabela ey_requests)
   -----------------------------------------------------------------------------
   O QUE FAZ
   Lê a API interna do portal EY (a MESMA que alimenta a lista e o "Gerar
   relatório"), pagina TODAS as solicitações do engagement aberto e COPIA um
   JSON para a área de transferência. Sem clicar em "Gerar relatório", sem
   Excel e sem o diálogo "salvar como".

   COMO USAR
   1) Abra e faça login no EY Canvas Client Portal e vá até a LISTA DE
      SOLICITAÇÕES de um engagement (a URL precisa ter "?engagementid=...").
   2) Rode o exportador:
        • Opção A (1 clique) — crie um favorito com o BOOKMARKLET lá embaixo e
          clique nele com o portal aberto.
        • Opção B (console)  — F12 ▸ aba "Console" ▸ cole o BLOCO ABAIXO ▸ Enter.
   3) Ele copia o JSON. Vá ao app "Controle de Solicitações":
        menu do usuário ▸ "Importar da EY (colar JSON)…" ▸
        "Colar da área de transferência" ▸ "Importar".
   4) Para exportar outra entidade/engagement: troque no portal e rode de novo.

   POR QUE RODA NO PORTAL (e não num servidor)
   A API exige um token do Azure AD (MSAL) que o próprio portal mantém em cache
   e renova sozinho enquanto você está logado. Um backend isolado não consegue
   gerar esse token (login Microsoft interativo + MFA). Por isso o exportador
   roda na aba logada do portal; o app é quem grava no Supabase (sessão dele).

   As "abas" do relatório = entidades (grupos): CEA, CEEE, CSA, EQTL AL, EQTL GO,
   EQTL Holdings, EQTL MA, EQTL PA, EQTL PI. Viram a coluna group_name na tabela.
   ============================================================================= */

/* ----------------------------- BLOCO (console) ----------------------------- */
(async () => {
  try {
    const qs = new URLSearchParams(location.search);
    const ENG = qs.get("engagementid") || qs.get("engagementId");
    if (!ENG) throw new Error('Abra a LISTA DE SOLICITAÇÕES de um engagement (a URL precisa ter "?engagementid=...").');

    // token Azure AD (MSAL) que o portal já mantém em cache
    const atKey = Object.keys(localStorage).find((k) => k.includes("-accesstoken-") && k.includes("cea-prd-us-app"));
    if (!atKey) throw new Error("Token EY não encontrado. Recarregue o portal (logado) e tente de novo.");
    const tok = JSON.parse(localStorage.getItem(atKey));
    const token = tok.secret;
    if (Number(tok.expiresOn) * 1000 < Date.now()) console.warn("[EY] o token pode estar expirado; se der 401, recarregue o portal.");

    const base = "https://eycanvasapp-us.ey.com/api/v2/ClientRequests.json";
    const url = (page) => base +
      "?groupid=1&filtertype=2&quickfilter=3&priorityTypeId=all&searchtext=null" +
      "&subquickfilter=false&skip=" + page + "&timephase=0&customfilter=null&take=100" +
      "&orderby=DueDate&sortby=ASC&searchColumns=3,0&engagementid=" + ENG + "&datasource=primary";

    const all = []; let page = 1, total = Infinity, engDesc = null;
    while (all.length < total) {
      const r = await fetch(url(page), { headers: { Authorization: "Bearer " + token } });
      if (r.status === 401) throw new Error("401 não autorizado — recarregue o portal (o token renova sozinho) e rode de novo.");
      if (!r.ok) throw new Error("HTTP " + r.status + " ao buscar a página " + page + ".");
      const j = await r.json();
      total = j.totalCount; engDesc = engDesc || j.engagementDescription || null;
      const list = j.clientRequestList || [];
      all.push(...list);
      if (!list.length) break;
      page++; if (page > 50) break;   // trava de segurança
    }

    // "1.31 - Contas a pagar - ... - EQTL PA" -> code "1.31", area "Contas a pagar"
    const parseArea = (name) => {
      const m = /^\s*([0-9]+(?:\.[0-9]+)*)\s*-\s*(.+?)(?:\s*-\s*|$)/.exec(name || "");
      return m ? { code: m[1], area: m[2].trim() } : { code: null, area: null };
    };
    const rows = all.map((x) => {
      const a = parseArea(x.clientRequestName);
      return {
        client_request_id: x.clientRequestId ?? x.id,   // chave estável (PK da tabela)
        engagement_id: Number(ENG),                      // a API devolve engagementId=null; injetamos o da URL
        reference_number: x.referenceNumber ?? null,     // "Nº" visível no portal
        group_id: x.clientGroupId ?? null,
        group_name: x.clientGroupName ?? null,           // a "aba" (entidade)
        name: x.clientRequestName ?? null,
        description: x.clientRequestDescription ?? null,
        area_code: a.code,
        area_name: a.area,
        assigned_to: x.assignedTo ?? null,
        status: x.status ?? null,
        due_date: x.dueDate ?? null,
        received_date: x.receivedDate ?? null,
        sent_date: x.sentDate ?? null,
        accepted_date: x.acceptedDate ?? null,
        modify_date: x.modifyDate ?? null,
        create_date: x.createDate ?? null,
        document_count: x.documentCount ?? null,
        has_documents: x.hasDocuments ?? null,
        engagement_desc: x.engagementDescription ?? null,
        raw: x,                                          // linha original completa (à prova de futuro)
      };
    });

    // helpers de fallback (ficam disponíveis no console depois de rodar)
    window.__eyRows = rows;
    window.__eyCopy = () => navigator.clipboard.writeText(JSON.stringify(window.__eyRows)).then(() => console.log("[EY] copiado."));
    window.__eyDownload = () => {
      const b = new Blob([JSON.stringify(window.__eyRows)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = "ey_requests_" + ENG + ".json";
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    };

    let copied = false;
    try { await navigator.clipboard.writeText(JSON.stringify(rows)); copied = true; } catch (e) {}

    const byG = {}; rows.forEach((r) => { const g = r.group_name || "(sem grupo)"; byG[g] = (byG[g] || 0) + 1; });
    console.log("%c[EY] " + rows.length + " solicitações — " + (engDesc || ("engagement " + ENG)), "font-weight:bold;font-size:13px");
    console.table(byG);
    if (copied) {
      console.log("%c✅ JSON copiado. No app: menu ▸ \"Importar da EY (colar JSON)…\" ▸ Colar ▸ Importar.", "color:green");
    } else {
      console.log("%c⚠️ Não copiei automaticamente (foco/permissão do console).", "color:#b80");
      console.log("   Rode  window.__eyCopy()  para copiar, ou  window.__eyDownload()  para baixar o .json.");
    }
    return rows.length + " solicitações" + (copied ? " (copiadas)." : " prontas em window.__eyRows.");
  } catch (e) {
    console.error("[EY] " + e.message);
    return "ERRO: " + e.message;
  }
})();


/* =============================================================================
   BOOKMARKLET (1 clique) — crie um favorito e cole TUDO isto no campo URL.
   (versão sem acentos/emoji p/ não depender de codificação no favorito)
   -----------------------------------------------------------------------------
javascript:(async()=>{try{const qs=new URLSearchParams(location.search);const ENG=qs.get('engagementid')||qs.get('engagementId');if(!ENG)throw new Error('Abra a lista de solicitacoes (URL precisa de ?engagementid=).');const k=Object.keys(localStorage).find(k=>k.includes('-accesstoken-')&&k.includes('cea-prd-us-app'));if(!k)throw new Error('Token EY nao encontrado. Recarregue o portal logado.');const t=JSON.parse(localStorage.getItem(k)).secret;const u=p=>'https://eycanvasapp-us.ey.com/api/v2/ClientRequests.json?groupid=1&filtertype=2&quickfilter=3&priorityTypeId=all&searchtext=null&subquickfilter=false&skip='+p+'&timephase=0&customfilter=null&take=100&orderby=DueDate&sortby=ASC&searchColumns=3,0&engagementid='+ENG+'&datasource=primary';const all=[];let p=1,tot=1/0;while(all.length<tot){const r=await fetch(u(p),{headers:{Authorization:'Bearer '+t}});if(!r.ok)throw new Error('HTTP '+r.status+(r.status===401?' - recarregue o portal e tente de novo.':''));const j=await r.json();tot=j.totalCount;const l=j.clientRequestList||[];all.push(...l);if(!l.length)break;p++;if(p>50)break;}const pa=n=>{const m=/^\s*([0-9]+(?:\.[0-9]+)*)\s*-\s*(.+?)(?:\s*-\s*|$)/.exec(n||'');return m?{c:m[1],a:m[2].trim()}:{c:null,a:null};};const rows=all.map(x=>{const a=pa(x.clientRequestName);return{client_request_id:x.clientRequestId??x.id,engagement_id:Number(ENG),reference_number:x.referenceNumber??null,group_id:x.clientGroupId??null,group_name:x.clientGroupName??null,name:x.clientRequestName??null,description:x.clientRequestDescription??null,area_code:a.c,area_name:a.a,assigned_to:x.assignedTo??null,status:x.status??null,due_date:x.dueDate??null,received_date:x.receivedDate??null,sent_date:x.sentDate??null,accepted_date:x.acceptedDate??null,modify_date:x.modifyDate??null,create_date:x.createDate??null,document_count:x.documentCount??null,has_documents:x.hasDocuments??null,engagement_desc:x.engagementDescription??null,raw:x};});window.__eyRows=rows;window.__eyDownload=()=>{const b=new Blob([JSON.stringify(rows)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ey_requests_'+ENG+'.json';a.click();};let ok=false;try{await navigator.clipboard.writeText(JSON.stringify(rows));ok=true;}catch(e){}alert('EY: '+rows.length+' solicitacoes'+(ok?' copiadas! No app: menu > Importar da EY > Colar > Importar.':' prontas. Copia automatica falhou; rode window.__eyDownload() no console.'));}catch(e){alert('EY erro: '+e.message);}})();
   ============================================================================= */
