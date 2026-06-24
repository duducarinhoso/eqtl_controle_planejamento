/* =============================================================================
   ey_api.js — ROTAS + FUNÇÕES CANÔNICAS do EY Canvas (reutilizável)
   -----------------------------------------------------------------------------
   Tudo que mapeamos da integração EY, num só lugar e pronto para reuso:
   token MSAL, lista de engagements, extração paginada das solicitações,
   mapeamento p/ a tabela ey_requests e detecção de estado da tela.

   ONDE RODA: no contexto do navegador LOGADO no EY (origin *.ey.com) — porque a
   API exige o token Azure AD que só existe lá. Use a partir de:
     • um userscript (Tampermonkey) — ver tools/ey_IMPLEMENTACAO.md §6
     • o console / bookmarklet — ver tools/ey_export_snippet.js
   NÃO funciona a partir do app (origin Supabase): CSP + cross-origin bloqueiam.

   Import (ESM):  import { EY } from "./ey_api.js";
   Em userscript/console: cole o objeto EY (sem o "export").
   ============================================================================= */

export const EY = {
  HOST_GLOBAL_API: "https://eycanvasapp.ey.com/api/v2",  // lista de engagements (host GLOBAL)
  HOST_LOGIN: "login.microsoftonline.com",               // estado: login (senha)
  HOST_MFA:   "authenticator.pingone.eu",                // estado: MFA PingID

  /* Token MSAL no localStorage do portal.
     kind='us'     -> cea-prd-us-app (API de dados/solicitações)
     kind='global' -> cea-prd-app    (lista de engagements) */
  getToken(kind = "us") {
    const want = kind === "global" ? "cea-prd-app/" : "cea-prd-us-app";
    for (const k of Object.keys(localStorage)) {
      if (!k.includes("-accesstoken-")) continue;
      try {
        const t = JSON.parse(localStorage.getItem(k));
        if (t.target && t.target.includes(want) &&
            (kind !== "global" || !t.target.includes("cea-prd-us-app")))
          return { secret: t.secret, expiresOn: Number(t.expiresOn) };
      } catch (e) {}
    }
    return null;
  },

  /* Deriva a API regional a partir do `Domain` do engagement.
     'https://eycanvasclientportal-us.ey.com/' -> 'https://eycanvasapp-us.ey.com/api/v2' */
  regionalApi(domain) {
    const m = /eycanvasclientportal(-[a-z]+)?\.ey\.com/.exec(domain || "");
    const suf = m && m[1] ? m[1] : "-us";   // default -us (nosso caso)
    return `https://eycanvasapp${suf}.ey.com/api/v2`;
  },

  /* Lista TODOS os engagements a que o usuário tem acesso. */
  async listEngagements() {
    const tok = this.getToken("global");
    if (!tok) throw new Error("Sem token global (cea-prd-app). Faça login no EY.");
    const r = await fetch(`${this.HOST_GLOBAL_API}/engagements.json`, { headers: { Authorization: "Bearer " + tok.secret } });
    if (!r.ok) throw new Error("engagements.json HTTP " + r.status);
    const arr = await r.json();
    return arr.map((e) => ({
      engagement_id: e.EngagementId,
      name: e.EngagementName,
      domain: e.Domain,
      status_id: e.EngagementStatusId,
      deactivated: e.IsEngagementDeactivatedRead,
      groups: (e.Groups || []).map((g) => g.GroupName),
      raw: e,
    }));
  },

  /* Solicitações de 1 engagement, paginadas. Devolve linhas no formato ey_requests.
     onProgress(carregadas, total) é chamado a cada página.
     OBS: quickfilter=3 traz o balde "Excepcional/recebidas" (174 no FY27). Para TODAS
     as 253, ver pendência em ey_IMPLEMENTACAO.md §8 (ajustar quickfilter/filtertype). */
  async fetchRequests(engagementId, { domain = null, quickfilter = 3, onProgress = () => {} } = {}) {
    const tok = this.getToken("us");
    if (!tok) throw new Error("Sem token de dados (cea-prd-us-app). Faça login no EY.");
    const apiBase = domain ? this.regionalApi(domain) : "https://eycanvasapp-us.ey.com/api/v2";
    const url = (page) => `${apiBase}/ClientRequests.json` +
      `?groupid=1&filtertype=2&quickfilter=${quickfilter}&priorityTypeId=all&searchtext=null` +
      `&subquickfilter=false&skip=${page}&timephase=0&customfilter=null&take=100` +
      `&orderby=DueDate&sortby=ASC&searchColumns=3,0&engagementid=${engagementId}&datasource=primary`;
    const all = []; let page = 1, total = Infinity;
    while (all.length < total) {
      const r = await fetch(url(page), { headers: { Authorization: "Bearer " + tok.secret } });
      if (r.status === 401) throw new Error("401 — recarregue o portal (token renova sozinho) e tente de novo.");
      if (!r.ok) throw new Error("ClientRequests HTTP " + r.status);
      const j = await r.json();
      total = j.totalCount;
      all.push(...(j.clientRequestList || []));
      onProgress(all.length, total);
      if (!(j.clientRequestList || []).length) break;
      page++; if (page > 50) break;   // trava de segurança
    }
    return all.map((x) => this.mapRequest(x, engagementId));
  },

  /* Mapeia 1 solicitação da API -> 1 linha de public.ey_requests. */
  mapRequest(x, engagementId) {
    const m = /^\s*([0-9]+(?:\.[0-9]+)*)\s*-\s*(.+?)(?:\s*-\s*|$)/.exec(x.clientRequestName || "");
    return {
      client_request_id: x.clientRequestId ?? x.id,   // PK
      engagement_id: Number(engagementId),             // injetado (API devolve null)
      reference_number: x.referenceNumber ?? null,
      group_id: x.clientGroupId ?? null,
      group_name: x.clientGroupName ?? null,           // a "aba" (entidade)
      name: x.clientRequestName ?? null,
      description: x.clientRequestDescription ?? null,
      area_code: m ? m[1] : null,
      area_name: m ? m[2].trim() : null,
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
      raw: x,
    };
  },

  /* ---- DETECÇÃO DE ESTADO (rastreador de progresso) ----
     sig = { host, path, hasUsToken }  -> chave do estado. */
  detectState(sig) {
    const h = (sig.host || "").toLowerCase();
    if (/login\.microsoftonline\.com|login\.live\.com/.test(h)) return "login"; // 🔴 senha
    if (/authenticator\.pingone\.eu/.test(h))                   return "mfa";   // 🔴 MFA PingID
    if (/eycanvas\.ey\.com|eycanvasclientportal/.test(h) && sig.hasUsToken) return "ready"; // ✅ logado
    if (/\.ey\.com$/.test(h) && sig.hasUsToken)                 return "ready"; // resiliente (clicou algo logado)
    return "opening"; // sem sessão / tela desconhecida -> recomeça o caminho
  },

  /* Assinatura da aba atual (use dentro da aba do EY). */
  currentSignature() {
    return { host: location.host, path: location.pathname, hasUsToken: !!this.getToken("us") };
  },

  /* ---- RELATÓRIO (.xlsx) COMO FONTE — fetch em memória, SEM diálogo ----
     reports.json/{id} devolve o .xlsx (View by tag + View by document). Buscado
     por fetch, fica na memória (o "Salvar como" só aparece quando o navegador baixa). */
  async fetchReportBlob(engagementId, { domain = null } = {}) {
    const tok = this.getToken("us");
    if (!tok) throw new Error("Sem token de dados (cea-prd-us-app). Faça login no EY.");
    const base = domain ? this.regionalApi(domain) : "https://eycanvasapp-us.ey.com/api/v2";
    const r = await fetch(`${base}/reports.json/${engagementId}?engagementid=${engagementId}`,
                          { headers: { Authorization: "Bearer " + tok.secret } });
    if (!r.ok) throw new Error("reports.json HTTP " + r.status);
    return await r.arrayBuffer();   // .xlsx em memória, sem diálogo
  },

  /* Parseia o relatório. Recebe o ArrayBuffer + a instância XLSX (SheetJS) — o
     app passa o seu (o esm.sh é bloqueado no domínio do EY). Mapeia por NOME de
     coluna (robusto a deslocamentos), espelhando reader.py do projeto antigo.
     Retorna { sheets, tagRows, docRows } prontos para ey_sync / ey_sync_documents. */
  parseReport(arrayBuffer, XLSX) {
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const find = (re) => wb.SheetNames.find((n) => re.test(n));
    const grid = (name) => (name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false }) : []);
    const headerIdx = (rows) => rows.findIndex((r) => r && r.some((c) => c != null && /^(EngagementID|#)$/i.test(String(c).trim())));
    const colmap = (h) => { const m = {}; h.forEach((c, i) => { if (c != null) m[String(c).trim()] = i; }); return m; };
    const cell = (row, m, name) => { const i = m[name]; return i != null && i < row.length ? row[i] : null; };
    const area = (t) => { const x = /^\s*([0-9]+(?:\.[0-9]+)*)\s*-\s*(.+?)(?:\s*-\s*|$)/.exec(t || ""); return x ? { code: x[1], area: x[2].trim() } : { code: null, area: null }; };
    const iso = (v) => { if (v == null || v === "") return null; const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return s.slice(0, 10) + "T" + s.slice(11, 19);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); return s; };

    // View by tag -> solicitações
    const tg = grid(find(/tag/i)); const ti = headerIdx(tg); const tagRows = [];
    if (ti >= 0) { const m = colmap(tg[ti]); for (let r = ti + 1; r < tg.length; r++) { const row = tg[r];
      if (!row || row.every((c) => c == null)) continue; const num = cell(row, m, "#"); if (num == null || String(num).trim() === "") continue;
      const title = String(cell(row, m, "Title") || "").trim(); const a = area(title);
      tagRows.push({ reference_number: String(num).trim(), group_name: String(cell(row, m, "Group") || "").trim(),
        name: title, description: String(cell(row, m, "Description") || "").trim(), priority: String(cell(row, m, "Priority") || "").trim(),
        status: String(cell(row, m, "Request Status") || "").trim(), tag_name: String(cell(row, m, "Tag Name") || "").trim(),
        area_code: a.code, area_name: a.area, received_date: iso(cell(row, m, "Received")), due_date: iso(cell(row, m, "Due Date")),
        sent_date: iso(cell(row, m, "Sent to EY")), ey_documents: String(cell(row, m, "EY Documents") ?? "").trim(),
        client_documents: String(cell(row, m, "Client Documents") ?? "").trim() }); } }

    // View by document -> documentos
    const dg = grid(find(/document/i)); const di = headerIdx(dg); const docRows = [];
    if (di >= 0) { const m = colmap(dg[di]); for (let r = di + 1; r < dg.length; r++) { const row = dg[r];
      if (!row || row.every((c) => c == null)) continue; const name = String(cell(row, m, "Document Name") || "").trim(); if (!name) continue;
      docRows.push({ reference_number: String(cell(row, m, "#") || "").trim(), group_name: String(cell(row, m, "Group") || "").trim(),
        document_name: name, document_type: String(cell(row, m, "Document Type") || "").trim(), file_extension: String(cell(row, m, "File Extension") || "").trim(),
        uploaded_by: String(cell(row, m, "Uploaded by") || "").trim(), upload_date: iso(cell(row, m, "Upload date")) }); } }

    return { sheets: wb.SheetNames, tagRows, docRows };
  },
};

// uso fora de ESM (userscript/console): descomente
// if (typeof window !== "undefined") window.EY = EY;
