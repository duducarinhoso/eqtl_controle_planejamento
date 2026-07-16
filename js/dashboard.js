/* Dashboard do projeto tabela — visão gerencial das seleções de auditoria.
   Agrega os planning_items NO CLIENTE (reusa calc.js) e desenha em HTML/SVG + CSS
   (sem lib de gráficos, como o Cronograma). Spec visual: protótipo v2 aprovado.
   Estilos em styles/dashboard.css (escopo .dash). */
import { h } from "./util.js";
import { statusEntrega, statusPrazo, diasAtraso } from "./calc.js";
import { copyImage, downloadPNG, openPresentation } from "./present.js";

const ICON = {
  total: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  checkClock: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7M12 17h.01"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 3v9"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M9 2h6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  png: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>',
  present: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 21V9M3 13h18"/>',
};
const svg = (paths, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}">${paths}</svg>`;

/* ---------- agregação (client-side) ---------- */
function tally(map, key) { const k = String(key ?? "").trim() || "(vazio)"; map.set(k, (map.get(k) || 0) + 1); }
function dimArray(map) { return [...map.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total); }

/* categoria geral a partir do statusEntrega (que distingue N/A — statusGeral do
   Excel joga N/A em "Concluído", o que não serve para o dashboard). */
function catOf(se) { return se === "N/A" ? "na" : se.startsWith("Concl") ? "concl" : "pend"; }
const GERAL_LABEL = { concl: "Concluído", pend: "Pendente", na: "N/A" };

export function aggregate(items, hoje = new Date()) {
  const se = { "Em andamento": 0, "Pendente": 0, "Concluído no prazo": 0, "Concluído com atraso": 0, "N/A": 0 };
  const cat = { concl: 0, pend: 0, na: 0 };
  const p = { "No Prazo": 0, Atrasado: 0, "N/A": 0 };
  const emp = new Map(), area = new Map(), grupo = new Map(), seg = new Map(), resp = new Map();
  const empGe = new Map(), empPr = new Map();
  let atrasoSoma = 0, atrasoN = 0;
  const atrasoArea = new Map(), atrasoSeg = new Map();

  for (const it of items) {
    const s = statusEntrega(it, hoje), sp = statusPrazo(it, hoje), da = diasAtraso(it, hoje);
    se[s] = (se[s] || 0) + 1; p[sp] = (p[sp] || 0) + 1;
    const c = catOf(s); cat[c]++;
    tally(emp, it.empresa); tally(area, it.area_responsavel); tally(grupo, it.grupo);
    tally(seg, it.segmento); tally(resp, it.responsavel);
    const e = String(it.empresa ?? "").trim() || "(vazio)";
    const ge = empGe.get(e) || { C: 0, P: 0, NA: 0 }; ge[c === "concl" ? "C" : c === "pend" ? "P" : "NA"]++; empGe.set(e, ge);
    const pr = empPr.get(e) || { NoPrazo: 0, Atras: 0, NA: 0 }; pr[sp === "No Prazo" ? "NoPrazo" : sp === "Atrasado" ? "Atras" : "NA"]++; empPr.set(e, pr);
    if (da != null && da > 0) {
      atrasoSoma += da; atrasoN++;
      const av = atrasoArea.get(it.area_responsavel) || [0, 0]; av[0] += da; av[1]++; atrasoArea.set(it.area_responsavel, av);
      const sv = atrasoSeg.get(it.segmento) || [0, 0]; sv[0] += da; sv[1]++; atrasoSeg.set(it.segmento, sv);
    }
  }
  const total = items.length;
  const media = (m) => [...m.entries()].map(([label, [s, n]]) => ({ label, media: n ? s / n : 0 })).sort((a, b) => b.media - a.media);
  return {
    total,
    emAndamento: se["Em andamento"], pendentes: se["Pendente"],
    conclNoPrazo: se["Concluído no prazo"], conclComAtraso: se["Concluído com atraso"],
    concluidas: cat.concl, emAberto: cat.pend, na: cat.na,
    atrasadas: p.Atrasado, noPrazo: p["No Prazo"],
    pctConclusao: total ? Math.round(cat.concl / total * 100) : 0,
    slaMedio: atrasoN ? Math.round(atrasoSoma / atrasoN) : 0,
    porEmpresa: dimArray(emp), porArea: dimArray(area), porGrupo: dimArray(grupo),
    porSegmento: dimArray(seg), porResponsavel: dimArray(resp),
    empresaXGeral: [...empGe.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => (b.C + b.P + b.NA) - (a.C + a.P + a.NA)),
    empresaXPrazo: [...empPr.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => (b.NoPrazo + b.Atras + b.NA) - (a.NoPrazo + a.Atras + a.NA)),
    atrasoMedioSeg: media(atrasoSeg), atrasoMedioArea: media(atrasoArea),
  };
}

/* filtra os itens pelas seleções ativas (multi por dimensão) */
export function applyFilters(items, f = {}, hoje = new Date()) {
  const has = (k) => f[k] && f[k].size;
  return items.filter((it) => {
    if (has("empresa") && !f.empresa.has(String(it.empresa ?? "").trim())) return false;
    if (has("area") && !f.area.has(String(it.area_responsavel ?? "").trim())) return false;
    if (has("segmento") && !f.segmento.has(String(it.segmento ?? "").trim())) return false;
    if (has("grupo") && !f.grupo.has(String(it.grupo ?? "").trim())) return false;
    if (has("responsavel") && !f.responsavel.has(String(it.responsavel ?? "").trim())) return false;
    if (has("geral") && !f.geral.has(GERAL_LABEL[catOf(statusEntrega(it, hoje))])) return false;
    if (has("prazo") && !f.prazo.has(statusPrazo(it, hoje))) return false;
    return true;
  });
}

/* ---------- render ---------- */
const el = (tag, cls, attrs) => h(tag, { class: cls, ...(attrs || {}) });
function bar(label, value, max, hot) {
  return h("div", { class: "d-brow" },
    h("span", { class: "d-bl", title: label }, label),
    h("span", { class: "d-track" }, h("span", { class: "d-fill" + (hot ? " hot" : ""), style: { width: (max ? Math.round(value / max * 100) : 0) + "%" } }, String(value))));
}
function stacked(rows, cols) {
  return rows.map((r) => {
    const t = cols.reduce((s, c) => s + (r[c.k] || 0), 0) || 1;
    const track = h("span", { class: "d-track" });
    cols.forEach((c) => { if (r[c.k] > 0) track.appendChild(h("span", { class: "d-seg", style: { width: (r[c.k] / t * 100) + "%", background: c.color } }, String(r[c.k]))); });
    return h("div", { class: "d-brow" }, h("span", { class: "d-bl", title: r.label }, r.label), track);
  });
}
function kpi(icon, cls, val, lab, hint, extraCls = "") {
  return h("div", { class: "d-kpi " + extraCls },
    h("span", { class: "d-ic " + cls, html: svg(icon) }),
    h("div", {}, h("div", { class: "d-val tnum" }, val), h("div", { class: "d-lab" }, lab), h("div", { class: "d-hint" }, hint)));
}
function card(title, ...body) { return h("div", { class: "d-card" }, h("h3", {}, title), ...body); }

/* dropdown de filtro compacto (Fase D liga a interatividade; aqui mostra o resumo) */
function filterChip(label, resumo, onClick) {
  const b = h("span", { class: "d-fdrop", role: "button", tabindex: "0", onClick },
    h("b", {}, label), h("span", { class: "d-fv" }, resumo + " ▾"));
  return b;
}

export function buildDashboard(project, allItems, opts = {}) {
  const root = h("div", { class: "dash" });
  const state = { filters: opts.filters || {}, project, allItems };
  renderDash(root, state);
  return root;
}

function renderDash(root, state) {
  const { project, allItems } = state;
  const items = applyFilters(allItems, state.filters);
  const a = aggregate(items);
  const maxOf = (arr) => Math.max(1, ...arr.map((x) => x.total));

  root.replaceChildren();

  // Cabeçalho
  const head = h("header", { class: "d-topbar" },
    h("div", { class: "d-brand" },
      h("img", { class: "d-logo", src: "app_planejamento_logo.png", alt: "Grupo Equatorial" }),
      h("span", { class: "d-vsep", "aria-hidden": "true" }),
      h("div", { class: "d-titles" }, h("h1", {}, "Dashboard de acompanhamento"), h("p", {}, "Seleções de auditoria externa"))),
    h("div", { class: "d-topmeta" },
      metaItem("Período", "2º tri 2026 · 01/04–30/06"),
      metaItem("Atualização", new Date().toLocaleDateString("pt-BR")),
      metaItem("Responsável", project.name),
      h("div", { class: "d-topbtns" },
        h("button", { class: "", html: svg(ICON.copy) + "<span>Copiar</span>", onClick: () => present(root, "copy") }),
        h("button", { class: "", html: svg(ICON.png) + "<span>PNG</span>", onClick: () => present(root, "png") }),
        h("button", { class: "primary", html: svg(ICON.present) + "<span>Apresentação · PDF</span>", onClick: () => present(root, "present") }))));
  root.appendChild(head);

  // KPIs (semáforo: "Pendentes" = vencidas sem entrega → alerta quando > 0)
  const kpis = h("div", { class: "d-kpis" },
    kpi(ICON.total, "d-ic-info", String(a.total), "Total", "100%"),
    kpi(ICON.clock, "d-ic-teal", String(a.emAndamento), "Em andamento", pct(a.emAndamento, a.total)),
    kpi(ICON.check, "d-ic-ok", String(a.conclNoPrazo), "Concl. no prazo", pct(a.conclNoPrazo, a.total)),
    kpi(ICON.checkClock, "d-ic-warn", String(a.conclComAtraso), "Concl. c/ atraso", pct(a.conclComAtraso, a.total)),
    kpi(ICON.alert, a.pendentes ? "d-ic-bad" : "d-ic-na", String(a.pendentes), "Pendentes", a.pendentes ? "vencidas s/ entrega" : "nenhuma", a.pendentes ? "alert" : "good"),
    kpi(ICON.help, "d-ic-na", String(a.na), "N/A", pct(a.na, a.total)),
    kpi(ICON.pie, "d-ic-teal", a.pctConclusao + "%", "% Conclusão", "concl./total"),
    kpi(ICON.timer, "d-ic-teal", a.slaMedio + " d", "SLA médio", a.slaMedio ? "com atraso" : "no prazo"));
  root.appendChild(kpis);

  // Filtros compactos (interatividade na Fase D — por ora abrem popover simples)
  const dims = [
    ["empresa", "Empresa", a.porEmpresa], ["area", "Área", a.porArea], ["segmento", "Segmento", a.porSegmento],
    ["grupo", "Grupo", a.porGrupo], ["responsavel", "Responsável", a.porResponsavel],
  ];
  const filtRow = h("div", { class: "d-filters" }, h("span", { class: "d-flab" }, "Filtros"));
  dims.forEach(([key, label]) => {
    const sel = state.filters[key];
    const resumo = sel && sel.size ? (sel.size === 1 ? [...sel][0] : sel.size + " sel.") : "Todas";
    filtRow.appendChild(filterChip(label, resumo, (e) => openFilter(e.currentTarget, key, label, allItems, state, root)));
  });
  ["geral", "prazo"].forEach((key) => {
    const label = key === "geral" ? "Status geral" : "Status prazo";
    const sel = state.filters[key];
    const resumo = sel && sel.size ? (sel.size === 1 ? [...sel][0] : sel.size + " sel.") : "Todos";
    filtRow.appendChild(filterChip(label, resumo, (e) => openFilterStatus(e.currentTarget, key, label, state, root)));
  });
  const clr = h("button", { class: "d-fclear", onClick: () => { state.filters = {}; renderDash(root, state); } }, "Limpar filtros");
  filtRow.appendChild(clr);
  root.appendChild(filtRow);

  // Linha 1: composição + cruzamentos
  const aberto = a.emAndamento + a.pendentes;
  const c1 = a.total ? a.concluidas / a.total * 100 : 0, c2 = c1 + (a.total ? aberto / a.total * 100 : 0);
  const donutBg = `conic-gradient(var(--d-ok) 0 ${c1}%, var(--d-info) ${c1}% ${c2}%, var(--d-na) ${c2}% 100%)`;
  const comp = card("Composição por status",
    h("div", { class: "d-donutrow" },
      h("div", { class: "d-donut", style: { background: donutBg } }, h("div", { class: "d-in" }, h("div", { class: "d-p tnum" }, pct(aberto, a.total)), h("div", { class: "d-c" }, "Em aberto"))),
      h("div", { class: "d-dleg" },
        legRow("var(--d-ok)", "Concluído", a.concluidas), legRow("var(--d-info)", "Em aberto", aberto), legRow("var(--d-na)", "N/A", a.na))));
  const cruzG = card("Empresas × status geral",
    clegend([["var(--d-ok)", "Concluído"], ["var(--d-info)", "Pendente"], ["var(--d-na)", "N/A"]]),
    h("div", { class: "d-bars" }, ...stacked(a.empresaXGeral, [{ k: "C", color: "var(--d-ok)" }, { k: "P", color: "var(--d-info)" }, { k: "NA", color: "var(--d-na)" }])));
  const cruzP = card("Empresas × status prazo",
    clegend([["var(--d-ok)", "No prazo"], ["var(--d-bad)", "Atrasado"], ["var(--d-na)", "N/A"]]),
    h("div", { class: "d-bars" }, ...stacked(a.empresaXPrazo, [{ k: "NoPrazo", color: "var(--d-ok)" }, { k: "Atras", color: "var(--d-bad)" }, { k: "NA", color: "var(--d-na)" }])));
  root.appendChild(h("div", { class: "d-g3" }, comp, cruzG, cruzP));

  // Linha 2: rankings + média de atraso
  const maxA = maxOf(a.porArea), maxG = maxOf(a.porGrupo);
  const rankArea = card(`Ranking por área · ${a.porArea.length} áreas`,
    h("div", { class: "d-bars d-scroll" }, ...a.porArea.map((x) => bar(x.label, x.total, maxA))),
    h("div", { class: "d-scrollhint" }, "role para ver todas"));
  const rankGrupo = card(`Por grupo contábil · ${a.porGrupo.length} grupos`,
    h("div", { class: "d-bars d-scroll" }, ...a.porGrupo.map((x) => bar(x.label, x.total, maxG))),
    h("div", { class: "d-scrollhint" }, "role para ver todos"));
  const atrasoCard = card("Média de dias de atraso", buildAtraso(a));
  root.appendChild(h("div", { class: "d-gabc" }, rankArea, rankGrupo, atrasoCard));

  // Linha 3: segmento + top5 empresas
  const maxS = maxOf(a.porSegmento);
  const segCard = card("Distribuição por segmento", h("div", { class: "d-bars" }, ...a.porSegmento.map((x) => bar(x.label, x.total, maxS))));
  const top5 = h("div", { class: "d-top5" });
  a.porEmpresa.slice(0, 5).forEach((x, i) => top5.appendChild(h("div", { class: "d-t5row" },
    h("span", { class: "d-rk" }, String(i + 1)), h("span", {}, x.label),
    h("span", { class: "d-pc tnum" }, `${x.total} · ${(x.total / a.total * 100).toFixed(1)}%`))));
  root.appendChild(h("div", { class: "d-g2" }, segCard, card("Top 5 empresas · % do total", top5)));

  root.appendChild(h("div", { class: "d-foot" },
    h("span", {}, "Fonte: base gerencial (Lista de pedidos) · confidencial, uso interno."),
    h("span", {}, filterSummary(state.filters))));
}

function pct(n, t) { return t ? Math.round(n / t * 100) + "%" : "0%"; }
function metaItem(k, v) { return h("div", { class: "d-mi" }, h("span", { class: "d-mk" }, k), h("span", { class: "d-mv" }, v)); }
function legRow(color, label, val) { return h("div", { class: "d-r" }, h("span", { class: "d-dot", style: { background: color } }), label, h("span", { class: "d-v tnum" }, String(val))); }
function clegend(pairs) { return h("div", { class: "d-clegend" }, ...pairs.map(([c, l]) => h("span", { class: "d-r" }, h("span", { class: "d-dot", style: { background: c } }), l))); }
function buildAtraso(a) {
  const box = (k, v) => h("div", { class: "d-abox" }, h("div", { class: "d-ak" }, k), h("div", { class: "d-arow" }, h("span", {}, "Atraso médio"), h("b", { class: "tnum" }, v.toFixed(1) + " d")));
  const segBoxes = a.atrasoMedioSeg.length ? a.atrasoMedioSeg : [{ label: "Distribuição", media: 0 }, { label: "Saneamento", media: 0 }];
  const wrap = h("div", { class: "d-atr" }, h("div", { class: "d-seg2" }, ...segBoxes.slice(0, 2).map((s) => box(s.label, s.media))));
  const topAreas = a.atrasoMedioArea.length ? a.atrasoMedioArea.slice(0, 3) : a.porArea.slice(0, 3).map((x) => ({ label: x.label, media: 0 }));
  const tb = h("div", { class: "d-abox" }, h("div", { class: "d-ak" }, "Top áreas por atraso"));
  topAreas.forEach((x) => tb.appendChild(h("div", { class: "d-arow" }, h("span", { title: x.label }, x.label), h("b", { class: "tnum" }, x.media.toFixed(1) + " d"))));
  wrap.appendChild(tb);
  const ok = a.atrasadas === 0;
  wrap.appendChild(h("div", { class: "d-health" + (ok ? "" : " bad") },
    h("span", { class: "d-hi", html: svg(ok ? '<path d="M5 12l4 4 10-10"/>' : '<path d="M12 8v5M12 16h.01"/>', 2.4) }),
    h("div", {}, h("div", { class: "d-ht" }, ok ? "Todos dentro do prazo" : `${a.atrasadas} atrasada(s)`), h("div", { class: "d-hs" }, `SLA médio geral: ${a.slaMedio} dias`))));
  return wrap;
}
function filterSummary(f) {
  const parts = [];
  for (const [k, s] of Object.entries(f)) if (s && s.size) parts.push(`${k}: ${s.size}`);
  return parts.length ? "Filtros: " + parts.join(" · ") : "Filtros: todos";
}

/* ---------- Fase D: filtros interativos ---------- */
const DIM_ACCESSOR = { empresa: "empresa", area: "area_responsavel", segmento: "segmento", grupo: "grupo", responsavel: "responsavel" };
function distinctValues(items, key) {
  const acc = DIM_ACCESSOR[key];
  const s = new Set();
  for (const it of items) { const v = String(it[acc] ?? "").trim(); if (v) s.add(v); }
  return [...s].sort((a, b) => a.localeCompare(b, "pt"));
}
function openFilter(anchor, key, label, allItems, state, root) {
  filterPopover(anchor, distinctValues(allItems, key), state.filters[key], (set) => {
    if (set.size) state.filters[key] = set; else delete state.filters[key];
    renderDash(root, state);
  });
}
function openFilterStatus(anchor, key, label, state, root) {
  const opts = key === "geral" ? ["Concluído", "Pendente", "N/A"] : ["No Prazo", "Atrasado", "N/A"];
  filterPopover(anchor, opts, state.filters[key], (set) => {
    if (set.size) state.filters[key] = set; else delete state.filters[key];
    renderDash(root, state);
  });
}
function filterPopover(anchor, options, selected, onApply) {
  document.querySelector(".d-fpop")?.remove();
  const cur = new Set(selected || []);
  const r = anchor.getBoundingClientRect();
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const pop = h("div", { class: "d-fpop", style: { top: ((r.bottom + 4) / z) + "px", left: (Math.max(8, Math.min(r.left, window.innerWidth - 250)) / z) + "px" } });
  const search = options.length > 8 ? h("input", { class: "d-fpop-search", type: "search", placeholder: "Buscar…" }) : null;
  const tools = h("div", { class: "d-fpop-tools" },
    h("button", { class: "d-fpop-link", onClick: () => { options.forEach((o) => cur.add(o)); renderList(); } }, "Todos"),
    h("button", { class: "d-fpop-link", onClick: () => { cur.clear(); renderList(); } }, "Limpar"));
  const list = h("div", { class: "d-fpop-list" });
  const renderList = () => {
    list.replaceChildren();
    const q = (search && search.value || "").toLowerCase();
    const fil = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    for (const o of fil) {
      const cb = h("input", { type: "checkbox" }); cb.checked = cur.has(o);
      cb.onchange = () => { if (cb.checked) cur.add(o); else cur.delete(o); };
      list.appendChild(h("label", { class: "d-fpop-item" }, cb, h("span", { title: o }, o)));
    }
    if (!fil.length) list.appendChild(h("div", { class: "d-fpop-empty" }, "Sem valores"));
  };
  if (search) search.oninput = renderList;
  renderList();
  const foot = h("div", { class: "d-fpop-foot" },
    h("button", { class: "d-fpop-apply", onClick: () => { close(); onApply(new Set(cur)); } }, "Aplicar"));
  if (search) pop.appendChild(search);
  pop.append(tools, list, foot);
  document.body.appendChild(pop);
  anchor.classList.add("on");
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { pop.remove(); anchor.classList.remove("on"); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); }
  setTimeout(() => { document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey); search?.focus(); }, 0);
}

/* ---------- Fase E: apresentação/exportar ---------- */
function present(root, mode) {
  if (mode === "copy") copyImage(root);
  else if (mode === "png") downloadPNG(root);
  else openPresentation(root);
}
