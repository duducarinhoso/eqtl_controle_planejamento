/* Modo apresentação / exportação do dashboard.
   Um único botão "Exportar" abre um menu: Copiar imagem · PNG · PDF.
   Captura a folha do dashboard como imagem (html2canvas via CDN) — o donut é
   SVG e não há conic-gradient/inset, então a captura sai limpa. Sem build:
   imports dinâmicos, mesmo padrão do SheetJS/ExcelJS. */
import { h, toast } from "./util.js";

let _h2c, _jspdf;
async function html2canvas() { if (!_h2c) _h2c = (await import("https://esm.sh/html2canvas@1.4.1")).default; return _h2c; }
async function jsPDFlib() { if (!_jspdf) _jspdf = (await import("https://esm.sh/jspdf@2.5.1")).jsPDF; return _jspdf; }

/* Captura um elemento em canvas. Zera temporariamente o zoom do <html> (a CSS
   `zoom` distorce a captura do html2canvas), esconde controles marcados com
   [data-noexport], e restaura tudo depois. */
async function capture(el) {
  const h2c = await html2canvas();
  const root = document.documentElement;
  const zoom = root.style.zoom;
  const hidden = [...el.querySelectorAll("[data-noexport]")];
  const prev = hidden.map((n) => n.style.display);
  root.style.zoom = "1";
  hidden.forEach((n) => { n.style.display = "none"; });
  try {
    const bg = getComputedStyle(el).backgroundColor;
    const white = !bg || bg === "rgba(0, 0, 0, 0)" ? "#ffffff" : bg;
    return await h2c(el, { backgroundColor: white, scale: 2, useCORS: true, logging: false, windowWidth: el.scrollWidth, windowHeight: el.scrollHeight });
  } finally {
    root.style.zoom = zoom;
    hidden.forEach((n, i) => { n.style.display = prev[i]; });
  }
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
    const w = canvas.width / 2, ht = canvas.height / 2;
    const pdf = new JsPDF({ orientation: w >= ht ? "landscape" : "portrait", unit: "pt", format: [w, ht] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, ht);
    pdf.save("dashboard-selecoes.pdf");
    toast("PDF gerado.");
  } catch (e) { toast("Não consegui gerar o PDF: " + e.message, "err"); }
}

/* Menu único de exportação (popover ancorado no botão "Exportar"). */
export function exportMenu(anchor, root) {
  document.querySelector(".d-expop")?.remove();
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const r = anchor.getBoundingClientRect();
  const pop = h("div", { class: "d-expop", style: { top: ((r.bottom + 6) / z) + "px", left: (Math.min(r.left, window.innerWidth - 220) / z) + "px" } });
  const run = (fn) => { close(); fn(root); };
  pop.append(
    h("button", { class: "d-exitem", onClick: () => run(copyImage) }, "Copiar imagem"),
    h("button", { class: "d-exitem", onClick: () => run(downloadPNG) }, "Baixar PNG"),
    h("button", { class: "d-exitem", onClick: () => run(downloadPDF) }, "Baixar PDF"));
  document.body.appendChild(pop);
  anchor.classList.add("on");
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { pop.remove(); anchor.classList.remove("on"); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); }
  setTimeout(() => { document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey); }, 0);
}
