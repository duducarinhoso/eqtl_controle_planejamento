/* Captura do dashboard como imagem — ícone de câmera ao lado de "Data Início".
   Menu com 2 opções: Salvar imagem · Clipboard.

   Renderização FIEL: usa html-to-image (SVG <foreignObject>), que rasteriza pelo
   PRÓPRIO motor do navegador — diferente do html2canvas, que reimplementa o CSS
   por conta e quebrava layout complexo (flex %, posição absoluta dos chips,
   line-clamp, alinhamento de cabeçalhos, eixos cortados). O que sai é idêntico
   ao que renderiza na tela.

   Dimensão controlada: clona a folha .dash para um palco isolado de LARGURA FIXA
   de desktop (sem zoom, sem scroll, overflow visível → todas as linhas), deixa o
   CSS reflowar limpo e grava na ALTURA NATURAL do conteúdo (paisagem, sem 16:9
   forçado → nada de espremer nem faixas brancas nas laterais). Um modal de
   progresso trava a interação durante o processo. Sem build (import dinâmico). */
import { h, toast } from "./util.js";

let _lib;
async function htmlToImage() { if (!_lib) _lib = await import("https://esm.sh/html-to-image@1.11.11"); return _lib; }

/* dimensão do palco = frame widescreen 1920×1040 (definida no CSS .dash-capture);
   o layout preenche e redistribui; a altura cresce se os dados pedirem.
   pixelRatio por AÇÃO:
   - Salvar imagem (arquivo guardado): 1 → 1920×1040, arquivo leve.
   - Clipboard (colar no Teams/e-mail, que recomprime): 2 → 3840×2080, mais
     pixels na origem = cola nítido mesmo após a recompressão do destino. */
const PR_PNG = 1;
const PR_CLIP = 2;
const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/* monta o palco em 2 camadas: HOST fixo offscreen (esconde) + FRAME estático
   (o que é fotografado — com fundo do workspace + padding, e a folha .dash). */
function buildStage(liveDash) {
  const clone = liveDash.cloneNode(true);
  clone.querySelectorAll("[data-noexport]").forEach((n) => n.remove());   // tira a câmera
  const host = h("div", { class: "dash-capture-host", "aria-hidden": "true" });
  const frame = h("div", { class: "dash-capture" });
  frame.appendChild(clone);
  host.appendChild(frame);
  document.body.appendChild(host);
  return { host, frame };
}

async function captureCanvas(liveDash, ratio) {
  const lib = await htmlToImage();
  const { host, frame } = buildStage(liveDash);
  try {
    await raf();
    /* fotografa o FRAME estático (fundo do workspace + padding + folha .dash) —
       imagem sai com o respiro lateral igual à tela. Não fotografar o host fixo
       (dava branco: conteúdo desenhado no offset -100000px, fora do quadro). */
    const w = frame.scrollWidth, ht = frame.scrollHeight;
    const bg = getComputedStyle(frame).backgroundColor || "#f4f7f6";
    /* html-to-image loga um SecurityError ao tentar ler cssRules da folha
       cross-origin (Google Fonts) mas ignora e segue — as fontes da marca são
       embutidas a partir do cache da página (a captura conclui em ~1,5s). */
    return await lib.toCanvas(frame, { backgroundColor: bg, pixelRatio: ratio, width: w, height: ht, cacheBust: true });
  } finally {
    host.remove();
  }
}

function canvasToBlob(canvas) { return new Promise((res) => canvas.toBlob(res, "image/png")); }
function safeFile(name) { return String(name || "dashboard").replace(/[\\/?*:|"<>]/g, "_").trim() || "dashboard"; }

/* ---------- modal de progresso (trava a interação) ---------- */
function openProgressModal() {
  const scrim = h("div", { class: "scrim cap-scrim" });
  const spin = h("div", { class: "spinner cap-spin" });
  const title = h("h3", { class: "cap-title" }, "Gerando imagem");
  const status = h("p", { class: "cap-status muted" }, "Preparando…");
  const foot = h("div", { class: "cap-foot" });
  const card = h("div", { class: "modal cap-modal" }, spin, title, status, foot);
  scrim.appendChild(card);
  scrim.addEventListener("mousedown", (e) => e.stopPropagation());   // bloqueia clique-fora
  document.body.appendChild(scrim);
  let closed = false;
  const close = () => { if (!closed) { closed = true; scrim.remove(); } };
  return {
    set: (t) => { status.textContent = t; },
    success: (t) => { spin.classList.add("ok"); title.textContent = "Concluído"; status.textContent = t; setTimeout(close, 1100); },
    error: (t) => {
      spin.remove(); title.textContent = "Não foi possível gerar"; status.textContent = t;
      foot.appendChild(h("button", { class: "btn btn-ghost btn-sm", onClick: close }, "Fechar"));
    },
    close,
  };
}

async function runCapture(liveDash, action, filename) {
  const modal = openProgressModal();
  try {
    modal.set("Montando o dashboard (largura fixa, todas as linhas)…");
    await raf();                                  // deixa o modal pintar antes do trabalho pesado
    const canvas = await captureCanvas(liveDash, action === "png" ? PR_PNG : PR_CLIP);
    if (action === "png") {
      modal.set("Salvando a imagem…");
      const a = h("a", { href: canvas.toDataURL("image/png"), download: safeFile(filename) + ".png" });
      document.body.appendChild(a); a.click(); a.remove();
      modal.success(`Imagem salva (${canvas.width}×${canvas.height}).`);
    } else {
      modal.set("Copiando para a área de transferência…");
      const blob = await canvasToBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      modal.success("Copiado — cole no e-mail ou Teams.");
    }
  } catch (e) {
    modal.error(String(e && e.message || e));
    toast("Não consegui gerar a imagem.", "err");
  }
}

/* ---------- botão de câmera + menu ---------- */
const CAM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

/* root = a folha .dash a capturar; filename = nome sugerido do arquivo (projeto). */
export function buildCaptureButton(root, filename) {
  const btn = h("button", { class: "t-cambtn", type: "button", title: "Capturar o dashboard (imagem)", "aria-label": "Capturar o dashboard", "aria-haspopup": "true", "data-noexport": "", html: CAM_ICON });
  btn.onclick = (e) => { e.stopPropagation(); openCaptureMenu(btn, root, filename); };
  return btn;
}
function openCaptureMenu(anchor, root, filename) {
  document.querySelector(".t-campop")?.remove();
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const r = anchor.getBoundingClientRect();
  const run = (action) => { close(); runCapture(root, action, filename); };
  const pop = h("div", { class: "t-campop", role: "menu" },
    h("button", { class: "t-campop-item", role: "menuitem", onClick: () => run("png") }, "Salvar imagem"),
    h("button", { class: "t-campop-item", role: "menuitem", onClick: () => run("copy") }, "Clipboard"));
  pop.style.top = ((r.bottom + 6) / z) + "px";
  pop.style.left = (Math.min(r.left, window.innerWidth - 170) / z) + "px";
  document.body.appendChild(pop);
  anchor.classList.add("on");
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { pop.remove(); anchor.classList.remove("on"); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); }
  setTimeout(() => { document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey); }, 0);
}
