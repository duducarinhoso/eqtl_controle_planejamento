import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { supabase, CONFIG } from "./supabase.js";

const DEFAULT_PASSWORD = "Inovacao#2026";

/* ===================== PERFIL ===================== */
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) {
    // fallback: garante perfil mesmo se o trigger nao rodou
    const md = user.user_metadata || {};
    await supabase.from("profiles").upsert({
      id: user.id,
      full_name: md.full_name || "",
      display_name: md.display_name || (md.full_name || user.email.split("@")[0]),
    });
    ({ data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle());
  }
  return { ...data, email: user.email };
}

export async function updateMyProfile(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from("profiles").update(patch).eq("id", user.id);
}

export async function getProfilesMap() {
  const { data } = await supabase.from("profiles").select("*");   // "*" inclui email se a coluna existir
  const m = new Map();
  (data || []).forEach((p) => m.set(p.id, p));
  return m;
}

export async function listProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("display_name", { ascending: true });
  if (error) return [];
  return data || [];
}

/* ===================== ADMIN: usuários ===================== */
export async function updateAnyProfile(id, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}
export async function listAllowedEmails() {
  const { data, error } = await supabase.from("allowed_emails").select("email").order("email");
  if (error) return [];
  return (data || []).map((r) => r.email);
}
export async function addAllowedEmail(email) {
  const { error } = await supabase.from("allowed_emails").upsert({ email: email.trim().toLowerCase() }, { onConflict: "email" });
  if (error) throw error;
}
export async function removeAllowedEmail(email) {
  await supabase.from("allowed_emails").delete().eq("email", email.trim().toLowerCase());
}

/* cria usuario com a senha padrao SEM derrubar a sessao do admin (cliente temporario) */
export async function createUser({ email, full_name, display_name, role }) {
  email = email.trim().toLowerCase();
  await addAllowedEmail(email);   // garante autorizacao antes do signup
  const tmp = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "eqtl-admin-tmp" },
  });
  const { error } = await tmp.auth.signUp({
    email, password: DEFAULT_PASSWORD,
    options: { data: { full_name: full_name || "", display_name: display_name || "", role: role || "operador" } },
  });
  try { await tmp.auth.signOut(); } catch (_) {}
  if (error) throw error;
  return DEFAULT_PASSWORD;
}

/* upload de foto de perfil -> bucket "avatars" -> grava avatar_url no perfil */
export async function uploadAvatar(targetId, file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${targetId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = data.publicUrl;
  await updateAnyProfile(targetId, { avatar_url: url });
  return url;
}

export const FIRST_PASSWORD = DEFAULT_PASSWORD;

/* ===================== PRESENCA (heartbeat por banco) ===================== */
export async function heartbeat(loc) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await supabase.from("online_status")
      .upsert({ user_id: user.id, loc: loc || {}, last_seen: new Date().toISOString() }, { onConflict: "user_id" });
  } catch (_) {}
}
export async function loadOnline(windowSec = 45) {
  const cutoff = new Date(Date.now() - windowSec * 1000).toISOString();
  const { data, error } = await supabase.from("online_status").select("user_id,loc,last_seen").gt("last_seen", cutoff);
  if (error) return [];
  return data || [];
}
export async function clearOnline() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) { try { await supabase.from("online_status").delete().eq("user_id", user.id); } catch (_) {} }
}

/* ===================== PROJETOS ===================== */
let _projectsAvailable = null;
export async function projectsAvailable() {
  if (_projectsAvailable !== null) return _projectsAvailable;
  const { error } = await supabase.from("projects").select("id").limit(1);
  _projectsAvailable = !error;       // false se a tabela ainda nao existe (pre-migracao)
  return _projectsAvailable;
}

export async function listProjects() {
  if (!(await projectsAvailable())) {
    return [{ id: "__all__", synthetic: true, name: "Controle de Solicitações",
      description: "Planejamento EQTL · Auditoria", created_at: null, updated_at: null }];
  }
  const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createProject({ name, description = "" }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("projects")
    .insert({ name, description, created_by: user?.id }).select().single();
  if (error) throw error;
  return data;
}
export async function updateProject(id, patch) {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteProject(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/* resumo de status -> Map(project_id -> Map(status -> qtd)) */
function normStatus(v) { const s = String(v || "").trim(); return s.toLowerCase() === "na" ? "N/A" : s; }
function addCount(map, label, n) { if (!label) return; map.set(label, (map.get(label) || 0) + n); }

export async function loadProjectsStatusSummary() {
  const out = new Map();
  if (await projectsAvailable()) {
    const { data, error } = await supabase.rpc("project_status_summary");
    if (!error && data) {
      for (const r of data) {
        if (!out.has(r.project_id)) out.set(r.project_id, new Map());
        addCount(out.get(r.project_id), normStatus(r.status), Number(r.qtd));
      }
      return out;
    }
  }
  const rows = await loadStatusAggregate();
  const m = new Map();
  for (const r of rows) addCount(m, normStatus(r.value), 1);
  out.set("__all__", m);
  return out;
}

function scoped(q, project) {
  return (project && !project.synthetic && project.id) ? q.eq("project_id", project.id) : q;
}

/* atividade por usuario (medidor de entregas): mudancas de status agregadas
   por usuario/status/dia. since = Date ou null (= tudo). Vem da RPC
   user_status_activity (sql/14_user_metrics.sql). */
export async function loadUserActivity(project, since = null) {
  const pid = (project && !project.synthetic && project.id) ? project.id : null;
  const p_since = since ? new Date(since).toISOString() : null;
  const { data, error } = await supabase.rpc("user_status_activity", { p_project: pid, p_since });
  if (error) throw error;
  return data || [];
}

/* ultima alteracao REAL por projeto (view project_activity) -> Map(project_id -> iso) */
export async function loadProjectsLastChange() {
  const m = new Map();
  try {
    const { data, error } = await supabase.from("project_activity").select("project_id,last_change");
    if (error) return m;
    (data || []).forEach((r) => m.set(r.project_id, r.last_change));
  } catch (_) {}
  return m;
}

/* ===================== ABAS ===================== */
export async function listSheets(project) {
  const { data, error } = await scoped(
    supabase.from("sheets").select("*").order("position", { ascending: true }), project);
  if (error) throw error;
  return data || [];
}

export async function getSheet(id) {
  const { data } = await supabase.from("sheets").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function createSheet({ name, kind = "matrix", position, project }) {
  const { data: { user } } = await supabase.auth.getUser();
  const row = { name, kind, position: position ?? 999, created_by: user?.id };
  if (project && !project.synthetic && project.id) row.project_id = project.id;
  const { data, error } = await supabase.from("sheets").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateSheet(id, patch) {
  const { error } = await supabase.from("sheets").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSheet(id) {
  const { error } = await supabase.from("sheets").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderSheets(orderedIds) {
  // grava a nova posicao de cada aba
  await Promise.all(orderedIds.map((id, i) => supabase.from("sheets").update({ position: i }).eq("id", id)));
}

/* mapa: nome-da-aba (trim) -> { areas:[], scot, clientPortal } montado a partir
   da aba indice "Solicitacoes". Alimenta o subtitulo das abas no sidebar e as
   infos do topbar. Degrada para Map vazio se nao houver indice. */
export async function loadSheetIndex(project, sheets = null) {
  try {
    const all = sheets || await listSheets(project);
    const idxSheets = all.filter((s) => s.kind === "index");
    const target = idxSheets.find((s) => /solicita/i.test(s.name)) || idxSheets[0];
    if (!target) return new Map();
    const cells = await loadCells(target.id);
    if (!cells.length) return new Map();
    const norm = (v) => String(v ?? "").trim().toLowerCase();
    const byRC = new Map();
    let maxRow = 0;
    for (const c of cells) { byRC.set(c.row + ":" + c.col, c.value); if (c.row > maxRow) maxRow = c.row; }
    // acha a linha de cabecalho (a que tem "Sheet" + "Área") e as colunas
    let headerRow = 0, areaCol = 0, scotCol = 0, cpCol = 0, sheetCol = 0;
    for (let r = 1; r <= Math.min(maxRow, 40); r++) {
      let a = 0, sc = 0, cp = 0, sh = 0;
      for (const c of cells) {
        if (c.row !== r) continue;
        const n = norm(c.value);
        if (n === "sheet") sh = c.col;
        else if (n === "área" || n === "area") a = c.col;
        else if (n === "scot") sc = c.col;
        else if (n.startsWith("client")) cp = c.col;
      }
      if (sh && a) { headerRow = r; areaCol = a; scotCol = sc; cpCol = cp; sheetCol = sh; break; }
    }
    if (!headerRow) return new Map();
    const map = new Map();
    for (let r = headerRow + 1; r <= maxRow; r++) {
      const key = String(byRC.get(r + ":" + sheetCol) ?? "").trim();
      if (!key) continue;
      const area = String(byRC.get(r + ":" + areaCol) ?? "").trim();
      const scot = scotCol ? String(byRC.get(r + ":" + scotCol) ?? "").trim() : "";
      const cp = cpCol ? String(byRC.get(r + ":" + cpCol) ?? "").trim() : "";
      if (!map.has(key)) map.set(key, { areas: [], scot: "", clientPortal: "" });
      const e = map.get(key);
      if (area && !e.areas.includes(area)) e.areas.push(area);
      if (!e.scot && scot) e.scot = scot;
      if (!e.clientPortal && cp) e.clientPortal = cp;
    }
    return map;
  } catch (_) { return new Map(); }
}

/* ===================== CELULAS ===================== */
export async function loadCells(sheetId) {
  // pagina para nao truncar abas grandes (limite default do PostgREST = 1000)
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from("cells").select("*")
      .eq("sheet_id", sheetId).order("row").order("col").range(from, from + page - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

/* grava/atualiza uma celula. Se ficar totalmente vazia, remove. */
export async function saveCell(sheetId, row, col, patch) {
  const body = { sheet_id: sheetId, row, col, ...patch };
  const { error } = await supabase.from("cells").upsert(body, { onConflict: "sheet_id,row,col" });
  if (error) throw error;
}

export async function deleteCell(sheetId, row, col) {
  await supabase.from("cells").delete().match({ sheet_id: sheetId, row, col });
}

/* busca textual em todas as celulas das abas informadas (Busca geral).
   sheetIds = ids das abas do projeto atual (escopo). Retorna ate `limit` matches. */
export async function searchCells(term, sheetIds = null, limit = 400) {
  const esc = String(term).replace(/[%_\\]/g, "\\$&");   // trata %, _ e \ como literais
  let q = supabase.from("cells").select("sheet_id,row,col,value").ilike("value", `%${esc}%`).limit(limit);
  if (sheetIds && sheetIds.length) q = q.in("sheet_id", sheetIds);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* busca EXATA (==) usada pelo "Converter texto em item da lista". Diferencia
   maiuscula/minuscula, acento e pontuacao. */
export async function searchCellsExact(value, sheetIds = null, limit = 5000) {
  let q = supabase.from("cells").select("sheet_id,row,col,value").eq("value", value).limit(limit);
  if (sheetIds && sheetIds.length) q = q.in("sheet_id", sheetIds);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* ===================== LISTA DE STATUS (configuravel) ===================== */
/* Itens do dropdown de status, compartilhados (tabela status_options).
   Lanca erro se a tabela ainda nao existir (rode sql/15_status_options.sql). */
export async function loadStatusOptions() {
  const { data, error } = await supabase.from("status_options").select("*").order("position", { ascending: true }).order("label", { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function upsertStatusOption(opt) {
  const { data, error } = await supabase.from("status_options").upsert(opt, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteStatusOption(id) {
  const { error } = await supabase.from("status_options").delete().eq("id", id);
  if (error) throw error;
}

/* ===================== LISTA DE EMPRESAS ===================== */
export async function loadCompanies() {
  const { data, error } = await supabase.from("companies").select("*").order("position", { ascending: true }).order("label", { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function upsertCompany(c) {
  const { data, error } = await supabase.from("companies").upsert(c, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}
export async function addCompanies(labels) {
  if (!labels || !labels.length) return;
  const rows = labels.map((label, i) => ({ label, position: i + 1 }));
  const { error } = await supabase.from("companies").upsert(rows, { onConflict: "label", ignoreDuplicates: true });
  if (error) throw error;
}
export async function deleteCompany(id) {
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw error;
}

/* ===================== LISTA DE AREAS ===================== */
export async function loadAreas() {
  const { data, error } = await supabase.from("areas").select("*").order("position", { ascending: true }).order("label", { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function upsertArea(a) {
  const { data, error } = await supabase.from("areas").upsert(a, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}
export async function addAreas(labels) {
  if (!labels || !labels.length) return;
  const rows = labels.map((label, i) => ({ label, position: i + 1 }));
  const { error } = await supabase.from("areas").upsert(rows, { onConflict: "label", ignoreDuplicates: true });
  if (error) throw error;
}
export async function deleteArea(id) {
  const { error } = await supabase.from("areas").delete().eq("id", id);
  if (error) throw error;
}

/* ===================== SOLICITACOES (tela-tabela) ===================== */
export async function loadSolicitacoes(project) {
  const q = scoped(supabase.from("solicitacoes").select("*").order("position", { ascending: true }), project);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function insertSolicitacao(row, project) {
  const body = { ...row };
  if (project && !project.synthetic && project.id) body.project_id = project.id;
  const { data, error } = await supabase.from("solicitacoes").insert(body).select().single();
  if (error) throw error;
  return data;
}
export async function insertSolicitacoes(rows, project) {
  const pid = (project && !project.synthetic && project.id) ? project.id : null;
  const body = rows.map((r) => (pid ? { ...r, project_id: pid } : { ...r }));
  const { error } = await supabase.from("solicitacoes").insert(body);
  if (error) throw error;
}
export async function updateSolicitacao(id, patch) {
  const { error } = await supabase.from("solicitacoes").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteSolicitacao(id) {
  const { error } = await supabase.from("solicitacoes").delete().eq("id", id);
  if (error) throw error;
}

/* le as LINHAS COMPLETAS da aba indice "Solicitacoes" (todas as colunas que
   interessam) para semear a tabela solicitacoes. Retorna [] se nao houver indice. */
export async function readIndexRows(project, sheets = null) {
  try {
    const all = sheets || await listSheets(project);
    const idxSheets = all.filter((s) => s.kind === "index");
    const target = idxSheets.find((s) => /solicita/i.test(s.name)) || idxSheets[0];
    if (!target) return [];
    const cells = await loadCells(target.id);
    if (!cells.length) return [];
    const norm = (v) => String(v ?? "").trim();
    const low = (v) => norm(v).toLowerCase();
    const byRC = new Map(); let maxRow = 0;
    for (const c of cells) { byRC.set(c.row + ":" + c.col, c.value); if (c.row > maxRow) maxRow = c.row; }
    // acha header e mapeia colunas por rotulo
    let headerRow = 0; const col = {};
    for (let r = 1; r <= Math.min(maxRow, 40); r++) {
      const found = {};
      for (const c of cells) {
        if (c.row !== r) continue;
        const n = low(c.value);
        if (n === "área" || n === "area") found.area = c.col;
        else if (n === "scot") found.scot = c.col;
        else if (n.startsWith("client")) found.cp = c.col;
        else if (n.startsWith("data")) found.data = c.col;
        else if (n === "deadline") found.deadline = c.col;
        else if (n === "sheet") found.sheet = c.col;
        else if (n === "área eqtl" || n === "area eqtl") found.areaEqtl = c.col;
        else if (n.startsWith("respons")) found.resp = c.col;
      }
      if (found.area && found.sheet) { headerRow = r; Object.assign(col, found); break; }
    }
    if (!headerRow) return [];
    const get = (r, c) => (c ? norm(byRC.get(r + ":" + c)) : "");
    const rows = [];
    for (let r = headerRow + 1; r <= maxRow; r++) {
      const area = get(r, col.area);
      const scot = get(r, col.scot);
      const cp = get(r, col.cp);
      if (!area && !scot && !cp) continue;   // linha vazia
      rows.push({
        area, scot, client_portal: cp,
        data_solicitacao: get(r, col.data), deadline: get(r, col.deadline),
        sheet: get(r, col.sheet), area_eqtl: get(r, col.areaEqtl), responsavel: get(r, col.resp),
      });
    }
    return rows;
  } catch (_) { return []; }
}

/* operacoes de linha/coluna (RPC atomica) */
export const insertRow = (sheetId, at) => supabase.rpc("insert_row", { p_sheet: sheetId, p_at: at });
export const deleteRow = (sheetId, at) => supabase.rpc("delete_row", { p_sheet: sheetId, p_at: at });
export const insertCol = (sheetId, at) => supabase.rpc("insert_col", { p_sheet: sheetId, p_at: at });
export const deleteCol = (sheetId, at) => supabase.rpc("delete_col", { p_sheet: sheetId, p_at: at });

/* ultima alteracao de cada aba (view sheet_activity). Degrada p/ vazio se a view nao existir. */
export async function loadSheetActivity(project) {
  const m = new Map();
  try {
    let q = supabase.from("sheet_activity").select("sheet_id,last_change");
    q = scoped(q, project);
    const { data, error } = await q;
    if (error) return m;
    (data || []).forEach((r) => m.set(r.sheet_id, r.last_change));
  } catch (_) {}
  return m;
}

/* celulas de status (sheet_id,value) para o Dashboard, escopadas ao projeto */
export async function loadStatusAggregate(project) {
  const out = [];
  const page = 1000;
  const useView = project && !project.synthetic && project.id && (await projectsAvailable());
  for (let from = 0; ; from += page) {
    let q;
    if (useView) q = supabase.from("status_cells").select("sheet_id,value").eq("project_id", project.id).range(from, from + page - 1);
    else q = supabase.from("cells").select("sheet_id,value").eq("data_type", "status").not("value", "is", null).range(from, from + page - 1);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

/* ===================== HISTORICO ===================== */
export async function loadSheetHistory(sheetId, limit = 100) {
  const { data, error } = await supabase.from("cell_history")
    .select("*").eq("sheet_id", sheetId)
    .order("changed_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function loadCellHistory(sheetId, row, col, limit = 40) {
  const { data, error } = await supabase.from("cell_history")
    .select("*").match({ sheet_id: sheetId, row, col })
    .order("changed_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

/* ===================== COMENTARIOS ===================== */
export async function loadComments(sheetId) {
  const { data } = await supabase.from("comments").select("*").eq("sheet_id", sheetId);
  return data || [];
}
export async function addComment(sheetId, row, col, body) {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from("comments").insert({ sheet_id: sheetId, row, col, body, author_id: user?.id });
}

/* ===================== IMPORTACAO DO SEED ===================== */
/* Importa o seed_data.json gerado pelo migrador. Idempotente: faz UPSERT
   por (aba pelo nome) e por (sheet,row,col). onProgress(msg). */
export async function importSeed(seed, project, onProgress = () => {}) {
  if (typeof project === "function") { onProgress = project; project = null; }   // retrocompat
  const existing = await listSheets(project);
  const byName = new Map(existing.map((s) => [s.name, s]));
  const { data: { user } } = await supabase.auth.getUser();
  const pid = (project && !project.synthetic && project.id) ? project.id : null;

  // a carga inicial NAO deve gerar historico: usa a RPC import_cells se existir
  let useRpc = true;
  try { const { error } = await supabase.rpc("import_cells", { p_rows: [] }); if (error) useRpc = false; }
  catch (_) { useRpc = false; }

  for (const sh of seed.sheets) {
    onProgress(`Aba "${sh.name}"…`);
    let sheet = byName.get(sh.name);
    const meta = {
      name: sh.name, position: sh.position, hidden: !!sh.hidden, kind: sh.kind || "matrix",
      row_count: sh.row_count, col_count: sh.col_count,
      col_widths: sh.col_widths || {}, row_heights: sh.row_heights || {},
      frozen_rows: sh.frozen_rows || 0, frozen_cols: sh.frozen_cols || 0,
    };
    if (pid) meta.project_id = pid;
    if (!sheet) {
      const { data, error } = await supabase.from("sheets").insert({ ...meta, created_by: user?.id }).select().single();
      if (error) throw error;
      sheet = data; byName.set(sh.name, sheet);
    } else {
      await supabase.from("sheets").update(meta).eq("id", sheet.id);
    }

    // celulas em lotes
    const rows = sh.cells.map((c) => ({
      sheet_id: sheet.id, row: c.row, col: c.col,
      value: c.value, data_type: c.data_type || "text",
      format: c.format || {}, merge: c.merge || null, covered_by: c.covered_by || null,
    }));
    const B = 500;
    for (let i = 0; i < rows.length; i += B) {
      const batch = rows.slice(i, i + B);
      let error;
      if (useRpc) ({ error } = await supabase.rpc("import_cells", { p_rows: batch }));
      else ({ error } = await supabase.from("cells").upsert(batch, { onConflict: "sheet_id,row,col" }));
      if (error) throw error;
      onProgress(`Aba "${sh.name}": ${Math.min(i + B, rows.length)}/${rows.length} células`);
    }

    // comentarios (evita duplicar: so insere se a aba ainda nao tem)
    if (sh.comments?.length) {
      const { count } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("sheet_id", sheet.id);
      if (!count) {
        const cm = sh.comments.map((c) => ({ sheet_id: sheet.id, row: c.row, col: c.col, author_name: c.author, body: c.body }));
        for (let i = 0; i < cm.length; i += B) {
          await supabase.from("comments").insert(cm.slice(i, i + B));
        }
      }
    }
  }
  onProgress("Concluído.");
}

/* ===================== CARGA INICIAL A PARTIR DO EXCEL ===================== */
/* Recebe a saida de excel.parseXlsxFull (abas com larguras/alturas/mescla/
   formatacao) e CRIA as abas + celulas direto, SEM gerar historico (usa a RPC
   import_cells, igual a carga do seed). Use para a carga inicial de um projeto
   novo a partir do .xlsx — sem precisar do migrador Python/JSON.
   `sheets` = subconjunto de parseXlsxFull (so as abas escolhidas). */
const _STATUS_VOCAB = new Set(["pendente", "recebido", "n/a", "na", "em análise",
  "em analise", "parcial", "recebido parcial"]);
const _isStatus = (v) => _STATUS_VOCAB.has(String(v ?? "").trim().toLowerCase());
const _isNumber = (v) => v != null && v !== "" && /^-?\d/.test(String(v).trim()) && !isNaN(Number(v));

export async function importWorkbook(sheets, project, onProgress = () => {}) {
  const existing = await listSheets(project);
  const byName = new Map(existing.map((s) => [s.name, s]));
  const { data: { user } } = await supabase.auth.getUser();
  const pid = (project && !project.synthetic && project.id) ? project.id : null;

  // carga inicial NAO gera historico: usa a RPC import_cells se existir
  let useRpc = true;
  try { const { error } = await supabase.rpc("import_cells", { p_rows: [] }); if (error) useRpc = false; }
  catch (_) { useRpc = false; }

  let created = 0, totalCells = 0;
  for (const sh of sheets) {
    if (!sh.cells.size && !Object.keys(sh.merges || {}).length) continue;   // aba vazia: ignora
    onProgress(`Aba "${sh.name}"…`);
    let sheet = byName.get(sh.name);
    const meta = {
      name: sh.name, position: sh.position, hidden: !!sh.hidden, kind: sh.kind || "matrix",
      row_count: sh.row_count, col_count: sh.col_count,
      col_widths: sh.col_widths || {}, row_heights: sh.row_heights || {},
      frozen_rows: 0, frozen_cols: 0,
    };
    if (pid) meta.project_id = pid;
    if (!sheet) {
      const { data, error } = await supabase.from("sheets").insert({ ...meta, created_by: user?.id }).select().single();
      if (error) throw error;
      sheet = data; byName.set(sh.name, sheet); created++;
    } else {
      await supabase.from("sheets").update(meta).eq("id", sheet.id);
    }

    // monta linhas de celula: valor + tipo + formato + mescla/cobertura
    const rowsMap = new Map();
    for (const [k, o] of sh.cells) {
      const [r, c] = k.split(":").map(Number);
      const dtype = _isStatus(o.value) ? "status" : (_isNumber(o.value) ? "number" : "text");
      rowsMap.set(k, { sheet_id: sheet.id, row: r, col: c, value: o.value ?? "", data_type: dtype, format: o.format || {}, merge: null, covered_by: null });
    }
    for (const [k, span] of Object.entries(sh.merges || {})) {
      const [r, c] = k.split(":").map(Number);
      const e = rowsMap.get(k) || { sheet_id: sheet.id, row: r, col: c, value: "", data_type: "text", format: {}, covered_by: null };
      e.merge = span; rowsMap.set(k, e);
    }
    for (const [k, anchor] of Object.entries(sh.covered || {})) {
      const [r, c] = k.split(":").map(Number);
      const e = rowsMap.get(k) || { sheet_id: sheet.id, row: r, col: c, value: "", data_type: "text", format: {}, merge: null };
      e.covered_by = anchor; rowsMap.set(k, e);
    }

    const rows = [...rowsMap.values()];
    const B = 500;
    for (let i = 0; i < rows.length; i += B) {
      const batch = rows.slice(i, i + B);
      let error;
      if (useRpc) ({ error } = await supabase.rpc("import_cells", { p_rows: batch }));
      else ({ error } = await supabase.from("cells").upsert(batch, { onConflict: "sheet_id,row,col" }));
      if (error) throw error;
      onProgress(`Aba "${sh.name}": ${Math.min(i + B, rows.length)}/${rows.length} células`);
    }
    totalCells += rows.length;

    // notas/comentarios (so se a aba ainda nao tiver)
    if (sh.comments?.length) {
      const { count } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("sheet_id", sheet.id);
      if (!count) {
        const cm = sh.comments.map((c) => ({ sheet_id: sheet.id, row: c.row, col: c.col, author_name: c.author || null, body: c.body }));
        for (let i = 0; i < cm.length; i += B) await supabase.from("comments").insert(cm.slice(i, i + B));
      }
    }
  }
  onProgress("Concluído.");
  return { created, totalCells };
}
