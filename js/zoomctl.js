/* Controle de densidade (zoom da UI) — botão "Aa" + popover −/valor%/+/Redefinir.
   Espelha o controle do Cronograma; aplica/persiste via js/uizoom.js.
   Reutilizado no topbar do shell (app.js) e na topbar do projeto tabela (planning.js). */
import { h } from "./util.js";
import { getZoom, setZoom, ZMIN, ZMAX, ZSTEP } from "./uizoom.js";

export function buildZoomControl() {
  const wrap = h("div", { class: "zoomctl" });
  const btn = h("button", { class: "zoomctl-btn", title: "Densidade da tela", "aria-label": "Ajustar densidade", "aria-haspopup": "dialog" }, "Aa");
  const pop = h("div", { class: "zoomctl-pop", role: "dialog", "aria-label": "Densidade da tela" });
  const minus = h("button", { class: "zoomctl-step", type: "button", "aria-label": "Diminuir" }, "−");
  const val = h("span", { class: "zoomctl-val" });
  const plus = h("button", { class: "zoomctl-step", type: "button", "aria-label": "Aumentar" }, "+");
  const reset = h("button", { class: "zoomctl-reset", type: "button" }, "Redefinir (100%)");
  const sync = () => {
    const z = getZoom();
    val.textContent = Math.round(z * 100) + "%";
    minus.disabled = z <= ZMIN + 1e-9; plus.disabled = z >= ZMAX - 1e-9; reset.disabled = Math.abs(z - 1) < 1e-9;
  };
  minus.onclick = () => { setZoom(getZoom() - ZSTEP); sync(); };
  plus.onclick = () => { setZoom(getZoom() + ZSTEP); sync(); };
  reset.onclick = () => { setZoom(1); sync(); };
  pop.append(h("div", { class: "zoomctl-row" }, minus, val, plus), reset);
  let onDoc = null;
  const close = () => { pop.classList.remove("open"); if (onDoc) { document.removeEventListener("mousedown", onDoc); onDoc = null; } };
  btn.onclick = () => {
    if (onDoc) { close(); return; }
    sync(); pop.classList.add("open");
    onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
  };
  wrap.append(btn, pop);
  return wrap;
}
