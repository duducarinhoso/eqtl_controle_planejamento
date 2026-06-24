import { supabase, CONFIG } from "./supabase.js";

/* Icones de olho (mostrar / ocultar senha). Trocamos o conteudo do botao,
   entao nunca aparece mais de um icone ao mesmo tempo. */
const EYE_OPEN = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.4" stroke="currentColor" stroke-width="1.7"/></svg>`;
const EYE_CLOSED = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 4 16 16M10.6 7.1c.45-.07.92-.1 1.4-.1 6 0 9.2 5 9.2 5a14.8 14.8 0 0 1-2.7 3.2M7.2 8.2C4.3 9.5 2.8 12 2.8 12s3.2 5 9.2 5c1 0 1.9-.14 2.7-.38M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SUG_EMAIL = "usuario@equatorialenergia.com.br";

/* Renderiza a tela de autenticacao no container informado.
   modes: "login" | "signup" | "forgot" | "reset" (reset = definir nova senha) */
export function renderAuth(root, startMode = "login") {
  let mode = startMode;

  root.innerHTML = `
    <div class="page">
      <div class="ambient" aria-hidden="true"></div>
      <section class="login-shell" aria-label="Área de autenticação">
        <aside class="showcase" aria-label="Identificação do portal">
          <div class="showcase-copy">
            <img class="showcase-logo" src="app_planejamento_logo.png" alt="Grupo Equatorial" />
            <h2>Portal da Contabilidade</h2>
            <p>Executiva Contabilidade IV</p>
          </div>
        </aside>
        <section class="login-panel">
          <div class="form-wrap" id="authFormWrap"></div>
        </section>
      </section>
    </div>`;

  const wrap = root.querySelector("#authFormWrap");

  const go = (m) => { mode = m; draw(); };

  const msg = (text, kind = "err") => {
    const old = wrap.querySelector(".auth-msg"); if (old) old.remove();
    if (!text) return;
    const el = document.createElement("div");
    el.className = "auth-msg " + kind;
    el.textContent = text;
    wrap.querySelector("form")?.before(el);
  };

  const setBusy = (btn, on) => { btn.disabled = on; btn.classList.toggle("is-busy", on); };

  // liga o botao de mostrar/ocultar senha presente no escopo
  const wireToggle = () => {
    const toggle = wrap.querySelector(".icon-button");
    const input = wrap.querySelector(".password-input");
    if (!toggle || !input) return;
    toggle.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
      toggle.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      input.focus({ preventScroll: true });
    });
  };

  // liga os links que trocam de modo (data-go="login|forgot|signup")
  const wireNav = () => {
    wrap.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => go(b.getAttribute("data-go"))));
  };

  const heading = (title, sub) =>
    `<header class="heading"><h1>${title}</h1><p>${sub}</p></header>`;

  const passField = (id, ph, autocomplete) => `
    <div class="field">
      <div class="field-head"><label for="${id}">Senha</label><span class="error-text"></span></div>
      <div class="control">
        <input class="password-input" id="${id}" type="password" autocomplete="${autocomplete}" placeholder="${ph}" />
        <button class="icon-button" type="button" aria-label="Mostrar senha">${EYE_OPEN}</button>
      </div>
    </div>`;

  function draw() {
    if (mode === "login") drawLogin();
    else if (mode === "signup") drawSignup();
    else if (mode === "forgot") drawForgot();
    else if (mode === "reset") drawReset();
  }

  // -------------------- LOGIN --------------------
  function drawLogin() {
    wrap.innerHTML = `
      ${heading("Bem-vindo de volta", "Use seu e-mail e senha para acessar sua conta.")}
      <form novalidate>
        <div class="field">
          <div class="field-head"><label for="lgEmail">E-mail</label><span class="error-text"></span></div>
          <div class="control"><input id="lgEmail" type="email" autocomplete="username" inputmode="email" placeholder="${SUG_EMAIL}" /></div>
        </div>
        ${passField("lgPass", "Digite sua senha", "current-password")}
        <div class="form-meta">
          <label class="check"><input type="checkbox" checked /><span>Lembrar de mim</span></label>
          <button class="text-link" type="button" data-go="forgot">Esqueci minha senha</button>
        </div>
        <button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="btn-label">Entrar</span></button>
      </form>
      <p class="signup">Acesso restrito aos usuários cadastrados pela administração. No primeiro acesso, use a senha padrão fornecida — o sistema pedirá uma nova.</p>`;

    wireToggle(); wireNav();
    const form = wrap.querySelector("form");
    const email = wrap.querySelector("#lgEmail");
    const pass = wrap.querySelector("#lgPass");
    const btn = wrap.querySelector(".btn-primary");

    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      if (!email.value.trim() || !pass.value) return msg("Informe e-mail e senha.");
      setBusy(btn, true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      setBusy(btn, false);
      if (error) msg(traduz(error.message));
    });
  }

  // -------------------- CADASTRO --------------------
  function drawSignup() {
    wrap.innerHTML = `
      ${heading("Criar conta", "Informe seu nome — ele fica gravado para os próximos acessos.")}
      <form novalidate>
        <div class="field"><div class="field-head"><label for="suFull">Nome completo</label></div><div class="control"><input id="suFull" placeholder="Ex.: Maria Souza de Oliveira" /></div></div>
        <div class="field"><div class="field-head"><label for="suDisp">Nome de exibição</label></div><div class="control"><input id="suDisp" placeholder="Ex.: Maria Souza" /></div></div>
        <div class="field"><div class="field-head"><label for="suEmail">E-mail</label></div><div class="control"><input id="suEmail" type="email" autocomplete="username" placeholder="${SUG_EMAIL}" /></div></div>
        ${passField("suPass", "Mínimo 6 caracteres", "new-password")}
        <button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="btn-label">Criar conta</span></button>
      </form>
      <p class="signup">Já tem conta?<button class="text-link" type="button" data-go="login">Entrar</button></p>`;

    wireToggle(); wireNav();
    const form = wrap.querySelector("form");
    const full = wrap.querySelector("#suFull");
    const disp = wrap.querySelector("#suDisp");
    const email = wrap.querySelector("#suEmail");
    const pass = wrap.querySelector("#suPass");
    const btn = wrap.querySelector(".btn-primary");

    full.addEventListener("blur", () => { if (!disp.value && full.value) disp.value = full.value.trim().split(/\s+/).slice(0, 2).join(" "); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      if (!full.value.trim()) return msg("Informe seu nome completo.");
      if (pass.value.length < 6) return msg("A senha precisa de ao menos 6 caracteres.");
      setBusy(btn, true);
      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: pass.value,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: { full_name: full.value.trim(), display_name: (disp.value.trim() || full.value.trim().split(/\s+/).slice(0, 2).join(" ")) },
        },
      });
      setBusy(btn, false);
      if (error) return msg(traduz(error.message));
      if (data?.user && !data.session) {
        msg("Conta criada! Verifique seu e-mail para confirmar e depois faça login.", "ok");
        setTimeout(() => go("login"), 600);
      }
    });
  }

  // -------------------- ESQUECI A SENHA --------------------
  function drawForgot() {
    wrap.innerHTML = `
      ${heading("Redefinir senha", "Enviaremos um link de redefinição para seu e-mail.")}
      <form novalidate>
        <div class="field"><div class="field-head"><label for="fgEmail">E-mail</label></div><div class="control"><input id="fgEmail" type="email" autocomplete="username" placeholder="${SUG_EMAIL}" /></div></div>
        <button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="btn-label">Enviar link</span></button>
      </form>
      <p class="signup"><button class="text-link" type="button" data-go="login">← Voltar para o login</button></p>`;

    wireNav();
    const form = wrap.querySelector("form");
    const email = wrap.querySelector("#fgEmail");
    const btn = wrap.querySelector(".btn-primary");

    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      setBusy(btn, true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: window.location.origin + window.location.pathname });
      setBusy(btn, false);
      if (error) return msg(traduz(error.message));
      msg("Link enviado. Confira seu e-mail (e o spam).", "ok");
    });
  }

  // -------------------- DEFINIR NOVA SENHA --------------------
  function drawReset() {
    wrap.innerHTML = `
      ${heading("Nova senha", "Defina sua nova senha de acesso.")}
      <form novalidate>
        ${passField("rsPass", "Nova senha (mín. 6)", "new-password")}
        <button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="btn-label">Salvar senha</span></button>
      </form>`;

    wireToggle();
    const form = wrap.querySelector("form");
    const pass = wrap.querySelector("#rsPass");
    const btn = wrap.querySelector(".btn-primary");

    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      if (pass.value.length < 6) return msg("A senha precisa de ao menos 6 caracteres.");
      setBusy(btn, true);
      const { error } = await supabase.auth.updateUser({ password: pass.value });
      setBusy(btn, false);
      if (error) return msg(traduz(error.message));
      msg("Senha atualizada! Entrando…", "ok");
    });
  }

  draw();
  return { go };
}

function traduz(m = "") {
  const t = m.toLowerCase();
  if (t.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (t.includes("already registered") || t.includes("already been registered")) return "Este e-mail já tem conta. Faça login.";
  if (t.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (t.includes("rate limit") || t.includes("too many")) return "Muitas tentativas. Aguarde um instante.";
  if (t.includes("password")) return "Senha inválida (mínimo 6 caracteres).";
  return m;
}
