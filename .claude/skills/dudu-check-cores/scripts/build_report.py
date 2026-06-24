#!/usr/bin/env python3
"""
build_report.py — Gera o preview HTML (antes/depois) da skill dudu-check-cores.

v2: além do swatch isolado, reconstrói um PEDAÇO da tela (ex.: cabeçalho de
tabela com colunas + linhas, card, badges) sobre o FUNDO REAL do app, em claro e
escuro, para julgar cor × fundo, brilho/halação no dark e o elemento no contexto.
Cada achado traz nota de VIABILIDADE (a skill se autoquestiona) e um ID para
autorizar. Sem dependência da aplicação, sem libs externas.

Uso:
  python build_report.py findings.json -o dudu-cores-report/index.html

Esquema (resumo — campos opcionais salvo nota):
{
  "meta": {project, scope, wcag_level, themes:[...], design_system_source, generated_at?},
  "findings": [{
    id, severity:"critical|warning|info", category:"contraste|fadiga|tipografia|brilho",
    title, location, issue, property, token_target, reflow_risk:false,
    rationale,
    "viability": {"level":"alta|média|baixa", "note":"a skill se questiona: isto fica bom no contexto?"},

    // PREFERIDO — reconstrói o elemento no contexto, um bloco por tema:
    "context": { "blocks": [ {
        "theme":"dark", "label":"Cabeçalho + linhas (escuro)",
        "page_bg":"#020810",            // fundo REAL da página (aceita gradiente)
        "texture":"dots",               // dots|none  (evoca fundo "barulhento" p/ julgar cor×fundo)
        "surface":"#070d1d",            // superfície do componente
        "border":"rgba(255,255,255,0.08)",
        "body_color":"#8fa3be",         // cor padrão das células de contexto
        "before_color":"#4d6280", "after_color":"#627ca0",
        "ratio_before":3.11, "ratio_after":4.53,
        "before_ok":false, "after_ok":true,
        "grid": [                       // linhas; cada célula: {t, swap?, cls?, color?}
           [{"t":"ID","swap":true,"cls":"th"},{"t":"EMPRESA","swap":true,"cls":"th"}],
           [{"t":"1042","cls":"td mono"},{"t":"ACME LTDA","cls":"td"}]
        ]
    } ] },

    // FALLBACK simples (linha de texto isolada), se não houver context:
    "samples": [ {theme,bg,text,style,before:{color,ratio,status},after:{...}} ]
  }]
}

cls de célula: "th" (cabeçalho 10px caps), "td" (corpo 11px), "mono" (tabular),
"strong". swap:true → célula recebe before_color/after_color (é o alvo da correção).
"""
import argparse
import html
import json
import os
import sys
from datetime import datetime

SEV = {
    "critical": ("Crítico", "#dc2626"),
    "warning": ("Atenção", "#d97706"),
    "info": ("Info", "#2563eb"),
}
VIA = {"alta": "#5ee08f", "média": "#f6c177", "media": "#f6c177", "baixa": "#ff8a93"}
THEME_LABEL = {"light": "Claro", "dark": "Escuro"}

CSS = """
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
  background:#0b1020;color:#e7eaf3;line-height:1.5}
.wrap{max-width:1120px;margin:0 auto;padding:32px 20px 80px}
header h1{margin:0 0 4px;font-size:22px;letter-spacing:-.01em}
header .sub{color:#9aa3b8;font-size:13px}
.metabar{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
.metabar .pill{background:#161d33;border:1px solid #232c47;border-radius:999px;
  padding:6px 12px;font-size:12px;color:#c3cae0}
.metabar .pill b{color:#fff;font-weight:600}
.counts{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 6px}
.count{border-radius:12px;padding:10px 14px;font-size:13px;font-weight:600;
  border:1px solid #232c47;background:#10162a}
.toolbar{position:sticky;top:0;z-index:10;background:rgba(11,16,32,.85);
  backdrop-filter:blur(8px);padding:14px 0;margin:8px 0 18px;border-bottom:1px solid #232c47;
  display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.toolbar .seg{display:inline-flex;border:1px solid #2b3552;border-radius:10px;overflow:hidden}
.toolbar .seg button{background:#10162a;color:#c3cae0;border:0;padding:8px 16px;
  font-size:13px;cursor:pointer}
.toolbar .seg button.active{background:#3b82f6;color:#fff}
.toolbar .hint{color:#9aa3b8;font-size:12px}
.card{background:#0f1730;border:1px solid #232c47;border-radius:16px;padding:18px;margin:0 0 16px}
.card .top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;color:#fff}
.tag{font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:#1c2440;
  color:#aeb7d4;border:1px solid #2b3552;text-transform:capitalize}
.tag.reflow{background:#3a2a12;color:#f6c177;border-color:#5a4420;text-transform:none}
.idtag{font-size:12px;font-weight:700;color:#0b1020;background:#cbd5f5;border-radius:6px;padding:3px 9px}
.card h3{margin:6px 0 4px;font-size:16px}
.loc{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;
  color:#8fa0c8;word-break:break-all}
.issue{margin:8px 0;color:#dbe1f2;font-size:14px}
.token{font-size:12px;color:#9aa3b8;margin:2px 0 12px}
.token code{background:#161d33;padding:2px 6px;border-radius:5px;color:#cbd5f5;
  font-family:ui-monospace,Menlo,Consolas,monospace}
.samples{display:flex;flex-direction:column;gap:14px}
.themeblock{border:1px solid #232c47;border-radius:12px;padding:12px;background:#0b1224}
.themeblock .tlabel{font-size:11px;text-transform:uppercase;letter-spacing:.08em;
  color:#8fa0c8;margin-bottom:8px}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:680px){.ba{grid-template-columns:1fr}}
.side .cap{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9aa3b8;
  margin-bottom:6px;display:flex;align-items:center;gap:6px}
.side .cap .dot{width:8px;height:8px;border-radius:999px;display:inline-block}
.scene{padding:16px;border-radius:10px;border:1px solid rgba(255,255,255,.06);
  display:flex;align-items:center;justify-content:center}
.preview{border-radius:10px;padding:18px 16px;min-height:60px;display:flex;align-items:center;
  border:1px solid rgba(255,255,255,.08)}
.meta2{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;flex-wrap:wrap}
.ratio{font-weight:700}
.status{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
.status.pass{background:#0f3d23;color:#5ee08f}
.status.fail{background:#451218;color:#ff8a93}
.viab{margin-top:12px;font-size:12.5px;display:flex;gap:8px;align-items:flex-start}
.viab .lbl{font-weight:700;white-space:nowrap}
.rationale{margin-top:10px;font-size:13px;color:#aeb7d4;border-left:3px solid #3b82f6;padding-left:12px}
footer{margin-top:30px;padding:18px;border:1px dashed #2b3552;border-radius:14px;
  background:#0f1730;font-size:14px;color:#dbe1f2}
footer b{color:#fff}
.empty{text-align:center;color:#7c87a6;padding:40px}
"""

FILTER_CSS = """
body[data-filter="light"] .themeblock[data-theme="dark"]{display:none}
body[data-filter="dark"] .themeblock[data-theme="light"]{display:none}
"""

JS = """
function setTheme(t,btn){
  document.body.setAttribute('data-filter',t);
  document.querySelectorAll('.seg button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
document.addEventListener('DOMContentLoaded',function(){document.body.setAttribute('data-filter','both');});
"""


def esc(s):
    return html.escape(str(s if s is not None else ""))


def style_str(d):
    return ";".join(f"{k}:{v}" for k, v in d.items()) if d else ""


# ── Renderização do elemento no contexto (cena reconstruída) ────────────────

def _cls_style(cls):
    s = {"font-family": "'Hanken Grotesk', system-ui, sans-serif", "font-size": "11px"}
    classes = (cls or "").split()
    if "th" in classes:
        s.update({"font-size": "10px", "font-weight": "700",
                  "text-transform": "uppercase", "letter-spacing": "0.06em"})
    if "mono" in classes:
        s.update({"font-family": "'JetBrains Mono', ui-monospace, monospace",
                  "font-variant-numeric": "tabular-nums"})
    if "strong" in classes:
        s["font-weight"] = "700"
    return s


def render_scene(b, target_color):
    grid = b.get("grid", [])
    body_color = b.get("body_color", "#888")
    border = b.get("border", "rgba(0,0,0,.12)")
    surface = b.get("surface", "#ffffff")
    ncols = max((len(r) for r in grid), default=1)
    cells = ""
    for ri, row in enumerate(grid):
        last = ri == len(grid) - 1
        for cell in row:
            st = _cls_style(cell.get("cls"))
            st["color"] = target_color if cell.get("swap") else cell.get("color", body_color)
            st["padding"] = "6px 11px"
            st["white-space"] = "nowrap"
            st["overflow"] = "hidden"
            st["text-overflow"] = "ellipsis"
            if not last:
                st["border-bottom"] = f"1px solid {border}"
            cells += f'<div style="{esc(style_str(st))}">{esc(cell.get("t", ""))}</div>'
    grid_style = (f"display:grid;grid-template-columns:repeat({ncols},minmax(0,auto));"
                  f"width:100%;background:{esc(surface)};border:1px solid {esc(border)};"
                  f"border-radius:8px;overflow:hidden")
    return f'<div style="{grid_style}">{cells}</div>'


def _scene_bg(b):
    page_bg = b.get("page_bg", "#ffffff")
    if b.get("texture") == "dots":
        dot = "rgba(255,255,255,.06)" if b.get("theme") == "dark" else "rgba(10,30,70,.06)"
        return (f"background:radial-gradient(circle, {dot} 1px, transparent 1px), {page_bg};"
                f"background-size:14px 14px, auto")
    return f"background:{page_bg}"


def render_context_block(b):
    theme = b.get("theme", "light")
    bg_css = _scene_bg(b)

    def side(label, dot, color, ratio, ok):
        scene = render_scene(b, color)
        status = "pass" if ok else "fail"
        stt = "passa" if ok else "reprova"
        rtxt = f"{ratio}:1" if ratio is not None else "—"
        return (f'<div class="side"><div class="cap"><span class="dot" style="background:{dot}">'
                f'</span>{esc(label)}</div><div class="scene" style="{esc(bg_css)}">{scene}</div>'
                f'<div class="meta2"><span class="ratio">{esc(rtxt)}</span>'
                f'<span class="status {status}">{stt}</span></div></div>')

    before = side("Antes", "#ff8a93", b.get("before_color"), b.get("ratio_before"),
                  b.get("before_ok", False))
    after = side("Depois (sugerido)", "#5ee08f", b.get("after_color"), b.get("ratio_after"),
                 b.get("after_ok", True))
    label = b.get("label", "Modo " + THEME_LABEL.get(theme, theme))
    return (f'<div class="themeblock" data-theme="{esc(theme)}"><div class="tlabel">{esc(label)}'
            f'</div><div class="ba">{before}{after}</div></div>')


# ── Fallback: swatch de texto isolado ───────────────────────────────────────

def render_side(label, dot_color, side, base_style, bg, text):
    color = side.get("color", "#000")
    txt_style = dict(base_style or {})
    txt_style.update(side.get("style", {}))
    txt_style["color"] = color
    ratio = side.get("ratio")
    status_cls = "pass" if side.get("status") == "pass" else "fail"
    status_txt = "passa" if side.get("status") == "pass" else "reprova"
    ratio_txt = f"{ratio}:1" if ratio is not None else "—"
    return (f'<div class="side"><div class="cap"><span class="dot" style="background:{esc(dot_color)}">'
            f'</span>{esc(label)}</div><div class="preview" style="background:{esc(bg)}">'
            f'<span style="{esc(style_str(txt_style))}">{esc(text)}</span></div>'
            f'<div class="meta2"><span class="ratio">{esc(ratio_txt)}</span>'
            f'<span class="status {status_cls}">{status_txt}</span>'
            f'<span class="hex" style="font-family:monospace;color:#aeb7d4">{esc(color)}</span></div></div>')


def render_sample(s):
    theme = s.get("theme", "light")
    base_style = s.get("style", {})
    before = render_side("Antes", "#ff8a93", s.get("before", {}), base_style,
                         s.get("bg", "#fff"), s.get("text", "Texto"))
    after = render_side("Depois (sugerido)", "#5ee08f", s.get("after", {}), base_style,
                        s.get("bg", "#fff"), s.get("text", "Texto"))
    return (f'<div class="themeblock" data-theme="{esc(theme)}"><div class="tlabel">Modo '
            f'{esc(THEME_LABEL.get(theme, theme))}</div><div class="ba">{before}{after}</div></div>')


def render_finding(f):
    sev_label, sev_color = SEV.get(f.get("severity", "info"), SEV["info"])
    reflow = '<span class="tag reflow">⚠ pode alterar altura (reflow)</span>' if f.get("reflow_risk") else ""
    token = ""
    if f.get("token_target"):
        token = (f'<div class="token">Aplicar em: <code>{esc(f["token_target"])}</code> &nbsp;·&nbsp; '
                 f'propriedade: <code>{esc(f.get("property", "color"))}</code></div>')
    # corpo visual: context (preferido) ou samples (fallback)
    body = ""
    if f.get("context", {}).get("blocks"):
        body = "".join(render_context_block(b) for b in f["context"]["blocks"])
    elif f.get("samples"):
        body = "".join(render_sample(s) for s in f["samples"])
    samples_html = f'<div class="samples">{body}</div>' if body else ""
    # viabilidade (a skill se autoquestiona)
    viab = ""
    if f.get("viability"):
        v = f["viability"]
        lvl = (v.get("level") or "").lower()
        color = VIA.get(lvl, "#aeb7d4")
        viab = (f'<div class="viab" style="color:{color}"><span class="lbl">Viabilidade: '
                f'{esc(v.get("level", "—"))}</span><span style="color:#aeb7d4">{esc(v.get("note", ""))}</span></div>')
    rationale = f'<div class="rationale">{esc(f["rationale"])}</div>' if f.get("rationale") else ""
    return (f'<div class="card"><div class="top"><span class="idtag">#{esc(f.get("id", "?"))}</span>'
            f'<span class="badge" style="background:{esc(sev_color)}">{esc(sev_label)}</span>'
            f'<span class="tag">{esc(f.get("category", ""))}</span>{reflow}</div>'
            f'<h3>{esc(f.get("title", "(sem título)"))}</h3>'
            f'<div class="loc">{esc(f.get("location", ""))}</div>'
            f'<div class="issue">{esc(f.get("issue", ""))}</div>{token}{samples_html}{viab}{rationale}</div>')


def build(data):
    meta = data.get("meta", {})
    findings = data.get("findings", [])
    gen = meta.get("generated_at") or datetime.now().strftime("%Y-%m-%d %H:%M")
    sev_counts = {"critical": 0, "warning": 0, "info": 0}
    for f in findings:
        k = f.get("severity", "info")
        sev_counts[k] = sev_counts.get(k, 0) + 1
    metabar = "".join(
        f'<span class="pill">{esc(k)}: <b>{esc(v)}</b></span>'
        for k, v in [("Projeto", meta.get("project", "—")), ("Escopo", meta.get("scope", "—")),
                     ("WCAG", meta.get("wcag_level", "AA")),
                     ("Design system", meta.get("design_system_source", "—")),
                     ("Gerado em", gen)])
    counts = "".join([
        f'<div class="count" style="color:#ff8a93">Crítico: {sev_counts.get("critical",0)}</div>',
        f'<div class="count" style="color:#f6c177">Atenção: {sev_counts.get("warning",0)}</div>',
        f'<div class="count" style="color:#7db5ff">Info: {sev_counts.get("info",0)}</div>',
        f'<div class="count">Total: {len(findings)}</div>'])
    cards = "".join(render_finding(f) for f in findings) or \
        '<div class="empty">Nenhum problema encontrado no escopo. 🎉</div>'
    return f"""<!doctype html>
<html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dudu-check-cores — {esc(meta.get('project','Auditoria visual'))}</title>
<style>{CSS}{FILTER_CSS}</style>
</head><body>
<div class="wrap">
  <header>
    <h1>dudu-check-cores — Auditoria visual</h1>
    <div class="sub">Acessibilidade (WCAG) + Ergonomia (fadiga/brilho) + Heurística · cor, contraste e tipografia · o elemento mostrado <b>no contexto e sobre o fundo real</b> · <b>sem alterar layout</b></div>
  </header>
  <div class="metabar">{metabar}</div>
  <div class="counts">{counts}</div>
  <div class="toolbar">
    <div class="seg">
      <button onclick="setTheme('light',this)">Claro</button>
      <button onclick="setTheme('dark',this)">Escuro</button>
      <button class="active" onclick="setTheme('both',this)">Ambos</button>
    </div>
    <span class="hint">Compare como cada correção se comporta em cada tema, sobre o fundo real.</span>
  </div>
  {cards}
  <footer>
    <b>Nada foi alterado no código ainda.</b> Revise as sugestões e volte ao chat dizendo
    quais aplicar — por ID. Ex.: <i>"aplica 1, 3 e 5"</i>, <i>"todas menos a 4"</i>, <i>"nenhuma"</i>.
    As correções aprovadas mexem só em cor/fonte (tokens do design system) — nunca em posição,
    tamanho de caixa ou espaçamento.
  </footer>
</div>
<script>{JS}</script>
</body></html>"""


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Gera preview HTML antes/depois (dudu-check-cores)")
    ap.add_argument("findings")
    ap.add_argument("-o", "--out", default="dudu-cores-report/index.html")
    args = ap.parse_args()
    with open(args.findings, encoding="utf-8") as f:
        data = json.load(f)
    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(build(data))
    out_abs = os.path.abspath(args.out)
    file_url = "file:///" + out_abs.replace("\\", "/")
    print(json.dumps({"ok": True, "out": out_abs, "url": file_url,
                      "findings": len(data.get("findings", []))}, ensure_ascii=False))
    # Linha humana — SEMPRE mostrar ao usuário; é o fallback se o auto-open falhar.
    print(f"\n>>> ABRA O RELATÓRIO NO NAVEGADOR:\n{file_url}\n")


if __name__ == "__main__":
    main()
