import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.APP_CONFIG || {};

export const isConfigured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("SEU-PROJETO"));
if (!isConfigured) {
  console.warn("[config] Edite app/config.js com a URL e a anon key do seu projeto Supabase.");
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // necessario p/ link de redefinicao de senha
    flowType: "pkce",
  },
});

export const CONFIG = cfg;
