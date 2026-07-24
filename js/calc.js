/* Colunas calculadas da Lista de pedidos (paridade com as fórmulas do Excel).
   Não são persistidas: a aplicação calcula no render (dependem de "hoje").
   Todas recebem o item e "hoje" (Date local). Datas em ISO "YYYY-MM-DD". */

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseDay(iso) {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function diffDays(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); } // a - b (dias)
function isNA(status) { return String(status || "").trim().toLowerCase().replace("/", "") === "na"; }

/* N — Status de entrega = junção de Status Geral (Concluído/Pendente) com
   Status Prazo (no prazo/atraso). Vocabulário padronizado nos dois lados:
   "Concluído no prazo" / "Concluído com atraso" e "Pendente no prazo" /
   "Pendente com atraso". N/A não tem prazo → só "N/A". "Pendente" puro só
   sobra no caso-limite de item pendente sem prazo cadastrado. */
export function statusEntrega(item, hoje = new Date()) {
  if (isNA(item.status)) return "N/A";
  const prazo = parseDay(item.prazo_recebimento);
  const entrega = parseDay(item.entrega_efetiva);
  if (!entrega) {
    if (!prazo) return "Pendente";
    return diffDays(hoje, prazo) <= 0 ? "Pendente no prazo" : "Pendente com atraso";
  }
  if (!prazo) return "Concluído no prazo";
  return diffDays(prazo, entrega) >= 0 ? "Concluído no prazo" : "Concluído com atraso";
}

/* O — Status Geral (fiel a =SE(OU(N="Em andamento";N="Pendente");"Pendente";"Concluído")).
   OBS: por essa fórmula, "N/A" cai em "Concluído" — replicado do Excel.
   Todo status de entrega pendente começa com "Pendente"; o resto é Concluído. */
export function statusGeral(item, hoje = new Date()) {
  return statusEntrega(item, hoje).startsWith("Pendente") ? "Pendente" : "Concluído";
}

/* P — Status Prazo */
export function statusPrazo(item, hoje = new Date()) {
  if (isNA(item.status)) return "N/A";
  const prazo = parseDay(item.prazo_recebimento);
  const entrega = parseDay(item.entrega_efetiva);
  if (!entrega) {
    if (!prazo) return "Pendente";
    return diffDays(hoje, prazo) <= 0 ? "No Prazo" : "Atrasado";
  }
  if (!prazo) return "No Prazo";
  return diffDays(prazo, entrega) >= 0 ? "No Prazo" : "Atrasado";
}

/* Q — Dias de atraso: só p/ não entregues e vencidos
   (fiel a =SE(Entrega>0;"";SE(HOJE()-Prazo<=0;"";HOJE()-Prazo))). */
export function diasAtraso(item, hoje = new Date()) {
  if (parseDay(item.entrega_efetiva)) return null;
  const prazo = parseDay(item.prazo_recebimento);
  if (!prazo) return null;
  const d = diffDays(hoje, prazo);
  return d <= 0 ? null : d;
}

/* Classe do chip (cor) por rótulo de status calculado. */
export function statusKlass(label) {
  switch (label) {
    case "Pendente":
    case "Pendente no prazo": return "st-pendente";
    case "No Prazo":
    case "Concluído no prazo":
    case "Concluído": return "st-no-prazo";
    case "Atrasado":
    case "Pendente com atraso":
    case "Concluído com atraso": return "st-com-atraso";
    case "N/A": return "st-na";
    default: return "st-na";
  }
}
