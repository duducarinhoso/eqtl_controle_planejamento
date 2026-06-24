// ==UserScript==
// @name         EY Canvas → Supabase (coleta de relatório)
// @namespace    eqtl-controle-planejamento
// @version      1.0
// @description  Baixa o relatório do EY por API (sem diálogo), lê View by tag + View by document e grava no Supabase (ey_sync + ey_sync_documents). Mostra o que mudou.
// @match        https://eycanvas.ey.com/*
// @match        https://eycanvasclientportal-us.ey.com/*
// @match        http://localhost:5500/*
// @require      https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      eycanvasapp-us.ey.com
// @connect      scsxisjvtfsqayujfgvd.supabase.co
// ==/UserScript==

/* COMO USAR
   1. Tenha o app (http://localhost:5500) aberto e LOGADO uma vez com este script ativo
      — ele captura o token de sessão do Supabase (para gravar como 'authenticated').
   2. No EY (eycanvas.ey.com OU a lista de solicitações), abra o menu do Tampermonkey
      e clique "📥 Coletar relatório EY → Supabase". Sem diálogo, sem passo manual.
   3. Repita quando quiser — da 2ª vez em diante, o resumo mostra o que MUDOU.

   Ajuste @match/@connect e SUPA/ANON se o app/projeto mudar de host. */

(function () {
  'use strict';

  const SUPA = 'https://scsxisjvtfsqayujfgvd.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjc3hpc2p2dGZzcWF5dWpmZ3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTUxODksImV4cCI6MjA5NzY3MTE4OX0.o0Gl0Y6NxhV4jPLTMv0sOPlfe88lPxGmUttBVWmSUFI';

  const host = location.host;
  const onApp = /^localhost(:\d+)?$/.test(host);                 // o app de Controle de Solicitações
  const onEY  = /\.ey\.com$/.test(host);

  // ───────────────── No app: captura o token de sessão do Supabase e compartilha (GM) ─────────────────
  if (onApp) {
    const grab = () => {
      for (const k of Object.keys(localStorage)) {
        if (/^sb-.*-auth-token$/.test(k)) {
          try {
            const v = JSON.parse(localStorage.getItem(k));
            const tok = v.access_token || (v.currentSession && v.currentSession.access_token);
            if (tok) { GM_setValue('sb_token', tok); GM_setValue('sb_token_at', Date.now()); }
          } catch (e) {}
        }
      }
    };
    grab();
    setInterval(grab, 30000);   // mantém o token fresco (o app o renova)
    return;
  }
  if (!onEY) return;

  // ───────────────── Helpers (lado EY) ─────────────────
  const eyToken = () => {
    for (const k of Object.keys(localStorage))
      if (k.includes('-accesstoken-') && k.includes('cea-prd-us-app')) {
        try { return JSON.parse(localStorage.getItem(k)).secret; } catch (e) {}
      }
    return null;
  };
  const eyUser = () => {
    for (const k of Object.keys(localStorage)) {
      try { const v = JSON.parse(localStorage.getItem(k)); if (v && v.username && v.authorityType) return v.username; } catch (e) {}
    }
    return 'userscript';
  };
  const engFromUrl = () => (location.href.match(/engagement[iI]d=(\d+)/) || [])[1];

  function supaRpc(fn, body) {
    return new Promise((resolve, reject) => {
      const sb = GM_getValue('sb_token', '');
      if (!sb) return reject(new Error('Token do app não encontrado. Abra http://localhost:5500 logado (com o script ativo) e tente de novo.'));
      GM_xmlhttpRequest({
        method: 'POST', url: `${SUPA}/rest/v1/rpc/${fn}`,
        headers: { apikey: ANON, Authorization: 'Bearer ' + sb, 'Content-Type': 'application/json' },
        data: JSON.stringify(body),
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) { try { resolve(JSON.parse(r.responseText)); } catch (e) { resolve(r.responseText); } }
          else reject(new Error('Supabase ' + r.status + ': ' + (r.responseText || '').slice(0, 200)));
        },
        onerror: () => reject(new Error('Falha de rede ao falar com o Supabase')),
      });
    });
  }

  // ───────────────── Parse do relatório (mesma regra de tools/ey_api.js) ─────────────────
  function parseReport(arrayBuffer) {
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const find = (re) => wb.SheetNames.find((n) => re.test(n));
    const grid = (name) => (name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false }) : []);
    const headerIdx = (rows) => rows.findIndex((r) => r && r.some((c) => c != null && /^(EngagementID|#)$/i.test(String(c).trim())));
    const colmap = (h) => { const m = {}; h.forEach((c, i) => { if (c != null) m[String(c).trim()] = i; }); return m; };
    const cell = (row, m, name) => { const i = m[name]; return i != null && i < row.length ? row[i] : null; };
    const area = (t) => { const x = /^\s*([0-9]+(?:\.[0-9]+)*)\s*-\s*(.+?)(?:\s*-\s*|$)/.exec(t || ''); return x ? { code: x[1], area: x[2].trim() } : { code: null, area: null }; };
    const iso = (v) => { if (v == null || v === '') return null; const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return s.slice(0, 10) + 'T' + s.slice(11, 19);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); return s; };

    const tg = grid(find(/tag/i)); const ti = headerIdx(tg); const tagRows = [];
    if (ti >= 0) { const m = colmap(tg[ti]); for (let r = ti + 1; r < tg.length; r++) { const row = tg[r];
      if (!row || row.every((c) => c == null)) continue; const num = cell(row, m, '#'); if (num == null || String(num).trim() === '') continue;
      const title = String(cell(row, m, 'Title') || '').trim(); const a = area(title);
      tagRows.push({ reference_number: String(num).trim(), group_name: String(cell(row, m, 'Group') || '').trim(),
        name: title, description: String(cell(row, m, 'Description') || '').trim(), priority: String(cell(row, m, 'Priority') || '').trim(),
        status: String(cell(row, m, 'Request Status') || '').trim(), tag_name: String(cell(row, m, 'Tag Name') || '').trim(),
        area_code: a.code, area_name: a.area, received_date: iso(cell(row, m, 'Received')), due_date: iso(cell(row, m, 'Due Date')),
        sent_date: iso(cell(row, m, 'Sent to EY')), ey_documents: String(cell(row, m, 'EY Documents') ?? '').trim(),
        client_documents: String(cell(row, m, 'Client Documents') ?? '').trim() }); } }

    const dg = grid(find(/document/i)); const di = headerIdx(dg); const docRows = [];
    if (di >= 0) { const m = colmap(dg[di]); for (let r = di + 1; r < dg.length; r++) { const row = dg[r];
      if (!row || row.every((c) => c == null)) continue; const name = String(cell(row, m, 'Document Name') || '').trim(); if (!name) continue;
      docRows.push({ reference_number: String(cell(row, m, '#') || '').trim(), group_name: String(cell(row, m, 'Group') || '').trim(),
        document_name: name, document_type: String(cell(row, m, 'Document Type') || '').trim(), file_extension: String(cell(row, m, 'File Extension') || '').trim(),
        uploaded_by: String(cell(row, m, 'Uploaded by') || '').trim(), upload_date: iso(cell(row, m, 'Upload date')) }); } }

    return { sheets: wb.SheetNames, tagRows, docRows };
  }

  // ───────────────── Ação de coleta ─────────────────
  async function coletar() {
    try {
      const eng = engFromUrl();
      if (!eng) return alert('Abra a LISTA DE SOLICITAÇÕES de um engagement (a URL precisa ter ?engagementid=...).');
      const tk = eyToken();
      if (!tk) return alert('Sessão EY expirada — recarregue o portal logado e tente de novo.');
      const who = eyUser();

      console.log('[EY→Supabase] baixando relatório do engagement ' + eng + '…');
      const rep = await fetch(`https://eycanvasapp-us.ey.com/api/v2/reports.json/${eng}?engagementid=${eng}`, { headers: { Authorization: 'Bearer ' + tk } });
      if (!rep.ok) return alert('Erro ao baixar o relatório: HTTP ' + rep.status);
      const buf = await rep.arrayBuffer();

      const { sheets, tagRows, docRows } = parseReport(buf);
      console.log('[EY→Supabase] abas:', sheets, '| solicitações:', tagRows.length, '| documentos:', docRows.length);
      if (!tagRows.length) return alert('O relatório não trouxe solicitações (abas: ' + sheets.join(', ') + ').');

      const a = await supaRpc('ey_sync', { p_engagement_id: Number(eng), p_rows: tagRows, p_run_by_label: who, p_source: 'userscript' });
      const b = await supaRpc('ey_sync_documents', { p_engagement_id: Number(eng), p_rows: docRows, p_run_by_label: who, p_source: 'userscript' });

      alert('✅ Coleta concluída (engagement ' + eng + ')\n\n' +
        'SOLICITAÇÕES — novas: ' + a.added + ' · alteradas: ' + a.updated + ' · iguais: ' + a.unchanged + ' · sumiram: ' + a.removed + ' · total: ' + a.total + '\n' +
        'DOCUMENTOS — inseridos: ' + b.inserted + ' · sem par: ' + b.unmatched + ' · total: ' + b.total);
      console.log('[EY→Supabase] solicitações:', a, '| documentos:', b);
    } catch (e) {
      console.error('[EY→Supabase]', e);
      alert('Falhou: ' + e.message);
    }
  }

  GM_registerMenuCommand('📥 Coletar relatório EY → Supabase', coletar);
})();
