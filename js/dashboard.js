/* Dashboard do projeto tabela — visão gerencial das seleções de auditoria.
   Design "Pedido de análise" (teal/coral): cabeçalho com Total / Concluídos /
   Pendentes / Status Geral / Média de atraso, faixa de tags de status de entrega
   no topo, e 5 cartas (% conclusão e pendências x prazo por empresa/grupo, média
   de atraso). "Concluído/Pendente" = Status Geral do Excel (N/A conta como
   Concluído). Agrega no cliente (calc.js); barras em <div>; ícones em modelos/.
   Estilos em styles/dashboard.css (escopo .dash). */
import { h } from "./util.js";
import { statusEntrega, statusGeral, statusPrazo, diasAtraso } from "./calc.js";
import { exportMenu } from "./present.js";

const ICON_DIR = "modelos/logomarcas_e_icones/icones_dashboard/";
const IC = { total: ICON_DIR + "check.png", concl: ICON_DIR + "checkmark.png", pend: ICON_DIR + "pending.png" };
const DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>';

/* status de entrega → cor da tag (faixa do topo) */
const SE_TAGS = [
  ["Em andamento", "te-ea"], ["Concluído no prazo", "te-cp"], ["Concluído com atraso", "te-ca"],
  ["Pendente", "te-pe"], ["N/A", "te-na"],
];

/* ---------- agregação (client-side) ---------- */
export function aggregate(items, hoje = new Date()) {
  const se = { "Em andamento": 0, "Pendente": 0, "Concluído no prazo": 0, "Concluído com atraso": 0, "N/A": 0 };
  const geral = { "Concluído": 0, "Pendente": 0 };
  const conclPrazo = { "No Prazo": 0, Atrasado: 0, "N/A": 0 };
  const pendPrazo = { "No Prazo": 0, Atrasado: 0, "N/A": 0 };
  const emp = new Map(), grp = new Map(), setor = new Map();
  const ens = (m, k) => { const key = String(k ?? "").trim() || "(vazio)"; let o = m.get(key); if (!o) { o = { label: key, total: 0, concl: 0, pend: 0, np: 0, atr: 0, na: 0, aSoma: 0, aN: 0 }; m.set(key, o); } return o; };

  for (const it of items) {
    const sE = statusEntrega(it, hoje), sG = statusGeral(it, hoje), sP = statusPrazo(it, hoje), da = diasAtraso(it, hoje);
    se[sE] = (se[sE] || 0) + 1;
    geral[sG]++;
    (sG === "Concluído" ? conclPrazo : pendPrazo)[sP]++;
    for (const [m, k] of [[emp, it.empresa], [grp, it.grupo], [setor, it.segmento]]) {
      const o = ens(m, k); o.total++;
      if (sG === "Concluído") o.concl++; else o.pend++;
      if (sP === "No Prazo") o.np++; else if (sP === "Atrasado") o.atr++; else o.na++;
      if (da != null && da > 0) { o.aSoma += da; o.aN++; }
    }
  }
  const total = items.length;
  const enrich = (o) => ({ ...o, pctConcl: o.total ? Math.round(o.concl / o.total * 100) : 0, pctPend: o.total ? Math.round(o.pend / o.total * 100) : 0, media: o.aN ? o.aSoma / o.aN : 0 });
  const arr = (m) => [...m.values()].map(enrich);
  return {
    total, se, geral, conclPrazo, pendPrazo,
    pctConcl: total ? Math.round(geral["Concluído"] / total * 100) : 0,
    pctPend: total ? Math.round(geral["Pendente"] / total * 100) : 0,
    empresas: arr(emp), grupos: arr(grp), setores: arr(setor),
  };
}

const fmt1 = (n) => n.toFixed(1).replace(".", ",");

/* ---------- componentes ---------- */
function vbars(bars) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const wrap = h("div", { class: "t-mini" });
  bars.forEach((b) => wrap.appendChild(h("div", { class: "t-micol" },
    h("span", { class: "t-mival tnum" }, String(b.value)),
    h("span", { class: "t-mibar " + b.cls, style: { height: Math.max(3, Math.round(b.value / max * 56)) + "px" } }),
    h("span", { class: "t-milab" }, b.label))));
  return wrap;
}
function legend(pairs) {
  return h("div", { class: "t-legend" }, ...pairs.map(([cls, lab]) =>
    h("span", { class: "t-lgitem" }, h("span", { class: "t-lgdot " + cls }), lab)));
}
function sgChart(setores) {
  const wrap = h("div", { class: "t-sgchart" });
  setores.slice(0, 4).forEach((s) => {
    const bar = (pct, cls) => h("div", { class: "t-sgbar " + cls, style: { height: Math.max(3, Math.round(pct / 100 * 66)) + "px" } }, h("span", { class: "t-sgpct" }, pct + "%"));
    wrap.appendChild(h("div", { class: "t-sggroup" },
      h("div", { class: "t-sgbars" }, bar(s.pctConcl, "teal"), bar(s.pctPend, "coral")),
      h("span", { class: "t-sglab", title: s.label }, s.label)));
  });
  return wrap;
}
function pctRow(o, withPend) {
  return h("div", { class: "t-pctrow" + (withPend ? "" : " g") },
    h("span", { class: "t-plab" + (withPend ? "" : " wrap"), title: o.label }, o.label),
    h("div", { class: "t-ptrack" }, h("span", { class: "t-pfill", style: { width: o.pctConcl + "%" } })),
    h("span", { class: "t-pc tnum" }, o.pctConcl + "%"),
    withPend ? h("span", { class: "t-pp tnum" }, o.pctPend + "%") : null);
}
function prazoRow(o, max, withLabel) {
  const track = h("div", { class: "t-prtrack" });
  const seg = (v, cls) => { if (v > 0) track.appendChild(h("span", { class: "t-prseg " + cls, style: { width: (v / max * 100) + "%" } })); };
  seg(o.np, "np"); seg(o.atr, "atr"); seg(o.na, "na");
  return h("div", { class: "t-prrow" },
    h("span", { class: "t-plab" + (withLabel ? " wrap" : ""), title: o.label }, o.label),
    track, h("span", { class: "t-prval tnum" }, String(o.np)));
}
function atrasoRow(o, max) {
  return h("div", { class: "t-arrow" },
    h("span", { class: "t-arlab", title: o.label }, o.label),
    h("div", { class: "t-artrack" }, o.media > 0 ? h("span", { class: "t-arfill", style: { width: (o.media / max * 100) + "%" } }) : null),
    h("span", { class: "t-arval tnum" }, o.media > 0 ? fmt1(o.media) : ""));
}
function card(title, cls, ...body) {
  return h("section", { class: "t-card" },
    h("h3", { class: "t-cardtitle" + (cls ? " " + cls : "") }, title),
    h("div", { class: "t-cardbody" }, ...body.filter(Boolean)));
}

/* ---------- render ---------- */
export function buildDashboard(project, allItems) {
  const root = h("div", { class: "dash" });
  const a = aggregate(allItems);
  const now = new Date();
  const dataHoje = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

  const empresasT = [...a.empresas].sort((x, y) => y.total - x.total);
  const gruposAlpha = [...a.grupos].sort((x, y) => x.label.localeCompare(y.label, "pt"));
  const gruposRev = [...gruposAlpha].reverse();

  /* ---- Cabeçalho ---- */
  const tagstrip = h("div", { class: "t-tagstrip" },
    h("img", { class: "t-logomark t-logo-light", src: "modelos/logomarcas_e_icones/equatorial/Logo%20marca%20-%20azul%20-%20fundo%20transparente.png", alt: "Grupo Equatorial" }),
    h("img", { class: "t-logomark t-logo-dark", src: "modelos/logomarcas_e_icones/equatorial/Logo%20marca%20-%20branco%20-%20fundo%20transparente.png", alt: "Grupo Equatorial" }),
    h("div", { class: "t-tags" }, ...SE_TAGS.map(([lab, cls]) =>
      h("span", { class: "t-tag " + cls }, h("span", { class: "t-tdot" }), h("span", { class: "t-tlab2" }, lab), h("b", { class: "tnum" }, String(a.se[lab] || 0))))),
    h("button", { class: "t-export", "data-noexport": "", html: DL + "<span>Exportar</span>", onClick: (e) => exportMenu(e.currentTarget, root) }));

  const idblock = h("div", { class: "t-idblock" },
    h("div", { class: "t-idtitle" }, "Auditoria | Pedido de análise"),
    h("div", { class: "t-idsub" }, "2ºTRI 2026"),
    h("div", { class: "t-datebox" },
      h("div", {}, h("b", {}, "Data Início: "), dataHoje),
      h("div", {}, h("b", {}, "Data Término: "), "andamento")));

  const total = h("div", { class: "t-total" },
    h("img", { class: "t-icon", src: IC.total, alt: "" }),
    h("div", { class: "t-tlab" }, "TOTAL PEDIDOS"),
    h("div", { class: "t-tnum tnum" }, String(a.total)));

  const conclBars = [{ label: "N/A", value: a.conclPrazo["N/A"], cls: "na" }, { label: "No Prazo", value: a.conclPrazo["No Prazo"], cls: "green" }];
  if (a.conclPrazo.Atrasado > 0) conclBars.push({ label: "Atrasado", value: a.conclPrazo.Atrasado, cls: "coral" });
  const conc = h("div", { class: "t-block conc" },
    h("div", { class: "t-bkleft" },
      h("img", { class: "t-icon2", src: IC.concl, alt: "" }),
      h("div", { class: "t-bklab conc" }, "Concluídos"),
      h("div", { class: "t-bkpct conc tnum" }, a.pctConcl + "%"),
      h("div", { class: "t-bkitems" }, a.geral["Concluído"] + " itens")),
    h("div", { class: "t-bkright" }, vbars(conclBars)));

  const pendBars = [{ label: "N/A", value: a.pendPrazo["N/A"], cls: "na" }, { label: "No Prazo", value: a.pendPrazo["No Prazo"], cls: "green" }];
  if (a.pendPrazo.Atrasado > 0) pendBars.push({ label: "Atrasado", value: a.pendPrazo.Atrasado, cls: "coral" });
  const pend = h("div", { class: "t-block pend" },
    h("div", { class: "t-bkleft" },
      h("img", { class: "t-icon2", src: IC.pend, alt: "" }),
      h("div", { class: "t-bklab pend" }, "Pendentes"),
      h("div", { class: "t-bkpct pend tnum" }, a.pctPend + "%"),
      h("div", { class: "t-bkitems" }, a.geral["Pendente"] + " itens")),
    h("div", { class: "t-bkright" }, vbars(pendBars)));

  const sgeral = h("div", { class: "t-block sgeral" },
    h("div", { class: "t-bktitle" }, "Status Geral"),
    legend([["teal", "Concluído"], ["coral", "Pendente"]]),
    sgChart([...a.setores].sort((x, y) => y.total - x.total)));

  const matraso = h("div", { class: "t-block matraso" },
    h("div", { class: "t-bktitle" }, "Média de Dias de Atraso"),
    (() => {
      const setores = [...a.setores].sort((x, y) => y.total - x.total).slice(0, 4);
      const max = Math.max(1, ...setores.map((s) => s.media));
      const body = h("div", { class: "t-mabody" });
      setores.forEach((s) => body.appendChild(h("div", { class: "t-macol" },
        h("span", { class: "t-maval tnum" }, s.media > 0 ? fmt1(s.media) : ""),
        h("span", { class: "t-mabar", style: { height: Math.max(2, Math.round(s.media / max * 54)) + "px" } }),
        h("span", { class: "t-malab", title: s.label }, s.label))));
      return body;
    })());

  root.appendChild(h("header", { class: "t-head" }, tagstrip,
    h("div", { class: "t-headmain" }, idblock, total, conc, pend, sgeral, matraso)));

  /* ---- 5 cartas ---- */
  const empMaxPr = Math.max(1, ...empresasT.map((o) => o.np + o.atr + o.na));
  const grpMaxPr = Math.max(1, ...gruposAlpha.map((o) => o.np + o.atr + o.na));
  const grpMaxAtr = Math.max(1, ...gruposRev.map((o) => o.media));

  const cEmpConcl = card("% Conclusão por Empresa", "", ...empresasT.map((o) => pctRow(o, true)));
  const cGrpConcl = card("% Conclusão por Grupo", "", ...gruposAlpha.map((o) => pctRow(o, false)));
  const cEmpPr = card("Pendências x Prazo por Empresas", "coral",
    legend([["np", "No Prazo"], ["na", "N/A"]]), ...empresasT.map((o) => prazoRow(o, empMaxPr, false)));
  const cGrpPr = card("Pendências x Prazo por Grupo", "coral",
    legend([["np", "No Prazo"], ["na", "N/A"]]), ...gruposAlpha.map((o) => prazoRow(o, grpMaxPr, true)));
  const cGrpAtr = card("Média de Dias de Atraso por Grupo", "", ...gruposRev.map((o) => atrasoRow(o, grpMaxAtr)));

  root.appendChild(h("div", { class: "t-cards" }, cEmpConcl, cGrpConcl, cEmpPr, cGrpPr, cGrpAtr));
  return root;
}
