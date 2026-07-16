import { supabase, CONFIG, isConfigured } from "./supabase.js";
import { renderAuth } from "./auth.js";
import * as store from "./store.js";
import { Grid } from "./grid.js";
import * as rt from "./realtime.js";
import * as excel from "./excel.js";
import { parseAbas } from "./parser.js";
import { openSolic, refreshSolic } from "./solic.js";
import { h, $, clear, toast, initials, colorFromString, escapeHtml, fmtDate, colName, debounce, getStatusOptions, setStatusOptions, statusClassFor, statusCategoryFor, getCompanies, setCompanies } from "./util.js";
import { initZoom } from "./uizoom.js";
import { buildZoomControl } from "./zoomctl.js";

/* Guarda do renderAll do ds.js: o toggleTheme do modelo dispara renderAll() em qualquer tela,
   tentando montar os gráficos/medidores DEMO do modelo (IDs lastWeekChart/topProductsChart/
   leadsChart, classes .g-svg/.spark) — que não existem no app. Sem eles, o Chart.js polui o
   console com "Failed to create chart". Só roda quando esses alvos do modelo existem (nunca, no
   app), virando no-op sem regressão. Não altera o ds.js (verbatim do modelo). */
if (typeof window.renderAll === "function") {
  const _renderAll = window.renderAll;
  const MODEL_TARGETS = "#lastWeekChart, #topProductsChart, #leadsChart, .g-svg, .spark";
  window.renderAll = () => { if (document.querySelector(MODEL_TARGETS)) _renderAll(); };
}

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
  initZoom();   // densidade da UI (reaplica o zoom salvo; idempotente com o anti-flash)
  if (!isConfigured) { $("#boot").hidden = true; return showConfigNotice(); }

  // fluxo de redefinicao de senha (link do e-mail)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { showAuth("reset"); return; }
    if (event === "SIGNED_IN" && !App.profile) applyRoute();
    if (event === "SIGNED_OUT") {
      clearInterval(App._beatIv); clearInterval(App._pollIv); App._presenceStarted = false;
      stopIdleGuard(); App._idleStarted = false;
      rt.unsubscribeOnline(); store.clearOnline().catch(() => {});
      App.project = null; App.profile = null;
      // Ao SAIR, descarta a rota antiga para o proximo login comecar pela selecao
      // de modulo (home). F5/reabrir com sessao ativa NAO passa por aqui, entao
      // continua retomando a ultima tela.
      try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
      showAuth("login");
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
  if (!App._idleStarted) { App._idleStarted = true; startIdleGuard(); }
  return true;
}

/* ---- presenca via heartbeat (quem esta online + onde) ---- */
async function heartbeatNow() { await store.heartbeat(App._loc || { view: "app" }); }
async function refreshOnline() {
  let rows = [];
  try { rows = await store.loadOnline(); } catch (_) {}
  App._appPeers = rows.map((r) => {
    const p = App.profilesMap.get(r.user_id) || {};
    return { id: r.user_id, name: titleCase(p.display_name || p.full_name || "Usuário"), full_name: p.full_name, email: p.email, color: p.color, loc: r.loc || {} };
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

/* ===================== TIMEOUT DE INATIVIDADE =====================
   Sem atividade (mouse/teclado/scroll/toque) por IDLE_LIMIT, o usuario e
   deslogado. Nos ultimos IDLE_WARN, um modal avisa com contagem regressiva e
   exige clique em "Continuar conectado" para permanecer. Um relogio de 1s
   recalcula a inatividade a partir do ultimo evento (robusto a sleep do PC). */
const IDLE_LIMIT_MS = 30 * 60 * 1000;   // 30 min de inatividade -> logout
const IDLE_WARN_MS  = 2  * 60 * 1000;   // aviso (com cronometro) nos ultimos 2 min
const IDLE_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];

function idleBump() { if (!App._idleWarnOpen) App._idleLast = Date.now(); }
function idleFmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function startIdleGuard() {
  App._idleLast = Date.now();
  IDLE_EVENTS.forEach((ev) => document.addEventListener(ev, idleBump, { passive: true }));
  clearInterval(App._idleIv);
  App._idleIv = setInterval(idleTick, 1000);
}
function stopIdleGuard() {
  clearInterval(App._idleIv); App._idleIv = null;
  IDLE_EVENTS.forEach((ev) => document.removeEventListener(ev, idleBump, { passive: true }));
  closeIdleWarn();
}
function idleTick() {
  if (!App.profile) return;                       // so vale quando logado
  const idle = Date.now() - (App._idleLast || Date.now());
  if (idle >= IDLE_LIMIT_MS) { closeIdleWarn(); supabase.auth.signOut(); return; }
  if (idle >= IDLE_LIMIT_MS - IDLE_WARN_MS) openIdleWarn(IDLE_LIMIT_MS - idle);
  else if (App._idleWarnOpen) closeIdleWarn();
}
function idleStay() { App._idleLast = Date.now(); closeIdleWarn(); }
function openIdleWarn(remainingMs) {
  if (!App._idleWarnOpen) {
    App._idleWarnOpen = true;
    const scrim = h("div", { class: "scrim", id: "idle-warn" },
      h("div", { class: "modal", style: { maxWidth: "440px", textAlign: "center" } },
        h("h3", {}, "Sua sessão vai expirar"),
        h("p", { style: { color: "var(--text-muted)", margin: "6px 0 4px" } },
          "Por inatividade, você será desconectado em ",
          h("strong", { id: "idle-count", style: { color: "var(--text)" } }, idleFmt(remainingMs)), "."),
        h("p", { style: { color: "var(--text-muted)", fontSize: "13px", marginTop: "0" } },
          "Clique em “Continuar conectado” para permanecer."),
        h("div", { class: "modal-foot" },
          h("button", { class: "btn btn-ghost", onClick: () => supabase.auth.signOut() }, "Sair agora"),
          h("button", { class: "btn btn-primary", onClick: idleStay }, "Continuar conectado"))));
    document.body.appendChild(scrim);
  }
  const c = document.getElementById("idle-count");
  if (c) c.textContent = idleFmt(remainingMs);
}
function closeIdleWarn() {
  App._idleWarnOpen = false;
  const el = document.getElementById("idle-warn");
  if (el) el.remove();
}

function userChipEl() {
  return h("div", { class: "user-chip", onClick: openUserMenu },
    avatarEl(App.profile, 30),
    h("div", { class: "who" }, App.profile.display_name || App.profile.full_name,
      h("small", {}, App.profile.email || "")));
}

function isAdmin() { return !!(App.profile && App.profile.role === "adm"); }

/* ---- Papéis de acesso (exibição). Banco continua com role 'adm'/'operador'.
   Mapeamento não-destrutivo: adm→Adm, operador→Operador, resto→Visitante. ---- */
function roleKey() {
  const r = (App.profile && App.profile.role) || "";
  if (r === "adm") return "adm";
  if (r === "operador") return "operador";
  return "visitante";
}
function roleLabel() {
  return { adm: "Adm", operador: "Operador", visitante: "Visitante" }[roleKey()];
}
/* quem enxerga o módulo Administração (por ora, só Adm) */
function canSeeAdmin() { return roleKey() === "adm"; }

/* carrega a lista de status do banco (status_options). Degrada para a lista
   padrao embutida se a tabela ainda nao existir (sql/15_status_options.sql). */
async function reloadStatusOptions() {
  try { const opts = await store.loadStatusOptions(); if (opts.length) setStatusOptions(opts); }
  catch (_) { /* tabela ainda nao criada: mantem o padrao */ }
}
async function reloadCompanies() {
  try { const c = await store.loadCompanies(); setCompanies(c); App.companies = c; }
  catch (_) { App.companies = []; setCompanies([]); }
}
async function reloadAreas() {
  try { App.areas = await store.loadAreas(); }
  catch (_) { App.areas = []; }
}

/* avatar: foto se houver, senão iniciais */
/* Nome de exibição: Title Case (Primeira Letra Maiúscula por palavra), independente
   de como foi digitado; conectores curtos ficam em minúsculas. */
function titleCase(s) {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "la", "van", "von"]);
  return String(s || "").trim().toLowerCase().split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w)) ? w : (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
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

/* ===================== TELA INICIAL (SELECAO DE MODULO) ===================== */
function showHome() {
  App.project = null; App.sheet = null;
  rt.unsubscribeDB(); rt.leavePresence();
  setLoc({ view: "home" });
  $("#auth-root").hidden = true;
  const root = $("#app-root"); root.hidden = false;
  clear(root);
  root.appendChild(buildHome());
}

function buildHome() {
  const el = document.createElement("main");
  el.className = "home";
  el.setAttribute("aria-label", "Tela inicial");
  el.innerHTML = `
    <span class="corner-mark">Selecione um módulo</span>
    <section class="panel panel-green" aria-label="Área Auditoria">
      <div class="panel-content">
        <a class="liquid-button" href="#/operacoes" aria-label="Abrir Auditoria">
          <span class="glass-flow" aria-hidden="true"></span>
          <span class="glass-sheen" aria-hidden="true"></span>
          <span class="border-runner" aria-hidden="true"></span>
          <span class="button-copy">
            <span class="button-label">Auditoria</span>
            <span class="button-meta">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5.5 13h6l-.5 9L18.5 11h-6L13 2Z"></path></svg>
              <span>Protótipo rápido</span>
            </span>
          </span>
        </a>
      </div>
    </section>
    <section class="panel panel-blue" aria-label="Área Cronograma">
      <div class="panel-content">
        <a class="liquid-button" aria-label="Cronograma inativo, em construção" aria-disabled="true" tabindex="-1">
          <span class="glass-flow" aria-hidden="true"></span>
          <span class="glass-sheen" aria-hidden="true"></span>
          <span class="border-runner" aria-hidden="true"></span>
          <span class="button-copy">
            <span class="button-label">Cronograma</span>
            <span class="button-meta">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.25-1 10.5-10.5a2.12 2.12 0 0 0-3-3L5.25 16 4 20Z"></path><path d="m14.5 6.75 3 3"></path></svg>
              <span>Inativo · em construção</span>
            </span>
          </span>
        </a>
      </div>
    </section>`;
  return el;
}

/* ============================ TELA INICIAL (PROJETOS) ============================ */
async function showProjects() {
  if (!(await ensureProfile())) return;
  App.project = null; App.sheet = null;
  rt.unsubscribeDB(); rt.leavePresence();
  setLoc({ view: "projects" });
  const slot = mountModuleShell("ops-proj");
  slot.appendChild(buildLandingBody());
  await loadLanding();
}

/* Corpo da landing (cards + busca) para montar dentro do module shell.
   O rail já fornece marca e usuário, então dispensamos o chrome de tela cheia. */
function buildLandingBody() {
  const grid = h("div", { class: "proj-grid", id: "proj-grid" });
  const usersSvg = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  const plusSvg = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const head = h("div", { class: "landing-head" },
    h("p", { class: "muted", style: { margin: 0 } }, "Selecione um projeto para abrir ou crie um novo."),
    h("div", { class: "landing-actions" },
      isAdmin() ? h("button", { class: "btn btn-ghost", onClick: openAdminPanel }, h("span", { html: usersSvg, style: { display: "inline-flex" } }), "Usuários") : null,
      h("button", { class: "btn btn-primary", onClick: newProject }, h("span", { html: plusSvg, style: { display: "inline-flex" } }), "Novo projeto")));
  return h("div", { class: "landing-body" }, head, grid);
}

/* (buildLanding legada removida — era a landing full-screen com barra navy;
   a tela Projetos agora vive no shell do modelo via buildLandingBody.) */

async function loadLanding() {
  const grid = $("#proj-grid"); if (!grid) return;
  grid.innerHTML = '<div class="spinner" style="margin:48px auto"></div>';
  let projects, summary, lastch;
  try { [projects, summary, lastch] = await Promise.all([store.listProjects(), store.loadProjectsStatusSummary(), store.loadProjectsLastChange()]); }
  catch (e) {
    clear(grid);
    grid.appendChild(h("div", { class: "card", style: { gridColumn: "1 / -1" } },
      h("div", { class: "card-body" },
        h("p", { style: { margin: "0 0 8px", color: "var(--red)", fontWeight: 600 } }, "Não foi possível carregar os projetos."),
        h("p", { class: "muted", style: { margin: "0 0 14px", fontSize: "12.5px" } }, e.message),
        h("button", { class: "btn btn-ghost btn-sm", onClick: loadLanding }, "Tentar novamente"))));
    return;
  }
  App._projects = projects; App._summary = summary; App._lastch = lastch;
  renderProjectCards(projects, "");
}

function renderProjectCards(projects, q) {
  const grid = $("#proj-grid"); if (!grid) return;
  clear(grid);
  const ql = (q || "").trim().toLowerCase();
  const list = projects.filter((p) => !ql || p.name.toLowerCase().includes(ql) || (p.description || "").toLowerCase().includes(ql));
  if (!list.length) {
    grid.appendChild(h("div", { class: "card", style: { gridColumn: "1 / -1" } },
      h("div", { class: "card-body", style: { textAlign: "center", padding: "32px 20px" } },
        h("p", { style: { margin: "0 0 4px", fontWeight: 600 } }, q ? "Nenhum projeto encontrado." : "Nenhum projeto ainda."),
        h("p", { class: "muted", style: { margin: "0 0 16px", fontSize: "12.5px" } }, q ? "Tente outro termo de busca." : "Crie o primeiro projeto para começar."),
        q ? null : h("button", { class: "btn btn-primary btn-sm", onClick: newProject }, "Novo projeto"))));
    return;
  }
  list.forEach((p) => grid.appendChild(projectCard(p)));
}

function projectCard(p) {
  const sum = (App._summary && (App._summary.get(p.id) || (p.synthetic && App._summary.get("__all__")))) || new Map();
  const chips = h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } });
  const seen = new Set();
  const badge = (label, n, cls) => h("span", { class: "badge st-" + (cls || "na") }, `${label} · ${n}`);
  getStatusOptions().forEach((s) => { const n = sum.get(s); if (n) { chips.appendChild(badge(s, n, statusClassFor(s) || "na")); seen.add(s); } });
  for (const [k, n] of sum) if (!seen.has(k) && n) chips.appendChild(badge(k, n, "na"));
  if (!chips.childNodes.length) chips.appendChild(h("span", { class: "muted", style: { fontSize: "11px" } }, "Sem status preenchidos"));
  const editBtn = h("button", { class: "card-act", title: "Editar nome/descrição", onClick: (e) => { e.stopPropagation(); editProject(p); },
    html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>' });
  const moreBtn = h("button", { class: "card-act", title: "Mais opções", onClick: (e) => { e.stopPropagation(); projectMenu(e, p); },
    html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' });
  const actions = p.synthetic ? null : h("div", { style: { display: "flex", gap: "4px", flex: "0 0 auto" } }, editBtn, moreBtn);
  const body = h("div", { class: "card-body" },
    h("p", { class: "muted", style: { margin: "0 0 10px" } }, p.description || "Sem descrição."),
    h("div", { style: { display: "flex", gap: "16px", fontSize: "11.5px", color: "var(--text-dim)", marginBottom: "12px" } },
      h("span", {}, "Criado: " + (p.created_at ? fmtDate(p.created_at) : "—")),
      h("span", {}, "Atualizado: " + ((App._lastch && App._lastch.get(p.id)) ? fmtDate(App._lastch.get(p.id)) : "—"))),
    chips);
  return h("div", { class: "card", style: { cursor: "pointer" }, onClick: () => goProject(p.id) },
    h("div", { class: "card-head" }, h("h3", {}, p.name), actions),
    body);
}

function newProject() {
  const name = h("input", { class: "input", placeholder: "Ex.: Auditoria EQTL 2026" });
  const desc = h("textarea", { class: "input", placeholder: "Descrição (opcional)", rows: 2 });

  // Escolha do modelo do projeto (grade x tabela)
  let kind = "grade";
  const optGrade = h("label", { class: "kind-opt kind-sel" },
    h("input", { type: "radio", name: "proj-kind", value: "grade", checked: true }),
    h("div", {}, h("strong", {}, "Planilha / abas"),
      h("span", { class: "muted" }, "Espelho do Excel: abas e grade, formatação por célula.")));
  const optTabela = h("label", { class: "kind-opt" },
    h("input", { type: "radio", name: "proj-kind", value: "tabela" }),
    h("div", {}, h("strong", {}, "Tabela estruturada"),
      h("span", { class: "muted" }, "Carrega a Lista de pedidos: colunas fixas, status calculado pela aplicação.")));
  const kindWrap = h("div", { class: "kind-choices" }, optGrade, optTabela);
  kindWrap.addEventListener("change", (e) => {
    kind = e.target.value;
    kindWrap.querySelectorAll(".kind-opt").forEach((l) =>
      l.classList.toggle("kind-sel", l.contains(e.target) && e.target.checked));
  });

  const content = h("div", {},
    h("div", { class: "field" }, h("label", {}, "Nome do projeto"), name),
    h("div", { class: "field" }, h("label", {}, "Descrição"), desc),
    h("div", { class: "field" }, h("label", {}, "Modelo do projeto"), kindWrap));

  const api = openModal("Novo projeto", content, [
    { label: "Cancelar", onClick: (a) => a.close() },
    { label: "Criar projeto", primary: true, onClick: async (a) => {
        if (!name.value.trim()) return;
        if (!(await store.projectsAvailable())) { a.close(); return toast("Para criar vários projetos, rode o SQL sql/07_projects.sql no Supabase.", "err"); }
        a.close();
        try { const p = await store.createProject({ name: name.value.trim(), description: desc.value.trim(), kind }); App._projects = [ ...(App._projects || []), p ]; goProject(p.id); }
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
function goOperacoes() { go("#/operacoes"); }
/* slug amigavel a partir do nome do projeto (URL mais legivel que o UUID).
   Derivado em runtime; o applyRoute resolve por slug OU por id (links antigos abrem). */
function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "projeto";
}
function slugForProject(pid) {
  const p = (App.project && String(App.project.id) === String(pid)) ? App.project
    : (App._projects || []).find((x) => String(x.id) === String(pid));
  return p?.name ? slugify(p.name) : String(pid);
}
function goProject(pid) { go("#/p/" + encodeURIComponent(slugForProject(pid))); }
function goSheet(pid, sid) { go("#/p/" + encodeURIComponent(slugForProject(pid)) + "/s/" + encodeURIComponent(sid)); }
function goToCell(pid, sid, r, c) {
  if (App.sheet && String(App.sheet.id) === String(sid) && App.grid) { App.grid.select(r, c); return; }
  App._pendingCell = { sheetId: sid, r, c }; goSheet(pid, sid);
}

async function mountProject(project) {
  App.project = project;
  App.sheetFilter = "";
  App.view = null;          // shell reconstruído: não deixar o guard de applyRoute pular o render do dashboard
  const slot = mountModuleShell("ops-proj");          // rail global, Operações ativo
  document.querySelector(".app")?.classList.add("in-project");
  slot.classList.add("proj-mode");
  if (project.kind === "tabela") {                    // modelo novo: tabela estruturada
    const { buildPlanningPane } = await import("./planning.js");
    slot.appendChild(buildPlanningPane(project));
    App.view = "planning";
    return;
  }
  slot.appendChild(buildProjectPane());               // rail de contexto + área de trabalho
  await refreshSheets();
}

async function applyRoute() {
  const hash = location.hash || "";
  if (hash.includes("access_token") || hash.includes("type=recovery")) return;
  if (!(await ensureProfile())) return;
  if (App.profile.must_change_password) return forceChangePassword();   // 1º acesso: trocar senha
  const m = hash.match(/^#\/p\/([^/]+)(?:\/s\/([^/]+))?$/);
  if (!m) {
    // ----- Operações: lista de projetos dentro do module shell -----
    if (hash === "#/operacoes" || hash === "#/projetos") { await showProjects(); return; }
    // ----- Portal EY (placeholders) -----
    if (hash === "#/ey" || hash === "#/ey/solicitacoes") { showModulePlaceholder("ey-solic"); return; }
    if (hash === "#/ey/executar")    { showModulePlaceholder("ey-exec"); return; }
    if (hash === "#/ey/engagements") { showModulePlaceholder("ey-eng"); return; }
    // ----- Administração (placeholders; só Adm) -----
    if (hash.startsWith("#/admin")) {
      if (!canSeeAdmin()) { goOperacoes(); return; }
      if (hash === "#/admin/usuarios") { showModulePlaceholder("adm-users"); return; }
      if (hash === "#/admin/config")   { showModulePlaceholder("adm-cfg"); return; }
      showModulePlaceholder("adm-cad"); return;  // #/admin e #/admin/cadastros
    }
    // ----- Tela inicial (splash de seleção de módulo) -----
    showHome();
    return;
  }
  const key = decodeURIComponent(m[1]);
  const sid = m[2] ? decodeURIComponent(m[2]) : null;
  // resolve o projeto por SLUG (nome) ou por ID (links antigos com UUID)
  const matches = (p) => p && (slugify(p.name) === key || String(p.id) === key);
  if (!matches(App.project) || !document.querySelector("#app-root .proj-shell")) {
    let proj = matches(App.project) ? App.project : null;
    if (!proj) {
      const projs = (App._projects && App._projects.length) ? App._projects : await store.listProjects();
      App._projects = projs;
      proj = projs.find(matches);
      if (!proj) return goProjects();
    }
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

/* ============================ MODULE SHELL (3 módulos) ============================ */
/* Ícones inline (stroke=currentColor). Itens apontam para rotas hash. */
const IC = {
  ey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
  ops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>',
};
/* ícones por item — SVG stroke 2, estilo Feather, coerentes entre si */
const ITEM_IC = {
  "ey-solic": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
  "ey-exec": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  "ey-eng": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
  "ops-proj": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
  "adm-cad": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 14h6"/></svg>',
  "adm-users": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  "adm-cfg": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};
/* título + caminho (breadcrumb) da página a partir do item ativo */
function pageMetaOf(activeItem) {
  const mod = moduleOfItem(activeItem);
  return { title: labelOfItem(activeItem) || "—", crumb: mod ? mod.label : "" };
}
function moduleModel() {
  const mods = [
    { key: "ey", label: "Portal EY", icon: IC.ey, items: [
      { key: "ey-solic", label: "Solicitações", route: "#/ey/solicitacoes" },
      { key: "ey-exec",  label: "Executar coleta", route: "#/ey/executar" },
      { key: "ey-eng",   label: "Engagements", route: "#/ey/engagements" },
    ] },
    { key: "ops", label: "Operações", icon: IC.ops, items: [
      { key: "ops-proj", label: "Projetos", route: "#/operacoes" },
    ] },
  ];
  if (canSeeAdmin()) {
    mods.push({ key: "admin", label: "Administração", icon: IC.admin, items: [
      { key: "adm-cad",   label: "Cadastros", route: "#/admin/cadastros" },
      { key: "adm-users", label: "Usuários", route: "#/admin/usuarios" },
      { key: "adm-cfg",   label: "Configurações", route: "#/admin/config" },
    ] });
  }
  return mods;
}
/* qual grupo contém o item ativo (para destacar o ícone quando colapsado) */
function moduleOfItem(itemKey) {
  return moduleModel().find((m) => m.items.some((it) => it.key === itemKey)) || null;
}
function labelOfItem(itemKey) {
  for (const m of moduleModel()) { const it = m.items.find((x) => x.key === itemKey); if (it) return it.label; }
  return "";
}

/* Monta o shell do modelo (design-system_v2): .app > .sidebar + .main.
   activeItem = key do item ativo (ex.: "ops-proj"). */
function buildModuleShell(activeItem) {
  const mods = moduleModel();

  // menu (flat, com rótulo por módulo) — estrutura do modelo
  const menu = h("nav", { class: "menu", id: "sidebarMenu", "aria-label": "Módulos" },
    h("span", { class: "menu-indicator", id: "sidebarIndicator", "aria-hidden": "true" }));
  mods.forEach((m) => {
    menu.appendChild(h("div", { class: "menu-group" }, m.label));
    m.items.forEach((it) => {
      const on = it.key === activeItem;
      const a = h("a", on ? { href: it.route, class: "active", "aria-current": "page" } : { href: it.route });
      a.innerHTML = (ITEM_IC[it.key] || "") + '<span class="menu-label">' + escapeHtml(it.label) + "</span>";
      a.addEventListener("click", () => document.getElementById("sidebar")?.classList.remove("open"));   // fecha o off-canvas ao navegar (mobile)
      menu.appendChild(a);
    });
  });

  // rodapé com o usuário (menu do modelo)
  const p = App.profile || {};
  const userMenu = h("div", { class: "sidebar-user-menu", id: "sidebarUserMenu", role: "menu" },
    h("a", { href: "#", role: "menuitem", onClick: (e) => { e.preventDefault(); editDisplayName(); } }, "Editar nome…"),
    h("a", { href: "#", role: "menuitem", onClick: (e) => { e.preventDefault(); changeMyPhoto(); } }, "Trocar foto…"),
    h("a", { href: "#", role: "menuitem", onClick: (e) => { e.preventDefault(); supabase.auth.signOut(); } }, "Sair"));
  const trigger = h("button", { class: "sidebar-trigger", id: "sidebarUserTrigger", type: "button", "aria-expanded": "false", "aria-controls": "sidebarUserMenu" },
    h("span", { class: "sidebar-avatar" }, initials(p.display_name || p.full_name || "?")),
    h("span", { class: "sidebar-user-info" }, h("strong", {}, titleCase(p.display_name || p.full_name || "Usuário")), h("span", {}, roleLabel())),
    h("span", { class: "sidebar-chevron", id: "sidebarChevron", "aria-hidden": "true",
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>' }));

  const sidebar = h("aside", { class: "sidebar", id: "sidebar", "aria-label": "Navegação principal" },
    h("span", { class: "sidebar-lights", "aria-hidden": "true" }),
    h("div", { class: "brand" },
      h("img", { class: "brand-mascot", src: "modelos/mascote_projetos_inovacao/ivy_figurinhas/ivy_programando.png", alt: "Ivy" }),
      h("img", { class: "brand-logo-full", src: "app_planejamento_logo.png", alt: "Grupo Equatorial — Planejamento", "aria-hidden": "true" })),
    menu,
    h("div", { class: "sidebar-foot" }, userMenu, trigger));

  // main: topbar (busca) + controle de densidade "Aa" + page-row + content
  const meta = pageMetaOf(activeItem);
  const search = h("div", { class: "search" });
  search.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>';
  search.appendChild(h("input", { type: "search", placeholder: "Buscar…", onfocus: () => openGlobalSearch() }));
  const burger = h("button", { class: "topbar-burger", "aria-label": "Mostrar menu", title: "Mostrar menu",
    onClick: () => document.getElementById("sidebar")?.classList.toggle("open"),
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>' });
  const topbar = h("div", { class: "topbar" }, burger, search, buildZoomControl());
  const pageRow = h("div", { class: "page-row" },
    h("h1", { id: "page-title" }, meta.title),
    h("div", { class: "crumb", id: "page-crumb" }, meta.crumb));
  const content = h("div", { class: "content", id: "mod-content" });
  const main = h("main", { class: "main" }, topbar, pageRow, content);

  // toggle de tema do modelo (flutuante)
  const themeBtn = h("button", { class: "theme-toggle", title: "Alternar tema", onClick: () => window.toggleTheme && window.toggleTheme() });
  themeBtn.innerHTML = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';

  return h("div", { class: "app" }, themeBtn, sidebar, main);
}

/* Garante que o module shell está montado em #app-root com o item ativo certo,
   e devolve o slot #mod-content (limpo) para a tela preencher. */
function mountModuleShell(activeItem) {
  $("#auth-root").hidden = true;
  const root = $("#app-root"); root.hidden = false;
  document.querySelector(".app")?.classList.remove("in-project");
  const _mc = document.getElementById("mod-content"); if (_mc) _mc.classList.remove("proj-mode");
  const cur = root.querySelector(".app");
  if (!cur || !cur.querySelector("#sidebarMenu")) {
    clear(root);
    root.appendChild(buildModuleShell(activeItem));
    if (window.setupSidebar) window.setupSidebar();
  } else {
    // atualiza ativo + título sem recriar o shell
    const lbl = labelOfItem(activeItem);
    cur.querySelectorAll("#sidebarMenu a").forEach((a) => {
      const on = (a.querySelector(".menu-label") || {}).textContent === lbl;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const meta = pageMetaOf(activeItem);
    const t = cur.querySelector("#page-title"); if (t) t.textContent = meta.title;
    const c = cur.querySelector("#page-crumb"); if (c) c.textContent = meta.crumb;
  }
  const slot = document.getElementById("mod-content");
  clear(slot);
  return slot;
}

/* Tela genérica "em construção" dentro do slot do module shell.
   opts = { kicker, title, desc, tabs? } */
function renderPlaceholder(slot, opts) {
  const body = h("div", { class: "card-body" });
  body.appendChild(h("p", { class: "muted", style: { marginTop: 0 } }, opts.desc || ""));
  if (opts.tabs && opts.tabs.length) {
    const tabs = h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", margin: "12px 0" } });
    opts.tabs.forEach((t) => tabs.appendChild(h("span", { class: "badge member" }, t)));
    body.appendChild(tabs);
  }
  body.appendChild(h("p", { class: "muted" }, "Em desenvolvimento. Esta seção será disponibilizada em breve."));
  slot.appendChild(h("div", { class: "card" }, body));
}

/* Telas-placeholder por item de módulo. */
function showModulePlaceholder(itemKey) {
  const slot = mountModuleShell(itemKey);
  const P = {
    "ey-solic":  { kicker: "Portal EY", title: "Solicitações", desc: "Triagem das solicitações do relatório EY, com Área e Responsável." },
    "ey-exec":   { kicker: "Portal EY", title: "Executar coleta", desc: "Disparo da coleta do relatório EY (sync incremental)." },
    "ey-eng":    { kicker: "Portal EY", title: "Engagements", desc: "Catálogo de engagements EY e seus grupos." },
    "adm-cad":   { kicker: "Administração", title: "Cadastros", desc: "Entidades do processo. Cada uma será uma aba.", tabs: ["Pessoas", "Áreas", "Unidades", "Lista de status"] },
    "adm-users": { kicker: "Administração", title: "Usuários", desc: "Permissões de acesso (Adm · Operador · Visitante) e allowlist de e-mails." },
    "adm-cfg":   { kicker: "Administração", title: "Configurações", desc: "Ajustes gerais da aplicação." },
  };
  renderPlaceholder(slot, P[itemKey] || { kicker: "", title: "Em construção", desc: "" });
}

/* ============================ SHELL DO PROJETO (DS v2) ============================ */
/* Ícones inline para o rail de contexto do projeto (coerentes com ITEM_IC). */
const PROJ_IC = {
  dash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  solic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>',
  back:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  imp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  exp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/></svg>',
  cfg:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

/* Rail de contexto do projeto: nav (Dashboard/Solicitações/Busca) + Abas + rodapé.
   Mantém os IDs que o resto do app já usa: #nav-dashboard, #nav-solic, #sheet-list, #exp-bar. */
function buildProjectRail() {
  const navItem = (id, icon, label, on) => {
    const a = h("button", id ? { class: "pn-item", id, onClick: on } : { class: "pn-item", onClick: on });
    a.innerHTML = icon + '<span>' + escapeHtml(label) + '</span>';
    return a;
  };
  const nav = h("div", { class: "proj-nav" },
    navItem("nav-dashboard", PROJ_IC.dash, "Dashboard", () => goProject(App.project.id)),
    navItem("nav-solic", PROJ_IC.solic, "Solicitações", () => showSolicitacoes()),
    navItem(null, PROJ_IC.search, "Busca geral", () => openGlobalSearch()));

  const sheetList = h("div", { class: "sheet-list", id: "sheet-list" });
  const abas = h("div", { class: "proj-abas" },
    h("div", { class: "pa-top" },
      h("span", { class: "pa-lab" }, "Abas"),
      h("button", { class: "pa-add", title: "Nova aba", onClick: newSheet }, "+")),
    h("input", { class: "side-search", type: "search", placeholder: "Buscar aba…", value: App.sheetFilter || "",
      oninput: (e) => { App.sheetFilter = e.target.value; renderSidebar(); } }),
    sheetList);

  const footBtn = (icon, label, on, id) => {
    const b = h("button", id ? { class: "pf-btn", id, onClick: on } : { class: "pf-btn", onClick: on });
    b.innerHTML = icon + '<span>' + escapeHtml(label) + '</span>';
    return b;
  };
  const foot = h("div", { class: "proj-foot" },
    isAdmin() ? footBtn(PROJ_IC.imp, "Importar Excel", openExcelImport) : null,
    footBtn(PROJ_IC.exp, "Exportar", enterExportMode, "btn-export"),
    footBtn(PROJ_IC.cfg, "Configuração", openConfig),
    h("div", { class: "exp-bar", id: "exp-bar", hidden: true }));

  return h("aside", { class: "proj-rail", "aria-label": "Navegação do projeto" },
    h("div", { class: "pr-head" },
      h("button", { class: "pr-back", title: "Voltar para Operações", "aria-label": "Voltar para Operações",
        onClick: goOperacoes, html: PROJ_IC.back }),
      h("span", { class: "pr-name", title: App.project ? App.project.name : "" }, App.project ? App.project.name : "")),
    nav, abas, foot);
}

/* Área de trabalho do projeto montada dentro de #mod-content (modo projeto). */
function buildProjectPane() {
  const crumb = h("div", { class: "crumb", id: "crumb" }, "—");
  const presence = h("div", { class: "presence", id: "presence" });
  const collapseBtn = h("button", { class: "ph-collapse", title: "Recolher/expandir o menu do projeto", "aria-label": "Recolher o menu do projeto",
    onClick: () => document.querySelector(".proj-shell")?.classList.toggle("rail-collapsed"),
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>' });
  const head = h("div", { class: "proj-head" }, collapseBtn, crumb, presence);

  const toolbar = buildToolbar();

  const gridScroll = h("div", { class: "grid-scroll", id: "grid-scroll", tabindex: "0" });
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

  const main = h("div", { class: "proj-main" }, head, toolbar, gridScroll, statusbar);
  return h("div", { class: "proj-shell" }, buildProjectRail(), main);
}

function buildShell() {
  // ---- Sidebar ----
  const sheetList = h("div", { class: "sheet-list", id: "sheet-list" });
  const sidebar = h("aside", { class: "lg-sidebar" },
    h("div", { class: "brand" },
      h("img", { class: "brand-logo", src: "app_planejamento_logo.png", alt: "App Planejamento" }),
      h("div", { class: "brand-proj", id: "brand-proj" }, App.project ? App.project.name : "")),
    h("div", { class: "side-nav" },
      h("button", { class: "side-nav-item nav-others", onClick: goOperacoes }, "↩ Operações"),
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
  const topbar = h("header", { class: "lg-topbar" }, collapseBtn, crumb, presence, userChipEl());

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
  return h("div", { class: "lg-app" }, sidebar, workspace);
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
  App._empData = null;          // invalida o cache do cruzamento (abas mudaram)
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
/* legenda da aba (subtítulo detectado de dentro da planilha; editável).
   O NOME (ex.: "1.2") vem da origem e não muda; a legenda (ex.: "Derivativos") sim.
   NULL/undefined = ainda não detectada; "" = detectada e não encontrada (renomear manual). */
function sheetLegend(s) { return s && s.legend != null ? String(s.legend) : ""; }
/* a aba índice "Solicitações" virou a tela-tabela: some da lista de abas */
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
      const hay = (s.name + " " + sheetLegend(s) + " " + sheetAreaText(s) + " " + (info ? info.scot + " " + info.clientPortal : "")).toLowerCase();
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
    const sub = sheetLegend(s);
    const tip = s.name + (sub ? " · " + sub : "") + (t ? "\nAlterado: " + fmtDate(t) : "");
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
        sub ? h("span", { class: "sub-name" }, sub) : null),
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
  item("Renomear legenda…", () => renameSheetLegend(s));
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
async function renameSheetLegend(s) {
  // edita só a LEGENDA (subtítulo); o nome/código da aba vem da origem e não muda.
  const legend = await promptModal(`Legenda da aba ${s.name}`, "Legenda (ex.: Derivativos)", sheetLegend(s));
  if (legend == null) return;                       // cancelou
  const val = String(legend).trim();
  if (val === sheetLegend(s)) return;
  try { await store.updateSheet(s.id, { legend: val }); }
  catch (e) { toast("Não consegui salvar a legenda: " + (e.message || e) + " — rode sql/20_sheet_legend.sql no Supabase.", "err"); return; }
  s.legend = val;
  await refreshSheets();
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
  if (App.view !== "dashboard") App._empData = null;     // entrou no dashboard de fora (ex.: após editar células/abas) → recomputa o cruzamento; troca de tab reusa o cache
  document.getElementById("emp-tip")?.classList.remove("show");   // não deixar tooltip preso
  App.view = "dashboard";
  App.sheet = null;
  if (!App.dashTab) App.dashTab = "empresa";             // 1ª aba do Dashboard = Empresas
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
  tabs.appendChild(mkTab("empresa", "Empresas"));
  tabs.appendChild(mkTab("status", "Abas"));
  tabs.appendChild(mkTab("users", "Usuários"));
  const body = h("div", { class: "dash-body", id: "dash-body" });
  gs.appendChild(tabs);
  gs.appendChild(body);

  if (App.dashTab === "users") return renderDashUsers(body);
  if (App.dashTab === "empresa") return renderDashEmpresa(body);
  return renderDashStatus(body, gs);
}

/* ===== Dashboard · aba "Entregas por empresa" ===== */
let RAMP_TOTAL = ["#E2EEEC", "#AFD2C9", "#6FB0A2", "#0c3530"]; // rampa neutra (teal) p/ "Todos"

/* filtro de status default = "Pendente" (a tag que reduz o volume). Cai para "all"
   se o projeto não tiver um status "pendente". */
function defaultEmpFilter() {
  const opts = getStatusOptions();
  return opts.find((l) => String(l).trim().toLowerCase() === "pendente")
    || opts.find((l) => statusCategoryFor(l) === "pendencia")
    || "all";
}

async function renderDashEmpresa(body) {
  if (App.empFilter == null) App.empFilter = defaultEmpFilter();
  if (!App.empOrient) App.empOrient = "ec";   // "ec" = empresa em coluna (abas em linha) · "el" = empresa em linha
  if (App.empOnlyOccur == null) App.empOnlyOccur = false;   // default: mostra tudo (não oculta linhas/colunas vazias)
  clear(body);
  body.appendChild(h("div", { class: "spinner", style: { margin: "50px auto" } }));
  let data;
  try { data = await getEmpData(); }
  catch (e) { clear(body); body.appendChild(h("p", { class: "muted", style: { padding: "28px" } }, "Erro ao carregar: " + (e.message || e))); return; }
  if (App.view !== "dashboard" || App.dashTab !== "empresa") return;
  clear(body);

  if (!data.empresas.length) {
    body.appendChild(h("div", { class: "dash-emp" },
      h("div", { class: "emp-empty" },
        h("h3", {}, "Nada para mostrar ainda"),
        h("p", {}, "Cadastre as empresas (Configuração → Lista de Empresas) e confira a leitura das abas. O dashboard lê os status reais das planilhas cruzados com o campo Área das Solicitações."))));
    return;
  }

  const wrap = h("div", { class: "dash-emp" });
  body.appendChild(wrap);

  // filtro de status — no TOPO e em evidência, pois altera o comportamento de tudo (KPIs? não; matriz + gráfico)
  wrap.appendChild(h("div", { class: "emp-filterbar" },
    h("span", { class: "efb-lbl" }, "Filtrar por status"),
    h("div", { class: "emp-filters", id: "emp-filters" })));

  wrap.appendChild(h("div", { class: "emp-kpis", id: "emp-kpis" }));
  wrap.appendChild(h("div", { class: "emp-companies", id: "emp-companies" }));   // filtro por empresa (aplica a tudo)

  // toggle de orientação da matriz (empresa em coluna ↔ linha) — atualiza o realce ao clicar
  const orientSeg = h("div", { class: "seg emp-orient" });
  const mkOrient = (k, l) => {
    const b = h("button", { class: "seg-b" + (App.empOrient === k ? " on" : ""),
      onClick: () => { if (App.empOrient === k) return; App.empOrient = k; orientSeg.querySelectorAll(".seg-b").forEach((x) => x.classList.remove("on")); b.classList.add("on"); empPaint(); } }, l);
    return b;
  };
  [["ec", "Empresa em coluna"], ["el", "Empresa em linha"]].forEach(([k, l]) => orientSeg.appendChild(mkOrient(k, l)));

  // toggle: ocultar linhas/colunas sem ocorrência (default off = mostra tudo)
  const occChk = h("input", { type: "checkbox", checked: App.empOnlyOccur });
  occChk.addEventListener("change", () => { App.empOnlyOccur = occChk.checked; empPaint(); });
  const occToggle = h("label", { class: "emp-occ", title: "Oculta linhas e colunas sem nenhum valor no filtro atual" },
    occChk, h("span", { class: "sw" }), h("span", { class: "tx" }, "Só com ocorrência"));

  // matriz Empresa × Aba — de fora a fora, altura fixa com rolagem vertical
  const mxCard = h("div", { class: "card" },
    h("div", { class: "card-head" }, h("h3", {}, "Matriz · Empresa × Aba"),
      h("div", { class: "ch-tools" }, h("span", { class: "hint", id: "emp-hint" }, ""), occToggle, orientSeg)),
    h("div", { class: "card-body" },
      h("div", { class: "emp-mx-scroll" }, h("table", { class: "emp-mx", id: "emp-mx" })),
      h("p", { class: "emp-note" }, "Cada aba pertence a uma empresa e a soma bate com o total (cada item pertence a uma aba). Clique (ou Enter) numa célula → abre a aba e vai à célula do item.")));
  wrap.appendChild(mxCard);

  // gráfico "Entregas por empresa" — barras verticais agrupadas por status, ocupando toda a largura
  const chartCard = h("div", { class: "card" },
    h("div", { class: "card-head" }, h("h3", {}, "Entregas por empresa"), h("span", { class: "hint" }, "ordenado por pendências")),
    h("div", { class: "card-body" }, h("div", { class: "emp-vbars", id: "emp-bars" })));
  wrap.appendChild(chartCard);

  empPaint();
}

/* empresas exibidas conforme o filtro por empresa (App.empCompany = null => todas) */
function empCompaniesShown(data) { return App.empCompany ? data.empresas.filter((e) => e === App.empCompany) : data.empresas; }
/* byStatus DISTINTO no escopo do filtro por empresa (p/ KPIs e tags) */
function empScopedByStatus(data) {
  return App.empCompany ? (data.byCompanyStatus.get(App.empCompany) || new Map()) : data.byStatus;
}
/* barra de tags de empresa (seleção única, contagem sutil) */
function empCompanyFilter(host, data) {
  if (!host) return;
  clear(host);
  const totByEmp = new Map();   // itens DISTINTOS por empresa (não expande por processo)
  data.empresas.forEach((emp) => { let t = 0; (data.byCompanyStatus.get(emp) || new Map()).forEach((q) => t += q); totByEmp.set(emp, t); });
  let grand = 0; totByEmp.forEach((v) => grand += v);
  const tag = (key, label, n) => {
    const on = (App.empCompany || "__all__") === key;
    const b = h("button", { class: "cchip" + (on ? " on" : ""), onClick: () => { App.empCompany = (key === "__all__") ? null : key; empPaint(); } },
      h("span", { class: "lb" }, label), h("span", { class: "n" }, String(n)));
    return b;
  };
  host.appendChild(tag("__all__", "Todas", grand));
  data.empresas.forEach((emp) => { if ((totByEmp.get(emp) || 0) > 0) host.appendChild(tag(emp, emp, totByEmp.get(emp))); });
}

/* re-render que depende dos filtros (empresa + status): tags + KPIs + matriz + barras + hint */
function empPaint() {
  const data = App._empData; if (!data) return;
  empCompanyFilter(document.getElementById("emp-companies"), data);
  empKpis(data);
  empFilters(document.getElementById("emp-filters"), data);
  empMatrix(document.getElementById("emp-mx"), data);
  empVBars(data);
  const sel = App.empFilter;
  const hint = document.getElementById("emp-hint");
  if (hint) hint.textContent = "Mostrando: " + (sel === "all" ? "total de itens" : "status " + sel) + (App.empCompany ? " · " + App.empCompany : "");
}

/* stubs — preenchidos nas próximas tasks */
function empKpis(data) {
  const host = document.getElementById("emp-kpis"); if (!host) return;
  let total = 0, recebido = 0, pend = 0;
  empScopedByStatus(data).forEach((qtd, label) => {
    total += qtd;
    const cat = statusCategoryFor(label);   // I-0015: KPIs pela categoria, não pela cor
    if (cat === "concluido") recebido += qtd;
    else if (cat === "pendencia") pend += qtd;
  });
  const pct = total ? Math.round(recebido / total * 100) : 0;
  const processos = data.areasCount || 0;
  const ico = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${p}</svg>`;
  const card = (cls, p, label, val) => h("div", { class: "card stat" },
    h("div", { class: "ico " + cls, html: ico(p) }),
    h("div", {}, h("div", { class: "s-label" }, label), h("div", { class: "s-value", html: val })));
  clear(host);
  host.appendChild(card("c-total", '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/>', "Itens mapeados", String(total)));
  host.appendChild(card("c-ok", '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>', "Concluído", `${recebido}<small>${pct}%</small>`));
  host.appendChild(card("c-pend", '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>', "Pendências", String(pend)));
  host.appendChild(card("c-emp", '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>', "Empresas", String(empCompaniesShown(data).length)));
  host.appendChild(card("c-proc", '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', "Processos (Áreas)", String(processos)));
}
function empFilters(host, data) {
  if (!host) return;
  const byKey = new Map(); let totAll = 0;
  data.byStatus.forEach((qtd, label) => { byKey.set(label, qtd); totAll += qtd; });
  clear(host);
  const chip = (key, label, n, cls) => {
    const b = h("button", { class: "fchip" + (App.empFilter === key ? " on" : ""), "data-k": key },
      h("span", { class: "dot " + (cls || "") }),
      h("span", { class: "lb" }, label),
      h("span", { class: "n" }, String(n)));
    b.addEventListener("click", () => { App.empFilter = key; empPaint(); });
    return b;
  };
  host.appendChild(chip("all", "Todos", totAll, "all"));
  getStatusOptions().forEach((label) => { if (byKey.has(label)) host.appendChild(chip(label, label, byKey.get(label), statusClassFor(label) || "na")); });
}

function empMatrix(table, data) {
  if (!table) return;
  const sel = App.empFilter;            // "all" | label de status
  const statuses = getStatusOptions();
  const empByCol = App.empOrient === "ec";   // empresa em coluna → abas nas linhas
  const emps = empCompaniesShown(data);
  const abas = data.abas || [];
  const compBar = (comp, tot) => statuses.map((st) => { const q = comp.get(st) || 0; return q ? `<i style="background:var(--st-${statusClassFor(st) || "na"});width:${q / (tot || 1) * 100}%"></i>` : ""; }).join("");
  const valOf = (c) => !c ? 0 : (sel === "all" ? c.total : (c.status.get(sel) || 0));
  const empItem = (e) => ({ kind: "emp", key: e, name: e });
  const abaItem = (a) => ({ kind: "aba", key: a.id, name: a.name, legend: a.legend });
  const cellOf = (ri, ci) => { const emp = ri.kind === "emp" ? ri.key : ci.key; const sid = ri.kind === "aba" ? ri.key : ci.key; return data.matrixAba.get(emp)?.get(sid); };
  let rowItems = empByCol ? abas.map(abaItem) : emps.map(empItem);
  let colItems = empByCol ? emps.map(empItem) : abas.map(abaItem);
  // toggle "só com ocorrência": oculta linhas/colunas sem nenhum valor no filtro atual
  if (App.empOnlyOccur) {
    colItems = colItems.filter((ci) => rowItems.some((ri) => valOf(cellOf(ri, ci)) > 0));
    rowItems = rowItems.filter((ri) => colItems.some((ci) => valOf(cellOf(ri, ci)) > 0));
  }

  // escala (máximo) p/ a intensidade da rampa
  let max = 1;
  rowItems.forEach((ri) => colItems.forEach((ci) => { const v = valOf(cellOf(ri, ci)); if (v > max) max = v; }));
  const idxOf = (v) => { const r = v / (max || 1); return r <= 0.34 ? 0 : r <= 0.67 ? 1 : 2; };
  // rótulo de aba: código (b) + legenda (i) em duas linhas
  const abaHead = (it, cls) => h("span", { class: cls }, h("b", {}, it.name), it.legend ? h("i", {}, it.legend) : null);

  clear(table);
  // thead
  const trh = h("tr", {}, h("th", { class: "corner rh" }, empByCol ? "Aba" : "Empresa"));
  colItems.forEach((ci) => trh.appendChild(ci.kind === "aba"
    ? h("th", { class: "th-aba", title: ci.name + (ci.legend ? " · " + ci.legend : "") }, abaHead(ci, "emp-th-aba"))
    : h("th", { title: ci.name }, h("span", { class: "emp-th-lbl" }, ci.name))));
  trh.appendChild(h("th", { class: "col-tot" }, "Total"));
  table.appendChild(h("thead", {}, trh));

  const tb = h("tbody", {});
  const colAgg = colItems.map(() => ({ tot: 0, comp: new Map() }));
  let grandTot = 0; const grandComp = new Map();
  rowItems.forEach((ri) => {
    const rh = ri.kind === "aba"
      ? h("th", { class: "rh rh-aba-cell", title: ri.name + (ri.legend ? " · " + ri.legend : "") }, abaHead(ri, "rh-aba"))
      : h("th", { class: "rh" }, ri.name);
    const tr = h("tr", {}, rh);
    let rowTot = 0; const rowComp = new Map();
    colItems.forEach((ci, ci_i) => {
      const c = cellOf(ri, ci);
      const v = valOf(c);
      const td = h("td", {});
      if (c) {
        const contrib = sel === "all" ? c.status : new Map(c.status.has(sel) ? [[sel, c.status.get(sel)]] : []);
        contrib.forEach((q, st) => { rowComp.set(st, (rowComp.get(st) || 0) + q); colAgg[ci_i].comp.set(st, (colAgg[ci_i].comp.get(st) || 0) + q); });
        rowTot += v; colAgg[ci_i].tot += v;
      }
      if (!c || v === 0) { td.appendChild(h("div", { class: "emp-cell empty" }, "·")); tr.appendChild(td); return; }
      const ramp = sel === "all" ? RAMP_TOTAL : rampFor(sel);
      const compHtml = sel === "all" ? '<div class="comp">' + compBar(c.status, c.total) + "</div>" : "";
      const empName = ri.kind === "emp" ? ri.name : ci.name;
      const abaObj = ri.kind === "aba" ? ri : ci;
      const abaTxt = abaObj.name + (abaObj.legend ? " · " + abaObj.legend : "");
      const cellEl = h("div", { class: "emp-cell has", tabindex: "0", role: "button",
        style: { background: ramp[idxOf(v)], color: ramp[3] },
        html: `<span>${v}</span>${compHtml}` });
      cellEl.addEventListener("click", () => empGoTo(c));
      cellEl.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); empGoTo(c); } });
      cellEl.addEventListener("mouseenter", (e) => empTip(e, empName, abaTxt, c));
      cellEl.addEventListener("mousemove", (e) => empTip(e, empName, abaTxt, c, true));
      cellEl.addEventListener("mouseleave", empTipHide);
      td.appendChild(cellEl); tr.appendChild(td);
    });
    grandTot += rowTot; rowComp.forEach((q, st) => grandComp.set(st, (grandComp.get(st) || 0) + q));
    tr.appendChild(h("td", { class: "tot td-tot" }, rowTot
      ? h("div", { class: "emp-cell tot-cell" }, h("span", {}, String(rowTot)), h("span", { class: "minibar", html: compBar(rowComp, rowTot) }))
      : h("div", { class: "emp-cell empty" }, "·")));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  // tfoot: total por coluna + total geral
  const tf = h("tr", {}, h("th", { class: "rh" }, "Total"));
  colItems.forEach((ci, i) => { const t = colAgg[i].tot; tf.appendChild(h("td", {}, t
    ? h("div", { class: "emp-cell tot-cell" }, h("span", {}, String(t)), h("span", { class: "minibar", html: compBar(colAgg[i].comp, t) }))
    : h("div", { class: "emp-cell empty" }, "·"))); });
  tf.appendChild(h("td", { class: "tot td-tot" }, h("div", { class: "emp-cell tot-cell" }, h("span", {}, String(grandTot)), h("span", { class: "minibar", html: compBar(grandComp, grandTot) }))));
  table.appendChild(h("tfoot", {}, tf));
}

/* gráfico "Entregas por empresa": barras verticais AGRUPADAS por status (não empilhado).
   Respeita o filtro de status (App.empFilter) e o filtro de empresa. Com "Pendente"
   (default) cada empresa vira uma barra só — o filtro reduz o volume. */
function empVBars(data) {
  const host = document.getElementById("emp-bars"); if (!host) return;
  const sel = App.empFilter;
  const statuses = getStatusOptions();
  const isPend = (st) => statusCategoryFor(st) === "pendencia";
  const shownStatuses = (sel === "all" ? statuses : [sel]).filter((st) => data.byStatus.has(st));
  const rows = empCompaniesShown(data).map((emp) => {
    const agg = data.byCompanyStatus.get(emp) || new Map();
    let tot = 0; agg.forEach((q) => tot += q);
    let pend = 0; agg.forEach((q, st) => { if (isPend(st)) pend += q; });
    return { emp, agg, tot, pend };
  }).filter((r) => r.tot > 0).sort((a, b) => b.pend - a.pend);
  clear(host);
  if (!rows.length) { host.appendChild(h("p", { class: "muted", style: { padding: "18px" } }, "Sem dados para o filtro atual.")); return; }
  let max = 1;
  rows.forEach((r) => shownStatuses.forEach((st) => { const q = r.agg.get(st) || 0; if (q > max) max = q; }));
  rows.forEach((r) => {
    const bars = shownStatuses.map((st) => {
      const q = r.agg.get(st) || 0; if (!q) return null;
      return h("i", { class: "vb", title: `${st}: ${q}`, style: { height: (q / max * 100) + "%", background: `var(--st-${statusClassFor(st) || "na"})` } },
        h("span", { class: "vb-n" }, String(q)));
    }).filter(Boolean);
    const grp = h("div", { class: "vg" + (App.empCompany === r.emp ? " on" : "") },
      h("div", { class: "vbars" }, bars.length ? bars : h("i", { class: "vb zero" })),
      h("div", { class: "vg-lbl", title: r.emp }, r.emp));
    grp.title = `${r.emp} — ${r.tot} itens · ${r.pend} pendência(s)`;
    grp.addEventListener("click", () => { App.empCompany = (App.empCompany === r.emp) ? null : r.emp; empPaint(); });
    host.appendChild(grp);
  });
}

/* donut "Distribuição por status" removido (decisão 2026-06-25): a tab Empresas
   não usa mais o gráfico de rosca; o card foi retirado do rail. */

function empGoTo(c) {
  empTipHide();   // some com o tooltip antes de navegar (o DOM da matriz é destruído e o mouseleave não dispara)
  if (!c || !c.targets.length) return;
  const sel = App.empFilter;
  const t = (sel !== "all" && c.targets.find((x) => x.status === sel)) || c.targets[0];
  goToCell(App.project.id, t.sheetId, t.row, t.col);
}

function empTipHide() { const t = document.getElementById("emp-tip"); if (t) t.classList.remove("show"); }
function empTipEl() {
  let t = document.getElementById("emp-tip");
  if (!t) { t = h("div", { id: "emp-tip" }); document.body.appendChild(t); }
  return t;
}
function empTip(e, emp, area, c, moveOnly) {
  const t = empTipEl();
  if (!moveOnly) {
    const rows = getStatusOptions().filter((st) => c.status.get(st)).map((st) =>
      `<div class="tt-r"><span class="sw" style="background:var(--st-${statusClassFor(st) || "na"})"></span>${escapeHtml(st)}<span class="v">${c.status.get(st)}</span></div>`).join("");
    t.innerHTML = `<div class="tt-h">${escapeHtml(emp)} · ${escapeHtml(area)}</div>${rows}<div class="tt-f">Clique → abrir a aba na célula</div>`;
    t.classList.add("show");
  }
  const pad = 14, w = t.offsetWidth, hh = t.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + hh > innerHeight - 8) y = e.clientY - hh - pad;
  t.style.left = x + "px"; t.style.top = y + "px";
}

async function renderDashStatus(body, gs) {
  body.appendChild(h("div", { class: "spinner", style: { margin: "50px auto" } }));
  let data;
  try { data = await getEmpData(); }
  catch (e) { clear(body); body.appendChild(h("p", { class: "muted", style: { padding: "28px" } }, "Erro ao carregar: " + (e.message || e))); return; }
  if (App.view !== "dashboard" || App.dashTab !== "status") return;

  const sheetName = new Map(App.sheets.map((s) => [s.id, s.name]));
  // P5.1: contagem pelo CRUZAMENTO Empresa×Status (parseAbas) — ignora status soltos
  const agg = new Map(); let grand = 0;
  data.bySheetStatus.forEach((stMap, sheetId) => {
    stMap.forEach((cnt, label) => {
      const lab = normStatusLabel(label); if (!lab) return;
      if (!agg.has(lab)) agg.set(lab, { total: 0, sheets: new Map() });
      const a = agg.get(lab); a.total += cnt; grand += cnt;
      a.sheets.set(sheetId, (a.sheets.get(sheetId) || 0) + cnt);
    });
  });
  const order = [...getStatusOptions()];
  for (const k of agg.keys()) if (!order.includes(k)) order.push(k);

  clear(body);
  body.appendChild(h("p", { class: "sub" }, `Por aba · ${grand} itens no cruzamento Empresa×Status, em ${data.bySheetStatus.size} aba(s). Clique num card para ver as abas; clique numa aba para abri-la.`));
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
    card.appendChild(h("div", { class: "kpi-top" },
      h("span", { class: "chip " + cls }, label),
      h("div", { class: "val" }, String(a.total))));
    card.appendChild(h("div", { class: "lbl" }, `${a.sheets.size} aba(s) · clique para abrir`));
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
  /* I-0015 — rampas das cores livres adicionais (claro → médio → texto escuro) */
  azul:     ["#E7EEF7", "#B9CEE8", "#7FA3D2", "#0B2647"],
  ciano:    ["#E0F0F4", "#A9D5DF", "#67B2C2", "#053842"],
  roxo:     ["#ECE9F4", "#C9C1E2", "#9D90C9", "#241B49"],
  rosa:     ["#F6E6EE", "#E6B9CE", "#D086A9", "#3A1023"],
  vermelho: ["#F8E5E3", "#EEB6B2", "#E08580", "#3F0F0D"],
};
function rampFor(label) { return STATUS_RAMP[statusClassFor(label) || "na"] || STATUS_RAMP.na; }
function heatTd(v, ramp, max, onClick) {
  const cell = h("div", { class: "hcell" }, v ? String(v) : "·");
  if (v) { const ratio = v / (max || 1); const i = ratio <= 0.34 ? 0 : ratio <= 0.67 ? 1 : 2; cell.style.background = ramp[i]; cell.style.color = ramp[3]; }
  else cell.style.color = "#aab2bd";
  const attrs = (v && onClick) ? { class: "u-click", title: "Ver entregas", onClick } : {};
  return h("td", attrs, cell);
}
/* célula de total clicável (col/linha/geral); só clica se houver valor */
function totTd(n, onClick) {
  const attrs = (n && onClick) ? { class: "tot u-click", title: "Ver entregas", onClick } : { class: "tot" };
  return h("td", attrs, String(n));
}
function kpi(label, val) { return h("div", { class: "u-kpi" }, h("div", { class: "l" }, label), h("div", { class: "v" }, val)); }

/* início do período selecionado (7/30 dias) ou null em "Tudo" — para o drill bater com os números da tabela */
function usersSince() {
  const d = App.usersPeriod === "7" ? 7 : App.usersPeriod === "30" ? 30 : null;
  return d ? new Date(Date.now() - d * 86400000) : null;
}
/* lê uma CSS var do :root (cor do tema atual) */
function cssVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
/* converte qualquer cor CSS (hex/nome/rgb) em rgba(...,a) via normalização do canvas */
function colorToRgba(c, a) {
  const cx = (colorToRgba._cx || (colorToRgba._cx = document.createElement("canvas").getContext("2d")));
  cx.fillStyle = "#000"; cx.fillStyle = c; const s = cx.fillStyle;
  if (s[0] === "#") { const n = parseInt(s.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  return s.replace(/rgba?\(([^)]+)\)/, (_, p) => { const [r, g, b] = p.split(",").map((x) => x.trim()); return `rgba(${r},${g},${b},${a})`; });
}

/* P6 — modal amplo de drill de entregas (mudanças de status em células do cruzamento
   Empresa×Status), agrupadas por empresa → aba, expansíveis até a célula.
   ctx: { title, user?, userId?, userIds?(Set), status?, day?(YYYY-MM-DD), since?(Date) } */
async function openDeliveriesDrill(ctx = {}) {
  const { title = "Entregas", user = null, userId = null, userIds = null, status = null, day = null, since = null } = ctx;
  const scrim = h("div", { class: "scrim" });
  const close = () => scrim.remove();
  const bodyEl = h("div", { class: "u-drill" }, h("div", { class: "spinner", style: { margin: "40px auto" } }));
  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-primary", onClick: close }, "Fechar"));
  const headIcon = user ? avatarEl(user, 32)
    : status ? h("span", { class: "chip " + (statusClassFor(status) || "na") }, status)
    : null;
  const head = h("div", { class: "u-drill-head" }, headIcon, h("h3", { style: { margin: 0 } }, title));
  const modal = h("div", { class: "modal wide u-drill-modal" }, head, bodyEl, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);

  let data, lastChanges;
  try {
    data = await getEmpData();
    const statusSet0 = new Set(getStatusOptions().map((s) => String(s).trim().toLowerCase()));
    const all = await store.loadStatusChanges(App.sheets.map((s) => s.id), {});   // todas, desc
    // dedup: só a ÚLTIMA alteração de cada célula do cruzamento (mesma regra do medidor)
    const seen = new Set(); lastChanges = [];
    for (const ch of all) {
      const ck = ch.sheet_id + ":" + ch.row + ":" + ch.col;
      if (seen.has(ck)) continue; seen.add(ck);
      if (!data.cellIndex.has(ck)) continue;
      const nv = String(ch.new_value || "").trim();
      if (!nv || !statusSet0.has(nv.toLowerCase())) continue;
      lastChanges.push(ch);
    }
  } catch (e) { clear(bodyEl); bodyEl.appendChild(h("p", { class: "muted", style: { padding: "20px" } }, "Erro ao carregar: " + (e.message || e))); return; }

  const wantStatus = status ? normStatusLabel(status).toLowerCase() : null;
  const byEmp = new Map();   // empresa -> Map(sheetName -> {sheetId, items:[{row,col,status,changed_at}]})
  let total = 0;
  for (const ch of lastChanges) {
    const nv = String(ch.new_value || "").trim();
    if (wantStatus && normStatusLabel(nv).toLowerCase() !== wantStatus) continue;
    if (day && String(ch.changed_at).slice(0, 10) !== day) continue;
    if (since && new Date(ch.changed_at) < since) continue;   // período pela data da última alteração
    if (userId && ch.changed_by !== userId) continue;
    if (userIds && !userIds.has(ch.changed_by)) continue;
    const ci = data.cellIndex.get(ch.sheet_id + ":" + ch.row + ":" + ch.col); if (!ci) continue;
    total++;
    if (!byEmp.has(ci.empresa)) byEmp.set(ci.empresa, new Map());
    const sm = byEmp.get(ci.empresa);
    if (!sm.has(ci.sheetName)) sm.set(ci.sheetName, { sheetId: ci.sheetId, items: [] });
    sm.get(ci.sheetName).items.push({ row: ch.row, col: ch.col, status: nv, changed_at: ch.changed_at });
  }

  clear(bodyEl);
  if (!total) { bodyEl.appendChild(h("p", { class: "muted", style: { padding: "24px", textAlign: "center" } }, "Sem entregas (mudanças de status em células do cruzamento) para este filtro.")); return; }
  bodyEl.appendChild(h("p", { class: "sub", style: { margin: "0 0 12px" } }, `${total} entrega(s) em ${byEmp.size} empresa(s). Expanda uma aba para ver as células e ir direto nelas.`));

  [...byEmp.keys()].sort((a, b) => a.localeCompare(b, "pt")).forEach((emp) => {
    const sm = byEmp.get(emp);
    let empTot = 0; sm.forEach((v) => empTot += v.items.length);
    const grp = h("div", { class: "ud-emp" });
    grp.appendChild(h("div", { class: "ud-emp-h" }, h("span", { class: "ud-emp-nm" }, emp), h("span", { class: "ud-emp-n" }, String(empTot))));
    [...sm.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt")).forEach(([sheetName, info]) => {
      const det = h("details", { class: "ud-aba" });
      det.appendChild(h("summary", {}, h("span", { class: "ud-aba-nm" }, sheetName), h("span", { class: "ud-aba-n" }, String(info.items.length))));
      const list = h("div", { class: "ud-cells" });
      info.items.sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at))).forEach((it) => {
        list.appendChild(h("div", { class: "ud-cell" },
          h("span", { class: "chip " + (statusClassFor(it.status) || "na") }, it.status),
          h("span", { class: "ud-when" }, fmtDate(it.changed_at)),
          h("button", { class: "btn btn-ghost btn-sm", onClick: () => { close(); goToCell(App.project.id, info.sheetId, it.row, it.col); } }, "Ir à célula")));
      });
      det.appendChild(list);
      grp.appendChild(det);
    });
    bodyEl.appendChild(grp);
  });
}

/* wrapper compatível: cabeçalhos de linha/coluna continuam chamando openUserDrill(u) */
function openUserDrill(user) {
  return openDeliveriesDrill({ title: "Entregas de " + (user.name || "—"), user, userId: user.id, since: usersSince() });
}

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
      h("p", { class: "sub" }, "Último status de cada item (no cruzamento Empresa×Status), atribuído a quem fez a última alteração · o período usa a data dessa alteração")),
    h("div", { class: "dash-ctrls" },
      seg([["7", "7 dias"], ["30", "30 dias"], ["all", "Tudo"]], App.usersPeriod, (k) => { App.usersPeriod = k; renderDashUsers(body); }),
      seg([["su", "Status × Usuário"], ["us", "Usuário × Status"]], App.usersOrient, (k) => { App.usersOrient = k; renderDashUsers(body); }))));
  const spin = h("div", { class: "spinner", style: { margin: "50px auto" } });
  body.appendChild(spin);

  const days = App.usersPeriod === "7" ? 7 : App.usersPeriod === "30" ? 30 : null;
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  // medidor = ÚLTIMO status de cada célula do cruzamento (não o histórico de mudanças).
  // Dedup: 1ª ocorrência na ordem desc = a alteração mais recente da célula. Assim, se a
  // pessoa muda N/A→Recebido→N/A, conta 1x (N/A), batendo com abas×empresas×status.
  let rows;
  try {
    const data = await getEmpData();
    const statusSet = new Set(getStatusOptions().map((s) => String(s).trim().toLowerCase()));
    const changes = await store.loadStatusChanges(App.sheets.map((s) => s.id), {});   // todas, ordenadas por changed_at desc
    const seen = new Set(); const lastByCell = new Map();
    for (const ch of changes) {
      const ck = ch.sheet_id + ":" + ch.row + ":" + ch.col;
      if (seen.has(ck)) continue; seen.add(ck);          // esta é a última alteração desta célula
      if (!data.cellIndex.has(ck)) continue;             // fora do cruzamento Empresa×Status
      const nv = String(ch.new_value || "").trim();
      if (!nv || !statusSet.has(nv.toLowerCase())) continue;   // último valor não é status válido → não conta
      lastByCell.set(ck, ch);
    }
    const ag = new Map();
    for (const ch of lastByCell.values()) {
      if (since && new Date(ch.changed_at) < since) continue;   // período pela data da ÚLTIMA alteração
      const nv = String(ch.new_value).trim();
      const dia = String(ch.changed_at).slice(0, 10);
      const k = ch.changed_by + "|" + nv + "|" + dia;
      ag.set(k, (ag.get(k) || 0) + 1);
    }
    rows = [...ag.entries()].map(([k, qtd]) => { const i = k.indexOf("|"), j = k.lastIndexOf("|"); return { user_id: k.slice(0, i), status: k.slice(i + 1, j), dia: k.slice(j + 1), qtd }; });
  } catch (e) {
    // fallback defensivo: RPC original (não quebra o medidor se o cruzamento falhar)
    try { rows = await store.loadUserActivity(App.project, since); }
    catch (e2) {
      spin.remove();
      const hint = /function|does not exist|404|user_status_activity/i.test(e2.message || "") ? " — rode sql/14_user_metrics.sql no Supabase." : "";
      body.appendChild(h("p", { class: "muted", style: { padding: "20px" } }, "Não consegui carregar o medidor: " + (e2.message || e2) + hint));
      return;
    }
  }
  if (App.view !== "dashboard" || App.dashTab !== "users") return;
  spin.remove();
  if (!rows.length) { body.appendChild(h("p", { class: "muted", style: { padding: "20px" } }, "Sem mudanças de status no período selecionado.")); return; }

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const users = userIds.map((id) => { const p = App.profilesMap.get(id) || {}; return { id, name: titleCase(p.display_name || p.full_name || "Usuário"), full_name: p.full_name, color: p.color, avatar_url: p.avatar_url }; });
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
    kpi("Itens no período", String(total)),
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

  // gráfico de entregas ao longo do tempo (todos os dias do período, não só os 21 da tabela)
  buildDeliveryChartCard(body, users, [...daySet].sort(), perDay);
}

function buildMatrix(orient, users, statuses, count, mmax, total, rowByUser, colByStatus) {
  const wrap = h("div", { class: "u-tablewrap" });
  const table = h("table", { class: "umx" });
  const allIds = new Set(users.map((u) => u.id));
  const cellDrill = (u, st) => openDeliveriesDrill({ title: "Entregas de " + u.name + " · " + st, user: u, userId: u.id, status: st, since: usersSince() });
  const userDrill = (u) => openDeliveriesDrill({ title: "Entregas de " + u.name, user: u, userId: u.id, since: usersSince() });
  const statusDrill = (st) => openDeliveriesDrill({ title: "Entregas · " + st, status: st, userIds: allIds, since: usersSince() });
  const allDrill = () => openDeliveriesDrill({ title: "Todas as entregas", userIds: allIds, since: usersSince() });
  if (orient === "su") {
    const head = h("tr", {}, h("th", { class: "rh" }, "Status"));
    users.forEach((u) => head.appendChild(h("th", { class: "u-click u-col", title: "Ver entregas de " + u.name, onClick: () => userDrill(u) }, avatarEl(u, 24), h("span", { class: "u-col-nm" }, u.name))));
    head.appendChild(h("th", {}, "Total"));
    table.appendChild(h("thead", {}, head));
    const tb = h("tbody", {});
    statuses.forEach((st) => {
      const ramp = rampFor(st);
      const tr = h("tr", {}, h("td", { class: "rh" }, h("span", { class: "chip " + (statusClassFor(st) || "na") }, st)));
      users.forEach((u) => tr.appendChild(heatTd((count[u.id] || {})[st] || 0, ramp, mmax, () => cellDrill(u, st))));
      tr.appendChild(totTd(colByStatus(st), () => statusDrill(st)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const tf = h("tr", {}, h("td", { class: "rh" }, "Total"));
    users.forEach((u) => tf.appendChild(totTd(rowByUser(u.id), () => userDrill(u))));
    tf.appendChild(totTd(total, allDrill));
    table.appendChild(h("tfoot", {}, tf));
  } else {
    const head = h("tr", {}, h("th", { class: "rh" }, "Pessoa"));
    statuses.forEach((st) => head.appendChild(h("th", { class: "u-click", title: "Ver entregas · " + st, onClick: () => statusDrill(st) }, h("span", { class: "chip " + (statusClassFor(st) || "na") }, st))));
    head.appendChild(h("th", {}, "Total"));
    table.appendChild(h("thead", {}, head));
    const tb = h("tbody", {});
    users.forEach((u) => {
      const tr = h("tr", {}, h("td", { class: "rh u-click", title: "Ver entregas de " + u.name, onClick: () => userDrill(u) }, avatarEl(u, 24), h("span", { class: "u-nm" }, u.name)));
      statuses.forEach((st) => tr.appendChild(heatTd((count[u.id] || {})[st] || 0, rampFor(st), mmax, () => cellDrill(u, st))));
      tr.appendChild(totTd(rowByUser(u.id), () => userDrill(u)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const tf = h("tr", {}, h("td", { class: "rh" }, "Total"));
    statuses.forEach((st) => tf.appendChild(totTd(colByStatus(st), () => statusDrill(st))));
    tf.appendChild(totTd(total, allDrill));
    table.appendChild(h("tfoot", {}, tf));
  }
  wrap.appendChild(table);
  return wrap;
}

function buildDaily(users, dias, perDay, dmax) {
  const wrap = h("div", { class: "u-tablewrap" });
  const table = h("table", { class: "umx" });
  const ramp = STATUS_RAMP.recebido;
  const allIds = new Set(users.map((u) => u.id));
  const fmtDay = (iso) => { const p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : iso; };
  const userDrill = (u) => openDeliveriesDrill({ title: "Entregas de " + u.name, user: u, userId: u.id, since: usersSince() });
  const dayDrill = (d) => openDeliveriesDrill({ title: "Entregas · " + fmtDay(d), day: d, userIds: allIds, since: usersSince() });
  const cellDrill = (u, d) => openDeliveriesDrill({ title: "Entregas de " + u.name + " · " + fmtDay(d), user: u, userId: u.id, day: d, since: usersSince() });
  const head = h("tr", {}, h("th", { class: "rh" }, "Pessoa"));
  dias.forEach((d) => head.appendChild(h("th", { class: "u-click", title: "Ver entregas · " + fmtDay(d), onClick: () => dayDrill(d) }, fmtDay(d))));
  head.appendChild(h("th", {}, "Total"));
  table.appendChild(h("thead", {}, head));
  const tb = h("tbody", {});
  users.forEach((u) => {
    const tr = h("tr", {}, h("td", { class: "rh u-click", title: "Ver entregas de " + u.name, onClick: () => userDrill(u) }, avatarEl(u, 24), h("span", { class: "u-nm" }, u.name)));
    let t = 0;
    dias.forEach((d) => { const v = (perDay[u.id] || {})[d] || 0; t += v; tr.appendChild(heatTd(v, ramp, dmax, () => cellDrill(u, d))); });
    tr.appendChild(totTd(t, () => userDrill(u)));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  const tf = h("tr", {}, h("td", { class: "rh" }, "Total/dia"));
  let gt = 0;
  dias.forEach((d) => { let c = 0; users.forEach((u) => { c += (perDay[u.id] || {})[d] || 0; }); gt += c; tf.appendChild(totTd(c, () => dayDrill(d))); });
  tf.appendChild(totTd(gt, () => openDeliveriesDrill({ title: "Todas as entregas", userIds: allIds, since: usersSince() })));
  table.appendChild(h("tfoot", {}, tf));
  wrap.appendChild(table);
  return wrap;
}

/* card do gráfico: itens entregues por dia, UMA linha por pessoa (cor da pessoa),
   tags rosto+nome que ligam/desligam só a linha, total tênue no cabeçalho.
   `days` = todos os dias com atividade no período (sem o cap de 21 da tabela). */
function buildDeliveryChartCard(container, users, days, perDay) {
  if (App._deliveryChart) { try { App._deliveryChart.destroy(); } catch (_) {} App._deliveryChart = null; }
  const card = h("div", { class: "u-card" });
  const totalNode = h("span", { class: "v" }, "0");
  card.appendChild(h("div", { class: "u-chart-head" },
    h("div", {}, h("h3", {}, "Entregas ao longo do tempo"),
      h("span", { class: "sub" }, "itens entregues por dia · uma linha por pessoa")),
    h("div", { class: "u-chart-total" }, totalNode, h("span", { class: "l" }, "no período"))));
  const canvas = h("canvas");
  card.appendChild(h("div", { class: "u-chart-wrap" }, canvas));
  const tagsRow = h("div", { class: "u-chart-tags" });
  card.appendChild(tagsRow);
  container.appendChild(card);

  if (typeof Chart === "undefined" || !days.length) {
    card.appendChild(h("p", { class: "muted", style: { padding: "0 16px 16px" } }, "Sem dados para o gráfico."));
    return;
  }

  const fmtDay = (iso) => { const p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : iso; };
  const labels = days.map(fmtDay);
  const colorOf = (u) => u.color || colorFromString(u.id || u.name);
  const userTotal = (u) => days.reduce((s, d) => s + ((perDay[u.id] || {})[d] || 0), 0);
  const visible = new Set(users.map((u) => u.id));   // todos visíveis por padrão

  const updateTotal = () => { let t = 0; users.forEach((u) => { if (visible.has(u.id)) t += userTotal(u); }); totalNode.textContent = String(t); };

  let chart;
  const draw = () => {
    if (chart) { try { chart.destroy(); } catch (_) {} }
    const grid = cssVar("--grid-line") || "rgba(128,128,128,.15)";
    const txt = cssVar("--text-dim") || "#94a3b8";
    const areaFill = (color) => (cx) => {
      const { ctx: c, chartArea } = cx.chart; if (!chartArea) return colorToRgba(color, .2);
      const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, colorToRgba(color, .22)); g.addColorStop(1, colorToRgba(color, 0)); return g;
    };
    chart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets: users.map((u) => { const col = colorOf(u); return {
        label: u.name, data: days.map((d) => (perDay[u.id] || {})[d] || 0),
        borderColor: col, backgroundColor: areaFill(col), fill: true, tension: .45, pointRadius: 0, borderWidth: 2,
        hidden: !visible.has(u.id) }; }) },
      options: { responsive: true, maintainAspectRatio: false,
        animation: false,   // paint determinístico: evita gráfico em branco ao reconstruir (troca de tema/re-render) quando o rAF é estrangulado
        plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: txt, precision: 0 } },
          x: { grid: { display: false }, border: { display: false }, ticks: { color: txt, maxRotation: 0, autoSkip: true } } } }
    });
    App._deliveryChart = chart;
  };
  draw();
  updateTotal();

  users.forEach((u, i) => {
    const chip = h("button", { class: "dchip", title: "Mostrar/ocultar " + u.name, onClick: () => {
      if (visible.has(u.id)) visible.delete(u.id); else visible.add(u.id);
      chip.classList.toggle("off", !visible.has(u.id));
      chart.setDatasetVisibility(i, visible.has(u.id));
      chart.update();
      updateTotal();
    } }, avatarEl(u, 20), h("span", {}, u.name));
    tagsRow.appendChild(chip);
  });

  // re-tema: reconstrói o gráfico com as cores do tema atual; solta o observer quando o canvas sai da tela
  const obs = new MutationObserver(() => { if (!canvas.isConnected) { obs.disconnect(); return; } draw(); });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
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
  const leg = sheetLegend(sheet);
  if (leg) el.appendChild(h("span", { class: "crumb-leg", title: leg }, leg));   // legenda ao lado do número
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
  document.querySelector(".lg-app")?.classList.toggle("sidebar-collapsed");
}

/* presenca no topbar: todos os usuários centralizados (online verde / offline cinza) */
function renderAppPresence() {
  const box = $("#presence"); if (!box) return;
  clear(box);
  const online = new Map((App._appPeers || []).map((p) => [p.id, p]));
  const users = new Map();
  for (const [id, p] of App.profilesMap) users.set(id, { id, name: titleCase(p.display_name || p.full_name || "Usuário"), full_name: p.full_name, email: p.email, color: p.color, avatar_url: p.avatar_url });
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
    item("Importar da EY (colar JSON)…", openEyImport);
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

/* ============================ IMPORTAR DA EY (JSON do portal) ============================ */
/* Recebe o JSON gerado pelo snippet do EY Canvas Client Portal (ver
   tools/ey_export_snippet.js) e faz upsert na tabela ey_requests. Sem arquivo e
   sem diálogo "salvar como": o snippet copia o JSON; aqui a gente cola. */
function openEyImport() {
  const info = h("p", { class: "muted", style: { margin: "0 0 8px", lineHeight: "1.45" } },
    "Com o portal EY aberto, rode o snippet (ou clique no favorito). Ele copia o JSON das solicitações. ",
    h("b", {}, "Cole abaixo"), " e importe — vai para a tabela ", h("code", {}, "ey_requests"), " (não mexe na grade).");
  const ta = h("textarea", {
    rows: 8, spellcheck: "false", placeholder: "Cole aqui o JSON copiado pelo snippet…",
    style: { width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "12px",
             padding: "8px", border: "1px solid var(--border, #ccc)", borderRadius: "8px", resize: "vertical" },
  });
  const status = h("p", { class: "muted", style: { margin: "8px 0 0", minHeight: "18px" } }, "");
  const pasteBtn = h("button", { class: "btn btn-ghost btn-sm", onClick: async () => {
    try { ta.value = await navigator.clipboard.readText(); status.textContent = "Colado da área de transferência."; }
    catch (e) { status.textContent = "Não consegui ler a área de transferência — cole manualmente (Ctrl+V)."; }
  } }, "📋 Colar da área de transferência");
  const body = h("div", {}, info, h("div", { style: { margin: "0 0 8px" } }, pasteBtn), ta, status);

  openModal("Importar da EY", body, [
    { label: "Fechar" },
    { label: "Importar", primary: true, onClick: async () => {
      let payload;
      try { payload = JSON.parse((ta.value || "").trim()); }
      catch (e) { return toast("JSON inválido: " + e.message, "err"); }
      const rows = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.rows) ? payload.rows : null);
      if (!rows || !rows.length) return toast("Nenhuma solicitação encontrada no JSON.", "err");
      if (rows[0].client_request_id == null) return toast("Formato inesperado (faltou client_request_id). Use o snippet oficial.", "err");
      status.textContent = "Importando…";
      try {
        const { upserted } = await store.upsertEyRequests(rows, (m) => { status.textContent = m; });
        const byG = {};
        for (const r of rows) { const g = r.group_name || "(sem grupo)"; byG[g] = (byG[g] || 0) + 1; }
        const resumo = Object.entries(byG).sort((a, b) => a[0].localeCompare(b[0])).map(([g, n]) => `${g}: ${n}`).join(" · ");
        toast(`Importadas ${upserted} solicitações da EY.`);
        status.textContent = "✅ " + upserted + " solicitações · " + resumo;
      } catch (e) { toast("Erro ao importar: " + e.message, "err"); status.textContent = "Falhou: " + e.message; }
    } },
  ]);
}

/* ============================ EXPORTAR EXCEL ============================ */
function safeFile(n) { return String(n).replace(/[\\/?*:"<>|]/g, "_").trim() || "planilha"; }

/* cor da célula de status no Excel: lê a cor REAL do chip (.chip.<klass>) exibido,
   então o export reflete exatamente o que a aba mostra (e segue qualquer mudança de cor). */
const _statusFillCache = new Map();
function rgbToHex(rgb) {
  const m = String(rgb || "").match(/\d+(?:\.\d+)?/g);
  if (!m || m.length < 3) return null;
  if (m.length >= 4 && parseFloat(m[3]) === 0) return null;   // transparente → sem cor
  const h2 = (n) => Math.round(+n).toString(16).padStart(2, "0");
  return "#" + h2(m[0]) + h2(m[1]) + h2(m[2]);
}
function statusFillFor(value) {
  const v = String(value ?? "").trim(); if (!v) return null;
  const klass = statusClassFor(v) || "na";
  if (_statusFillCache.has(klass)) return _statusFillCache.get(klass);
  const el = h("span", { class: "chip " + klass, style: { position: "absolute", visibility: "hidden", left: "-9999px" } }, v);
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const res = { fg: rgbToHex(cs.color), bg: rgbToHex(cs.backgroundColor) };
  el.remove();
  _statusFillCache.set(klass, res);
  return res;
}

async function exportCurrentSheet() {
  if (!App.sheet) return;
  toast("Gerando Excel…");
  try {
    await excel.exportToXlsx([{
      name: App.sheet.name, col_widths: App.sheet.col_widths, col_count: App.sheet.col_count,
      cells: [...App.grid.cells.values()],
    }], safeFile(App.sheet.name) + ".xlsx", statusFillFor);
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
    await excel.exportToXlsx(sheetsData, "Controle de Solicitações.xlsx", statusFillFor);
    toast("Exportado.");
  } catch (e) { toast("Erro ao exportar: " + e.message, "err"); }
}

/* ---- modo de exportacao seletiva (checkboxes no sidebar) ---- */
function enterExportMode() {
  if (App.exportMode) return;
  if (!App.sheets.length) { toast("Não há abas para exportar."); return; }
  App.exportMode = true;
  App.exportSel = new Set();                 // default: nenhuma aba marcada (usuário escolhe)
  renderSidebar();
  const bar = $("#exp-bar"); bar.hidden = false; clear(bar);
  bar.appendChild(h("div", { class: "exp-hint" }, "Marque as abas a exportar:"));
  bar.appendChild(h("label", { class: "exp-all" },
    h("input", { type: "checkbox", id: "exp-all", checked: false, onChange: toggleAllExport }),
    h("span", {}, "Todas as abas")));
  bar.appendChild(h("button", { class: "btn btn-primary btn-sm", id: "exp-confirm", style: { width: "100%" }, onClick: confirmExport }, "Confirmar exportação"));
  bar.appendChild(h("button", { class: "btn btn-ghost btn-sm exp-cancel", style: { width: "100%" }, onClick: exitExportMode }, "Cancelar"));
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
    await excel.exportToXlsx(sheetsData, chosen.length === 1 ? safeFile(chosen[0].name) + ".xlsx" : "Controle de Solicitações.xlsx", statusFillFor);
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

/* I-0015 — paleta de 10 cores livres (cor = só identidade visual). As 5 primeiras
   klasses são as legadas (mantidas p/ não migrar dados/CSS); as 5 últimas são novas. */
const STATUS_COLORS = [
  ["recebido", "Verde", "#2f7d4e"], ["pendente", "Âmbar", "#8a6914"], ["analise", "Teal", "#246b78"],
  ["azul", "Azul", "#2f5fa0"], ["ciano", "Ciano", "#0e7490"], ["roxo", "Roxo", "#5b4b9e"],
  ["rosa", "Rosa", "#9d3b6b"], ["parcial", "Coral", "#b85c2e"], ["vermelho", "Vermelho", "#b3322f"],
  ["na", "Cinza", "#64707a"],
];
/* I-0015 — "Status Geral" padrão herdado da cor, p/ itens sem categoria gravada */
const DEFAULT_CAT = { recebido: "concluido", pendente: "pendencia", analise: "pendencia", parcial: "pendencia", na: "na" };
const STATUS_CATS = [["concluido", "Concluído"], ["pendencia", "Pendência"], ["na", "N/A"]];
/* grid de swatches visíveis (substitui o <select>): expõe .value (a klass) para o save. */
function colorSelect(val) {
  const box = h("div", { class: "lm-swatches", role: "radiogroup", "aria-label": "Cor do status" });
  let current = val || "na";
  box.value = current;
  STATUS_COLORS.forEach(([k, label, hex]) => {
    const sw = h("button", { type: "button", class: "lm-sw" + (k === current ? " on" : ""), title: label, "aria-label": label, style: { background: hex } });
    sw.dataset.k = k;
    sw.addEventListener("click", () => { current = k; box.value = k; box.querySelectorAll(".lm-sw").forEach((x) => x.classList.toggle("on", x.dataset.k === k)); });
    box.appendChild(sw);
  });
  return box;
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
      const cat = h("select", { class: "input lm-cat", title: "Status Geral — entra nos KPIs do dashboard (Concluído/Pendências)" },
        ...STATUS_CATS.map(([v, t]) => h("option", { value: v }, t)));
      cat.value = o.categoria || DEFAULT_CAT[o.klass] || "na";
      const save = h("button", { class: "btn btn-sm", onClick: async () => {
        const nl = label.value.trim(); if (!nl) return toast("O nome não pode ficar vazio.");
        try {
          const saved = await store.upsertStatusOption({ id: o.id, label: nl, klass: color.value, categoria: cat.value, position: o.position });
          Object.assign(o, saved); chip.textContent = saved.label; chip.className = "chip " + (saved.klass || "na");
          await reloadStatusOptions(); refreshActiveView(); toast("Item salvo.");
        } catch (e) { toast("Erro ao salvar: " + (e.message || e), "err"); }
      } }, "Salvar");
      const del = h("button", { class: "btn btn-ghost btn-sm", title: "Remover item", onClick: async () => {
        if (!(await confirmModal("Remover item", `Remover "${o.label}" da lista? As células que já usam esse valor continuam como estão.`))) return;
        try { await store.deleteStatusOption(o.id); opts = opts.filter((x) => x.id !== o.id); renderItems(); await reloadStatusOptions(); refreshActiveView(); }
        catch (e) { toast("Erro ao remover: " + (e.message || e), "err"); }
      } }, "✕");
      return h("div", { class: "lm-row" },
        h("div", { class: "lm-row-top" }, chip, label, save, del),
        h("div", { class: "lm-ctl" },
          h("span", { class: "lm-ctl-l" }, "Cor"), color,
          h("span", { class: "lm-ctl-l" }, "Status Geral"), cat));
    };
    const renderItems = () => {
      clear(listBox);
      if (!opts.length) listBox.appendChild(h("p", { class: "muted" }, "Nenhum item. Adicione abaixo."));
      opts.forEach((o) => listBox.appendChild(itemRow(o)));
    };
    renderItems();
    const addBtn = h("button", { class: "btn btn-primary btn-sm", onClick: async () => {
      try { const saved = await store.upsertStatusOption({ label: "Novo item", klass: "na", categoria: "na", position: opts.length + 1 }); opts.push(saved); renderItems(); await reloadStatusOptions(); }
      catch (e) { toast("Erro ao adicionar: " + (e.message || e), "err"); }
    } }, "＋ Adicionar item");
    body.appendChild(h("div", { class: "lm-card" },
      h("h4", {}, "Itens da lista"),
      h("p", { class: "muted", style: { margin: "0 0 10px", fontSize: "12px" } }, "Nome, cor e Status Geral de cada item do dropdown. A cor é só visual; o Status Geral (Concluído/Pendência/N/A) é o que alimenta os KPIs do dashboard. Vale para toda a planilha."),
      listBox, h("div", { style: { marginTop: "10px" } }, addBtn)));

    // ----- conversor (substituir) -----
    body.appendChild(buildConverter(opts));
  }

  const foot = h("div", { class: "modal-foot" }, h("button", { class: "btn btn-primary", onClick: close }, "Fechar"));
  const modal = h("div", { class: "modal wide" }, h("h3", {}, "Gerenciar lista"), body, foot);
  scrim.appendChild(modal);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
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

/* ============================ GO ============================ */
boot();

/* ===== Empresas / Áreas / Parser / Solicitações (port da Fase 1-3) ===== */
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
    const keyOf = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const row = (o) => {
      const label = h("input", { class: "input lm-label", value: o.label });
      const aliases = Array.isArray(o.aliases) ? [...o.aliases] : [];
      const chipsBox = h("div", { class: "lm-aliases" });
      const aliasInput = h("input", { class: "lm-alias-add", placeholder: "+ grafia" });
      const renderChips = () => {
        clear(chipsBox);
        aliases.forEach((a, i) => chipsBox.appendChild(h("span", { class: "lm-alias" },
          h("span", {}, a),
          h("button", { class: "lm-alias-x", title: "Remover grafia", onClick: () => { aliases.splice(i, 1); renderChips(); } }, "✕"))));
        chipsBox.appendChild(aliasInput);
      };
      // grafia entra sem precisar de Enter: confirma ao sair do campo (blur) ou por Enter/vírgula
      const commitAlias = (refocus) => {
        const v = aliasInput.value.trim(); if (!v) return;
        const k = keyOf(v);
        if (k === keyOf(label.value) || aliases.some((a) => keyOf(a) === k)) { aliasInput.value = ""; return; }
        const clash = list.find((x) => x.id !== o.id && (keyOf(x.label) === k || (Array.isArray(x.aliases) && x.aliases.some((a) => keyOf(a) === k))));
        if (clash) { toast(`"${v}" já pertence a ${clash.label}.`, "err"); return; }
        aliases.push(v); aliasInput.value = ""; renderChips();
        if (refocus) aliasInput.focus();
      };
      aliasInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitAlias(true); } });
      aliasInput.addEventListener("blur", () => commitAlias(false));
      const save = h("button", { class: "btn btn-sm", onClick: async () => {
        const nl = label.value.trim(); if (!nl) return toast("O nome não pode ficar vazio.");
        try { const saved = await store.upsertCompany({ id: o.id, label: nl, position: o.position, aliases }); Object.assign(o, saved); App._empData = null; await reloadCompanies(); toast("Empresa salva."); }
        catch (e) { toast("Erro ao salvar: " + (e.message || e), "err"); }
      } }, "Salvar");
      const del = h("button", { class: "btn btn-ghost btn-sm", title: "Remover", onClick: async () => {
        if (!(await confirmModal("Remover empresa", `Remover "${o.label}" da lista?`))) return;
        try { await store.deleteCompany(o.id); list = list.filter((x) => x.id !== o.id); render(); await reloadCompanies(); App._empData = null; }
        catch (e) { toast("Erro ao remover: " + (e.message || e), "err"); }
      } }, "✕");
      renderChips();
      return h("div", { class: "lm-row" }, h("div", { class: "lm-row-top" }, label, save, del), chipsBox);
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
      detectBox.appendChild(h("p", { class: "muted", style: { fontSize: "12px", margin: "0 0 8px" } }, "Marque os rótulos e escolha: criar empresa nova OU anexar como grafia de uma existente."));
      const checks = [];
      cand.forEach((c) => {
        const cb = h("input", { type: "checkbox", checked: c.sheets >= 2 });
        const sel = h("select", { class: "bld-select lm-detect-sel" });
        sel.appendChild(h("option", { value: "__new__" }, "criar empresa nova"));
        list.forEach((co) => sel.appendChild(h("option", { value: co.id }, "grafia de: " + co.label)));
        checks.push({ cb, label: c.label, sel });
        detectBox.appendChild(h("label", { class: "lm-detect-row" }, cb,
          h("span", { class: "lm-detect-lbl" }, c.label),
          h("span", { class: "muted", style: { fontSize: "11px" } }, `${c.sheets} aba(s) · ${c.count}×`),
          sel));
      });
      detectBox.appendChild(h("button", { class: "btn btn-primary btn-sm", style: { marginTop: "10px" }, onClick: async () => {
        const chosen = checks.filter((x) => x.cb.checked);
        if (!chosen.length) return toast("Marque ao menos um.");
        const novas = chosen.filter((x) => x.sel.value === "__new__").map((x) => x.label);
        const anexar = chosen.filter((x) => x.sel.value !== "__new__");
        try {
          if (novas.length) await store.addCompanies(novas);
          const byTarget = new Map();
          anexar.forEach((x) => { if (!byTarget.has(x.sel.value)) byTarget.set(x.sel.value, []); byTarget.get(x.sel.value).push(x.label); });
          for (const [id, labels] of byTarget) {
            const co = list.find((c) => c.id === id); if (!co) continue;
            const merged = [...new Set([...(co.aliases || []), ...labels])];
            await store.upsertCompany({ id, label: co.label, position: co.position, aliases: merged });
          }
          list = await store.loadCompanies(); render(); await reloadCompanies(); App._empData = null; clear(detectBox);
          toast(`${chosen.length} item(ns) aplicado(s).`);
        } catch (e) { toast("Erro: " + (e.message || e), "err"); }
      } }, "Aplicar selecionados"));
    }

    body.appendChild(h("div", { class: "lm-card" },
      h("h4", {}, "Empresas"),
      h("p", { class: "muted", style: { margin: "0 0 10px", fontSize: "12px" } }, "Nome canônico da empresa. Em “+ grafia” registre outras formas de escrita (ex.: GO ↔ EQTL GO) — todas contam sob o canônico, sem mexer nas abas."),
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
      return h("div", { class: "lm-row" }, h("span", { class: "badge" }, o.label), label, save, del);
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

async function computeAbaStatusCounts() {
  const out = await parseAbas(App.sheets, (id) => store.loadCells(id), App.companies || [], getStatusOptions());
  const m = new Map();
  for (const { sheet, res } of out.perSheet) {
    const byS = new Map();
    for (const rec of res.records) byS.set(rec.status, (byS.get(rec.status) || 0) + 1);
    m.set(String(sheet.name || "").trim(), byS);
  }
  return m;
}

/* Cruza parseAbas (empresa×status por aba) com o campo Área das Solicitações
   (sheet_link → area[]). Retorna empresas, áreas (processos) e a matriz de
   contagens com alvos de navegação (sheetId/row/col) por célula. */
async function computeEmpresaAreaData() {
  // 1) mapa aba(nome) -> Set(áreas) a partir das Solicitações — só p/ o KPI "Processos (Áreas)"
  let solic = App._solicRows;
  if (!Array.isArray(solic)) { try { solic = await store.loadSolicitacoes(App.project); } catch (_) { solic = []; } }
  const areas = new Set();
  for (const r of solic) (Array.isArray(r.area) ? r.area : []).filter(Boolean).forEach((a) => areas.add(a));
  // 2) parser: empresa × status por aba (também detecta a legenda de cada aba)
  const parsed = await parseAbas(App.sheets, (id) => store.loadCells(id), App.companies || [], getStatusOptions());
  // 3) cruza por ABA: matrixAba[empresa][sheetId] = { status:Map(label->qtd), total, targets:[...] }
  const empresas = new Set();
  const matrixAba = new Map();
  const cellFor = (emp, sid) => {
    if (!matrixAba.has(emp)) matrixAba.set(emp, new Map());
    const row = matrixAba.get(emp);
    if (!row.has(sid)) row.set(sid, { status: new Map(), total: 0, targets: [] });
    return row.get(sid);
  };
  const bySheetStatus = new Map();   // sheetId -> Map(status -> qtd)  (1 por registro)
  const cellIndex = new Map();       // "sheetId:row:col" -> {sheetId,sheetName,row,col,empresa}
  const abaList = [];                // abas com pelo menos 1 registro
  const legendUpdates = [];          // backfill de legenda (só onde nunca detectada)
  for (const { sheet, res, legend } of parsed.perSheet) {
    // backfill: preenche a legenda 1x quando ainda é NULL (não sobrescreve edição manual nem "").
    // Reflete já em memória (painel/matriz mostram na hora); a persistência dá durabilidade.
    if (sheet.legend == null && legend != null) { sheet.legend = legend; legendUpdates.push({ sheet, legend }); }
    if (!res.records.length) continue;
    abaList.push({ id: sheet.id, name: sheet.name, legend: sheet.legend != null ? String(sheet.legend) : "" });
    for (const rec of res.records) {
      empresas.add(rec.empresa);
      if (!bySheetStatus.has(sheet.id)) bySheetStatus.set(sheet.id, new Map());
      const bs = bySheetStatus.get(sheet.id);
      bs.set(rec.status, (bs.get(rec.status) || 0) + 1);
      const ck = sheet.id + ":" + rec.row + ":" + rec.col;
      if (!cellIndex.has(ck)) cellIndex.set(ck, { sheetId: sheet.id, sheetName: sheet.name, row: rec.row, col: rec.col, empresa: rec.empresa });
      const c = cellFor(rec.empresa, sheet.id);
      c.status.set(rec.status, (c.status.get(rec.status) || 0) + 1);
      c.total++;
      c.targets.push({ sheetId: sheet.id, row: rec.row, col: rec.col, status: rec.status });
    }
  }
  if (legendUpdates.length) { renderSidebar(); persistDetectedLegends(legendUpdates); }   // reflete já; persiste em background
  abaList.sort((a, b) => natCompare(a.name, b.name));
  return {
    empresas: [...empresas].sort((a, b) => a.localeCompare(b, "pt")),
    abas: abaList,
    areasCount: areas.size,
    matrixAba, byStatus: parsed.byStatus, total: parsed.total,
    byCompanyStatus: parsed.byCompanyStatus,   // empresa -> Map(status->qtd) DISTINTO (cada item 1x)
    bySheetStatus, cellIndex,
  };
}

/* backfill tolerante: persiste a legenda detectada (já refletida em memória). Se a
   coluna `legend` ainda não existir no banco, silencia (roda sql/20_sheet_legend.sql). */
async function persistDetectedLegends(updates) {
  for (const { sheet, legend } of updates) {
    try { await store.updateSheet(sheet.id, { legend }); }
    catch (_) { return; }   // coluna ausente → aborta (sem spam de erros)
  }
}

/* cache do cruzamento (1 parse por carga de projeto; reusado entre as tabs).
   Invalidado em refreshSheets (mudança de abas). */
async function getEmpData() {
  if (!App._empData) App._empData = await computeEmpresaAreaData();
  return App._empData;
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
  document.querySelectorAll(".proj-nav .pn-item.active").forEach((e) => e.classList.remove("active"));
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
