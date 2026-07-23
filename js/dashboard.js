/* Dashboard do projeto tabela — visão gerencial das seleções de auditoria.
   Design "Pedido de análise" (teal/coral). "Concluído/Pendente" = Status Geral
   do Excel (N/A conta como Concluído).
   Cabeçalho compacto (~1/3 da tela) + 5 cartas que ocupam o resto.
   Interação: tags de status de entrega e 4 caixas de filtro (Referência,
   Segmento, Empresa, Grupo) filtram TUDO na tela; todo indicador tem tooltip
   com quantidade e %; clicar num indicador abre a Base Gerencial filtrada
   (via onDrill). Agrega no cliente (calc.js). Estilos em styles/dashboard.css. */
import { h } from "./util.js";
import { statusEntrega, statusGeral, statusPrazo, diasAtraso } from "./calc.js";

const ICON_DIR = "modelos/logomarcas_e_icones/icones_dashboard/";
const IC = { total: ICON_DIR + "check.png", concl: ICON_DIR + "checkmark.png", pend: ICON_DIR + "pending.png" };
const FILT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>';
const CHV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

const txt = (v) => String(v ?? "").trim();
const iso = (v) => txt(v).slice(0, 10);
const fmt1 = (n) => n.toFixed(1).replace(".", ",");
const pctOf = (n, t) => (t ? Math.round(n / t * 100) : 0);
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
function fmtDataLonga(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${DIAS[new Date(y, m - 1, d).getDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
/* Período: início = menor "Data solicitação"; término = maior "Entrega efetiva",
   só quando TODAS estiverem preenchidas (senão o projeto segue em andamento). */
function periodo(items) {
  const sol = items.map((i) => iso(i.data_solicitacao)).filter(Boolean).sort();
  const ent = items.map((i) => iso(i.entrega_efetiva));
  const todasEntregues = items.length > 0 && ent.every(Boolean);
  return {
    inicio: sol.length ? fmtDataLonga(sol[0]) : null,
    termino: todasEntregues ? fmtDataLonga([...ent].sort().slice(-1)[0]) : null,
  };
}

/* status de entrega → cor da tag (faixa do topo; também são filtros) */
const SE_TAGS = [
  ["Em andamento", "te-ea"], ["Concluído no prazo", "te-cp"], ["Concluído com atraso", "te-ca"],
  ["Pendente", "te-pe"], ["N/A", "te-na"],
];
/* caixas de filtro (dimensão → coluna da Base Gerencial, mesmo nome) */
const FILTER_DIMS = [
  { key: "referencia", label: "Referência", acc: (it) => txt(it.referencia) },
  { key: "segmento", label: "Segmento", acc: (it) => txt(it.segmento) },
  { key: "empresa", label: "Empresa", acc: (it) => txt(it.empresa) },
  { key: "grupo", label: "Grupo", acc: (it) => txt(it.grupo) },
  { key: "area_responsavel", label: "Área", acc: (it) => txt(it.area_responsavel) },
];
/* dimensão dos 3 gráficos de recorte (Conclusão / Pendências x Prazo / Atraso).
   Alternável na faixa de filtros; padrão = Área. */
const DIMS = { area: { key: "area_responsavel", label: "Área" }, grupo: { key: "grupo", label: "Grupo" } };
/* os 3 status de prazo — sempre exibidos (mesmo zerados), p/ largura estável.
   Paleta própria (azul/âmbar/cinza) para não confundir com o Status Geral. */
const PRAZOS = [["N/A", "na"], ["No Prazo", "np"], ["Atrasado", "atr"]];

/* ---------- filtros da página ---------- */
function applyFilters(allItems, f, hoje = new Date()) {
  const has = (k) => f[k] && f[k].size;
  return allItems.filter((it) => {
    for (const d of FILTER_DIMS) if (has(d.key) && !f[d.key].has(d.acc(it))) return false;
    if (has("entrega") && !f.entrega.has(statusEntrega(it, hoje))) return false;
    return true;
  });
}

/* ---------- agregação (client-side) ---------- */
export function aggregate(items, hoje = new Date()) {
  const se = { "Em andamento": 0, "Pendente": 0, "Concluído no prazo": 0, "Concluído com atraso": 0, "N/A": 0 };
  const geral = { "Concluído": 0, "Pendente": 0 };
  const conclPrazo = { "No Prazo": 0, Atrasado: 0, "N/A": 0 };
  const pendPrazo = { "No Prazo": 0, Atrasado: 0, "N/A": 0 };
  const prazoTot = { "No Prazo": 0, Atrasado: 0, "N/A": 0 };
  const emp = new Map(), grp = new Map(), setor = new Map(), ref = new Map(), area = new Map();
  const ens = (m, k) => { const key = txt(k) || "(vazio)"; let o = m.get(key); if (!o) { o = { label: key, total: 0, concl: 0, pend: 0, np: 0, atr: 0, na: 0, aSoma: 0, aN: 0 }; m.set(key, o); } return o; };

  for (const it of items) {
    const sE = statusEntrega(it, hoje), sG = statusGeral(it, hoje), sP = statusPrazo(it, hoje), da = diasAtraso(it, hoje);
    se[sE] = (se[sE] || 0) + 1;
    geral[sG]++;
    prazoTot[sP]++;
    (sG === "Concluído" ? conclPrazo : pendPrazo)[sP]++;
    for (const [m, k] of [[emp, it.empresa], [grp, it.grupo], [setor, it.segmento], [ref, it.referencia], [area, it.area_responsavel]]) {
      const o = ens(m, k); o.total++;
      if (sG === "Concluído") o.concl++; else o.pend++;
      if (sP === "No Prazo") o.np++; else if (sP === "Atrasado") o.atr++; else o.na++;
      if (da != null && da > 0) { o.aSoma += da; o.aN++; }
    }
  }
  const total = items.length;
  const enrich = (o) => ({ ...o, pctConcl: pctOf(o.concl, o.total), pctPend: pctOf(o.pend, o.total), media: o.aN ? o.aSoma / o.aN : 0 });
  const arr = (m) => [...m.values()].map(enrich);
  return {
    total, se, geral, conclPrazo, pendPrazo, prazoTot,
    pctConcl: pctOf(geral["Concluído"], total), pctPend: pctOf(geral["Pendente"], total),
    empresas: arr(emp), grupos: arr(grp), setores: arr(setor), referencias: arr(ref), areas: arr(area),
  };
}

/* ---------- drill: abre a Base Gerencial filtrada ---------- */
function drill(ctx, extra) {
  if (!ctx.onDrill) return;
  const sel = {};
  for (const d of FILTER_DIMS) if (ctx.state.filters[d.key]?.size) sel[d.key] = [...ctx.state.filters[d.key]];
  if (ctx.state.filters.entrega?.size) sel.c_entrega = [...ctx.state.filters.entrega];
  Object.assign(sel, extra || {});
  ctx.onDrill(sel);
}
/* stopPropagation: num empilhado, o clique no segmento não dispara o drill da linha */
function clickable(ctx, tip, extra) {
  return {
    title: tip, role: "button", tabindex: "0",
    onClick: (e) => { e.stopPropagation(); drill(ctx, extra); },
    onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); drill(ctx, extra); } },
  };
}

/* ---------- componentes ---------- */
/* medidor em arco de 3/4 (270°, abertura embaixo) — % no centro */
function gaugeSvg(pct, kind) {
  const r = 26, C = 2 * Math.PI * r, ARC = C * 0.75;
  const len = Math.max(0, Math.min(100, pct)) / 100 * ARC;
  const rot = "rotate(135 32 32)";   // começa embaixo à esquerda
  return `<svg viewBox="0 0 64 64" class="t-gsvg" aria-hidden="true">` +
    `<circle cx="32" cy="32" r="${r}" class="t-gtrack" stroke-dasharray="${ARC.toFixed(2)} ${(C - ARC).toFixed(2)}" transform="${rot}"/>` +
    `<circle cx="32" cy="32" r="${r}" class="t-gfill ${kind}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" transform="${rot}"/></svg>`;
}
/* legendas em 3 colunas de largura igual, quantidade abaixo do rótulo */
function legCounts(counts, ctx, total) {
  return h("div", { class: "t-legs" }, ...PRAZOS.map(([label, cls]) => {
    const v = counts[label] || 0;   /* sem ocorrência → esmaecido, para não competir */
    return h("div", Object.assign({ class: "t-leg drillable" + (v === 0 ? " zero" : "") },
      clickable(ctx, `${label}: ${v} (${pctOf(v, total)}% do total)`, { c_prazo: [label] })),
      h("span", { class: "t-leglab " + cls }, label),
      h("span", { class: "t-legval tnum" }, String(v)));
  }));
}
/* pares [cls, rótulo] ou [cls, rótulo, qtd, extraDoDrill] — com extra, vira filtro clicável */
function legend(pairs, ctx) {
  return h("div", { class: "t-legend" }, ...pairs.map(([cls, lab, count, extra]) => {
    const kids = [h("span", { class: "t-lgdot " + cls }), lab];
    if (count != null) kids.push(h("b", { class: "t-lgn tnum" }, String(count)));
    if (extra && ctx) return h("button", Object.assign({ class: "t-lgitem t-lgbtn" },
      clickable(ctx, `Ver só "${lab}" na Base Gerencial`, extra)), ...kids);
    return h("span", { class: "t-lgitem" }, ...kids);
  }));
}
/* barras agrupadas %Concluído x %Pendente (Status Geral por setor, e por Referência) */
function sgChart(rows, ctx, dimKey, limit) {
  const wrap = h("div", { class: "t-sgchart" });
  rows.slice(0, limit).forEach((s) => {
    const bar = (pct, n, cls, lab, gv) => h("div", Object.assign({ class: "t-sgbar drillable " + cls, style: { height: Math.max(2, Math.round(pct / 100 * 40)) + "px" } },
      clickable(ctx, `${s.label} · ${lab}: ${n} de ${s.total} (${pct}%)`, { [dimKey]: [s.label], c_geral: [gv] })),
      h("span", { class: "t-sgpct" }, pct + "%"));
    wrap.appendChild(h("div", { class: "t-sggroup" },
      h("div", { class: "t-sgbars" }, bar(s.pctConcl, s.concl, "ok", "Concluído", "Concluído"), bar(s.pctPend, s.pend, "pend", "Pendente", "Pendente")),
      h("span", { class: "t-sglab", title: s.label }, s.label)));
  });
  return wrap;
}
function pctRow(o, ctx, dimKey) {
  return h("div", Object.assign({ class: "t-pctrow drillable" },
    clickable(ctx, `${o.label}: ${o.concl} de ${o.total} concluído(s) — ${o.pctConcl}%`, { [dimKey]: [o.label] })),
    h("span", { class: "t-plab" }, o.label),
    h("div", { class: "t-ptrack" },
      h("span", { class: "t-pfill", style: { width: Math.min(100, o.pctConcl) + "%" } }),
      h("span", { class: "t-pval tnum" }, o.pctConcl + "%")));
}
/* cada segmento do empilhado filtra só o seu status (clique individual) */
function prazoRow(o, max, ctx, dimKey) {
  const track = h("div", { class: "t-prtrack" });
  const seg = (v, cls, status) => {
    if (v <= 0) return;
    track.appendChild(h("span", Object.assign({ class: "t-prseg " + cls, style: { width: (v / max * 100) + "%" } },
      clickable(ctx, `${o.label} · ${status}: ${v} de ${o.total} (${pctOf(v, o.total)}%)`, { [dimKey]: [o.label], c_prazo: [status] }))));
  };
  seg(o.np, "np", "No Prazo"); seg(o.atr, "atr", "Atrasado"); seg(o.na, "na", "N/A");
  const tip = `${o.label}: ${o.total} item(ns) — No Prazo ${o.np} (${pctOf(o.np, o.total)}%) · Atrasado ${o.atr} (${pctOf(o.atr, o.total)}%) · N/A ${o.na} (${pctOf(o.na, o.total)}%)`;
  return h("div", Object.assign({ class: "t-prrow drillable" }, clickable(ctx, tip, { [dimKey]: [o.label] })),
    h("span", { class: "t-plab" }, o.label), track);
}
function atrasoRow(o, max, ctx, dimKey) {
  const tip = o.media > 0
    ? `${o.label}: atraso médio ${fmt1(o.media)} dia(s) — ${o.aN} de ${o.total} item(ns) em atraso (${pctOf(o.aN, o.total)}%)`
    : `${o.label}: sem atraso — 0 de ${o.total} item(ns)`;
  return h("div", Object.assign({ class: "t-arrow drillable" + (o.media > 0 ? "" : " zero") }, clickable(ctx, tip, { [dimKey]: [o.label] })),
    h("span", { class: "t-arlab" }, o.label),
    h("div", { class: "t-artrack" }, o.media > 0 ? h("span", { class: "t-arfill", style: { width: (o.media / max * 100) + "%" } }) : null),
    h("span", { class: "t-arval tnum" }, fmt1(o.media)));
}
function card(title, cls, ...body) {
  return h("section", { class: "t-card" },
    h("h3", { class: "t-cardtitle" + (cls ? " " + cls : "") }, title),
    h("div", { class: "t-cardbody" }, ...body.filter(Boolean)));
}

/* ---------- render ---------- */
export function buildDashboard(project, allItems, opts = {}) {
  const root = h("div", { class: "dash" });
  const state = { filters: {}, dim: "area" };   /* padrão: gráficos por Área responsável */
  const values = {};
  for (const d of FILTER_DIMS) values[d.key] = [...new Set(allItems.map(d.acc).filter(Boolean))].sort((x, y) => x.localeCompare(y, "pt", { numeric: true }));
  const ctx = { state, onDrill: opts.onDrill || null };
  const rerender = () => renderDash(root, project, allItems, state, values, ctx, rerender);
  rerender();
  return root;
}

function renderDash(root, project, allItems, state, values, ctx, rerender) {
  const items = applyFilters(allItems, state.filters);
  const a = aggregate(items);
  const per = periodo(items);

  const empresasT = [...a.empresas].sort((x, y) => y.total - x.total);
  /* dimensão escolhida no alternador (Área/Grupo) — alimenta as 3 cartas de recorte */
  const dim = DIMS[state.dim] || DIMS.area;
  const dimAlpha = [...(state.dim === "grupo" ? a.grupos : a.areas)].sort((x, y) => x.label.localeCompare(y.label, "pt"));
  const dimRev = [...dimAlpha].reverse();
  const setoresT = [...a.setores].sort((x, y) => y.total - x.total);
  const refsT = [...a.referencias].sort((x, y) => y.total - x.total);

  /* ---- faixa do topo: tags de status (seleção individual) + caixas de filtro ----
     As contagens das tags ignoram o próprio filtro de status; senão, ao escolher
     um status, os outros zerariam e não daria para trocar de seleção. */
  const semEntrega = { ...state.filters }; delete semEntrega.entrega;
  const aTags = aggregate(applyFilters(allItems, semEntrega));
  const semFiltroStatus = !state.filters.entrega?.size;
  const tag = (lab, cls, n, on, onClick) => h("button", {
    class: "t-tag " + cls + (on ? " on" : ""),
    title: `${lab}: ${n} (${pctOf(n, aTags.total)}% do total)` + (on ? " — selecionado" : " — clique para filtrar"),
    onClick,
  }, h("span", { class: "t-tdot" }), h("span", { class: "t-tlab2" }, lab), h("b", { class: "tnum" }, String(n)));

  const tags = h("div", { class: "t-tags" },
    tag("Todas", "te-all", aTags.total, semFiltroStatus, () => { delete state.filters.entrega; rerender(); }),
    ...SE_TAGS.map(([lab, cls]) => {
      const on = !!state.filters.entrega?.has(lab);
      return tag(lab, cls, aTags.se[lab] || 0, on, () => {
        if (on) delete state.filters.entrega;          /* clicar de novo volta para "Todas" */
        else state.filters.entrega = new Set([lab]);   /* seleção individual */
        rerender();
      });
    }));

  /* alternador da dimensão dos gráficos (à esquerda das caixas de filtro) */
  const dimToggle = h("div", { class: "t-fwrap" },
    h("span", { class: "t-flegend" }, "Gráficos por"),
    h("div", { class: "t-seg", role: "group", "aria-label": "Dimensão dos gráficos" },
      ...["area", "grupo"].map((k) => {
        const on = state.dim === k;
        return h("button", {
          class: "t-segbtn" + (on ? " on" : ""), "aria-pressed": String(on),
          title: `Ver os gráficos de recorte por ${DIMS[k].label}`,
          onClick: () => { if (!on) { state.dim = k; rerender(); } },
        }, DIMS[k].label);
      })));

  const filtros = h("div", { class: "t-filters" }, dimToggle, ...FILTER_DIMS.map((d) =>
    h("div", { class: "t-fwrap" },
      h("span", { class: "t-flegend" }, d.label),
      h("button", {
        class: "t-filter" + (state.filters[d.key]?.size ? " on" : ""),
        title: `Filtrar por ${d.label}`,
        onClick: (e) => openFilter(e.currentTarget, d, values[d.key], state, rerender),
      }, h("span", { class: "t-fic", html: FILT }),
        h("span", { class: "t-flabel" }, filterLabel(state.filters[d.key])), h("span", { class: "t-fchv", html: CHV })))));

  const tagstrip = h("div", { class: "t-tagstrip" }, tags, filtros);

  /* linha de título (acima de tudo): logo + Auditoria + nome do projeto | datas à direita */
  const refSel = state.filters.referencia;
  const sub = !refSel || !refSel.size ? "Todas as referências" : refSel.size === 1 ? [...refSel][0] : `${refSel.size} referências`;
  const headline = h("div", { class: "t-headline" },
    h("div", { class: "t-hl-left" },
      h("img", { class: "t-logomark t-logo-light", src: "modelos/logomarcas_e_icones/equatorial/Logo%20marca%20-%20azul%20-%20fundo%20transparente.png", alt: "Grupo Equatorial" }),
      h("img", { class: "t-logomark t-logo-dark", src: "modelos/logomarcas_e_icones/equatorial/Logo%20marca%20-%20branco%20-%20fundo%20transparente.png", alt: "Grupo Equatorial" }),
      h("h1", { class: "t-hl-title" }, "Auditoria"),
      h("span", { class: "t-hl-sep", "aria-hidden": "true" }, "|"),
      h("span", { class: "t-hl-proj", title: project.name }, project.name),
      h("span", { class: "t-hl-sub" }, sub)),
    h("div", { class: "t-hl-dates" },
      h("div", { class: "t-hl-date" }, h("b", {}, "Data Início: "), per.inicio || "—"),
      h("div", { class: "t-hl-date" }, h("b", {}, "Data Término: "), per.termino || "andamento")));

  const total = h("div", Object.assign({ class: "t-total drillable" }, clickable(ctx, `Total de pedidos: ${a.total} (100%)`, {})),
    h("img", { class: "t-icon", src: IC.total, alt: "" }),
    h("div", { class: "t-tlab" }, "TOTAL PEDIDOS"),
    h("div", { class: "t-tnum tnum" }, String(a.total)));

  const bloco = (kind, icon, lab, pct, n, counts, geralVal) => h("div", { class: "t-block " + kind },
    h("div", Object.assign({ class: "t-bkhead drillable" }, clickable(ctx, `${lab}: ${n} de ${a.total} (${pct}%)`, { c_geral: [geralVal] })),
      h("img", { class: "t-icon2", src: icon, alt: "" }),
      h("span", { class: "t-bklab " + kind }, lab)),
    h("div", { class: "t-bkbody" },
      h("div", { class: "t-gcol" },
        h("div", { class: "t-gauge", html: gaugeSvg(pct, kind) + `<span class="t-gpct ${kind}">${pct}%</span>` }),
        h("div", { class: "t-bkitems" }, n + " itens")),
      legCounts(counts, ctx, a.total)));
  const conc = bloco("conc", IC.concl, "Concluídos", a.pctConcl, a.geral["Concluído"], a.conclPrazo, "Concluído");
  const pend = bloco("pend", IC.pend, "Pendentes", a.pctPend, a.geral["Pendente"], a.pendPrazo, "Pendente");

  const sgeral = h("div", { class: "t-block sgeral" },
    h("div", { class: "t-bktitle" }, "Status Geral"),
    legend([["ok", "Concluído"], ["pend", "Pendente"]]),
    sgChart(setoresT, ctx, "segmento", 4));

  const matraso = h("div", { class: "t-block matraso" },
    h("div", { class: "t-bktitle" }, "Média de Dias de Atraso"),
    (() => {
      const setores = setoresT.slice(0, 4);
      const max = Math.max(1, ...setores.map((s) => s.media));
      const body = h("div", { class: "t-mabody" });
      setores.forEach((s) => body.appendChild(h("div", Object.assign({ class: "t-macol drillable" + (s.media > 0 ? "" : " zero") },
        clickable(ctx, s.media > 0 ? `${s.label}: atraso médio ${fmt1(s.media)} dia(s) — ${s.aN} de ${s.total} (${pctOf(s.aN, s.total)}%)` : `${s.label}: sem atraso — 0 de ${s.total}`, { segmento: [s.label] })),
        h("span", { class: "t-maval tnum" }, fmt1(s.media)),
        h("span", { class: "t-mabar", style: { height: Math.max(2, Math.round(s.media / max * 44)) + "px" } }),
        h("span", { class: "t-malab", title: s.label }, s.label))));
      return body;
    })());

  const refs = h("div", { class: "t-block refs" },
    h("div", { class: "t-bktitle" }, "Referências"),
    legend([["ok", "Concluído"], ["pend", "Pendente"]]),
    sgChart(refsT, ctx, "referencia", 8));

  const header = h("header", { class: "t-head" }, headline, tagstrip,
    h("div", { class: "t-headmain" }, total, conc, pend, sgeral, refs, matraso));

  /* ---- 5 cartas ---- */
  const empMaxPr = Math.max(1, ...empresasT.map((o) => o.np + o.atr + o.na));
  const dimMaxPr = Math.max(1, ...dimAlpha.map((o) => o.np + o.atr + o.na));
  const dimMaxAtr = Math.max(1, ...dimRev.map((o) => o.media));
  const prazoLeg = () => legend([
    ["np", "No Prazo", a.prazoTot["No Prazo"], { c_prazo: ["No Prazo"] }],
    ["atr", "Atrasado", a.prazoTot.Atrasado, { c_prazo: ["Atrasado"] }],
    ["na", "N/A", a.prazoTot["N/A"], { c_prazo: ["N/A"] }],
  ], ctx);

  root.replaceChildren(header, h("div", { class: "t-cards" },
    card("% Conclusão por Empresa", "", ...empresasT.map((o) => pctRow(o, ctx, "empresa"))),
    card(`% Conclusão por ${dim.label}`, "", ...dimAlpha.map((o) => pctRow(o, ctx, dim.key))),
    card("Pendências x Prazo por Empresas", "coral", prazoLeg(), ...empresasT.map((o) => prazoRow(o, empMaxPr, ctx, "empresa"))),
    card(`Pendências x Prazo por ${dim.label}`, "coral", prazoLeg(), ...dimAlpha.map((o) => prazoRow(o, dimMaxPr, ctx, dim.key))),
    card(`Média de Dias de Atraso por ${dim.label}`, "", ...dimRev.map((o) => atrasoRow(o, dimMaxAtr, ctx, dim.key)))));
}

/* ---------- caixas de filtro (combobox multi-seleção) ---------- */
function filterLabel(filter) {
  if (!filter || !filter.size) return "Todos";
  if (filter.size === 1) return [...filter][0];
  return filter.size + " selecionadas";
}
function openFilter(anchor, dim, options, state, rerender) {
  document.querySelector(".t-fpop")?.remove();
  const cur = new Set(state.filters[dim.key] || []);
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const r = anchor.getBoundingClientRect();
  const pop = h("div", { class: "t-fpop", style: { top: ((r.bottom + 6) / z) + "px", left: (Math.max(8, Math.min(r.left, window.innerWidth - 290)) / z) + "px" } });
  const search = options.length > 8 ? h("input", { class: "t-fpop-search", type: "search", placeholder: `Buscar ${dim.label.toLowerCase()}…` }) : null;
  const count = h("span", { class: "t-fpop-count" });
  const updateCount = () => { count.textContent = cur.size ? cur.size + " selecionada(s)" : "Todos"; };
  /* aplica na hora (sem botão "Aplicar") */
  const commit = () => { if (cur.size) state.filters[dim.key] = new Set(cur); else delete state.filters[dim.key]; rerender(); };
  const tools = h("div", { class: "t-fpop-tools" },
    h("button", { class: "t-fpop-link", onClick: () => { options.forEach((o) => cur.add(o)); paint(); commit(); } }, "Todos"),
    h("button", { class: "t-fpop-link", onClick: () => { cur.clear(); paint(); commit(); } }, "Limpar"),
    count);
  const list = h("div", { class: "t-fpop-list" });
  const paint = () => {
    updateCount();
    list.replaceChildren();
    const q = ((search && search.value) || "").toLowerCase();
    const fil = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    for (const o of fil) {
      const cb = h("input", { type: "checkbox" }); cb.checked = cur.has(o);
      cb.onchange = () => { if (cb.checked) cur.add(o); else cur.delete(o); updateCount(); commit(); };
      list.appendChild(h("label", { class: "t-fpop-item" }, cb, h("span", { title: o }, o)));
    }
    if (!fil.length) list.appendChild(h("div", { class: "t-fpop-empty" }, "Sem valores"));
  };
  if (search) search.oninput = paint;
  paint();
  if (search) pop.appendChild(search);
  pop.append(tools, list);
  document.body.appendChild(pop);
  anchor.classList.add("open");
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { pop.remove(); anchor.classList.remove("open"); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); }
  setTimeout(() => { document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey); if (search) search.focus(); }, 0);
}
