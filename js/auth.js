import { supabase, CONFIG } from "./supabase.js";
import { h, clear, $ } from "./util.js";

/* Renderiza a tela de autenticacao no container informado.
   modes: "login" | "signup" | "forgot" | "reset" (reset = definir nova senha) */
export function renderAuth(root, startMode = "login") {
  let mode = startMode;
  clear(root);

  const aside = h("div", { class: "auth-aside" },
    h("div", {},
      h("div", { class: "brand-badge" }, h("span", { class: "dot" }),
        h("span", { style: { color: "#fff", fontWeight: 800, fontSize: "15px", letterSpacing: "-.02em" } }, "GRUPO EQUATORIAL")),
    ),
    h("div", {},
      h("h1", {}, CONFIG.APP_TITLE || "Controle de Solicitações"),
      h("p", {}, "Espaço colaborativo de planejamento e auditoria. Edição simultânea, status em tempo real e trilha completa de alterações."),
      h("div", { class: "feat" }, h("span", { class: "ic" }, "◆"), h("span", {}, "Edite junto com o time, ao vivo")),
      h("div", { class: "feat" }, h("span", { class: "ic" }, "◆"), h("span", {}, "Status semafórico: Recebido · Pendente · N/A")),
      h("div", { class: "feat" }, h("span", { class: "ic" }, "◆"), h("span", {}, "Histórico de quem alterou cada célula")),
    ),
    h("div", { class: "muted", style: { color: "var(--navy-300)", fontSize: "12px" } }, "Acesso restrito · Equatorial Energia"),
  );

  const panel = h("div", { class: "auth-panel" });
  const card = h("div", { class: "auth-card" });
  panel.appendChild(card);

  const wrap = h("div", { class: "auth-wrap" }, aside, panel);
  root.appendChild(wrap);

  const msg = (text, kind = "err") => {
    const old = $(".auth-msg", card); if (old) old.remove();
    if (!text) return;
    card.querySelector("form")?.before(h("div", { class: "auth-msg " + kind }, text));
  };
  const busy = (btn, on, label) => { btn.disabled = on; btn.textContent = on ? "Aguarde…" : label; };

  function go(m) { mode = m; draw(); }

  function draw() {
    clear(card);
    if (mode === "login") drawLogin();
    else if (mode === "signup") drawSignup();
    else if (mode === "forgot") drawForgot();
    else if (mode === "reset") drawReset();
  }

  // -------------------- LOGIN --------------------
  function drawLogin() {
    card.appendChild(h("h2", {}, "Entrar"));
    card.appendChild(h("p", { class: "sub" }, "Acesse com seu e-mail e senha."));
    const email = h("input", { class: "input", type: "email", placeholder: "voce@equatorial.com", autocomplete: "username" });
    const pass = h("input", { class: "input", type: "password", placeholder: "Sua senha", autocomplete: "current-password" });
    const btn = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%", height: "42px", justifyContent: "center" } }, "Entrar");

    const form = h("form", {},
      h("div", { class: "field" }, h("label", {}, "E-mail"), email),
      h("div", { class: "field" }, h("label", {}, "Senha"), pass),
      h("div", { class: "auth-row" }, h("span"), h("button", { class: "link-btn", type: "button", onClick: () => go("forgot") }, "Esqueci a senha")),
      btn,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      busy(btn, true, "Entrar");
      const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      busy(btn, false, "Entrar");
      if (error) msg(traduz(error.message));
    });
    card.appendChild(form);
    card.appendChild(h("div", { class: "auth-switch" }, "Acesso restrito aos usuários cadastrados pela administração. No primeiro acesso, use a senha padrão fornecida — o sistema pedirá uma nova."));
  }

  // -------------------- CADASTRO --------------------
  function drawSignup() {
    card.appendChild(h("h2", {}, "Criar conta"));
    card.appendChild(h("p", { class: "sub" }, "Informe seu nome — ele ficará gravado para os próximos acessos."));
    const full = h("input", { class: "input", placeholder: "Ex.: Maria Souza de Oliveira" });
    const disp = h("input", { class: "input", placeholder: "Ex.: Maria Souza" });
    const email = h("input", { class: "input", type: "email", placeholder: "voce@equatorial.com", autocomplete: "username" });
    const pass = h("input", { class: "input", type: "password", placeholder: "Mínimo 6 caracteres", autocomplete: "new-password" });
    const btn = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%", height: "42px", justifyContent: "center" } }, "Criar conta");

    full.addEventListener("blur", () => { if (!disp.value && full.value) { const p = full.value.trim().split(/\s+/); disp.value = p.slice(0, 2).join(" "); } });

    const form = h("form", {},
      h("div", { class: "field" }, h("label", {}, "Nome completo"), full),
      h("div", { class: "field" }, h("label", {}, "Nome de exibição (aparece para o time)"), disp),
      h("div", { class: "field" }, h("label", {}, "E-mail"), email),
      h("div", { class: "field" }, h("label", {}, "Senha"), pass),
      btn,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      if (!full.value.trim()) return msg("Informe seu nome completo.");
      if (pass.value.length < 6) return msg("A senha precisa de ao menos 6 caracteres.");
      busy(btn, true, "Criar conta");
      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: pass.value,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: { full_name: full.value.trim(), display_name: (disp.value.trim() || full.value.trim().split(/\s+/).slice(0, 2).join(" ")) },
        },
      });
      busy(btn, false, "Criar conta");
      if (error) return msg(traduz(error.message));
      if (data?.user && !data.session) {
        msg("Conta criada! Verifique seu e-mail para confirmar e depois faça login.", "ok");
        setTimeout(() => go("login"), 400);
      }
      // se a confirmacao de e-mail estiver desligada, o onAuthStateChange ja loga.
    });
    card.appendChild(form);
    card.appendChild(h("div", { class: "auth-switch" }, "Já tem conta? ",
      h("button", { class: "link-btn", onClick: () => go("login") }, "Entrar")));
  }

  // -------------------- ESQUECI A SENHA --------------------
  function drawForgot() {
    card.appendChild(h("h2", {}, "Redefinir senha"));
    card.appendChild(h("p", { class: "sub" }, "Enviaremos um link de redefinição para seu e-mail."));
    const email = h("input", { class: "input", type: "email", placeholder: "voce@equatorial.com" });
    const btn = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%", height: "42px", justifyContent: "center" } }, "Enviar link");
    const form = h("form", {}, h("div", { class: "field" }, h("label", {}, "E-mail"), email), btn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      busy(btn, true, "Enviar link");
      const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      });
      busy(btn, false, "Enviar link");
      if (error) return msg(traduz(error.message));
      msg("Link enviado. Confira seu e-mail (e o spam).", "ok");
    });
    card.appendChild(form);
    card.appendChild(h("div", { class: "auth-switch" }, h("button", { class: "link-btn", onClick: () => go("login") }, "← Voltar para o login")));
  }

  // -------------------- DEFINIR NOVA SENHA (apos clicar no link) --------------------
  function drawReset() {
    card.appendChild(h("h2", {}, "Nova senha"));
    card.appendChild(h("p", { class: "sub" }, "Defina sua nova senha de acesso."));
    const pass = h("input", { class: "input", type: "password", placeholder: "Nova senha (mín. 6)", autocomplete: "new-password" });
    const btn = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%", height: "42px", justifyContent: "center" } }, "Salvar senha");
    const form = h("form", {}, h("div", { class: "field" }, h("label", {}, "Nova senha"), pass), btn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      if (pass.value.length < 6) return msg("A senha precisa de ao menos 6 caracteres.");
      busy(btn, true, "Salvar senha");
      const { error } = await supabase.auth.updateUser({ password: pass.value });
      busy(btn, false, "Salvar senha");
      if (error) return msg(traduz(error.message));
      msg("Senha atualizada! Entrando…", "ok");
    });
    card.appendChild(form);
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
