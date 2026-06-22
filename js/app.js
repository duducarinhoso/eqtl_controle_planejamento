import { supabase, CONFIG, isConfigured } from "./supabase.js";
import { renderAuth } from "./auth.js";
import * as store from "./store.js";
import { Grid } from "./grid.js";
import * as rt from "./realtime.js";
import * as excel from "./excel.js";
import { h, $, clear, toast, initials, colorFromString, escapeHtml, fmtDate, colName, debounce, statusClass, STATUS_OPTIONS } from "./util.js";

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
}
function startPresence() {
  heartbeatNow().then(refreshOnline);
  App._beatIv = setInterval(heartbeatNow, 20000);
  App._pollIv = setInterval(refreshOnline, 15000);
  rt.subscribeOnline(() => refreshOnline());   // atualização instantânea (usa o Realtime, que funciona)
}
function setLoc(loc) { App._loc = loc; heartbeatNow().then(refreshOnline); }

function userChipEl() {
  return h("div", { class: "user-chip", onClick: openUserMenu },
    avatarEl(App.profile, 30),
    h("div", { class: "who" }, App.profile.display_name || App.profile.full_name,
      h("small", {}, App.profile.email || "")));
}

function isAdmin() { return !!(App.profile && App.profile.role === "adm"); }

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
  STATUS_OPTIONS.forEach((s) => { const n = sum.get(s); if (n) { chips.appendChild(h("span", { class: "chip " + (statusClass(s) || "na") }, `${s} · ${n}`)); seen.add(s); } });
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
      h("button", { class: "side-nav-item nav-dash", id: "nav-dashboard", onClick: () => goProject(App.project.id) }, "▦ Dashboard")),
    h("div", { class: "side-actions" },
      h("div", { class: "side-icons" },
        h("button", { class: "side-icon-btn", title: "Importar / atualizar a partir de um Excel (.xlsx)", onClick: openExcelImport }, "⇪ Importar Excel"),
        h("button", { class: "side-icon-btn", id: "btn-export", title: "Exportar abas para Excel (.xlsx)", onClick: enterExportMode }, "⭳ Exportar")),
      h("div", { class: "exp-bar", id: "exp-bar", hidden: true })),
    h("div", { class: "side-section" }, h("span", {}, "Abas"),
      h("button", { class: "add", title: "Nova aba", onClick: newSheet }, "+")),
    sheetList,
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
  const [sheets, activity] = await Promise.all([store.listSheets(App.project), store.loadSheetActivity(App.project)]);
  App.sheets = sheets;
  App.activity = activity;
  renderSidebar();
}

function bumpActivity(sheetId) {
  const iso = new Date().toISOString();
  App.activity.set(sheetId, iso);
  const el = document.getElementById("time-" + sheetId);
  if (el) el.textContent = "alt. " + fmtDate(iso);
}

function renderSidebar() {
  const list = $("#sheet-list"); if (!list) return;
  clear(list);
  App.sheets.forEach((s, i) => {
    const t = App.activity.get(s.id);
    const inExp = App.exportMode;
    const checked = inExp && App.exportSel.has(s.id);
    const item = h("div", {
      class: "sheet-item" + (!inExp && App.sheet && s.id === App.sheet.id ? " active" : "") + (s.hidden ? " is-hidden" : ""),
      onClick: () => {
        if (inExp) { App.exportSel.has(s.id) ? App.exportSel.delete(s.id) : App.exportSel.add(s.id); renderSidebar(); updateExpBar(); }
        else goSheet(App.project.id, s.id);
      },
      oncontextmenu: (e) => { if (inExp) return; e.preventDefault(); sheetMenu(e.clientX, e.clientY, s); },
    },
      inExp ? h("input", { type: "checkbox", class: "exp-check", checked: checked })
            : h("span", { class: "idx" }, String(i + 1).padStart(2, "0")),
      h("div", { class: "col" },
        h("span", { class: "nm", title: s.name }, s.name),
        h("span", { class: "meta-time", id: "time-" + s.id }, t ? "alt. " + fmtDate(t) : "")),
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
  const idx = App.sheets.findIndex((x) => x.id === s.id);
  if (idx > 0) item("Mover para cima", () => moveSheet(s, -1));
  if (idx < App.sheets.length - 1) item("Mover para baixo", () => moveSheet(s, +1));
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
  if (App.sheet?.id === s.id) $("#crumb").textContent = name;
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
    h("p", {}, "Crie uma aba no menu lateral ou importe a planilha existente."),
    h("button", { class: "btn btn-primary", onClick: openImport }, "Importar planilha")));
}

/* ============================ DASHBOARD ============================ */
async function showDashboard() {
  App.view = "dashboard";
  App.sheet = null;
  setLoc({ projectId: App.project?.id, projectName: App.project?.name, view: "dashboard" });
  renderSidebar();
  renderAppPresence();
  $("#nav-dashboard")?.classList.add("active");
  $("#crumb").textContent = "Dashboard";
  const tb = document.querySelector(".toolbar"); if (tb) tb.style.display = "none";
  rt.unsubscribeDB(); rt.leavePresence();
  const presBox = $("#presence"); if (presBox) clear(presBox);
  const gs = $("#grid-scroll");
  clear(gs); gs.classList.add("dash");
  gs.appendChild(h("div", { class: "spinner", style: { margin: "60px auto" } }));

  let rows;
  try { rows = await store.loadStatusAggregate(App.project); }
  catch (e) { clear(gs); gs.appendChild(h("p", { class: "muted", style: { padding: "28px" } }, "Erro ao carregar: " + e.message)); return; }
  if (App.view !== "dashboard") return;   // usuario ja saiu

  const sheetName = new Map(App.sheets.map((s) => [s.id, s.name]));
  const normLabel = (v) => { const s = String(v || "").trim(); return s.toLowerCase() === "na" ? "N/A" : s; };
  const agg = new Map(); let grand = 0;
  for (const r of rows) {
    const label = normLabel(r.value); if (!label) continue;
    if (!agg.has(label)) agg.set(label, { total: 0, sheets: new Map() });
    const a = agg.get(label); a.total++; grand++;
    a.sheets.set(r.sheet_id, (a.sheets.get(r.sheet_id) || 0) + 1);
  }
  const order = [...STATUS_OPTIONS];
  for (const k of agg.keys()) if (!order.includes(k)) order.push(k);

  clear(gs);
  const wrap = h("div", { class: "dash-wrap" });
  wrap.appendChild(h("h2", {}, "Dashboard"));
  wrap.appendChild(h("p", { class: "sub" }, `Visão por status · ${grand} itens em ${App.sheets.length} abas. Clique num card para ver as abas; clique numa aba para abri-la.`));
  const gridEl = h("div", { class: "kpi-grid" });
  for (const label of order) {
    const a = agg.get(label); if (!a) continue;
    const cls = statusClass(label) || "na";
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
  if (!agg.size) wrap.appendChild(h("p", { class: "muted" }, "Ainda não há células de status preenchidas."));
  wrap.appendChild(gridEl);
  gs.appendChild(wrap);

  // limita a altura das listas ao espaço real ate o rodape -> o card termina na borda
  // (sem precisar rolar a pagina). Reaplica no resize da janela.
  const fit = () => {
    if (App.view !== "dashboard" || !gridEl.isConnected) return;
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

/* ============================ SELECT SHEET ============================ */
let reconcile = null;
async function selectSheet(sheet) {
  App.sheet = sheet;
  App.view = "grid";
  $("#nav-dashboard")?.classList.remove("active");
  const tb = document.querySelector(".toolbar"); if (tb) tb.style.display = "";
  renderSidebar();
  $("#crumb").textContent = sheet.name;
  const gs = $("#grid-scroll");
  gs.classList.remove("dash");
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
        $("#crumb").textContent = p.new.name;
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
  const list = [...users.values()].map((u) => { const on = online.get(u.id); return { ...u, online: !!on, loc: on ? on.loc : null }; });
  list.sort((a, b) => (b.online - a.online) || String(a.name).localeCompare(String(b.name)));
  const MAX = 9;
  list.slice(0, MAX).forEach((u) => box.appendChild(presAvatar(u)));
  if (list.length > MAX) box.appendChild(h("div", { class: "pav", onClick: openTeamPanel, title: "Ver todos" },
    h("div", { class: "pav-circle", style: { background: "var(--secondary)" } }, "+" + (list.length - MAX))));
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
    if (App._loc) App._loc.cell = { r: sel.r, c: sel.c };   // p/ "Ir para célula" (enviado no próximo heartbeat)
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
  m.appendChild(h("div", { class: "sep" }));
  item("Importar / atualizar do Excel (.xlsx)…", openExcelImport);
  item("Exportar planilha inteira (.xlsx)", exportWorkbook);
  item("Importar seed (.json) — avançado…", openImport);
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
  bar.appendChild(h("button", { class: "btn btn-primary btn-sm", id: "exp-confirm", style: { width: "100%" }, onClick: confirmExport }, "Confirmar exportação"));
  bar.appendChild(h("div", { style: { display: "flex", gap: "6px" } },
    h("button", { class: "btn btn-ghost btn-sm", style: { flex: "1", color: "var(--navy-100)", borderColor: "#ffffff33" }, onClick: toggleAllExport }, "Todas"),
    h("button", { class: "btn btn-ghost btn-sm", style: { flex: "1", color: "var(--navy-100)", borderColor: "#ffffff33" }, onClick: exitExportMode }, "Cancelar")));
  updateExpBar();
}
function toggleAllExport() {
  const allSel = App.exportSel.size === App.sheets.length;
  App.exportSel = allSel ? new Set() : new Set(App.sheets.map((s) => s.id));
  renderSidebar(); updateExpBar();
}
function updateExpBar() { const c = $("#exp-confirm"); if (c) c.textContent = `Confirmar exportação (${App.exportSel.size})`; }
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
    for (const x of sel) {
      const ex = x.curMap.get(x.ch.row + ":" + x.ch.col);
      const imp = x.fmtMap && x.fmtMap.get(x.ch.row + ":" + x.ch.col);
      const fmt = imp ? imp.format : ((ex && ex.format) || {});   // aplica a formatação do Excel
      const dtype = (ex && ex.data_type === "status") || isStatusVal(x.ch.neu) ? "status" : (ex ? ex.data_type : "text");
      await store.saveCell(x.sheet.id, x.ch.row, x.ch.col, { value: x.ch.neu, data_type: dtype, format: fmt });
      touched.add(x.sheet.id);
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

/* ============================ GO ============================ */
boot();
