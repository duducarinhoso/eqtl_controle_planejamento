import { supabase, CONFIG, isConfigured } from "./supabase.js";
import { renderAuth } from "./auth.js";
import * as store from "./store.js";
import { Grid } from "./grid.js";
import * as rt from "./realtime.js";
import * as excel from "./excel.js";
import { parseAbas } from "./parser.js";
import { openSolic, refreshSolic } from "./solic.js";
import { h, $, clear, toast, initials, colorFromString, escapeHtml, fmtDate, colName, debounce, getStatusOptions, setStatusOptions, statusClassFor, getCompanies, setCompanies } from "./util.js";

const BG_COLORS = ["", "#fff3cd", "#d4edbc", "#cfe2ff", "#f8d7da", "#e2d9f3", "#ffe5d0", "#d9dae0", "#0d1f33"];
const TX_COLORS = ["#191c20", "#004786", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#ffffff", "#727782"];

const App = {
  profile: null,
  profilesMap: new Map(),
  sheets: [],
  sheet: null,
  grid: null,
  project: null,         // projeto aberto (ou null = na tela inicial)
  activity: new Map(),   // sheet_id -> iso da ultima alteracao
  view: "grid",          // "grid" | "dashboard"
  exportMode: false,
  exportSel: null,       // Set de sheet_id selecionados p/ exportar
  zoom: Math.max(50, Math.min(200, parseInt(localStorage.getItem("eqtl_zoom") || "100", 10) || 100)),
  reloadDebounced: null,
};

/* ============================ BOOT ============================ */
async function boot() {
  if (!isConfigured) { $("#boot").hidden = true; return showConfigNotice(); }

  // fluxo de redefinicao de senha (link do e-mail)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { showAuth("reset"); return; }
    if (event === "SIGNED_IN" && !App.profile) applyRoute();
    if (event === "SIGNED_OUT") {
      clearInterval(App._beatIv); clearInterval(App._pollIv); App._presenceStarted = false;
      rt.unsubscribeOnline(); store.clearOnline().catch(() => {});
      App.project = null; App.profile = null; showAuth("login");
    }
  });

  // navegacao por hash (Voltar/Avancar do navegador + F5 restauram a tela)
  window.addEventListener("hashchange", () => {
    const hh = location.hash || "";
    if (hh.includes("access_token") || hh.includes("type=recovery")) return;
    applyRoute();
  });

  let session = null;
  try { ({ data: { session } } = await supabase.auth.getSession()); }
  catch (e) { console.error(e); }
  $("#boot").hidden = true;
  if (location.hash.includes("type=recovery")) return showAuth("reset");
  if (session) applyRoute(); else showAuth("login");
}

function showConfigNotice() {
  const a = $("#auth-root"); a.hidden = false;
  clear(a);
  a.appendChild(h("div", { class: "center-screen" },
    h("div", { class: "modal", style: { width: "520px" } },
      h("h3", {}, "Configuração necessária"),
      h("p", { class: "muted" }, "Edite o arquivo "), h("code", {}, "app/config.js"),
      h("p", { class: "muted" }, " com a URL e a anon key do seu projeto Supabase (Painel > Project Settings > API). Depois recarregue esta página."))));
}

function showAuth(mode) {
  App.sheet = null;
  const a = $("#auth-root"), ap = $("#app-root");
  ap.hidden = true; a.hidden = false;
  renderAuth(a, mode);
}

async function ensureProfile() {
  if (App.profile) return true;
  try { App.profile = await store.getMyProfile(); }
  catch (e) { toast("Erro ao carregar perfil: " + e.message, "err"); return false; }
  if (!App.profile) { showAuth("login"); return false; }
  App.profilesMap = await store.getProfilesMap();
  await reloadStatusOptions();
  await reloadCompanies();
  await reloadAreas();
  if (!App._presenceStarted) { App._presenceStarted = true; startPresence(); }
  return true;
}

/* ---- presenca via heartbeat (quem esta online + onde) ---- */
async function heartbeatNow() { await store.heartbeat(App._loc || { view: "app" }); }
async function refreshOnline() {
  let rows = [];
  try { rows = await store.loadOnline(); } catch (_) {}
  App._appPeers = rows.map((r) => {
    const p = App.profilesMap.get(r.user_id) || {};
    return { id: r.user_id, name: p.display_name || p.full_name || "Usuário", full_name: p.full_name, email: p.email, color: p.color, loc: r.loc || {} };
  });
  renderAppPresence();
  updateCellPresence();
}
/* marcador discreto no grid: onde cada pessoa online está na aba atual */
function updateCellPresence() {
  if (!App.grid) return;
  if (App.view !== "grid" || !App.sheet) { App.grid.setCellPresence([]); return; }
  const sid = String(App.sheet.id);
  const list = (App._appPeers || [])
    .filter((p) => p.id !== App.profile.id && p.loc && String(p.loc.sheetId) === sid && p.loc.cell)
    .map((p) => ({ cell: p.loc.cell, name: p.name, color: p.color || colorFromString(p.id || p.name), initials: initials(p.name) }));
  App.grid.setCellPresence(list);
}
function startPresence() {
  heartbeatNow().then(refreshOnline);
  App._beatIv = setInterval(heartbeatNow, 20000);
  App._pollIv = setInterval(refreshOnline, 15000);
  rt.subscribeOnline(() => refreshOnline());   // atualização instantânea (usa o Realtime, que funciona)
}
function setLoc(loc) { App._loc = loc; heartbeatNow().then(refreshOnline); }
/* ao mudar de célula, avisa os outros logo (sem esperar o heartbeat de 20s) */
const scheduleCellBeat = debounce(() => { heartbeatNow(); }, 1200);

function userChipEl() {
  return h("div", { class: "user-chip", onClick: openUserMenu },
    avatarEl(App.profile, 30),
    h("div", { class: "who" }, App.profile.display_name || App.profile.full_name,
      h("small", {}, App.profile.email || "")));
}

function isAdmin() { return !!(App.profile && App.profile.role === "adm"); }

/* carrega a lista de status do banco (status_options). Degrada para a lista
   padrao embutida se a tabela ainda nao existir (sql/15_status_options.sql). */
async function reloadStatusOptions() {
  try { const opts = await store.loadStatusOptions(); if (opts.length) setStatusOptions(opts); }
  catch (_) { /* tabela ainda nao criada: mantem o padrao */ }
}
/* carrega a lista de empresas (companies). Degrada para vazio se a tabela
   ainda nao existir (sql/16_companies.sql). */
async function reloadCompanies() {
  try { const c = await store.loadCompanies(); setCompanies(c); App.companies = c; }
  catch (_) { App.companies = []; setCompanies([]); }
}
async function reloadAreas() {
  try { App.areas = await store.loadAreas(); }
  catch (_) { App.areas = []; }
}

/* avatar: foto se houver, senão iniciais */
function avatarEl(u, size = 30) {
  const name = u.display_name || u.full_name || u.name || "?";
  const el = h("div", { class: "av", style: {
    width: size + "px", height: size + "px", borderRadius: "50%", overflow: "hidden",
    background: u.color || colorFromString(u.id || name), display: "grid", placeItems: "center",
    color: "#fff", fontWeight: "800", fontFamily: "var(--font-ui)", fontSize: Math.round(size * 0.42) + "px", flex: "0 0 auto",
  } });
  if (u.avatar_url) el.appendChild(h("img", { src: u.avatar_url, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" } }));
  else el.textContent = initials(name);
  return el;
}

/* tela de 1º acesso: trocar a senha padrão */
function forceChangePassword() {
  $("#app-root").hidden = true;
  const a = $("#auth-root"); a.hidden = false; clear(a);
  const pass = h("input", { class: "input", type: "password", placeholder: "Nova senha (mín. 6)", autocomplete: "new-password" });
  const pass2 = h("input", { class: "input", type: "password", placeholder: "Confirme a nova senha", autocomplete: "new-password" });
  const msg = h("div");
  const btn = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%", height: "42px", justifyContent: "center" } }, "Definir senha e entrar");
  const form = h("form", {},
    h("div", { class: "field" }, h("label", {}, "Nova senha"), pass),
    h("div", { class: "field" }, h("label", {}, "Confirmar senha"), pass2), msg, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pass.value.length < 6) { msg.innerHTML = '<div class="auth-msg err">A senha precisa de ao menos 6 caracteres.</div>'; return; }
    if (pass.value !== pass2.value) { msg.innerHTML = '<div class="auth-msg err">As senhas não conferem.</div>'; return; }
    btn.disabled = true; btn.textContent = "Aguarde…";
    const { error } = await supabase.auth.updateUser({ password: pass.value });
    if (error) { btn.disabled = false; btn.textContent = "Definir senha e entrar"; msg.innerHTML = '<div class="auth-msg err">' + error.message + "</div>"; return; }
    try { await store.updateMyProfile({ must_change_password: false }); } catch (_) {}
    App.profile.must_change_password = false;
    a.hidden = true; applyRoute();
  });
  a.appendChild(h("div", { class: "auth-wrap" },
    h("div", { class: "auth-aside" },
      h("div", { class: "brand-badge" }, h("span", { class: "dot" }), h("span", { style: { color: "#fff", fontWeight: 800 } }, "GRUPO EQUATORIAL")),
      h("div", {}, h("h1", {}, "Bem-vindo(a)!"), h("p", {}, "Primeiro acesso — defina uma senha pessoal para continuar."))),
    h("div", { class: "auth-panel" }, h("div", { class: "auth-card" },
      h("h2", {}, "Definir nova senha"), h("p", { class: "sub" }, "Você está usando a senha padrão. Crie uma nova para acessar a aplicação."), form))));
  setTimeout(() => pass.focus(), 30);
}

/* ============================ PAINEL ADMIN (usuários) ============================ */
async function openAdminPanel() {
  if (!isAdmin()) return;
  let profiles = [];
  try { profiles = await store.listProfiles(); } catch (_) {}
  const body = h("div", { class: "db" });
  body.appendChild(h("button", { class: "btn btn-primary btn-sm", style: { marginBottom: "12px", width: "100%" }, onClick: addUserForm }, "＋ Adicionar usuário"));
  if (!profiles.length) body.appendChild(h("p", { class: "muted" }, "Nenhum usuário."));
  profiles.forEach((u) => body.appendChild(adminUserRow(u)));
  openDrawer("Administração de usuários", body);
}
function adminUserRow(u) {
  const av = avatarEl(u, 38); av.style.cursor = "pointer"; av.title = "Clique para trocar a foto";
  av.onclick = () => pickAvatar(u.id, () => openAdminPanel());
  const role = h("select", { class: "input", style: { height: "30px", width: "108px", padding: "0 6px" } },
    h("option", { value: "operador" }, "Operador"), h("option", { value: "adm" }, "Adm"));
  role.value = u.role || "operador";
  role.onchange = async () => { try { await store.updateAnyProfile(u.id, { role: role.value }); toast("Papel atualizado."); } catch (e) { toast(e.message, "err"); } };
  return h("div", { class: "admin-row" },
    av,
    h("div", { class: "ar-info" },
      h("div", { class: "ar-name" }, u.display_name || u.full_name || "—"),
      h("div", { class: "ar-mail" }, u.email || "—")),
    role,
    h("button", { class: "btn btn-ghost btn-sm", onClick: () => editUserModal(u) }, "Editar"));
}
function pickAvatar(id, onDone) {
  const input = h("input", { type: "file", accept: "image/*", style: { display: "none" } });
  document.body.appendChild(input);
  input.onchange = async () => {
    const f = input.files[0]; input.remove(); if (!f) return;
    toast("Enviando foto…");
    try { const url = await store.uploadAvatar(id, f); toast("Foto atualizada."); onDone && onDone(url); }
    catch (e) { toast("Erro na foto: " + e.message, "err"); }
  };
  input.click();
}
/* o próprio usuário troca a sua foto */
function changeMyPhoto() {
  pickAvatar(App.profile.id, (url) => {
    App.profile.avatar_url = url;
    const p = App.profilesMap.get(App.profile.id); if (p) p.avatar_url = url;
    document.querySelectorAll(".user-chip .av").forEach((el) => el.replaceWith(avatarEl(App.profile, 30)));
    renderAppPresence();
  });
}
function editUserModal(u) {
  const full = h("input", { class: "input", value: u.full_name || "" });
  const disp = h("input", { class: "input", value: u.display_name || "" });
  const photoBtn = h("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => pickAvatar(u.id, () => { toast("Foto salva."); }) }, "📷 Trocar foto");
  const content = h("div", {},
    h("div", { class: "field", style: { display: "flex", alignItems: "center", gap: "12px", flexDirection: "row" } }, avatarEl(u, 44), photoBtn),
    h("div", { class: "field" }, h("label", {}, "Nome completo"), full),
    h("div", { class: "field" }, h("label", {}, "Nome de exibição"), disp));
  openModal("Editar usuário", content, [
    { label: "Cancelar", onClick: (a) => a.close() },
    { label: "Salvar", primary: true, onClick: async (a) => { a.close(); try { await store.updateAnyProfile(u.id, { full_name: full.value.trim(), display_name: disp.value.trim() }); toast("Salvo."); openAdminPanel(); } catch (e) { toast(e.message, "err"); } } },
  ]);
}
function addUserForm() {
  const email = h("input", { class: "input", type: "email", placeholder: "email@equatorial..." });
  const full = h("input", { class: "input", placeholder: "Nome completo" });
  const disp = h("input", { class: "input", placeholder: "Nome de exibição" });
  const role = h("select", { class: "input" }, h("option", { value: "operador" }, "Operador"), h("option", { value: "adm" }, "Adm"));
  const content = h("div", {},
    h("div", { class: "field" }, h("label", {}, "E-mail"), email),
    h("div", { class: "field" }, h("label", {}, "Nome completo"), full),
    h("div", { class: "field" }, h("label", {}, "Nome de exibição"), disp),
    h("div", { class: "field" }, h("label", {}, "Papel"), role),
    h("p", { class: "muted", style: { fontSize: "12px" } }, "Entra com a senha padrão e define a própria no 1º acesso."));
  openModal("Adicionar usuário", content, [
    { label: "Cancelar", onClick: (a) => a.close() },
    { label: "Criar usuário", primary: true, onClick: async (a) => {
        if (!email.value.trim()) return;
        a.close();
        try { const pw = await store.createUser({ email: email.value, full_name: full.value, display_name: disp.value, role: role.value }); toast("Usuário criado. Senha padrão: " + pw); openAdminPanel(); }
        catch (e) { toast("Erro ao criar: " + (e.message || e), "err"); }
      } },
  ]);
}

/* ============================ TELA INICIAL (PROJETOS) ============================ */
async function showProjects() {
  if (!(await ensureProfile())) return;
  App.project = null; App.sheet = null;
  rt.unsubscribeDB(); rt.leavePresence();
  setLoc({ view: "projects" });
  $("#auth-root").hidden = true;
  const root = $("#app-root"); root.hidden = false;
  clear(root);
  root.appendChild(buildLanding());
  await loadLanding();
}

function buildLanding() {
  const search = h("input", { class: "input proj-search", type: "search", placeholder: "Buscar projeto…",
    oninput: (e) => renderProjectCards(App._projects || [], e.target.value) });
  const grid = h("div", { class: "proj-grid", id: "proj-grid" });
  const top = h("header", { class: "landing-top" },
    h("img", { class: "landing-logo", src: "app_planejamento_logo.png", alt: "App Planejamento" }),
    h("div", { class: "spacer", style: { flex: 1 } }),
    isAdmin() ? h("button", { class: "landing-gear", title: "Administração de usuários", onClick: openAdminPanel }, "⚙") : null,
    userChipEl());
  const head = h("div", { class: "landing-head" },
    h("div", {}, h("div", { class: "t-display" }, "Projetos"),
      h("p", { class: "muted", style: { margin: "2px 0 0" } }, "Selecione um projeto para abrir ou crie um novo.")),
    h("div", { class: "landing-actions" }, search,
      h("button", { class: "btn btn-primary", onClick: newProject }, "＋ Novo projeto")));
  return h("div", { class: "landing" }, top, h("div", { class: "landing-body" }, head, grid));
}

async function loadLanding() {
  const grid = $("#proj-grid"); if (!grid) return;
  grid.innerHTML = '<div class="spinner" style="margin:48px auto"></div>';
  let projects, summary, lastch;
  try { [projects, summary, lastch] = await Promise.all([store.listProjects(), store.loadProjectsStatusSummary(), store.loadProjectsLastChange()]); }
  catch (e) { clear(grid); grid.appendChild(h("p", { class: "muted" }, "Erro ao carregar: " + e.message)); return; }
  App._projects = projects; App._summary = summary; App._lastch = lastch;
  renderProjectCards(projects, "");
}

function renderProjectCards(projects, q) {
  const grid = $("#proj-grid"); if (!grid) return;
  clear(grid);
  const ql = (q || "").trim().toLowerCase();
  const list = projects.filter((p) => !ql || p.name.toLowerCase().includes(ql) || (p.description || "").toLowerCase().includes(ql));
  if (!list.length) { grid.appendChild(h("p", { class: "muted", style: { padding: "20px 4px" } }, "Nenhum projeto encontrado.")); return; }
  list.forEach((p) => grid.appendChild(projectCard(p)));
}

function projectCard(p) {
  const sum = (App._summary && (App._summary.get(p.id) || (p.synthetic && App._summary.get("__all__")))) || new Map();
  const chips = h("div", { class: "pc-status" });
  const seen = new Set();
  getStatusOptions().forEach((s) => { const n = sum.get(s); if (n) { chips.appendChild(h("span", { class: "chip " + (statusClassFor(s) || "na") }, `${s} · ${n}`)); seen.add(s); } });
  for (const [k, n] of sum) if (!seen.has(k) && n) chips.appendChild(h("span", { class: "chip na" }, `${k} · ${n}`));
  if (!chips.childNodes.length) chips.appendChild(h("span", { class: "muted", style: { fontSize: "11px" } }, "Sem status preenchidos"));
  return h("div", { class: "proj-card", onClick: () => goProject(p.id) },
    h("div", { class: "pc-top" },
      h("div", { class: "pc-name" }, p.name),
      p.synthetic ? null : h("div", { class: "pc-actions" },
        h("button", { class: "pc-edit", title: "Editar nome/descrição", onClick: (e) => { e.stopPropagation(); editProject(p); } }, "✎"),
        h("button", { class: "pc-menu", title: "Mais opções", onClick: (e) => { e.stopPropagation(); projectMenu(e, p); } }, "⋯"))),
    h("div", { class: "pc-desc" }, p.description || "Sem descrição."),
    h("div", { class: "pc-meta" },
      h("span", {}, "Criado: " + (p.created_at ? fmtDate(p.created_at) : "—")),
      h("span", {}, "Atualizado: " + ((App._lastch && App._lastch.get(p.id)) ? fmtDate(App._lastch.get(p.id)) : "—"))),
    chips);
}

function newProject() {
  const name = h("input", { class: "input", placeholder: "Ex.: Auditoria EQTL 2026" });
  const desc = h("textarea", { class: "input", placeholder: "Descrição (opcional)", rows: 2 });
  const content = h("div", {}, h("div", { class: "field" }, h("label", {}, "Nome do projeto"), name),
    h("div", { class: "field" }, h("label", {}, "Descrição"), desc));
  const api = openModal("Novo projeto", content, [
    { label: "Cancelar", onClick: (a) => a.close() },
    { label: "Criar projeto", primary: true, onClick: async (a) => {
        if (!name.value.trim()) return;
        if (!(await store.projectsAvailable())) { a.close(); return toast("Para criar vários projetos, rode o SQL sql/07_projects.sql no Supabase.", "err"); }
        a.close();
        try { const p = await store.createProject({ name: name.value.trim(), description: desc.value.trim() }); App._projects = null; goProject(p.id); }
        catch (e) { toast("Erro ao criar: " + e.message, "err"); }
      } },
  ]);
  setTimeout(() => name.focus(), 30);
}

function projectMenu(e, p) {
  document.querySelector(".ctx-menu")?.remove();
  const m = h("div", { class: "ctx-menu", style: { left: e.clientX + "px", top: e.clientY + "px" } });
  const item = (l, fn, d) => m.appendChild(h("button", { class: d ? "danger" : "", onClick: () => { m.remove(); fn(); } }, l));
  item("Editar nome/descrição…", () => editProject(p));
  m.appendChild(h("div", { class: "sep" }));
  item("Excluir projeto", () => delProject(p), true);
  document.body.appendChild(m);
  const close = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("mousedown", close); } };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}
function editProject(p) {
  const name = h("input", { class: "input", value: p.name });
  const desc = h("textarea", { class: "input", rows: 2 }); desc.value = p.description || "";
  const content = h("div", {}, h("div", { class: "field" }, h("label", {}, "Nome"), name), h("div", { class: "field" }, h("label", {}, "Descrição"), desc));
  openModal("Editar projeto", content, [
    { label: "Cancelar", onClick: (a) => a.close() },
    { label: "Salvar", primary: true, onClick: async (a) => { a.close(); await store.updateProject(p.id, { name: name.value.trim(), description: desc.value.trim() }); loadLanding(); } },
  ]);
}
async function delProject(p) {
  if (!(await confirmModal("Excluir projeto", `Excluir "${p.name}" e TODAS as abas/dados dele? Esta ação não pode ser desfeita.`))) return;
  try { await store.deleteProject(p.id); loadLanding(); } catch (e) { toast("Erro: " + e.message, "err"); }
}

/* ============================ ROTEAMENTO (hash) ============================ */
/* A URL reflete a tela: #/projetos · #/p/<projeto> (dashboard) · #/p/<projeto>/s/<aba>.
   Assim F5 restaura a tela e Voltar/Avançar navegam dentro do app. */
function go(hash) { if (location.hash === hash) applyRoute(); else location.hash = hash; }
function goProjects() { go("#/projetos"); }
function goProject(pid) { go("#/p/" + encodeURIComponent(pid)); }
function goSheet(pid, sid) { go("#/p/" + encodeURIComponent(pid) + "/s/" + encodeURIComponent(sid)); }
function goToCell(pid, sid, r, c) {
  if (App.sheet && String(App.sheet.id) === String(sid) && App.grid) { App.grid.select(r, c); return; }
  App._pendingCell = { sheetId: sid, r, c }; goSheet(pid, sid);
}

async function mountProject(project) {
  App.project = project;
  App.sheetFilter = "";
  $("#auth-root").hidden = true;
  const root = $("#app-root"); root.hidden = false;
  clear(root);
  root.appendChild(buildShell());
  await refreshSheets();
}

async function applyRoute() {
  const hash = location.hash || "";
  if (hash.includes("access_token") || hash.includes("type=recovery")) return;
  if (!(await ensureProfile())) return;
  if (App.profile.must_change_password) return forceChangePassword();   // 1º acesso: trocar senha
  const m = hash.match(/^#\/p\/([^/]+)(?:\/s\/([^/]+))?$/);
  if (!m) {                                  // tela inicial (projetos)
    if (!(App.project === null && document.querySelector(".landing"))) await showProjects();
    return;
  }
  const pid = decodeURIComponent(m[1]);
  const sid = m[2] ? decodeURIComponent(m[2]) : null;
  if (!App.project || String(App.project.id) !== pid || !document.querySelector("#app-root .app")) {
    const projs = (App._projects && App._projects.length) ? App._projects : await store.listProjects();
    App._projects = projs;
    const proj = projs.find((x) => String(x.id) === pid);
    if (!proj) return goProjects();
    await mountProject(proj);
  }
  if (sid) {
    if (App.sheet && String(App.sheet.id) === sid && App.view === "grid") return;
    const s = App.sheets.find((x) => String(x.id) === sid);
    if (s) selectSheet(s); else (App.sheets.length ? showDashboard() : showEmptyState());
  } else {
    if (App.view === "dashboard") return;
    App.sheets.length ? showDashboard() : showEmptyState();
  }
}

function buildShell() {
  // ---- Sidebar ----
  const sheetList = h("div", { class: "sheet-list", id: "sheet-list" });
  const sidebar = h("aside", { class: "sidebar" },
    h("div", { class: "brand" },
      h("img", { class: "brand-logo", src: "app_planejamento_logo.png", alt: "App Planejamento" }),
      h("div", { class: "brand-proj", id: "brand-proj" }, App.project ? App.project.name : "")),
    h("div", { class: "side-nav" },
      h("button", { class: "side-nav-item nav-others", onClick: goProjects }, "↩ Outros projetos"),
      h("button", { class: "side-nav-item nav-dash", id: "nav-dashboard", onClick: () => goProject(App.project.id) },
        h("span", { class: "nav-ic", html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="5" rx="1.6"/><rect x="13" y="10" width="8" height="11" rx="1.6"/><rect x="3" y="13" width="8" height="8" rx="1.6"/></svg>' }),
        h("span", {}, "Dashboard")),
      h("div", { class: "side-nav-item nav-solic", id: "nav-solic", onClick: showSolicitacoes },
        h("span", { class: "nav-ic", html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="3" y="4" width="18" height="3" rx="1"/><rect x="3" y="10.5" width="18" height="3" rx="1"/><rect x="3" y="17" width="18" height="3" rx="1"/></svg>' }),
        h("span", { class: "ns-lab" }, "Solicitações"),
        h("button", { class: "ns-orig", title: "Ver a aba original (somente consulta)", onClick: (e) => { e.stopPropagation(); openOriginalSolic(); } }, "↗")),
      h("button", { class: "side-nav-item nav-search", onClick: openGlobalSearch },
        h("span", { class: "nav-ic" }, "🔎"), h("span", {}, "Busca geral"))),
    h("div", { class: "side-actions" },
      h("div", { class: "side-icons" },
        isAdmin() ? h("button", { class: "side-icon-btn", title: "Importar / atualizar a partir de um Excel (.xlsx)", onClick: openExcelImport }, "⇪ Importar Excel") : null,
        h("button", { class: "side-icon-btn", id: "btn-export", title: "Exportar abas para Excel (.xlsx)", onClick: enterExportMode }, "⭳ Exportar")),
      h("div", { class: "exp-bar", id: "exp-bar", hidden: true })),
    h("div", { class: "side-section" },
      h("span", { class: "side-section-t" }, "Abas"),
      h("input", { class: "side-search", type: "search", placeholder: "Buscar…", value: App.sheetFilter || "",
        oninput: (e) => { App.sheetFilter = e.target.value; renderSidebar(); } }),
      h("button", { class: "add", title: "Nova aba", onClick: newSheet }, "+")),
    sheetList,
    h("div", { class: "side-foot" },
      h("button", { class: "side-foot-btn", title: "Configuração", onClick: openConfig },
        h("span", { class: "nav-ic" }, "⚙"), h("span", {}, "Configuração"))),
  );

  // ---- Topbar ----
  const collapseBtn = h("button", { class: "collapse-btn", title: "Recolher/expandir menu", onClick: toggleSidebar }, "☰");
  const crumb = h("div", { class: "crumb", id: "crumb" }, "—");
  const presence = h("div", { class: "presence", id: "presence" });
  const topbar = h("header", { class: "topbar" }, collapseBtn, crumb, presence, userChipEl());

  // ---- Toolbar ----
  const toolbar = buildToolbar();

  // ---- Grid + statusbar ----
  const gridScroll = h("div", { class: "grid-scroll", id: "grid-scroll", tabindex: "0" });
  // Ctrl + roda do mouse = zoom (como no Excel/navegador), sem dar zoom na pagina toda
  gridScroll.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(App.zoom + (e.deltaY < 0 ? 10 : -10));
  }, { passive: false });

  const statusbar = h("div", { class: "statusbar" },
    h("span", { class: "rt", id: "rt-status" }, h("span", { class: "dot" }), h("span", {}, "Conectando…")),
    h("span", { id: "sel-info" }, ""),
    h("div", { class: "spacer", style: { flex: 1 } }),
    h("span", { id: "sheet-info" }, ""),
    h("div", { class: "zoom-ctl" },
      h("button", { class: "zbtn", title: "Diminuir zoom", onClick: () => setZoom(App.zoom - 10) }, "−"),
      h("input", { type: "range", id: "zoom-range", min: "50", max: "200", step: "10", value: String(App.zoom),
        oninput: (e) => setZoom(parseInt(e.target.value, 10)) }),
      h("button", { class: "zbtn", title: "Aumentar zoom", onClick: () => setZoom(App.zoom + 10) }, "+"),
      h("span", { id: "zoom-label", class: "zoom-label", title: "Redefinir para 100%", onClick: () => setZoom(100) }, App.zoom + "%")));

  const workspace = h("div", { class: "workspace" }, topbar, toolbar, gridScroll, statusbar);
  return h("div", { class: "app" }, sidebar, workspace);
}

/* ============================ TOOLBAR ============================ */
function buildToolbar() {
  const g = App; // alias
  const tbtn = (label, title, fn, id) => h("button", { class: "tbtn", title, id, onClick: fn }, label);

  const bold = tbtn("B", "Negrito (Ctrl+B)", () => g.grid?.toggleFormat("bold"), "tb-bold");
  bold.style.fontWeight = "800";
  const ital = tbtn("I", "Itálico (Ctrl+I)", () => g.grid?.toggleFormat("italic"), "tb-italic");
  ital.style.fontStyle = "italic";
  const und = tbtn("U", "Sublinhado", () => g.grid?.toggleFormat("underline"), "tb-underline");
  und.style.textDecoration = "underline";

  const alignL = tbtn("⠿", "Alinhar à esquerda", () => g.grid?.applyFormat({ align: null }));
  alignL.textContent = "≡";
  const alignC = tbtn("≣", "Centralizar", () => g.grid?.applyFormat({ align: "center" }));
  const alignR = tbtn("≣", "Alinhar à direita", () => g.grid?.applyFormat({ align: "right" }));
  alignR.style.transform = "scaleX(-1)";

  const bg = colorButton("Cor de fundo", "▦", BG_COLORS, (c) => g.grid?.applyFormat({ bg: c || null }));
  const tx = colorButton("Cor do texto", "A", TX_COLORS, (c) => g.grid?.applyFormat({ color: c || null }), true);

  const undoBtn = tbtn("↶", "Desfazer (Ctrl+Z)", () => g.grid?.undo(), "tb-undo");
  const redoBtn = tbtn("↷", "Refazer (Ctrl+Y)", () => g.grid?.redo(), "tb-redo");
  undoBtn.disabled = true; redoBtn.disabled = true;

  const merge = tbtn("⛶ Mesclar", "Mesclar células selecionadas", () => g.grid?.mergeSelection());
  const unmerge = tbtn("Desmesclar", "Desfazer a mescla das células", () => g.grid?.unmergeSelection());
  const status = tbtn("◷ Status", "Tornar coluna/célula de status (dropdown)", () => {
    const rec = g.grid?.get(g.grid.sel.r, g.grid.sel.c);
    g.grid?.setStatusType(!(rec && rec.data_type === "status"));
  });

  const insRow = tbtn("+ Linha", "Inserir linha abaixo", () => g.grid && actions.insertRow(g.grid.sel.r + 1));
  const insCol = tbtn("+ Coluna", "Inserir coluna à direita", () => g.grid && actions.insertCol(g.grid.sel.c + 1));
  const autofit = tbtn("↔ Ajustar", "Auto-ajustar largura das colunas ao conteúdo", () => g.grid && g.grid.autoFitAll());
  const gridBtn = tbtn("▦ Grade", "Mostrar/ocultar as linhas de grade do app", () => toggleGridlines(), "tb-grid");
  const hist = tbtn("◴ Histórico", "Histórico de alterações desta aba", () => openSheetHistory());
  const cmt = tbtn("💬 Comentar", "Comentários da célula", () => g.grid && actions.openComments(g.grid.sel.r, g.grid.sel.c));

  return h("div", { class: "toolbar" },
    h("div", { class: "group" }, undoBtn, redoBtn),
    h("div", { class: "group" }, bold, ital, und),
    h("div", { class: "group" }, alignL, alignC, alignR),
    h("div", { class: "group" }, bg, tx),
    h("div", { class: "group" }, merge, unmerge, status),
    h("div", { class: "group" }, insRow, insCol, autofit, gridBtn),
    h("div", { class: "group" }, hist, cmt),
  );
}

/* mostra/oculta as linhas de grade nativas (preferencia salva por usuario) */
function toggleGridlines() {
  const off = localStorage.getItem("eqtl_gridlines") === "off";
  localStorage.setItem("eqtl_gridlines", off ? "on" : "off");
  applyGridlines();
}
function applyGridlines() {
  const off = localStorage.getItem("eqtl_gridlines") === "off";
  const tbl = document.querySelector("table.grid"); if (tbl) tbl.classList.toggle("no-gridlines", off);
  const btn = $("#tb-grid"); if (btn) btn.classList.toggle("on", !off);
}

/* zoom da visualizacao (estilo Excel) */
function setZoom(pct) {
  pct = Math.max(50, Math.min(200, Math.round(pct / 10) * 10));
  App.zoom = pct;
  localStorage.setItem("eqtl_zoom", String(pct));
  applyZoom();
}
function applyZoom() {
  const tbl = document.querySelector("table.grid");
  if (tbl) tbl.style.zoom = App.zoom / 100;
  const r = $("#zoom-range"); if (r) r.value = String(App.zoom);
  const l = $("#zoom-label"); if (l) l.textContent = App.zoom + "%";
}

function colorButton(title, glyph, colors, onPick, isText) {
  const sw = h("span", { class: "swatch" });
  const btn = h("button", { class: "tbtn", title }, h("span", { style: { fontWeight: 800 } }, glyph), sw);
  btn.onclick = (e) => {
    e.stopPropagation();
    document.querySelector(".color-pop")?.remove();
    const pop = h("div", { class: "color-pop" });
    const rect = btn.getBoundingClientRect();
    pop.style.position = "fixed"; pop.style.left = rect.left + "px"; pop.style.top = rect.bottom + 4 + "px";
    colors.forEach((c) => {
      const s = h("div", { class: "sw" + (c ? "" : " none"), title: c || "padrão" });
      if (c) s.style.background = c;
      s.onclick = () => { onPick(c); sw.style.background = c || "transparent"; pop.remove(); };
      pop.appendChild(s);
    });
    document.body.appendChild(pop);
    const close = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener("mousedown", close); } };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  };
  return btn;
}

/* sincroniza estado visual da toolbar com a celula selecionada */
function syncToolbar(fmt) {
  const set = (id, on) => { const b = $("#" + id); if (b) b.classList.toggle("on", !!on); };
  set("tb-bold", fmt.bold); set("tb-italic", fmt.italic); set("tb-underline", fmt.underline);
}

/* ============================ SIDEBAR ============================ */
async function refreshSheets() {
  const sheets = await store.listSheets(App.project);
  const [activity, index] = await Promise.all([
    store.loadSheetActivity(App.project),
    store.loadSheetIndex(App.project, sheets),
  ]);
  App.sheets = sortedSheets(sheets);
  App.activity = activity;
  App.sheetIndex = index || new Map();
  renderSidebar();
}

/* ordenacao natural das abas: indices primeiro, depois 1.1, 1.2 … 1.10, 1.11.
   Apenas para EXIBICAO (nao regrava posicoes no banco). */
function natCompare(a, b) {
  const ax = String(a ?? "").trim().match(/\d+|\D+/g) || [];
  const bx = String(b ?? "").trim().match(/\d+|\D+/g) || [];
  const n = Math.max(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    const x = ax[i], y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d/.test(x) && /^\d/.test(y)) { const d = parseInt(x, 10) - parseInt(y, 10); if (d) return d; }
    else { const d = x.localeCompare(y, "pt"); if (d) return d; }
  }
  return 0;
}
function sortedSheets(sheets) {
  const idx = sheets.filter((s) => s.kind === "index").sort((a, b) => (a.position - b.position) || natCompare(a.name, b.name));
  const rest = sheets.filter((s) => s.kind !== "index").sort((a, b) => natCompare(a.name, b.name));
  return [...idx, ...rest];
}
/* info do indice (Área/Scot/Client Portal) para uma aba, se houver */
function sheetInfo(s) {
  if (!App.sheetIndex || !s) return null;
  return App.sheetIndex.get(String(s.name || "").trim()) || null;
}
function sheetAreaText(s) { const i = sheetInfo(s); return i && i.areas.length ? i.areas.join(" · ") : ""; }
/* a aba índice "Solicitações" agora vira a tela-tabela; sai da lista de abas
   (fica acessível pelo item do menu e pelo link "ver original"). */
function isSolicIndex(s) { return !!(s && s.kind === "index" && /solicita/i.test(s.name)); }
function solicIndexSheet() { return App.sheets.find(isSolicIndex) || null; }
function openOriginalSolic() { const s = solicIndexSheet(); if (s) goSheet(App.project.id, s.id); else toast("Aba original não encontrada."); }

function bumpActivity(sheetId) {
  const iso = new Date().toISOString();
  App.activity.set(sheetId, iso);
  const el = document.getElementById("time-" + sheetId);
  if (el) el.textContent = "alt. " + fmtDate(iso);
}

function renderSidebar() {
  const list = $("#sheet-list"); if (!list) return;
  clear(list);
  const inExp = App.exportMode;
  const q = (App.sheetFilter || "").trim().toLowerCase();
  const base = App.sheets.filter((s) => !isSolicIndex(s));
  let sheets = base;
  if (q && !inExp) {
    sheets = base.filter((s) => {
      const info = sheetInfo(s);
      const hay = (s.name + " " + sheetAreaText(s) + " " + (info ? info.scot + " " + info.clientPortal : "")).toLowerCase();
      return hay.includes(q);
    });
  }
  if (!sheets.length) {
    list.appendChild(h("div", { class: "sheet-empty" }, q ? "Nenhuma aba encontrada." : "Nenhuma aba."));
    return;
  }
  sheets.forEach((s) => {
    const t = App.activity.get(s.id);
    const checked = inExp && App.exportSel.has(s.id);
    const area = sheetAreaText(s);
    const tip = s.name + (area ? " · " + area : "") + (t ? "\nAlterado: " + fmtDate(t) : "");
    const item = h("div", {
      class: "sheet-item" + (!inExp && App.sheet && s.id === App.sheet.id ? " active" : "") + (s.hidden ? " is-hidden" : ""),
      title: tip,
      onClick: () => {
        if (inExp) { App.exportSel.has(s.id) ? App.exportSel.delete(s.id) : App.exportSel.add(s.id); renderSidebar(); updateExpBar(); }
        else goSheet(App.project.id, s.id);
      },
      oncontextmenu: (e) => { if (inExp) return; e.preventDefault(); sheetMenu(e.clientX, e.clientY, s); },
    },
      inExp ? h("input", { type: "checkbox", class: "exp-check", checked: checked }) : null,
      h("div", { class: "col" },
        h("span", { class: "nm" }, s.name),
        area ? h("span", { class: "sub-name" }, area) : null),
      s.kind === "index" && !inExp ? h("span", { class: "badge" }, "índice") : null,
      !inExp ? h("button", { class: "row-menu", title: "Opções", onClick: (e) => { e.stopPropagation(); const r = e.target.getBoundingClientRect(); sheetMenu(r.left, r.bottom, s); } }, "⋯") : null,
    );
    list.appendChild(item);
  });
}

function sheetMenu(x, y, s) {
  document.querySelector(".ctx-menu")?.remove();
  const m = h("div", { class: "ctx-menu", style: { left: x + "px", top: y + "px" } });
  const item = (label, fn, danger) => m.appendChild(h("button", { class: danger ? "danger" : "", onClick: () => { m.remove(); fn(); } }, label));
  item("Renomear…", () => renameSheet(s));
  item(s.hidden ? "Reexibir aba" : "Ocultar aba", async () => { await store.updateSheet(s.id, { hidden: !s.hidden }); await refreshSheets(); });
  m.appendChild(h("div", { class: "sep" }));
  item("Excluir aba", () => confirmDelete(s), true);
  document.body.appendChild(m);
  const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("mousedown", close); } };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

async function moveSheet(s, dir) {
  const ids = App.sheets.map((x) => x.id);
  const i = ids.indexOf(s.id), j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await store.reorderSheets(ids);
  await refreshSheets();
}

async function newSheet() {
  const name = await promptModal("Nova aba", "Nome da aba", "");
  if (!name) return;
  const s = await store.createSheet({ name, position: App.sheets.length, project: App.project });
  await refreshSheets();
  goSheet(App.project.id, s.id);
}
async function renameSheet(s) {
  const name = await promptModal("Renomear aba", "Novo nome", s.name);
  if (!name || name === s.name) return;
  await store.updateSheet(s.id, { name });
  await refreshSheets();
  if (App.sheet?.id === s.id) { App.sheet.name = name; renderCrumb(App.sheet); }
}
async function confirmDelete(s) {
  if (!(await confirmModal("Excluir aba", `Excluir a aba "${s.name}" e todo o seu conteúdo? Esta ação não pode ser desfeita.`))) return;
  await store.deleteSheet(s.id);
  if (App.sheet?.id === s.id) App.sheet = null;
  await refreshSheets();
  const nxt = App.sheets.find((x) => !x.hidden) || App.sheets[0];
  if (nxt) goSheet(App.project.id, nxt.id); else showEmptyState();
}

function showEmptyState() {
  const gs = $("#grid-scroll"); if (!gs) return;
  clear(gs);
  gs.appendChild(h("div", { style: { padding: "60px", textAlign: "center", color: "var(--on-surface-variant)" } },
    h("div", { class: "t-headline-sm" }, "Nenhuma aba ainda"),
    h("p", {}, isAdmin() ? "Crie uma aba no menu lateral ou importe a planilha existente." : "Crie uma aba no menu lateral."),
    isAdmin() ? h("button", { class: "btn btn-primary", onClick: openImport }, "Importar planilha") : null));
}

/* ============================ DASHBOARD ============================ */
async function showDashboard() {
  App.view = "dashboard";
  App.sheet = null;
  if (!App.dashTab) App.dashTab = "status";              // 1ª tela ao entrar no projeto = Dashboard
  setLoc({ projectId: App.project?.id, projectName: App.project?.name, view: "dashboard" });
  renderSidebar();
  renderAppPresence();
  updateCellPresence();
  $("#nav-dashboard")?.classList.add("active");
  $("#nav-solic")?.classList.remove("active");
  { const cr = $("#crumb"); if (cr) { clear(cr); cr.appendChild(h("span", { class: "crumb-name" }, "Dashboard")); } }
  const tb = document.querySelector(".toolbar"); if (tb) tb.style.display = "none";
  rt.unsubscribeDB(); rt.leavePresence();
  const gs = $("#grid-scroll");
  clear(gs); gs.classList.remove("solic"); gs.classList.add("dash");

  const tabs = h("div", { class: "dash-tabs" });
  const mkTab = (key, label) => h("button", { class: "dtab" + (App.dashTab === key ? " on" : ""),
    onClick: () => { if (App.dashTab === key) return; App.dashTab = key; showDashboard(); } }, label);
  tabs.appendChild(mkTab("status", "Visão por status"));
  tabs.appendChild(mkTab("users", "Usuários"));
  const body = h("div", { class: "dash-body", id: "dash-body" });
  gs.appendChild(tabs);
  gs.appendChild(body);

  if (App.dashTab === "users") return renderDashUsers(body);
  return renderDashStatus(body, gs);
}

async function renderDashStatus(body, gs) {
  body.appendChild(h("div", { class: "spinner", style: { margin: "50px auto" } }));
  let rows;
  try { rows = await store.loadStatusAggregate(App.project); }
  catch (e) { clear(body); body.appendChild(h("p", { class: "muted", style: { padding: "28px" } }, "Erro ao carregar: " + e.message)); return; }
  if (App.view !== "dashboard" || App.dashTab !== "status") return;

  const sheetName = new Map(App.sheets.map((s) => [s.id, s.name]));
  const agg = new Map(); let grand = 0;
  for (const r of rows) {
    const label = normStatusLabel(r.value); if (!label) continue;
    if (!agg.has(label)) agg.set(label, { total: 0, sheets: new Map() });
    const a = agg.get(label); a.total++; grand++;
    a.sheets.set(r.sheet_id, (a.sheets.get(r.sheet_id) || 0) + 1);
  }
  const order = [...getStatusOptions()];
  for (const k of agg.keys()) if (!order.includes(k)) order.push(k);

  clear(body);
  body.appendChild(h("p", { class: "sub" }, `Visão por status · ${grand} itens em ${App.sheets.length} abas. Clique num card para ver as abas; clique numa aba para abri-la.`));
  const gridEl = h("div", { class: "kpi-grid" });
  for (const label of order) {
    const a = agg.get(label); if (!a) continue;
    const cls = statusClassFor(label) || "na";
    const card = h("div", { class: "kpi-card" });
    const sheetsBox = h("div", { class: "kpi-sheets" });
    [...a.sheets.entries()].sort((x, y) => y[1] - x[1]).forEach(([sid, cnt]) => {
      sheetsBox.appendChild(h("div", { class: "srow", onClick: (e) => { e.stopPropagation(); goSheet(App.project.id, sid); } },
        h("span", {}, sheetName.get(sid) || "—"), h("span", { class: "cnt" }, String(cnt))));
    });
    card.appendChild(h("span", { class: "chip " + cls }, label));
    card.appendChild(h("div", { class: "val" }, String(a.total)));
    card.appendChild(h("div", { class: "lbl" }, `${a.sheets.size} aba(s)`));
    card.appendChild(h("div", { class: "bar", style: { background: `var(--st-${cls})` } }));
    card.appendChild(sheetsBox);
    gridEl.appendChild(card);
  }
  if (!agg.size) body.appendChild(h("p", { class: "muted" }, "Ainda não há células de status preenchidas."));
  body.appendChild(gridEl);

  const fit = () => {
    if (App.view !== "dashboard" || App.dashTab !== "status" || !gridEl.isConnected) return;
    const gsBottom = gs.getBoundingClientRect().bottom;
    gridEl.querySelectorAll(".kpi-sheets").forEach((el) => {
      const top = el.getBoundingClientRect().top;
      el.style.maxHeight = Math.max(120, Math.floor(gsBottom - top - 44)) + "px";
    });
  };
  requestAnimationFrame(fit);
  if (App._dashFit) window.removeEventListener("resize", App._dashFit);
  App._dashFit = fit;
  window.addEventListener("resize", fit);
}

/* ---- aba "Usuários": medidor de entregas (status × usuário + por dia) ---- */
function normStatusLabel(v) { const s = String(v || "").trim(); return s.toLowerCase() === "na" ? "N/A" : s; }
const STATUS_RAMP = {
  recebido: ["#EAF3DE", "#C0DD97", "#97C459", "#173404"],
  pendente: ["#FAEEDA", "#FAC775", "#EF9F27", "#412402"],
  analise:  ["#E6F1FB", "#B5D4F4", "#85B7EB", "#042C53"],
  parcial:  ["#FAECE7", "#F5C4B3", "#F0997B", "#4A1B0C"],
  na:       ["#F1EFE8", "#D3D1C7", "#B4B2A9", "#2C2C2A"],
};
function rampFor(label) { return STATUS_RAMP[statusClassFor(label) || "na"] || STATUS_RAMP.na; }
function heatTd(v, ramp, max) {
  const cell = h("div", { class: "hcell" }, v ? String(v) : "·");
  if (v) { const ratio = v / (max || 1); const i = ratio <= 0.34 ? 0 : ratio <= 0.67 ? 1 : 2; cell.style.background = ramp[i]; cell.style.color = ramp[3]; }
  else cell.style.color = "#aab2bd";
  return h("td", {}, cell);
}
function kpi(label, val) { return h("div", { class: "u-kpi" }, h("div", { class: "l" }, label), h("div", { class: "v" }, val)); }

async function renderDashUsers(body) {
  if (!App.usersOrient) App.usersOrient = "su";
  if (!App.usersPeriod) App.usersPeriod = "30";
  clear(body);

  const seg = (items, cur, on) => {
    const box = h("div", { class: "seg" });
    items.forEach(([k, l]) => box.appendChild(h("button", { class: "seg-b" + (cur === k ? " on" : ""), onClick: () => on(k) }, l)));
    return box;
  };
  body.appendChild(h("div", { class: "dash-head" },
    h("div", {}, h("h2", {}, "Medidor de entregas"),
      h("p", { class: "sub" }, "Mudanças de status por pessoa · cada mudança conta como uma entrega")),
    h("div", { class: "dash-ctrls" },
      seg([["7", "7 dias"], ["30", "30 dias"], ["all", "Tudo"]], App.usersPeriod, (k) => { App.usersPeriod = k; renderDashUsers(body); }),
      seg([["su", "Status × Usuário"], ["us", "Usuário × Status"]], App.usersOrient, (k) => { App.usersOrient = k; renderDashUsers(body); }))));
  const spin = h("div", { class: "spinner", style: { margin: "50px auto" } });
  body.appendChild(spin);

  const days = App.usersPeriod === "7" ? 7 : App.usersPeriod === "30" ? 30 : null;
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  let rows;
  try { rows = await store.loadUserActivity(App.project, since); }
  catch (e) {
    spin.remove();
    const hint = /function|does not exist|404|user_status_activity/i.test(e.message || "") ? " — rode sql/14_user_metrics.sql no Supabase." : "";
    body.appendChild(h("p", { class: "muted", style: { padding: "20px" } }, "Não consegui carregar o medidor: " + e.message + hint));
    return;
  }
  if (App.view !== "dashboard" || App.dashTab !== "users") return;
  spin.remove();
  if (!rows.length) { body.appendChild(h("p", { class: "muted", style: { padding: "20px" } }, "Sem mudanças de status no período selecionado.")); return; }

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const users = userIds.map((id) => { const p = App.profilesMap.get(id) || {}; return { id, name: p.display_name || p.full_name || "Usuário", full_name: p.full_name, color: p.color, avatar_url: p.avatar_url }; });
  users.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const statuses = [...getStatusOptions()];
  for (const r of rows) { const l = normStatusLabel(r.status); if (l && !statuses.includes(l)) statuses.push(l); }

  const count = {}; const perDay = {}; const daySet = new Set(); let total = 0;
  for (const r of rows) {
    const uid = r.user_id, st = normStatusLabel(r.status), q = Number(r.qtd) || 0;
    total += q;
    (count[uid] = count[uid] || {})[st] = (count[uid][st] || 0) + q;
    (perDay[uid] = perDay[uid] || {})[r.dia] = (perDay[uid][r.dia] || 0) + q;
    daySet.add(r.dia);
  }
  const colByStatus = (st) => users.reduce((s, u) => s + ((count[u.id] || {})[st] || 0), 0);
  const rowByUser = (uid) => statuses.reduce((s, st) => s + ((count[uid] || {})[st] || 0), 0);

  let topSt = "", topN = -1;
  statuses.forEach((st) => { const n = colByStatus(st); if (n > topN) { topN = n; topSt = st; } });
  body.appendChild(h("div", { class: "u-kpis" },
    kpi("Mudanças no período", String(total)),
    kpi("Pessoas ativas", String(users.length)),
    kpi("Status mais frequente", topN > 0 ? topSt : "—"),
    kpi("Média por dia", String(daySet.size ? Math.round(total / daySet.size) : 0))));

  let mmax = 0;
  statuses.forEach((st) => users.forEach((u) => { const v = (count[u.id] || {})[st] || 0; if (v > mmax) mmax = v; }));
  const card1 = h("div", { class: "u-card" });
  card1.appendChild(h("div", { class: "u-card-h" }, h("h3", {}, "Matriz de status"),
    h("span", { class: "sub" }, App.usersOrient === "su" ? "linhas = status · colunas = pessoas" : "linhas = pessoas · colunas = status")));
  card1.appendChild(buildMatrix(App.usersOrient, users, statuses, count, mmax, total, rowByUser, colByStatus));
  body.appendChild(card1);

  let dias = [...daySet].sort();
  let capped = false;
  if (dias.length > 21) { dias = dias.slice(-21); capped = true; }
  let dmax = 0;
  users.forEach((u) => dias.forEach((d) => { const v = (perDay[u.id] || {})[d] || 0; if (v > dmax) dmax = v; }));
  const card2 = h("div", { class: "u-card" });
  card2.appendChild(h("div", { class: "u-card-h" }, h("h3", {}, "Entregas por dia"),
    h("span", { class: "sub" }, capped ? "últimos 21 dias com atividade" : "por pessoa · dias com atividade")));
  card2.appendChild(buildDaily(users, dias, perDay, dmax));
  body.appendChild(card2);
}

function buildMatrix(orient, users, statuses, count, mmax, total, rowByUser, colByStatus) {
  const wrap = h("div", { class: "u-tablewrap" });
  const table = h("table", { class: "umx" });
  if (orient === "su") {
    const head = h("tr", {}, h("th", { class: "rh" }, "Status"));
    users.forEach((u) => head.appendChild(h("th", { title: u.name }, avatarEl(u, 24))));
    head.appendChild(h("th", {}, "Total"));
    table.appendChild(h("thead", {}, head));
    const tb = h("tbody", {});
    statuses.forEach((st) => {
      const ramp = rampFor(st);
      const tr = h("tr", {}, h("td", { class: "rh" }, h("span", { class: "chip " + (statusClassFor(st) || "na") }, st)));
      users.forEach((u) => tr.appendChild(heatTd((count[u.id] || {})[st] || 0, ramp, mmax)));
      tr.appendChild(h("td", { class: "tot" }, String(colByStatus(st))));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const tf = h("tr", {}, h("td", { class: "rh" }, "Total"));
    users.forEach((u) => tf.appendChild(h("td", { class: "tot" }, String(rowByUser(u.id)))));
    tf.appendChild(h("td", { class: "tot" }, String(total)));
    table.appendChild(h("tfoot", {}, tf));
  } else {
    const head = h("tr", {}, h("th", { class: "rh" }, "Pessoa"));
    statuses.forEach((st) => head.appendChild(h("th", {}, h("span", { class: "chip " + (statusClassFor(st) || "na") }, st))));
    head.appendChild(h("th", {}, "Total"));
    table.appendChild(h("thead", {}, head));
    const tb = h("tbody", {});
    users.forEach((u) => {
      const tr = h("tr", {}, h("td", { class: "rh" }, avatarEl(u, 24), h("span", { class: "u-nm" }, u.name)));
      statuses.forEach((st) => tr.appendChild(heatTd((count[u.id] || {})[st] || 0, rampFor(st), mmax)));
      tr.appendChild(h("td", { class: "tot" }, String(rowByUser(u.id))));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const tf = h("tr", {}, h("td", { class: "rh" }, "Total"));
    statuses.forEach((st) => tf.appendChild(h("td", { class: "tot" }, String(colByStatus(st)))));
    tf.appendChild(h("td", { class: "tot" }, String(total)));
    table.appendChild(h("tfoot", {}, tf));
  }
  wrap.appendChild(table);
  return wrap;
}

function buildDaily(users, dias, perDay, dmax) {
  const wrap = h("div", { class: "u-tablewrap" });
  const table = h("table", { class: "umx" });
  const ramp = STATUS_RAMP.recebido;
  const fmtDay = (iso) => { const p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : iso; };
  const head = h("tr", {}, h("th", { class: "rh" }, "Pessoa"));
  dias.forEach((d) => head.appendChild(h("th", {}, fmtDay(d))));
  head.appendChild(h("th", {}, "Total"));
  table.appendChild(h("thead", {}, head));
  const tb = h("tbody", {});
  users.forEach((u) => {
    const tr = h("tr", {}, h("td", { class: "rh" }, avatarEl(u, 24), h("span", { class: "u-nm" }, u.name)));
    let t = 0;
    dias.forEach((d) => { const v = (perDay[u.id] || {})[d] || 0; t += v; tr.appendChild(heatTd(v, ramp, dmax)); });
    tr.appendChild(h("td", { class: "tot" }, String(t)));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  const tf = h("tr", {}, h("td", { class: "rh" }, "Total/dia"));
  let gt = 0;
  dias.forEach((d) => { let c = 0; users.forEach((u) => { c += (perDay[u.id] || {})[d] || 0; }); gt += c; tf.appendChild(h("td", { class: "tot" }, String(c))); });
  tf.appendChild(h("td", { class: "tot" }, String(gt)));
  table.appendChild(h("tfoot", {}, tf));
  wrap.appendChild(table);
  return wrap;
}

/* ============================ SELECT SHEET ============================ */
let reconcile = null;
async function selectSheet(sheet) {
  App.sheet = sheet;
  App.view = "grid";
  $("#nav-dashboard")?.classList.remove("active");
  $("#nav-solic")?.classList.remove("active");
  const tb = document.querySelector(".toolbar"); if (tb) tb.style.display = "";
  renderSidebar();
  renderCrumb(sheet);
  const gs = $("#grid-scroll");
  gs.classList.remove("dash"); gs.classList.remove("solic");
  if (!App.grid) App.grid = new Grid(gs, actions);

  setRtStatus(false, "Carregando…");
  let cells, comments;
  try { [cells, comments] = await Promise.all([store.loadCells(sheet.id), store.loadComments(sheet.id)]); }
  catch (e) { return toast("Erro ao carregar aba: " + e.message, "err"); }
  App.grid.box = gs;            // garante container
  App.grid.load(sheet, cells, comments);
  if (App._pendingCell && App._pendingCell.sheetId === sheet.id) { App.grid.select(App._pendingCell.r, App._pendingCell.c); App._pendingCell = null; }
  updateSheetInfo();

  // realtime
  reconcile = debounce(() => reloadCurrent(), 350);
  rt.subscribeSheet(sheet.id, {
    onCell: (p) => {
      if (p.eventType === "DELETE") { if (p.old) App.grid.removeRemote(p.old.row, p.old.col); }
      else App.grid.applyRemote(p.new);
      bumpActivity(sheet.id);
    },
    onSheet: (p) => {
      if (!p.new) return;
      // mudou alguma aba: atualiza sidebar
      const idx = App.sheets.findIndex((x) => x.id === p.new.id);
      if (idx >= 0) App.sheets[idx] = p.new;
      renderSidebar();
      if (p.new.id === App.sheet.id) {
        const structural = p.new.row_count !== App.sheet.row_count || p.new.col_count !== App.sheet.col_count;
        const dimChanged = JSON.stringify(p.new.col_widths) !== JSON.stringify(App.sheet.col_widths)
                        || JSON.stringify(p.new.row_heights) !== JSON.stringify(App.sheet.row_heights);
        App.sheet = p.new; App.grid.sheet = p.new;
        if (structural) reconcile();
        else if (dimChanged) App.grid.render();
        renderCrumb(p.new);
        updateSheetInfo();
      }
    },
    onComment: (p) => { if (p.eventType === "INSERT" && p.new) App.grid.bumpComment(p.new.row, p.new.col); },
  });
  // status da conexao
  setTimeout(() => setRtStatus(true, "Ao vivo"), 600);

  // presenca: canal da aba (flags de edicao por celula) + atualiza localizacao global
  rt.joinPresence(sheet.id, App.profile, (peers) => { App.grid.setPeers(peers, App.profile.id); });
  setLoc({ projectId: App.project?.id, projectName: App.project?.name, sheetId: sheet.id, sheetName: sheet.name, view: "sheet" });
  updateCellPresence();
}

async function reloadCurrent() {
  if (!App.sheet) return;
  const s = await store.getSheet(App.sheet.id);
  if (!s) return;
  App.sheet = s;
  const [cells, comments] = await Promise.all([store.loadCells(s.id), store.loadComments(s.id)]);
  const keepSel = App.grid.sel;
  App.grid.load(s, cells, comments);
  App.grid.select(keepSel.r, keepSel.c);
  updateSheetInfo();
}

function updateSheetInfo() {
  const el = $("#sheet-info");
  if (el && App.sheet) el.textContent = `${App.sheet.row_count} linhas · ${App.sheet.col_count} colunas`;
}

/* topbar: nome da aba + Área / Scot / Client Portal (vindos da aba índice) */
function renderCrumb(sheet) {
  const el = $("#crumb"); if (!el) return;
  clear(el);
  if (!sheet) { el.textContent = "—"; return; }
  el.appendChild(h("span", { class: "crumb-name" }, sheet.name));
  const info = sheetInfo(sheet);
  if (info) {
    const chips = h("div", { class: "crumb-info" });
    const add = (label, val) => { if (val) chips.appendChild(h("span", { class: "ci", title: label + ": " + val }, h("b", {}, label + ": "), val)); };
    add("Área", info.areas.join(" · "));
    add("Scot", info.scot);
    add("Client Portal", info.clientPortal);
    if (chips.childNodes.length) el.appendChild(chips);
  }
}
function setRtStatus(on, label) {
  const el = $("#rt-status"); if (!el) return;
  el.classList.toggle("off", !on);
  el.querySelector("span:last-child").textContent = label;
}
function toggleSidebar() {
  document.querySelector(".app")?.classList.toggle("sidebar-collapsed");
}

/* presenca no topbar: todos os usuários centralizados (online verde / offline cinza) */
function renderAppPresence() {
  const box = $("#presence"); if (!box) return;
  clear(box);
  const online = new Map((App._appPeers || []).map((p) => [p.id, p]));
  const users = new Map();
  for (const [id, p] of App.profilesMap) users.set(id, { id, name: p.display_name || p.full_name || "Usuário", full_name: p.full_name, email: p.email, color: p.color, avatar_url: p.avatar_url });
  for (const [id, p] of online) if (!users.has(id)) users.set(id, { id, name: p.name, full_name: p.full_name, email: p.email, color: p.color });
  const all = [...users.values()].map((u) => { const on = online.get(u.id); return { ...u, online: !!on, loc: on ? on.loc : null }; });
  // SO os online viram avatar no topbar (com bolinha verde); offline vira só um contador cinza.
  const onlineUsers = all.filter((u) => u.online).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const offlineCount = all.length - onlineUsers.length;
  const MAX = 9;
  onlineUsers.slice(0, MAX).forEach((u) => box.appendChild(presAvatar(u)));
  if (onlineUsers.length > MAX) box.appendChild(h("div", { class: "pav", onClick: openTeamPanel, title: "Ver todos online" },
    h("div", { class: "pav-circle", style: { background: "var(--secondary)" } }, "+" + (onlineUsers.length - MAX)),
    h("div", { class: "pav-name" }, "online")));
  if (offlineCount > 0) box.appendChild(h("div", { class: "pav off", onClick: openTeamPanel, title: `${offlineCount} offline · ver equipe` },
    h("div", { class: "pav-circle", style: { background: "var(--outline)" } }, String(offlineCount)),
    h("div", { class: "pav-name" }, "offline")));
}
function presAvatar(u) {
  const self = u.id === App.profile.id;
  const circle = h("div", { class: "pav-circle", style: { background: u.color || "#1a5fa8" } });
  if (u.avatar_url) { circle.style.backgroundImage = `url("${u.avatar_url}")`; circle.style.backgroundSize = "cover"; circle.style.backgroundPosition = "center"; }
  else circle.textContent = initials(u.name);
  return h("div", { class: "pav" + (u.online ? "" : " off"), title: (u.name || "") + (u.email ? " · " + u.email : "") + (self ? " (você)" : "") + (u.online ? "" : " · offline"), onClick: (e) => presMenu(e, u) },
    circle, h("div", { class: "pav-name" }, String(u.name || "").split(" ")[0]));
}
function presMenu(e, u) {
  e.stopPropagation();
  document.querySelector(".ctx-menu")?.remove();
  const m = h("div", { class: "ctx-menu", style: { left: Math.max(8, e.clientX - 90) + "px", top: (e.clientY + 8) + "px" } });
  const canGo = u.online && u.loc && u.loc.sheetId && u.loc.projectId;
  const item = (label, fn, disabled) => { const b = h("button", {}, label); if (disabled) b.disabled = true; else b.onclick = () => { m.remove(); fn(); }; m.appendChild(b); };
  item(canGo ? "Ir para célula" : "Ir para célula (indisponível)", () => {
    if (u.loc.cell) goToCell(u.loc.projectId, u.loc.sheetId, u.loc.cell.r, u.loc.cell.c);
    else goSheet(u.loc.projectId, u.loc.sheetId);
  }, !canGo);
  item("Ver perfil", () => openUserModal(u));
  document.body.appendChild(m);
  const close = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("mousedown", close); } };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

/* painel com TODOS os usuários (online + offline) */
async function openTeamPanel() {
  let profiles = [];
  try { profiles = await store.listProfiles(); } catch (_) {}
  const onlineIds = new Set((App._appPeers || []).map((p) => p.id));
  const byId = new Map(); profiles.forEach((p) => byId.set(p.id, p));
  (App._appPeers || []).forEach((p) => { if (!byId.has(p.id)) byId.set(p.id, { id: p.id, display_name: p.name, full_name: p.full_name, email: p.email, color: p.color }); });
  const all = [...byId.values()].sort((a, b) =>
    (onlineIds.has(b.id) - onlineIds.has(a.id)) || String(a.display_name || "").localeCompare(String(b.display_name || "")));
  const body = h("div", { class: "db" });
  if (!all.length) body.appendChild(h("p", { class: "muted" }, "Nenhum usuário cadastrado ainda."));
  all.forEach((u) => {
    const online = onlineIds.has(u.id);
    body.appendChild(h("div", { class: "team-row", title: (u.display_name || u.full_name || "") + (u.email ? " · " + u.email : ""), onClick: () => openUserModal({ ...u, name: u.display_name || u.full_name, online }) },
      avatarEl(u, 34),
      h("div", { class: "tr-info" },
        h("div", { class: "tr-name" }, u.display_name || u.full_name || "—"),
        h("div", { class: "tr-mail" }, u.email || "—")),
      h("span", { class: "tr-dot " + (online ? "on" : "off"), title: online ? "Online" : "Offline" })));
  });
  openDrawer(`Equipe · ${all.length} usuário(s)`, body);
}

function openUserModal(u) {
  const online = u.online !== undefined ? u.online : (App._appPeers || []).some((p) => p.id === u.id);
  const name = u.name || u.display_name || u.full_name || "—";
  const f = (label, val) => h("div", { class: "uc-field" }, h("span", { class: "uc-label" }, label), h("span", { class: "uc-val" }, val || "—"));
  const content = h("div", { class: "user-card" },
    h("div", { class: "uc-head" },
      avatarEl({ ...u, name }, 48),
      h("div", {}, h("div", { class: "uc-name" }, name),
        h("div", { class: "uc-status " + (online ? "on" : "off") }, online ? "● Online" : "○ Offline"))),
    f("Nome completo", u.full_name),
    f("Nome de exibição", u.display_name || u.name),
    f("E-mail", u.email),
    u.created_at ? f("Cadastrado em", fmtDate(u.created_at)) : null);
  openModal("Usuário", content, [{ label: "Fechar", primary: true }]);
}

/* ============================ ACTIONS (grid -> store) ============================ */
const actions = {
  save: (r, c, patch) => { bumpActivity(App.sheet.id); return store.saveCell(App.sheet.id, r, c, patch).catch((e) => toast("Falha ao salvar: " + e.message, "err")); },
  clear: (r, c) => store.deleteCell(App.sheet.id, r, c),
  insertRow: async (at) => { const { error } = await store.insertRow(App.sheet.id, at); if (error) return toast(error.message, "err"); await reloadCurrent(); },
  deleteRow: async (at) => { const { error } = await store.deleteRow(App.sheet.id, at); if (error) return toast(error.message, "err"); await reloadCurrent(); },
  insertCol: async (at) => { const { error } = await store.insertCol(App.sheet.id, at); if (error) return toast(error.message, "err"); await reloadCurrent(); },
  deleteCol: async (at) => { const { error } = await store.deleteCol(App.sheet.id, at); if (error) return toast(error.message, "err"); await reloadCurrent(); },
  setSheet: (patch) => store.updateSheet(App.sheet.id, patch).catch((e) => toast(e.message, "err")),
  onEditing: (key) => rt.setEditingCell(App.profile, key),
  onSelect: (sel, rec) => {
    const info = $("#sel-info"); if (info) info.textContent = `${colName(sel.c)}${sel.r}`;
    if (App._loc) { App._loc.cell = { r: sel.r, c: sel.c }; scheduleCellBeat(); }   // avisa os outros onde estou
    syncToolbar((rec && rec.format) || {});
  },
  openHistory: (r, c) => openHistory(r, c),
  openComments: (r, c) => openComments(r, c),
  onHistoryChange: (canU, canR) => { const u = $("#tb-undo"), rd = $("#tb-redo"); if (u) u.disabled = !canU; if (rd) rd.disabled = !canR; },
  onRender: () => { applyGridlines(); applyZoom(); },
};

/* ============================ HISTORICO ============================ */
async function openHistory(r, c) {
  const rows = await store.loadCellHistory(App.sheet.id, r, c).catch(() => []);
  const body = h("div", { class: "db" });
  if (!rows.length) body.appendChild(h("p", { class: "muted" }, "Sem alterações registradas para esta célula."));
  rows.forEach((it) => {
    const who = App.profilesMap.get(it.changed_by);
    const kindLabel = { value: "alterou", clear: "limpou", format: "formatou", merge: "mesclou" }[it.change_kind] || "alterou";
    body.appendChild(h("div", { class: "hist-item" },
      h("div", { class: "meta" },
        h("strong", {}, who ? (who.display_name || who.full_name) : "—"),
        h("span", {}, kindLabel),
        h("span", {}, "· " + fmtDate(it.changed_at))),
      it.change_kind === "value" || it.change_kind === "clear"
        ? h("div", { class: "diff" },
          it.old_value ? h("span", { class: "old" }, it.old_value) : h("span", { class: "muted" }, "(vazio)"),
          h("span", {}, "→"),
          h("span", { class: "new" }, it.new_value || "(vazio)"))
        : null));
  });
  openDrawer(`Histórico · ${colName(c)}${r}`, body);
}

/* ============================ HISTORICO DA ABA ============================ */
async function openSheetHistory() {
  if (!App.sheet) return;
  let rows = [];
  try { rows = await store.loadSheetHistory(App.sheet.id); }
  catch (e) { return toast("Erro ao carregar histórico: " + e.message, "err"); }
  const body = h("div", { class: "db" });
  if (!rows.length) body.appendChild(h("p", { class: "muted" }, "Nenhuma alteração registrada nesta aba ainda."));
  const kindLabel = { value: "alterou", clear: "limpou", format: "formatou", merge: "mesclou" };
  rows.forEach((it) => {
    const who = App.profilesMap.get(it.changed_by);
    const ref = colName(it.col) + it.row;
    const item = h("div", {
      class: "hist-item clickable",
      title: "Ir para a célula " + ref,
      onClick: () => {
        document.querySelector(".drawer")?.remove();
        document.querySelector(".drawer-scrim")?.remove();
        App.grid.select(it.row, it.col);
      },
    },
      h("div", { class: "meta" },
        h("span", { class: "cellref" }, ref),
        h("strong", {}, who ? (who.display_name || who.full_name) : "—"),
        h("span", {}, kindLabel[it.change_kind] || "alterou"),
        h("span", {}, "· " + fmtDate(it.changed_at))),
      (it.change_kind === "value" || it.change_kind === "clear")
        ? h("div", { class: "diff" },
          it.old_value ? h("span", { class: "old" }, it.old_value) : h("span", { class: "muted" }, "(vazio)"),
          h("span", {}, "→"),
          h("span", { class: "new" }, it.new_value || "(vazio)"))
        : null);
    body.appendChild(item);
  });
  openDrawer(`Histórico da aba · ${App.sheet.name}`, body);
}

/* ============================ COMENTARIOS ============================ */
async function openComments(r, c) {
  const all = await store.loadComments(App.sheet.id).catch(() => []);
  const here = all.filter((x) => x.row === r && x.col === c);
  const body = h("div", { class: "db" });
  const listEl = h("div", {});
  if (!here.length) listEl.appendChild(h("p", { class: "muted" }, "Nenhum comentário nesta célula."));
  here.forEach((cm) => {
    const who = cm.author_id ? App.profilesMap.get(cm.author_id) : null;
    listEl.appendChild(h("div", { class: "hist-item" },
      h("div", { class: "meta" }, h("strong", {}, who ? (who.display_name || who.full_name) : (cm.author_name || "—")), h("span", {}, "· " + fmtDate(cm.created_at))),
      h("div", { style: { marginTop: "4px", whiteSpace: "pre-wrap" } }, cm.body)));
  });
  const ta = h("textarea", { class: "input", placeholder: "Escreva um comentário…", rows: 3 });
  const add = h("button", { class: "btn btn-primary btn-sm", onClick: async () => {
    if (!ta.value.trim()) return;
    await store.addComment(App.sheet.id, r, c, ta.value.trim());
    App.grid.bumpComment(r, c);
    openComments(r, c); // recarrega
  } }, "Adicionar");
  body.appendChild(listEl);
  body.appendChild(h("div", { style: { marginTop: "12px" } }, ta, h("div", { style: { marginTop: "8px", textAlign: "right" } }, add)));
  openDrawer(`Comentários · ${colName(c)}${r}`, body);
}

/* ============================ USER MENU / PERFIL ============================ */
function openUserMenu(e) {
  document.querySelector(".ctx-menu")?.remove();
  const r = e.currentTarget.getBoundingClientRect();
  const m = h("div", { class: "ctx-menu", style: { left: (r.right - 200) + "px", top: r.bottom + 4 + "px" } });
  const item = (label, fn, danger) => m.appendChild(h("button", { class: danger ? "danger" : "", onClick: () => { m.remove(); fn(); } }, label));
  item("Editar nome de exibição…", editDisplayName);
  item("Trocar minha foto…", changeMyPhoto);
  item("Equipe / usuários…", openTeamPanel);
  if (isAdmin()) {
    m.appendChild(h("div", { class: "sep" }));
    item("Importar / atualizar do Excel (.xlsx)…", openExcelImport);
    item("Importar seed (.json) — avançado…", openImport);
  }
  m.appendChild(h("div", { class: "sep" }));
  item("Exportar planilha inteira (.xlsx)", exportWorkbook);
  m.appendChild(h("div", { class: "sep" }));
  item("Sair", () => supabase.auth.signOut(), true);
  document.body.appendChild(m);
  const close = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("mousedown", close); } };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}
async function editDisplayName() {
  const v = await promptModal("Nome de exibição", "Como seu nome aparece para o time", App.profile.display_name || "");
  if (!v) return;
  await store.updateMyProfile({ display_name: v });
  App.profile.display_name = v;
  const who = document.querySelector(".user-chip .who");
  if (who && who.firstChild) who.firstChild.textContent = v;
  const av = document.querySelector(".user-chip .av");
  if (av) av.textContent = initials(v);
  toast("Nome de exibição atualizado.");
}

/* ============================ IMPORTACAO ============================ */
function openImport() {
  const input = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files[0]; input.remove();
    if (!file) return;
    let seed;
    try { seed = JSON.parse(await file.text()); }
    catch { return toast("Arquivo JSON inválido.", "err"); }
    if (!seed.sheets) return toast("Este não parece ser um seed_data.json.", "err");
    const prog = h("p", { class: "muted" }, "Iniciando…");
    const m = openModal("Importando planilha", h("div", {}, h("p", {}, `${seed.sheets.length} abas detectadas.`), prog), []);
    try {
      await store.importSeed(seed, App.project, (msg) => { prog.textContent = msg; });
      toast("Importação concluída.");
    } catch (e) { toast("Erro na importação: " + e.message, "err"); }
    m.close();
    await refreshSheets();
    const first = App.sheets.find((s) => !s.hidden) || App.sheets[0];
    if (first) selectSheet(first);
  };
  input.click();
}

/* ============================ EXPORTAR EXCEL ============================ */
function safeFile(n) { return String(n).replace(/[\\/?*:"<>|]/g, "_").trim() || "planilha"; }

async function exportCurrentSheet() {
  if (!App.sheet) return;
  toast("Gerando Excel…");
  try {
    await excel.exportToXlsx([{
      name: App.sheet.name, col_widths: App.sheet.col_widths, col_count: App.sheet.col_count,
      cells: [...App.grid.cells.values()],
    }], safeFile(App.sheet.name) + ".xlsx");
  } catch (e) { toast("Erro ao exportar: " + e.message, "err"); }
}

async function exportWorkbook() {
  toast("Gerando Excel da planilha inteira…");
  try {
    const sheetsData = [];
    for (const s of App.sheets) {
      const cells = await store.loadCells(s.id);
      sheetsData.push({ name: s.name, col_widths: s.col_widths, col_count: s.col_count, cells });
    }
    await excel.exportToXlsx(sheetsData, "Controle de Solicitações.xlsx");
    toast("Exportado.");
  } catch (e) { toast("Erro ao exportar: " + e.message, "err"); }
}

/* ---- modo de exportacao seletiva (checkboxes no sidebar) ---- */
function enterExportMode() {
  if (App.exportMode) return;
  if (!App.sheets.length) { toast("Não há abas para exportar."); return; }
  App.exportMode = true;
  App.exportSel = new Set(App.sheets.map((s) => s.id));
  renderSidebar();
  const bar = $("#exp-bar"); bar.hidden = false; clear(bar);
  bar.appendChild(h("div", { class: "exp-hint" }, "Marque as abas a exportar:"));
  bar.appendChild(h("label", { class: "exp-all" },
    h("input", { type: "checkbox", id: "exp-all", checked: true, onChange: toggleAllExport }),
    h("span", {}, "Todas as abas")));
  bar.appendChild(h("button", { class: "btn btn-primary btn-sm", id: "exp-confirm", style: { width: "100%" }, onClick: confirmExport }, "Confirmar exportação"));
  bar.appendChild(h("button", { class: "btn btn-ghost btn-sm", style: { width: "100%", color: "var(--navy-100)", borderColor: "#ffffff33" }, onClick: exitExportMode }, "Cancelar"));
  updateExpBar();
}
function toggleAllExport() {
  const allSel = App.exportSel.size === App.sheets.length;
  App.exportSel = allSel ? new Set() : new Set(App.sheets.map((s) => s.id));
  renderSidebar(); updateExpBar();
}
function updateExpBar() {
  const c = $("#exp-confirm"); if (c) c.textContent = `Confirmar exportação (${App.exportSel.size})`;
  const a = $("#exp-all");
  if (a) { const n = App.exportSel.size, t = App.sheets.length; a.checked = n === t; a.indeterminate = n > 0 && n < t; }
}
function exitExportMode() {
  App.exportMode = false; App.exportSel = null;
  const bar = $("#exp-bar"); if (bar) { bar.hidden = true; clear(bar); }
  renderSidebar();
}
async function confirmExport() {
  const chosen = App.sheets.filter((s) => App.exportSel.has(s.id));
  if (!chosen.length) { toast("Selecione ao menos uma aba."); return; }
  const cbtn = $("#exp-confirm"); if (cbtn) { cbtn.disabled = true; cbtn.textContent = "Exportando…"; }
  try {
    const sheetsData = [];
    for (const s of chosen) {
      const cells = await store.loadCells(s.id);
      sheetsData.push({ name: s.name, col_widths: s.col_widths, col_count: s.col_count, cells });
    }
    await excel.exportToXlsx(sheetsData, chosen.length === 1 ? safeFile(chosen[0].name) + ".xlsx" : "Controle de Solicitações.xlsx");
    toast(`Exportado (${chosen.length} aba(s)).`);
  } catch (e) { toast("Erro ao exportar: " + e.message, "err"); }
  exitExportMode();
}

/* ============================ IMPORTAR EXCEL (com diff) ============================ */
function isStatusVal(v) {
  return ["pendente", "recebido", "n/a", "na", "em análise", "em analise", "parcial"].includes(String(v || "").trim().toLowerCase());
}
// normaliza para comparar so o conteudo "real": ignora espaços extras,
// nbsp e quebras de linha (evita marcar como mudança o que na tela é igual).
function normVal(s) { return String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim(); }

function computeSheetDiff(curCells, importedMap) {
  const cur = new Map(curCells.map((c) => [c.row + ":" + c.col, c.value == null ? "" : String(c.value)]));
  const changes = [];
  for (const [k, nv] of importedMap) {
    const ov = cur.get(k) ?? "";
    if (normVal(nv) !== normVal(ov)) {            // só conta se o conteúdo REAL mudou
      const [r, c] = k.split(":").map(Number);
      changes.push({ row: r, col: c, ref: colName(c) + r, old: ov, neu: String(nv), kind: ov.trim() === "" ? "add" : "chg" });
    }
  }
  changes.sort((a, b) => a.row - b.row || a.col - b.col);
  return changes;
}

function openExcelImport() {
  const input = h("input", { type: "file", accept: ".xlsx,.xls", style: { display: "none" } });
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files[0]; input.remove();
    if (!file) return;
    const loading = openModal("Lendo Excel", h("p", { class: "muted" }, "Processando o arquivo e comparando com o conteúdo atual…"), []);
    let parsed;
    try { parsed = await excel.parseXlsxFull(file); }   // ExcelJS: traz valores + formatação
    catch (e) { loading.close(); return toast("Não consegui ler o Excel: " + e.message, "err"); }
    const byName = new Map(App.sheets.map((s) => [s.name.trim(), s]));
    const results = []; const novas = [];
    for (const ps of parsed) {
      const sheet = byName.get(ps.name.trim());
      if (!sheet) { if (ps.cells.size) novas.push(ps); continue; }   // aba nova -> carga inicial
      const cur = await store.loadCells(sheet.id);
      const valMap = new Map([...ps.cells].map(([k, o]) => [k, o.value]));
      const changes = computeSheetDiff(cur, valMap);
      if (changes.length) results.push({ sheet, changes, curMap: new Map(cur.map((c) => [c.row + ":" + c.col, c])), fmtMap: ps.cells });
    }
    loading.close();
    if (!results.length && !novas.length) return toast("Nada para importar ou atualizar.");
    showDiffModal(results, novas);
  };
  input.click();
}

function showDiffModal(results, novas = []) {
  const total = results.reduce((n, r) => n + r.changes.length, 0);
  const onlyCarga = novas.length && !results.length;
  const body = h("div", { class: "scrollbody" });

  // ---- secao: abas novas (CARGA INICIAL, sem historico) ----
  const novaChecks = [];
  if (novas.length) {
    const sec = h("div", { class: "diff-sheet" });
    sec.appendChild(h("div", { class: "dh2" },
      h("strong", {}, novas.length === 1 ? "1 aba nova (carga, sem histórico)" : `${novas.length} abas novas (carga, sem histórico)`)));
    novas.forEach((ps) => {
      const cb = h("input", { type: "checkbox" }); cb.checked = true;
      novaChecks.push({ ps, input: cb });
      sec.appendChild(h("div", { class: "diff-row" }, cb,
        h("span", { class: "ref" }, "nova"),
        h("span", { class: "new", style: { flex: "1" } }, ps.name),
        h("span", { class: "count" }, ps.cells.size + " células")));
    });
    body.appendChild(sec);
  }

  const checks = [];
  results.forEach((res) => {
    const adds = res.changes.filter((c) => c.kind === "add").length;
    const chgs = res.changes.length - adds;
    const list = h("div", { class: "diff-list", style: { display: "none" } });
    const master = h("input", { type: "checkbox" }); master.checked = true;
    const header = h("div", { class: "dh2" },
      master, h("strong", {}, res.sheet.name),
      adds ? h("span", { class: "tag add" }, "+" + adds + " novas") : null,
      chgs ? h("span", { class: "tag chg" }, "~" + chgs + " alteradas") : null,
      h("span", { class: "count" }, res.changes.length + " ▾"));
    header.addEventListener("click", (e) => { if (e.target === master) return; list.style.display = list.style.display === "none" ? "block" : "none"; });
    res.changes.forEach((ch) => {
      const cb = h("input", { type: "checkbox" }); cb.checked = true;
      checks.push({ ch, sheet: res.sheet, input: cb, curMap: res.curMap, fmtMap: res.fmtMap });
      list.appendChild(h("div", { class: "diff-row" }, cb,
        h("span", { class: "ref" }, ch.ref),
        h("span", { class: "old" }, ch.old || "(vazio)"),
        h("span", { class: "arrow" }, "→"),
        h("span", { class: "new" }, ch.neu)));
    });
    master.addEventListener("change", () => list.querySelectorAll("input[type=checkbox]").forEach((i) => { i.checked = master.checked; }));
    body.appendChild(h("div", { class: "diff-sheet" }, header, list));
  });

  const scrim = h("div", { class: "scrim" });
  const apply = h("button", { class: "btn btn-primary" }, "Aplicar selecionadas");
  const foot = h("div", { class: "modal-foot" },
    h("button", { class: "btn btn-ghost", onClick: () => scrim.remove() }, "Cancelar"), apply);
  const parts = [];
  if (novas.length) parts.push(`${novas.length} aba(s) nova(s) (carga inicial, sem histórico)`);
  if (results.length) parts.push(`${total} alteração(ões) em ${results.length} aba(s) existente(s)`);
  const modal = h("div", { class: "modal wide" },
    h("h3", {}, onlyCarga ? "Carga inicial a partir do Excel" : "Importar / atualizar a partir do Excel"),
    h("p", { class: "muted", style: { margin: "0 0 10px" } }, `O arquivo traz ${parts.join(" e ")}. Nada muda até você confirmar.`),
    body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) scrim.remove(); });
  document.body.appendChild(scrim);

  apply.onclick = async () => {
    const sel = checks.filter((x) => x.input.checked);
    const selNovas = novaChecks.filter((x) => x.input.checked).map((x) => x.ps);
    if (!sel.length && !selNovas.length) return scrim.remove();
    apply.disabled = true; apply.textContent = "Aplicando…";
    const touched = new Set();

    // 1) abas novas: carga inicial (cria abas + células SEM histórico)
    if (selNovas.length) {
      apply.textContent = "Carregando abas…";
      try { await store.importWorkbook(selNovas, App.project, (msg) => { apply.textContent = msg; }); }
      catch (e) {
        toast("Erro na carga das abas novas: " + e.message, "err");
        apply.disabled = false; apply.textContent = "Aplicar selecionadas"; return;
      }
    }

    // 2) abas existentes: alterações (geram histórico)
    apply.textContent = "Aplicando…";
    const sheetMaxDims = new Map();
    for (const x of sel) {
      const ex = x.curMap.get(x.ch.row + ":" + x.ch.col);
      const imp = x.fmtMap && x.fmtMap.get(x.ch.row + ":" + x.ch.col);
      const fmt = imp ? imp.format : ((ex && ex.format) || {});   // aplica a formatação do Excel
      const dtype = (ex && ex.data_type === "status") || isStatusVal(x.ch.neu) ? "status" : (ex ? ex.data_type : "text");
      await store.saveCell(x.sheet.id, x.ch.row, x.ch.col, { value: x.ch.neu, data_type: dtype, format: fmt });
      touched.add(x.sheet.id);
      const d = sheetMaxDims.get(x.sheet.id) || { maxR: 0, maxC: 0, sheet: x.sheet };
      d.maxR = Math.max(d.maxR, x.ch.row);
      d.maxC = Math.max(d.maxC, x.ch.col);
      sheetMaxDims.set(x.sheet.id, d);
    }
    // Expande row_count/col_count se o Excel trouxe dados além dos limites atuais
    for (const [sheetId, d] of sheetMaxDims) {
      const patch = {};
      if (d.maxR > d.sheet.row_count) patch.row_count = d.maxR + 20;
      if (d.maxC > d.sheet.col_count) patch.col_count = d.maxC + 4;
      if (Object.keys(patch).length) await store.updateSheet(sheetId, patch);
    }
    scrim.remove();

    const msgs = [];
    if (selNovas.length) msgs.push(`${selNovas.length} aba(s) carregada(s)`);
    if (sel.length) msgs.push(`${sel.length} célula(s) atualizada(s)`);
    toast(msgs.join(" · ") || "Concluído.");
    touched.forEach((id) => bumpActivity(id));
    if (selNovas.length) {
      await refreshSheets();
      if (!App.sheet) { const first = App.sheets.find((s) => !s.hidden) || App.sheets[0]; if (first) selectSheet(first); }
    }
    if (App.sheet && touched.has(App.sheet.id)) await reloadCurrent();
  };
}

/* ============================ MODAIS / DRAWER ============================ */
function openModal(title, contentEl, buttons = [{ label: "Fechar", primary: true }]) {
  const scrim = h("div", { class: "scrim" });
  const foot = h("div", { class: "modal-foot" });
  const api = { close: () => scrim.remove() };
  buttons.forEach((b) => foot.appendChild(h("button", { class: "btn " + (b.primary ? "btn-primary" : "btn-ghost"), onClick: () => { b.onClick ? b.onClick(api) : api.close(); } }, b.label)));
  const modal = h("div", { class: "modal" }, h("h3", {}, title), contentEl, buttons.length ? foot : null);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) api.close(); });
  document.body.appendChild(scrim);
  return api;
}
function promptModal(title, label, initial = "") {
  return new Promise((resolve) => {
    const input = h("input", { class: "input", value: initial });
    const content = h("div", {}, h("div", { class: "field" }, h("label", {}, label), input));
    const api = openModal(title, content, [
      { label: "Cancelar", onClick: (a) => { a.close(); resolve(null); } },
      { label: "Salvar", primary: true, onClick: (a) => { a.close(); resolve(input.value.trim()); } },
    ]);
    setTimeout(() => { input.focus(); input.select(); }, 30);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { api.close(); resolve(input.value.trim()); } });
  });
}
function confirmModal(title, message) {
  return new Promise((resolve) => {
    openModal(title, h("p", { class: "muted" }, message), [
      { label: "Cancelar", onClick: (a) => { a.close(); resolve(false); } },
      { label: "Confirmar", primary: true, onClick: (a) => { a.close(); resolve(true); } },
    ]);
  });
}
function openDrawer(title, bodyEl) {
  document.querySelector(".drawer")?.remove();
  document.querySelector(".drawer-scrim")?.remove();
  const scrim = h("div", { class: "scrim drawer-scrim", style: { background: "transparent", backdropFilter: "none" } });
  const drawer = h("div", { class: "drawer" },
    h("div", { class: "dh" }, h("strong", {}, title), h("button", { class: "btn btn-icon btn-ghost", onClick: () => { drawer.remove(); scrim.remove(); } }, "✕")),
    bodyEl);
  scrim.addEventListener("mousedown", () => { drawer.remove(); scrim.remove(); });
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);
}

/* ============================ BUSCA GERAL (todas as abas) ============================ */
function closeDrawer() {
  document.querySelector(".drawer")?.remove();
  document.querySelector(".drawer-scrim")?.remove();
}
/* trecho com o termo realçado (e truncado em volta do 1º match, p/ células longas) */
function gsSnippet(value, term) {
  const s = String(value ?? "");
  const tl = term.toLowerCase();
  const idx = s.toLowerCase().indexOf(tl);
  let str = s, pre = "", post = "";
  if (s.length > 140 && idx >= 0) {
    const start = Math.max(0, idx - 40), end = Math.min(s.length, idx + term.length + 80);
    str = s.slice(start, end);
    if (start > 0) pre = "…";
    if (end < s.length) post = "…";
  }
  const low = str.toLowerCase();
  let out = "", i = 0;
  while (true) {
    const j = low.indexOf(tl, i);
    if (j < 0) { out += escapeHtml(str.slice(i)); break; }
    out += escapeHtml(str.slice(i, j)) + "<mark>" + escapeHtml(str.slice(j, j + term.length)) + "</mark>";
    i = j + term.length;
  }
  return pre + out + post;
}
function openGlobalSearch() {
  const input = h("input", { class: "input", type: "search", placeholder: "Buscar texto em todas as abas…" });
  const info = h("div", { class: "muted", style: { fontSize: "12px", margin: "2px 0 10px" } }, "Digite ao menos 2 caracteres.");
  const results = h("div", { class: "gsearch-results" });
  const body = h("div", { class: "db" }, h("div", { class: "field", style: { marginBottom: "6px" } }, input), info, results);
  const run = debounce(async () => {
    const term = input.value.trim();
    clear(results);
    if (term.length < 2) { info.textContent = "Digite ao menos 2 caracteres."; return; }
    info.textContent = "Buscando…";
    let rows;
    try { rows = await store.searchCells(term, App.sheets.map((s) => s.id)); }
    catch (e) { info.textContent = "Erro na busca: " + e.message; return; }
    if (input.value.trim() !== term) return;   // o usuário continuou digitando: descarta resultado antigo
    const byId = new Map(App.sheets.map((s) => [String(s.id), s]));
    const groups = new Map();
    for (const r of rows) {
      const sid = String(r.sheet_id);
      if (!byId.has(sid)) continue;
      if (!groups.has(sid)) groups.set(sid, []);
      groups.get(sid).push(r);
    }
    if (!groups.size) { info.textContent = `Nada encontrado para “${term}”.`; return; }
    const total = [...groups.values()].reduce((n, a) => n + a.length, 0);
    info.textContent = `${total} resultado(s) em ${groups.size} aba(s).`;
    const sids = [...groups.keys()].sort((a, b) => natCompare(byId.get(a).name, byId.get(b).name));
    for (const sid of sids) {
      const s = byId.get(sid);
      const matches = groups.get(sid).sort((a, b) => a.row - b.row || a.col - b.col);
      const area = sheetAreaText(s);
      const sec = h("div", { class: "gs-group" });
      sec.appendChild(h("div", { class: "gs-group-h" },
        h("span", { class: "gs-sheet" }, s.name),
        area ? h("span", { class: "gs-area" }, area) : null,
        h("span", { class: "gs-count" }, String(matches.length))));
      matches.slice(0, 60).forEach((r) => {
        sec.appendChild(h("div", { class: "gs-row", title: "Ir para " + colName(r.col) + r.row,
          onClick: () => { closeDrawer(); goToCell(App.project.id, sid, r.row, r.col); } },
          h("span", { class: "gs-ref" }, colName(r.col) + r.row),
          h("span", { class: "gs-snippet", html: gsSnippet(r.value, term) })));
      });
      if (matches.length > 60) sec.appendChild(h("div", { class: "muted", style: { fontSize: "11px", padding: "4px 10px" } }, `+${matches.length - 60} mais nesta aba`));
      results.appendChild(sec);
    }
  }, 220);
  input.addEventListener("input", run);
  openDrawer("Busca geral", body);
  setTimeout(() => input.focus(), 60);
}

/* ============================ CONFIGURAÇÃO / GERENCIAR LISTA ============================ */
function cfgItem(title, desc, fn) {
  return h("div", { class: "cfg-item", onClick: () => { closeDrawer(); fn(); } },
    h("div", { class: "cfg-ic" }, "≣"),
    h("div", {}, h("div", { class: "cfg-t" }, title), h("div", { class: "cfg-d" }, desc)));
}
function openConfig() {
  const body = h("div", { class: "db" });
  body.appendChild(h("p", { class: "muted", style: { fontSize: "12px", margin: "0 0 12px" } }, "Ajustes da planilha compartilhada (valem para todos)."));
  body.appendChild(cfgItem("Lista de Status", "Itens do dropdown de status e conversão de textos das células em itens da lista.", openListManager));
  body.appendChild(cfgItem("Lista de Empresas", "Empresas usadas no cruzamento Empresa × Status das abas (alimenta o Dashboard real).", openCompaniesManager));
  body.appendChild(cfgItem("Lista de Áreas", "Áreas padronizadas usadas como tags na tela Solicitações.", openAreasManager));
  body.appendChild(cfgItem("Conferir leitura das abas", "Mostra o que o parser entendeu de cada aba (empresa × status) antes do Dashboard usar.", openParserCheck));
  openDrawer("Configuração", body);
}

const STATUS_COLORS = [["recebido", "Verde"], ["pendente", "Amarelo"], ["analise", "Azul"], ["parcial", "Laranja"], ["na", "Cinza"]];
function colorSelect(val) {
  const sel = h("select", { class: "input lm-color" }, ...STATUS_COLORS.map(([k, l]) => h("option", { value: k }, l)));
  sel.value = val || "na";
  return sel;
}
/* re-renderiza a tela atual para refletir mudanças na lista (cores/itens) */
function refreshActiveView() {
  if (App.view === "dashboard") showDashboard();
  else if (App.sheet && App.grid) App.grid.render();
}

async function openListManager() {
  let opts = [], missing = false;
  try { opts = await store.loadStatusOptions(); }
  catch (_) { missing = true; }

  const scrim = h("div", { class: "scrim" });
  const close = () => scrim.remove();
  const body = h("div", { class: "scrollbody" });

  if (missing) {
    body.appendChild(h("div", { class: "lm-warn" },
      h("strong", {}, "Tabela ainda não criada."),
      h("p", { class: "muted", style: { margin: "8px 0 0" } },
        "Para a lista ficar compartilhada, rode o arquivo "), h("code", {}, "sql/15_status_options.sql"),
      h("span", { class: "muted" }, " no Supabase (SQL Editor). Até lá o app usa a lista padrão e o gerenciamento fica indisponível.")));
  } else {
    // ----- editor de itens -----
    const listBox = h("div", { class: "lm-list" });
    const itemRow = (o) => {
      const chip = h("span", { class: "chip " + (o.klass || "na") }, o.label);
      const label = h("input", { class: "input lm-label", value: o.label });
      const color = colorSelect(o.klass);
      const save = h("button", { class: "btn btn-sm", onClick: async () => {
        const nl = label.value.trim(); if (!nl) return toast("O nome não pode ficar vazio.");
        try {
          const saved = await store.upsertStatusOption({ id: o.id, label: nl, klass: color.value, position: o.position });
          Object.assign(o, saved); chip.textContent = saved.label; chip.className = "chip " + (saved.klass || "na");
          await reloadStatusOptions(); refreshActiveView(); toast("Item salvo.");
        } catch (e) { toast("Erro ao salvar: " + (e.message || e), "err"); }
      } }, "Salvar");
      const del = h("button", { class: "btn btn-ghost btn-sm", title: "Remover item", onClick: async () => {
        if (!(await confirmModal("Remover item", `Remover "${o.label}" da lista? As células que já usam esse valor continuam como estão.`))) return;
        try { await store.deleteStatusOption(o.id); opts = opts.filter((x) => x.id !== o.id); renderItems(); await reloadStatusOptions(); refreshActiveView(); }
        catch (e) { toast("Erro ao remover: " + (e.message || e), "err"); }
      } }, "✕");
      return h("div", { class: "lm-row" }, chip, label, color, save, del);
    };
    const renderItems = () => {
      clear(listBox);
      if (!opts.length) listBox.appendChild(h("p", { class: "muted" }, "Nenhum item. Adicione abaixo."));
      opts.forEach((o) => listBox.appendChild(itemRow(o)));
    };
    renderItems();
    const addBtn = h("button", { class: "btn btn-primary btn-sm", onClick: async () => {
      try { const saved = await store.upsertStatusOption({ label: "Novo item", klass: "na", position: opts.length + 1 }); opts.push(saved); renderItems(); await reloadStatusOptions(); }
      catch (e) { toast("Erro ao adicionar: " + (e.message || e), "err"); }
    } }, "＋ Adicionar item");
    body.appendChild(h("div", { class: "lm-card" },
      h("h4", {}, "Itens da lista"),
      h("p", { class: "muted", style: { margin: "0 0 10px", fontSize: "12px" } }, "Nome e cor de cada item do dropdown de status. Vale para toda a planilha."),
      listBox, h("div", { style: { marginTop: "10px" } }, addBtn)));

    // ----- conversor (substituir) -----
    body.appendChild(buildConverter(opts));
  }

  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-primary", onClick: close }, "Fechar"));
  const modal = h("div", { class: "modal wide" }, h("h3", {}, "Lista de Status"), body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
}

/* ---- Lista de Empresas ---- */
async function openCompaniesManager() {
  let list = [], missing = false;
  try { list = await store.loadCompanies(); } catch (_) { missing = true; }
  const scrim = h("div", { class: "scrim" });
  const close = () => scrim.remove();
  const body = h("div", { class: "scrollbody" });

  if (missing) {
    body.appendChild(h("div", { class: "lm-warn" },
      h("strong", {}, "Tabela ainda não criada."),
      h("p", { class: "muted", style: { margin: "8px 0 0" } }, "Rode "), h("code", {}, "sql/16_companies.sql"),
      h("span", { class: "muted" }, " no Supabase (SQL Editor) para habilitar a Lista de Empresas.")));
  } else {
    const listBox = h("div", { class: "lm-list" });
    const detectBox = h("div", { class: "lm-detect" });
    const row = (o) => {
      const label = h("input", { class: "input lm-label", value: o.label });
      const save = h("button", { class: "btn btn-sm", onClick: async () => {
        const nl = label.value.trim(); if (!nl) return toast("O nome não pode ficar vazio.");
        try { const saved = await store.upsertCompany({ id: o.id, label: nl, position: o.position }); Object.assign(o, saved); await reloadCompanies(); toast("Empresa salva."); }
        catch (e) { toast("Erro ao salvar: " + (e.message || e), "err"); }
      } }, "Salvar");
      const del = h("button", { class: "btn btn-ghost btn-sm", title: "Remover", onClick: async () => {
        if (!(await confirmModal("Remover empresa", `Remover "${o.label}" da lista?`))) return;
        try { await store.deleteCompany(o.id); list = list.filter((x) => x.id !== o.id); render(); await reloadCompanies(); }
        catch (e) { toast("Erro ao remover: " + (e.message || e), "err"); }
      } }, "✕");
      return h("div", { class: "lm-row" }, label, save, del);
    };
    const render = () => {
      clear(listBox);
      if (!list.length) listBox.appendChild(h("p", { class: "muted" }, "Nenhuma empresa ainda. Use “Detectar das abas” ou adicione manualmente."));
      list.forEach((o) => listBox.appendChild(row(o)));
    };
    render();
    const addBtn = h("button", { class: "btn btn-primary btn-sm", onClick: async () => {
      try { const saved = await store.upsertCompany({ label: "Nova empresa", position: list.length + 1 }); list.push(saved); render(); await reloadCompanies(); }
      catch (e) { toast("Erro ao adicionar: " + (e.message || e), "err"); }
    } }, "＋ Adicionar empresa");
    const detectBtn = h("button", { class: "btn btn-sm", onClick: () => detectFlow() }, "🔍 Detectar das abas");

    async function detectFlow() {
      clear(detectBox);
      detectBox.appendChild(h("div", { class: "muted", style: { fontSize: "12px", margin: "6px 0" } }, "Varrendo as abas…"));
      detectBox.appendChild(h("div", { class: "spinner", style: { margin: "10px auto" } }));
      let cand;
      try { cand = await detectCompanyCandidates(); }
      catch (e) { clear(detectBox); detectBox.appendChild(h("p", { class: "muted" }, "Erro na detecção: " + e.message)); return; }
      const have = new Set(list.map((x) => x.label.toLowerCase()));
      cand = cand.filter((x) => !have.has(x.label.toLowerCase())).slice(0, 30);
      clear(detectBox);
      if (!cand.length) { detectBox.appendChild(h("p", { class: "muted" }, "Nenhuma empresa nova detectada.")); return; }
      detectBox.appendChild(h("p", { class: "muted", style: { fontSize: "12px", margin: "0 0 8px" } }, "Marque as que são empresas e clique em adicionar:"));
      const checks = [];
      cand.forEach((c) => {
        const cb = h("input", { type: "checkbox", checked: c.sheets >= 2 });
        checks.push({ cb, label: c.label });
        detectBox.appendChild(h("label", { class: "lm-detect-row" }, cb,
          h("span", { class: "lm-detect-lbl" }, c.label),
          h("span", { class: "muted", style: { fontSize: "11px" } }, `${c.sheets} aba(s) · ${c.count}×`)));
      });
      detectBox.appendChild(h("button", { class: "btn btn-primary btn-sm", style: { marginTop: "10px" }, onClick: async () => {
        const sel = checks.filter((x) => x.cb.checked).map((x) => x.label);
        if (!sel.length) return toast("Marque ao menos uma.");
        try { await store.addCompanies(sel); list = await store.loadCompanies(); render(); await reloadCompanies(); clear(detectBox); toast(`${sel.length} empresa(s) adicionada(s).`); }
        catch (e) { toast("Erro ao adicionar: " + (e.message || e), "err"); }
      } }, "Adicionar selecionadas"));
    }

    body.appendChild(h("div", { class: "lm-card" },
      h("h4", {}, "Empresas"),
      h("p", { class: "muted", style: { margin: "0 0 10px", fontSize: "12px" } }, "Nomes exatamente como aparecem nas abas (cabeçalho de coluna ou coluna “Empresa”). Alimentam o cruzamento Empresa × Status."),
      listBox,
      h("div", { style: { marginTop: "10px", display: "flex", gap: "8px" } }, addBtn, detectBtn),
      detectBox));
  }

  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-primary", onClick: close }, "Fechar"));
  const modal = h("div", { class: "modal wide" }, h("h3", {}, "Lista de Empresas"), body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
}

/* varre todas as abas e propõe candidatos a empresa: rótulos que aparecem como
   CABEÇALHO acima de células de status (matriz) ou repetidos na LINHA de células
   de status (lista). Ranqueia por nº de abas e frequência. O usuário revisa. */
async function detectCompanyCandidates() {
  const STOP = new Set(["#", "empresa", "evidências", "evidencias", "status", "responsável", "responsavel",
    "solicitação", "solicitacao", "área", "area", "scot", "client portal", "sheet", "ok", "grupo equatorial",
    "qtd. de itens", "área eqtl", "area eqtl", "data da solicitação", "deadline", "total"]);
  const statusSet = new Set(getStatusOptions().map((s) => s.toLowerCase()));
  const counts = new Map();   // label -> { count, sheets:Set }
  const bump = (label, sid) => {
    const key = label.trim();
    const low = key.toLowerCase();
    if (!key || key.length < 2 || key.length > 24) return;
    if (STOP.has(low) || statusSet.has(low)) return;
    if (/^-?\d[\d.,/-]*$/.test(key)) return;   // números/datas
    if (!counts.has(key)) counts.set(key, { count: 0, sheets: new Set() });
    const e = counts.get(key); e.count++; e.sheets.add(sid);
  };
  const txt = (c) => (c && c.value != null ? String(c.value).trim() : "");
  const isStatus = (c) => c && c.data_type === "status";
  for (const s of App.sheets) {
    if (s.kind === "index") continue;
    let cells;
    try { cells = await store.loadCells(s.id); } catch (_) { continue; }
    const map = new Map(cells.map((c) => [c.row + ":" + c.col, c]));
    for (const c of cells) {
      if (!isStatus(c)) continue;
      // matriz: cabeçalho da coluna (1ª célula de texto não-status acima)
      for (let r = c.row - 1; r >= 1 && r >= c.row - 10; r--) {
        const hd = map.get(r + ":" + c.col);
        if (hd && !isStatus(hd) && txt(hd)) { bump(txt(hd), s.id); break; }
      }
      // lista: todos os rótulos de texto à esquerda na mesma linha (o repetido = empresa)
      for (let cc = c.col - 1; cc >= 1 && cc >= c.col - 8; cc--) {
        const l = map.get(c.row + ":" + cc);
        if (l && !isStatus(l) && txt(l)) bump(txt(l), s.id);
      }
    }
  }
  return [...counts.entries()]
    .map(([label, v]) => ({ label, count: v.count, sheets: v.sheets.size }))
    .sort((a, b) => b.sheets - a.sheets || b.count - a.count);
}

/* ---- Conferir leitura das abas (validação do parser) ---- */
async function openParserCheck() {
  const comps = getCompanies();
  if (!comps.length) { toast("Cadastre as empresas primeiro (Configuração → Lista de Empresas).", "err"); return; }
  const scrim = h("div", { class: "scrim" });
  const close = () => scrim.remove();
  const summary = h("div", { class: "muted", style: { fontSize: "12px", margin: "0 0 10px" } }, "Lendo abas…");
  const listEl = h("div", { class: "pc-list" });
  const body = h("div", { class: "scrollbody" }, summary, listEl);
  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-primary", onClick: close }, "Fechar"));
  const modal = h("div", { class: "modal wide" }, h("h3", {}, "Conferir leitura das abas"), body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);

  let recognized = 0, none = 0, totalSoFar = 0;
  const out = await parseAbas(App.sheets, (id) => store.loadCells(id), comps, getStatusOptions(),
    (done, total, s, res) => {
      if (res.orientation === "none") none++; else recognized++;
      totalSoFar += res.records.length;
      const perStatus = new Map();
      for (const rec of res.records) perStatus.set(rec.status, (perStatus.get(rec.status) || 0) + 1);
      listEl.appendChild(pcRow(s, res, perStatus));
      summary.textContent = `Lendo… ${done}/${total} · ${recognized} reconhecida(s), ${none} não · ${totalSoFar} registros`;
    });
  const statusParts = [...out.byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · ");
  summary.innerHTML = `<b>${out.total}</b> registros · ${recognized} aba(s) reconhecida(s), ${none} não reconhecida(s).` + (statusParts ? `<br>${escapeHtml(statusParts)}` : "");
}
function pcRow(s, res, perStatus) {
  const badge = res.orientation === "matrix" ? "Matriz" : res.orientation === "list" ? "Lista" : "—";
  const chips = h("div", { class: "pc-chips" });
  [...perStatus.entries()].forEach(([k, v]) => chips.appendChild(h("span", { class: "chip " + (statusClassFor(k) || "na") }, `${k} ${v}`)));
  return h("div", { class: "pc-item " + (res.orientation === "none" ? "pc-none" : "pc-ok") },
    h("div", { class: "pc-head" },
      h("span", { class: "pc-name" }, s.name),
      h("span", { class: "pc-orient" }, badge),
      h("span", { class: "pc-count" }, res.orientation === "none" ? "não reconhecida" : `${res.records.length} reg · ${res.companies.length} empresas`)),
    res.records.length ? chips : null);
}

function buildConverter(opts) {
  const card = h("div", { class: "lm-card" });
  const findInput = h("input", { class: "input", placeholder: "Texto exato a procurar (ex.: NA)" });
  const targetSel = h("select", { class: "input" }, ...opts.map((o) => h("option", { value: o.label }, o.label)));
  const findBtn = h("button", { class: "btn", onClick: () => doFind() }, "Procurar");
  const previewBox = h("div", { class: "lm-preview" });
  const applyBtn = h("button", { class: "btn btn-primary", disabled: true, onClick: () => doApply() }, "Substituir selecionadas");
  const allCb = h("input", { type: "checkbox", checked: true });
  const allRow = h("label", { class: "lm-allrow", hidden: true }, allCb, h("span", {}, "Marcar / desmarcar todas"));
  let checks = [];
  const leftStr = (rec) => { const v = rec && rec.value != null ? String(rec.value) : ""; return v === "" ? "·" : v; };

  async function doFind() {
    const text = findInput.value;   // EXATO (sem trim)
    clear(previewBox); checks = []; applyBtn.disabled = true; allRow.hidden = true;
    if (!text) { previewBox.appendChild(h("p", { class: "muted" }, "Digite o texto exato a procurar.")); return; }
    previewBox.appendChild(h("div", { class: "spinner", style: { margin: "20px auto" } }));
    let rows;
    try { rows = await store.searchCellsExact(text, App.sheets.map((s) => s.id)); }
    catch (e) { clear(previewBox); previewBox.appendChild(h("p", { class: "muted" }, "Erro na busca: " + e.message)); return; }
    const byId = new Map(App.sheets.map((s) => [String(s.id), s]));
    const groups = new Map();
    for (const r of rows) { const sid = String(r.sheet_id); if (!byId.has(sid)) continue; if (!groups.has(sid)) groups.set(sid, []); groups.get(sid).push(r); }
    clear(previewBox);
    if (!groups.size) { previewBox.appendChild(h("p", { class: "muted" }, `Nenhuma célula com exatamente “${text}”.`)); return; }
    const total = [...groups.values()].reduce((n, a) => n + a.length, 0);
    allRow.hidden = false;
    previewBox.appendChild(h("div", { class: "muted", style: { fontSize: "12px", margin: "0 0 8px" } },
      `${total} célula(s) em ${groups.size} aba(s). Confira a posição (coluna à esquerda e à direita) antes de aplicar.`));
    const sids = [...groups.keys()].sort((a, b) => natCompare(byId.get(a).name, byId.get(b).name));
    for (const sid of sids) {
      const s = byId.get(sid);
      const matches = groups.get(sid).sort((a, b) => a.row - b.row || a.col - b.col);
      let cmap;
      try { const cells = await store.loadCells(sid); cmap = new Map(cells.map((c) => [c.row + ":" + c.col, c])); }
      catch (_) { cmap = new Map(); }
      const sec = h("div", { class: "lm-pv-group" });
      sec.appendChild(h("div", { class: "lm-pv-h" }, h("span", { class: "gs-sheet" }, s.name),
        sheetAreaText(s) ? h("span", { class: "gs-area" }, sheetAreaText(s)) : null,
        h("span", { class: "gs-count" }, String(matches.length))));
      matches.forEach((m) => {
        const cb = h("input", { type: "checkbox", checked: true });
        checks.push({ sid, row: m.row, col: m.col, cb, fmt: (cmap.get(m.row + ":" + m.col) || {}).format || {} });
        sec.appendChild(h("div", { class: "lm-pv-row" }, cb,
          h("span", { class: "lm-ref" }, colName(m.col) + m.row),
          h("span", { class: "lm-side", title: "coluna à esquerda" }, leftStr(cmap.get(m.row + ":" + (m.col - 1)))),
          h("span", { class: "lm-mid" }, m.value),
          h("span", { class: "lm-side", title: "coluna à direita" }, leftStr(cmap.get(m.row + ":" + (m.col + 1))))));
      });
      previewBox.appendChild(sec);
    }
    applyBtn.disabled = false;
    allCb.checked = true;
    allCb.onchange = () => { checks.forEach((x) => { x.cb.checked = allCb.checked; }); };
  }

  async function doApply() {
    const target = targetSel.value;
    if (!target) return toast("Crie ao menos um item na lista.");
    const sel = checks.filter((x) => x.cb.checked);
    if (!sel.length) return toast("Selecione ao menos uma célula.");
    if (!(await confirmModal("Confirmar substituição", `Trocar ${sel.length} célula(s) por “${target}” e transformar em lista (dropdown)? Gera histórico e pode ser desfeito célula a célula.`))) return;
    applyBtn.disabled = true; applyBtn.textContent = "Aplicando…";
    let n = 0; const touched = new Set();
    for (const x of sel) {
      try { await store.saveCell(x.sid, x.row, x.col, { value: target, data_type: "status", format: x.fmt }); n++; touched.add(x.sid); }
      catch (_) {}
    }
    touched.forEach((id) => bumpActivity(id));
    toast(`${n} célula(s) substituída(s).`);
    applyBtn.textContent = "Substituir selecionadas";
    if (App.sheet && touched.has(String(App.sheet.id))) await reloadCurrent();
    doFind();   // o texto antigo já não existe: atualiza o preview
  }

  card.appendChild(h("h4", {}, "Converter texto em item da lista"));
  card.appendChild(h("p", { class: "muted", style: { margin: "0 0 10px", fontSize: "12px" } },
    "Procura em TODAS as abas as células com o texto exato (diferencia maiúscula/minúscula, acento e pontuação) e troca pelo item escolhido, virando célula de lista (dropdown)."));
  card.appendChild(h("div", { class: "lm-conv-ctrls" },
    h("div", { class: "field", style: { flex: "1", marginBottom: "0" } }, h("label", {}, "Texto na célula"), findInput),
    h("div", { class: "field", style: { flex: "1", marginBottom: "0" } }, h("label", {}, "Vira o item"), targetSel),
    findBtn));
  card.appendChild(allRow);
  card.appendChild(previewBox);
  card.appendChild(h("div", { class: "lm-apply" }, applyBtn));
  return card;
}

/* ---- Lista de Áreas ---- */
async function openAreasManager() {
  let list = [], missing = false;
  try { list = await store.loadAreas(); } catch (_) { missing = true; }
  const scrim = h("div", { class: "scrim" });
  const close = () => scrim.remove();
  const body = h("div", { class: "scrollbody" });
  if (missing) {
    body.appendChild(h("div", { class: "lm-warn" }, h("strong", {}, "Tabela ainda não criada."),
      h("p", { class: "muted", style: { margin: "8px 0 0" } }, "Rode "), h("code", {}, "sql/17_solicitacoes.sql"),
      h("span", { class: "muted" }, " no Supabase para habilitar as Áreas.")));
  } else {
    const listBox = h("div", { class: "lm-list" });
    const row = (o) => {
      const label = h("input", { class: "input lm-label", value: o.label });
      const save = h("button", { class: "btn btn-sm", onClick: async () => {
        const nl = label.value.trim(); if (!nl) return toast("O nome não pode ficar vazio.");
        try { const s = await store.upsertArea({ id: o.id, label: nl, position: o.position }); Object.assign(o, s); await reloadAreas(); toast("Área salva."); }
        catch (e) { toast("Erro ao salvar: " + (e.message || e), "err"); }
      } }, "Salvar");
      const del = h("button", { class: "btn btn-ghost btn-sm", title: "Remover", onClick: async () => {
        if (!(await confirmModal("Remover área", `Remover "${o.label}"?`))) return;
        try { await store.deleteArea(o.id); list = list.filter((x) => x.id !== o.id); render(); await reloadAreas(); }
        catch (e) { toast("Erro ao remover: " + (e.message || e), "err"); }
      } }, "✕");
      return h("div", { class: "lm-row" }, h("span", { class: "badge " + areaBadge(o.label) }, o.label), label, save, del);
    };
    const render = () => { clear(listBox); if (!list.length) listBox.appendChild(h("p", { class: "muted" }, "Nenhuma área ainda. São semeadas ao abrir a tela Solicitações, ou adicione aqui.")); list.forEach((o) => listBox.appendChild(row(o))); };
    render();
    const addBtn = h("button", { class: "btn btn-primary btn-sm", onClick: async () => {
      try { const s = await store.upsertArea({ label: "Nova área", position: list.length + 1 }); list.push(s); render(); await reloadAreas(); }
      catch (e) { toast("Erro ao adicionar: " + (e.message || e), "err"); }
    } }, "＋ Adicionar área");
    body.appendChild(h("div", { class: "lm-card" }, h("h4", {}, "Áreas"),
      h("p", { class: "muted", style: { margin: "0 0 10px", fontSize: "12px" } }, "Tags padronizadas de Área usadas na tela Solicitações (multi-seleção)."),
      listBox, h("div", { style: { marginTop: "10px" } }, addBtn)));
  }
  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-primary", onClick: close }, "Fechar"));
  const modal = h("div", { class: "modal wide" }, h("h3", {}, "Lista de Áreas"), body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
}

/* ============================ TELA-TABELA SOLICITAÇÕES ============================ */
const BADGE_COLORS = ["blue", "green", "yellow", "orange", "purple", "teal", "gray"];
function hashColor(s) { let n = 0; for (const ch of String(s || "")) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return BADGE_COLORS[n % BADGE_COLORS.length]; }
function areaBadge(label) { return hashColor(label); }
function solicHay(r) { return [(r.area || []).join(" "), r.scot, r.client_portal, r.data_solicitacao, r.deadline, r.sheet_link, r.area_eqtl, r.responsavel].join(" ").toLowerCase(); }
function solicSave(row, patch) { Object.assign(row, patch); store.updateSolicitacao(row.id, patch).catch((e) => toast("Falha ao salvar: " + e.message, "err")); }

function closePopover() { document.querySelector(".dd-pop")?.remove(); if (App._popClose) { document.removeEventListener("mousedown", App._popClose); App._popClose = null; } }
function showPopover(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 290)) + "px";
  pop.style.top = (r.bottom + 4) + "px";
  document.body.appendChild(pop);
  const close = (e) => { if (!pop.contains(e.target)) closePopover(); };
  App._popClose = close;
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

/* counts de status por aba, a partir do parser (cacheado em App._abaCounts) */
async function computeAbaStatusCounts() {
  const out = await parseAbas(App.sheets, (id) => store.loadCells(id), getCompanies(), getStatusOptions());
  const m = new Map();
  for (const { sheet, res } of out.perSheet) {
    const byS = new Map();
    for (const rec of res.records) byS.set(rec.status, (byS.get(rec.status) || 0) + 1);
    m.set(String(sheet.name || "").trim(), byS);
  }
  return m;
}

/* semeia a tabela solicitacoes a partir da aba índice (1ª abertura) */
async function seedSolicitacoes() {
  const idxRows = await store.readIndexRows(App.project, App.sheets);
  if (!idxRows.length) return [];
  const abaByKey = new Map(App.sheets.filter((s) => !isSolicIndex(s)).map((s) => [String(s.name).trim().toLowerCase(), s.name]));
  const cleanFirst = (v) => String(v || "").trim().split(/\s+/)[0].toLowerCase();
  const seedAreas = new Set();
  const toInsert = idxRows.map((r, i) => {
    let link = "";
    const k1 = cleanFirst(r.sheet), k2 = String(r.sheet || "").trim().toLowerCase();
    if (k2 && abaByKey.has(k2)) link = abaByKey.get(k2);
    else if (k1 && abaByKey.has(k1)) link = abaByKey.get(k1);
    if (r.area) seedAreas.add(r.area);
    return { area: r.area ? [r.area] : [], scot: r.scot, client_portal: r.client_portal,
      data_solicitacao: r.data_solicitacao, deadline: r.deadline, sheet_link: link,
      area_eqtl: r.area_eqtl, responsavel: r.responsavel, position: i + 1 };
  });
  try { await store.insertSolicitacoes(toInsert, App.project); } catch (e) { toast("Erro ao semear: " + e.message, "err"); }
  try { await store.addAreas([...seedAreas]); await reloadAreas(); } catch (_) {}
  try { return await store.loadSolicitacoes(App.project); } catch (_) { return []; }
}

async function showSolicitacoes() {
  if (!App.project) return;
  App.view = "solic";
  App.sheet = null;
  setLoc({ projectId: App.project?.id, projectName: App.project?.name, view: "solicitacoes" });
  renderSidebar();
  renderAppPresence(); updateCellPresence();
  document.querySelectorAll(".side-nav-item.active").forEach((e) => e.classList.remove("active"));
  $("#nav-solic")?.classList.add("active");
  { const cr = $("#crumb"); if (cr) { clear(cr); cr.appendChild(h("span", { class: "crumb-name" }, "Solicitações")); } }
  const tb = document.querySelector(".toolbar"); if (tb) tb.style.display = "none";
  rt.unsubscribeDB(); rt.leavePresence();
  const gs = $("#grid-scroll"); clear(gs); gs.classList.remove("dash"); gs.classList.add("solic");
  const wrap = h("div", { class: "solic-host" });
  wrap.appendChild(h("div", { class: "spinner", style: { margin: "50px auto" } }));
  gs.appendChild(wrap);

  let rows;
  try { rows = await store.loadSolicitacoes(App.project); }
  catch (e) { clear(wrap); wrap.appendChild(solicMissingNotice()); return; }
  if (App.view !== "solic") return;
  if (!rows.length) rows = await seedSolicitacoes();
  if (!App._abaCounts) { try { App._abaCounts = await computeAbaStatusCounts(); } catch (_) { App._abaCounts = new Map(); } }
  if (App.view !== "solic") return;
  App._solicRows = rows;
  clear(wrap);
  App._solicCtx = buildSolicCtx();
  openSolic(wrap, App._solicCtx);
}

function buildSolicCtx() {
  const abas = App.sheets.filter((s) => !isSolicIndex(s)).map((s) => ({ name: s.name, sub: sheetAreaText(s) }));
  const syncRows = () => { if (App._solicCtx) App._solicCtx.rows = App._solicRows; refreshSolic(); };
  return {
    rows: App._solicRows, abas,
    areas: (App.areas || []).map((a) => a.label),
    statusOptions: getStatusOptions(),
    abaCounts: App._abaCounts || new Map(),
    onEdit: (row, patch) => { Object.assign(row, patch); store.updateSolicitacao(row.id, patch).catch((e) => toast("Falha ao salvar: " + e.message, "err")); },
    onAdd: async () => { try { const r = await store.insertSolicitacao({ area: [], position: App._solicRows.length + 1 }, App.project); App._solicRows.push(r); syncRows(); } catch (e) { toast("Erro ao adicionar: " + (e.message || e), "err"); } },
    onDelete: async (row) => { if (!(await confirmModal("Excluir linha", "Excluir esta linha? (não afeta a aba original)"))) return; try { await store.deleteSolicitacao(row.id); App._solicRows = App._solicRows.filter((x) => x.id !== row.id); syncRows(); } catch (e) { toast("Erro: " + (e.message || e), "err"); } },
    onDeleteMany: async (ids) => { if (!(await confirmModal("Excluir", `Excluir ${ids.length} linha(s)?`))) return; for (const id of ids) { try { await store.deleteSolicitacao(id); } catch (_) {} } App._solicRows = App._solicRows.filter((x) => !ids.includes(x.id)); syncRows(); },
    onGoAba: (name) => { const s = App.sheets.find((x) => String(x.name) === String(name)) || App.sheets.find((x) => String(x.name).trim() === String(name).trim()); if (s) goSheet(App.project.id, s.id); },
    onGoOriginal: openOriginalSolic,
    onRecount: async () => { App._abaCounts = await computeAbaStatusCounts(); if (App._solicCtx) App._solicCtx.abaCounts = App._abaCounts; },
    onAddArea: async (label) => { try { await store.addAreas([label]); await reloadAreas(); if (App._solicCtx) App._solicCtx.areas = (App.areas || []).map((a) => a.label); } catch (_) {} },
  };
}

function solicMissingNotice() {
  return h("div", { class: "lm-warn", style: { margin: "30px" } },
    h("strong", {}, "Tabela ainda não criada."),
    h("p", { class: "muted", style: { margin: "8px 0 0" } }, "Rode "), h("code", {}, "sql/17_solicitacoes.sql"),
    h("span", { class: "muted" }, " no Supabase (SQL Editor) para habilitar a tela Solicitações."));
}

function renderSolicTable(wrap) {
  clear(wrap);
  const statuses = [...getStatusOptions()];
  const search = h("input", { id: "solic-busca", type: "search", placeholder: "Buscar…", value: App._solicQuery || "",
    oninput: (e) => { App._solicQuery = e.target.value; renderSolicBody(); } });
  const count = h("span", { class: "count", id: "solic-count" }, "");
  const bar = h("div", { class: "cmdbar" },
    h("div", { class: "search" }, h("span", { class: "s-ic", html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' }), search),
    count,
    h("div", { class: "spacer", style: { flex: 1 } }),
    h("button", { class: "btn btn-light btn-sm", onClick: openOriginalSolic }, "Ver aba original"),
    h("button", { class: "btn btn-light btn-sm", title: "Recalcular contagens (parser)", onClick: async () => { App._abaCounts = await computeAbaStatusCounts(); renderSolicBody(); toast("Contagens atualizadas."); } }, "↻ Status"),
    h("button", { class: "btn btn-primary btn-sm", onClick: addSolicRow }, "＋ Linha"));

  const tableWrap = h("div", { class: "table-wrap" });
  const table = h("table", { class: "grade" });
  const cg = h("colgroup");
  [48, 220, 210, 240, 96, 96, 120, 160, 170].forEach((w) => cg.appendChild(h("col", { style: { width: w + "px" } })));
  statuses.forEach(() => cg.appendChild(h("col", { style: { width: "66px" } })));
  table.appendChild(cg);
  const thLab = (t) => h("th", { class: "th-col" }, h("span", { class: "th-lab" }, t));
  const trh = h("tr", {}, h("th", { class: "th-num" }, "#"),
    thLab("Área"), thLab("Scot"), thLab("Client Portal"), thLab("Data"), thLab("Deadline"), thLab("Aba"), thLab("Área EQTL"), thLab("Responsável"));
  statuses.forEach((st) => trh.appendChild(h("th", { class: "th-st" }, h("span", { class: "chip " + (statusClassFor(st) || "na") }, st))));
  table.appendChild(h("thead", {}, trh));
  const tbody = h("tbody", { id: "solic-body" });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(bar);
  wrap.appendChild(tableWrap);
  App._solicTbody = tbody;
  renderSolicBody();
}

function renderSolicBody() {
  const tbody = App._solicTbody; if (!tbody) return;
  clear(tbody);
  const statuses = [...getStatusOptions()];
  const q = (App._solicQuery || "").trim().toLowerCase();
  let rows = App._solicRows || [];
  if (q) rows = rows.filter((r) => solicHay(r).includes(q));
  const cnt = $("#solic-count");
  if (cnt) cnt.textContent = q ? `${rows.length} de ${(App._solicRows || []).length}` : `${(App._solicRows || []).length} registros`;
  rows.forEach((r, i) => {
    const tr = h("tr", {});
    tr.appendChild(h("td", { class: "td-num" },
      h("span", { class: "row-n" }, String(i + 1)),
      h("button", { class: "row-del", title: "Excluir linha", onClick: (e) => { e.stopPropagation(); delSolicRow(r); } }, "✕")));
    tr.appendChild(areaCell(r));
    ["scot", "client_portal", "data_solicitacao", "deadline"].forEach((f) => tr.appendChild(textCell(r, f)));
    tr.appendChild(abaCell(r));
    ["area_eqtl", "responsavel"].forEach((f) => tr.appendChild(textCell(r, f)));
    const link = String(r.sheet_link || "").trim();
    const cmap = App._abaCounts ? App._abaCounts.get(link) : null;
    statuses.forEach((st) => { const n = cmap ? (cmap.get(st) || 0) : 0; tr.appendChild(h("td", { class: "td-st" }, n ? String(n) : h("span", { class: "cell-empty" }, "·"))); });
    tbody.appendChild(tr);
  });
  if (!rows.length) tbody.appendChild(h("tr", {}, h("td", { class: "sc-empty", colspan: String(9 + statuses.length) }, q ? "Nada encontrado." : "Sem solicitações.")));
}

function textCell(row, field) {
  const td = h("td", { class: "sc-edit" });
  const paint = () => { clear(td); if (row[field]) td.appendChild(document.createTextNode(row[field])); else td.appendChild(h("span", { class: "cell-empty" }, "—")); };
  paint();
  td.onclick = () => {
    if (td.querySelector("input")) return;
    const inp = h("input", { class: "sc-input", value: row[field] || "" });
    clear(td); td.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const finish = (commit) => { if (done) return; done = true; if (commit && inp.value.trim() !== (row[field] || "")) solicSave(row, { [field]: inp.value.trim() }); paint(); };
    inp.addEventListener("blur", () => finish(true));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } else if (e.key === "Escape") { finish(false); } });
  };
  return td;
}

function areaCell(row) {
  const td = h("td", { class: "sc-edit sc-area" });
  const paint = () => {
    clear(td);
    const chips = h("div", { class: "cell-chips" });
    (row.area || []).forEach((a) => chips.appendChild(h("span", { class: "badge " + areaBadge(a) }, a)));
    if (!(row.area || []).length) chips.appendChild(h("span", { class: "cell-empty" }, "—"));
    td.appendChild(chips);
  };
  paint();
  td.onclick = (e) => { e.stopPropagation(); openAreaDropdown(td, row, paint); };
  return td;
}

function openAreaDropdown(anchor, row, paint) {
  closePopover();
  const pop = h("div", { class: "dd-pop" });
  const listEl = h("div", { class: "dd-list" });
  const sel = new Set(row.area || []);
  const labels = (App.areas || []).map((a) => a.label);
  (row.area || []).forEach((a) => { if (!labels.includes(a)) labels.push(a); });
  const checks = [];
  const addOpt = (label, checked) => { const cb = h("input", { type: "checkbox", checked: checked }); checks.push({ cb, label }); listEl.appendChild(h("label", { class: "dd-opt" }, cb, h("span", { class: "badge " + areaBadge(label) }, label))); };
  labels.forEach((l) => addOpt(l, sel.has(l)));
  const newInp = h("input", { class: "sc-input", placeholder: "+ nova área" });
  const addNew = h("button", { class: "btn btn-light btn-sm", onClick: async () => {
    const v = newInp.value.trim(); if (!v) return;
    try { await store.addAreas([v]); await reloadAreas(); } catch (_) {}
    addOpt(v, true); newInp.value = "";
  } }, "Adicionar");
  const apply = h("button", { class: "btn btn-primary btn-sm", onClick: () => { solicSave(row, { area: checks.filter((x) => x.cb.checked).map((x) => x.label) }); paint(); closePopover(); } }, "Pronto");
  pop.appendChild(listEl);
  pop.appendChild(h("div", { class: "dd-foot" }, newInp, addNew, apply));
  showPopover(pop, anchor);
}

function abaCell(row) {
  const td = h("td", { class: "sc-edit sc-aba" });
  if (row.sheet_link) td.appendChild(h("span", { class: "badge " + hashColor(row.sheet_link) }, row.sheet_link));
  else td.appendChild(h("span", { class: "cell-empty" }, "—"));
  td.onclick = (e) => { e.stopPropagation(); openAbaDropdown(td, row); };
  return td;
}

function openAbaDropdown(anchor, row) {
  closePopover();
  const pop = h("div", { class: "dd-pop" });
  const listEl = h("div", { class: "dd-list" });
  const pick = (name) => { solicSave(row, { sheet_link: name }); closePopover(); renderSolicBody(); };
  listEl.appendChild(h("button", { class: "dd-opt", onClick: () => pick("") }, h("span", { class: "muted" }, "— sem aba —")));
  App.sheets.filter((s) => !isSolicIndex(s)).forEach((s) => {
    listEl.appendChild(h("button", { class: "dd-opt" + (row.sheet_link === s.name ? " on" : ""), onClick: () => pick(s.name) },
      h("span", {}, s.name), sheetAreaText(s) ? h("span", { class: "dd-sub" }, sheetAreaText(s)) : null));
  });
  pop.appendChild(listEl);
  showPopover(pop, anchor);
}

async function addSolicRow() {
  try { const row = await store.insertSolicitacao({ area: [], position: (App._solicRows ? App._solicRows.length : 0) + 1 }, App.project); App._solicRows.push(row); renderSolicBody(); }
  catch (e) { toast("Erro ao adicionar: " + (e.message || e), "err"); }
}
async function delSolicRow(r) {
  if (!(await confirmModal("Excluir linha", "Excluir esta linha da tabela Solicitações? (não afeta a aba original)"))) return;
  try { await store.deleteSolicitacao(r.id); App._solicRows = App._solicRows.filter((x) => x.id !== r.id); renderSolicBody(); }
  catch (e) { toast("Erro ao excluir: " + (e.message || e), "err"); }
}

/* ============================ GO ============================ */
boot();
