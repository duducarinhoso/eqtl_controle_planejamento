/* Modo apresentação / exportação do dashboard.
   Captura o painel como imagem (html2canvas via CDN) e permite: copiar para a
   área de transferência, baixar PNG e gerar PDF (jsPDF via CDN). Sem build —
   imports dinâmicos, mesmo padrão do SheetJS/ExcelJS. */
import { h, toast } from "./util.js";

let _h2c, _jspdf;
async function html2canvas() { if (!_h2c) _h2c = (await import("https://esm.sh/html2canvas@1.4.1")).default; return _h2c; }
async function jsPDFlib() { if (!_jspdf) _jspdf = (await import("https://esm.sh/jspdf@2.5.1")).jsPDF; return _jspdf; }

/* Captura um elemento em canvas. Zera temporariamente o zoom do <html> (a CSS
   `zoom` distorce a captura do html2canvas) e restaura depois. */
async function capture(el) {
  const h2c = await html2canvas();
  const root = document.documentElement;
  const zoom = root.style.zoom;
  root.style.zoom = "1";
  try {
    const bg = getComputedStyle(document.body).backgroundColor;
    return await h2c(el, { backgroundColor: bg, scale: 2, useCORS: true, logging: false, windowWidth: el.scrollWidth, windowHeight: el.scrollHeight });
  } finally { root.style.zoom = zoom; }
}
function canvasToBlob(canvas) { return new Promise((res) => canvas.toBlob(res, "image/png")); }

export async function copyImage(el) {
  try {
    const canvas = await capture(el);
    const blob = await canvasToBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Imagem copiada — cole no e-mail ou Teams.");
  } catch (e) { toast("Não consegui copiar a imagem: " + e.message, "err"); }
}
export async function downloadPNG(el) {
  try {
    const canvas = await capture(el);
    const a = h("a", { href: canvas.toDataURL("image/png"), download: "dashboard-selecoes.png" });
    document.body.appendChild(a); a.click(); a.remove();
    toast("PNG baixado.");
  } catch (e) { toast("Não consegui gerar o PNG: " + e.message, "err"); }
}
export async function downloadPDF(el) {
  try {
    const canvas = await capture(el);
    const JsPDF = await jsPDFlib();
    const pdf = new JsPDF({ orientation: "landscape", unit: "pt", format: [canvas.width / 2, canvas.height / 2] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save("dashboard-selecoes.pdf");
    toast("PDF gerado.");
  } catch (e) { toast("Não consegui gerar o PDF: " + e.message, "err"); }
}

/* Tela cheia / apresentação: mostra o dashboard numa folha para print/screenshot,
   com os botões de exportar. Fecha no Esc / botão. */
export function openPresentation(dashEl) {
  const scrim = h("div", { class: "dash-present" });
  const sheet = h("div", { class: "dp-sheet" });
  const clone = dashEl.cloneNode(true);
  clone.querySelector(".d-topbtns")?.remove();  // sem os botões no clone
  sheet.appendChild(clone);
  const bar = h("div", { class: "dp-bar" },
    h("button", { class: "dp-btn", onClick: () => copyImage(clone) }, "Copiar imagem"),
    h("button", { class: "dp-btn", onClick: () => downloadPNG(clone) }, "PNG"),
    h("button", { class: "dp-btn", onClick: () => downloadPDF(clone) }, "PDF"),
    h("button", { class: "dp-btn dp-close", onClick: close }, "Fechar"));
  scrim.append(bar, sheet);
  document.body.appendChild(scrim);
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  function close() { scrim.remove(); document.removeEventListener("keydown", onKey); }
}
