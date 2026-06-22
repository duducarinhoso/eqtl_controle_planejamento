import { supabase } from "./supabase.js";

/* Sincronizacao em tempo real de uma aba.
   - Postgres Changes em "cells" (filtrado pela aba) e "sheets".
   - Canal de Presence: quem esta na aba e qual celula esta editando. */

let dbChannel = null;
let presenceChannel = null;
let myCell = null;

export function subscribeSheet(sheetId, { onCell, onSheet, onComment } = {}) {
  unsubscribeDB();
  dbChannel = supabase
    .channel("db:sheet:" + sheetId)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "cells", filter: "sheet_id=eq." + sheetId },
      (p) => onCell && onCell(p))
    .on("postgres_changes",
      { event: "*", schema: "public", table: "sheets" },
      (p) => onSheet && onSheet(p))
    .on("postgres_changes",
      { event: "*", schema: "public", table: "comments", filter: "sheet_id=eq." + sheetId },
      (p) => onComment && onComment(p))
    .subscribe();
  return dbChannel;
}

export function unsubscribeDB() {
  if (dbChannel) { supabase.removeChannel(dbChannel); dbChannel = null; }
}

/* ---------------- Presence ---------------- */
export function joinPresence(sheetId, profile, onState) {
  leavePresence();
  myCell = null;
  presenceChannel = supabase.channel("presence:sheet:" + sheetId, {
    config: { presence: { key: profile.id } },
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const peers = [];
      for (const key of Object.keys(state)) {
        const meta = state[key][0];
        if (meta) peers.push(meta);
      }
      onState && onState(peers);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          id: profile.id,
          name: profile.display_name || profile.full_name || "Usuário",
          color: profile.color || "#1a5fa8",
          cell: null,
          at: Date.now(),
        });
      }
    });
  return presenceChannel;
}

export async function setEditingCell(profile, cell /* "r:c" ou null */) {
  if (!presenceChannel || myCell === cell) return;
  myCell = cell;
  try {
    await presenceChannel.track({
      id: profile.id,
      name: profile.display_name || profile.full_name || "Usuário",
      color: profile.color || "#1a5fa8",
      cell,
      at: Date.now(),
    });
  } catch (_) {}
}

export function leavePresence() {
  if (presenceChannel) { supabase.removeChannel(presenceChannel); presenceChannel = null; }
}

/* ---------------- Presenca GLOBAL do app (quem esta online) ---------------- */
let appChannel = null;
let appMeta = null;

export function joinAppPresence(profile, onState) {
  leaveAppPresence();
  appMeta = {
    id: profile.id,
    name: profile.display_name || profile.full_name || "Usuário",
    full_name: profile.full_name || "",
    email: profile.email || "",
    color: profile.color || "#1a5fa8",
    loc: {}, at: Date.now(),
  };
  appChannel = supabase.channel("presence:app", { config: { presence: { key: profile.id } } });
  appChannel
    .on("presence", { event: "sync" }, () => {
      const state = appChannel.presenceState();
      const peers = [];
      for (const k of Object.keys(state)) { const m = state[k][0]; if (m) peers.push(m); }
      onState && onState(peers);
    })
    .subscribe(async (status) => { if (status === "SUBSCRIBED") await appChannel.track(appMeta); });
  return appChannel;
}

/* atualiza onde a pessoa esta (projeto/aba/view) */
export async function setAppLocation(loc) {
  if (!appChannel || !appMeta) return;
  appMeta = { ...appMeta, loc: loc || {}, at: Date.now() };
  try { await appChannel.track(appMeta); } catch (_) {}
}

export function leaveAppPresence() {
  if (appChannel) { supabase.removeChannel(appChannel); appChannel = null; appMeta = null; }
}

/* assina mudancas na tabela de presenca (heartbeat) -> atualiza a lista de online na hora */
let onlineChannel = null;
export function subscribeOnline(onChange) {
  unsubscribeOnline();
  onlineChannel = supabase.channel("db:online_status")
    .on("postgres_changes", { event: "*", schema: "public", table: "online_status" }, () => onChange && onChange())
    .subscribe();
  return onlineChannel;
}
export function unsubscribeOnline() {
  if (onlineChannel) { supabase.removeChannel(onlineChannel); onlineChannel = null; }
}
