#!/usr/bin/env python3
"""
contrast.py — Núcleo determinístico da skill dudu-check-cores.

Calcula razão de contraste WCAG 2.x, classifica contra AA/AAA e sugere a
correção de MENOR mudança possível (mesma matiz / mesma paleta) para passar.

Por que existe: contraste é matemática (luminância relativa + razão). Fazer
isso "no olho" erra. Este script garante números corretos e sugestões
principiadas, e é reaproveitado em toda invocação da skill.

Uso:
  # razão entre duas cores (aceita hex, rgb(), rgba(), hsl(), nomes CSS)
  python contrast.py ratio "#9CA3AF" "#FFFFFF"
  python contrast.py ratio "rgba(0,0,0,.6)" "#1e293b"        # compõe alpha

  # checagem em lote (JSON) — ideal para uma tela/sistema inteiro
  python contrast.py check pares.json
    # pares.json: {"level":"AA","pairs":[
    #   {"id":1,"fg":"#9CA3AF","bg":"#fff","large":false,"ui":false}, ...]}

  # sugerir a cor corrigida de menor mudança que atinge o alvo
  python contrast.py suggest "#9CA3AF" "#FFFFFF" --target 4.5
  python contrast.py suggest "#9CA3AF" "#FFFFFF" --target 4.5 --palette paleta.json
    # paleta.json: ["#111827","#374151","#6b7280","#9ca3af", ...]

Saída sempre em JSON no stdout (fácil de consumir pelo agente).
"""
import argparse
import json
import math
import re
import sys

# ----------------------------------------------------------------------------
# Parsing de cor
# ----------------------------------------------------------------------------

# Subconjunto pragmático de cores nomeadas CSS (as mais usadas em UI). Para
# qualquer outra, passe o hex — Tailwind/shadcn não usam nomes mesmo.
NAMED = {
    "white": "#ffffff", "black": "#000000", "transparent": "#00000000",
    "red": "#ff0000", "green": "#008000", "blue": "#0000ff",
    "gray": "#808080", "grey": "#808080", "silver": "#c0c0c0",
    "slategray": "#708090", "slategrey": "#708090", "dimgray": "#696969",
    "lightgray": "#d3d3d3", "lightgrey": "#d3d3d3", "gainsboro": "#dcdcdc",
    "whitesmoke": "#f5f5f5", "snow": "#fffafa", "ivory": "#fffff0",
    "orange": "#ffa500", "yellow": "#ffff00", "purple": "#800080",
    "navy": "#000080", "teal": "#008080", "olive": "#808000",
    "maroon": "#800000", "aqua": "#00ffff", "cyan": "#00ffff",
    "fuchsia": "#ff00ff", "magenta": "#ff00ff", "lime": "#00ff00",
    "indigo": "#4b0082", "violet": "#ee82ee", "pink": "#ffc0cb",
    "tomato": "#ff6347", "crimson": "#dc143c", "gold": "#ffd700",
    "darkgray": "#a9a9a9", "darkgrey": "#a9a9a9",
}


class ColorError(ValueError):
    pass


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def parse_color(s):
    """Retorna (r, g, b, a) com r/g/b em 0-255 e a em 0-1."""
    if s is None:
        raise ColorError("cor vazia")
    s = str(s).strip().lower()
    if s in NAMED:
        s = NAMED[s]

    if s.startswith("#"):
        h = s[1:]
        if len(h) == 3:
            r, g, b = (int(c * 2, 16) for c in h)
            return (r, g, b, 1.0)
        if len(h) == 4:
            r, g, b, a = (int(c * 2, 16) for c in h)
            return (r, g, b, a / 255)
        if len(h) == 6:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
        if len(h) == 8:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16),
                    int(h[6:8], 16) / 255)
        raise ColorError(f"hex inválido: {s}")

    m = re.match(r"rgba?\(([^)]+)\)", s)
    if m:
        parts = re.split(r"[,\s/]+", m.group(1).strip())
        parts = [p for p in parts if p != ""]
        def chan(p):
            if p.endswith("%"):
                return round(float(p[:-1]) * 255 / 100)
            return round(float(p))
        r, g, b = (chan(parts[0]), chan(parts[1]), chan(parts[2]))
        a = 1.0
        if len(parts) >= 4:
            a = float(parts[3][:-1]) / 100 if parts[3].endswith("%") else float(parts[3])
        return (_clamp(r, 0, 255), _clamp(g, 0, 255), _clamp(b, 0, 255), _clamp(a, 0, 1))

    m = re.match(r"hsla?\(([^)]+)\)", s)
    if m:
        parts = re.split(r"[,\s/]+", m.group(1).strip())
        parts = [p for p in parts if p != ""]
        h = float(re.sub(r"deg$", "", parts[0]))
        sat = float(parts[1][:-1]) / 100 if parts[1].endswith("%") else float(parts[1])
        lig = float(parts[2][:-1]) / 100 if parts[2].endswith("%") else float(parts[2])
        a = 1.0
        if len(parts) >= 4:
            a = float(parts[3][:-1]) / 100 if parts[3].endswith("%") else float(parts[3])
        r, g, b = hsl_to_rgb(h, sat, lig)
        return (r, g, b, _clamp(a, 0, 1))

    raise ColorError(f"formato de cor não reconhecido: {s!r}")


def to_hex(r, g, b):
    return "#{:02x}{:02x}{:02x}".format(
        int(round(_clamp(r, 0, 255))),
        int(round(_clamp(g, 0, 255))),
        int(round(_clamp(b, 0, 255))),
    )


# ----------------------------------------------------------------------------
# HSL <-> RGB
# ----------------------------------------------------------------------------

def rgb_to_hsl(r, g, b):
    r, g, b = r / 255, g / 255, b / 255
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return (0.0, 0.0, l)
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = (g - b) / d + (6 if g < b else 0)
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return (h * 60, s, l)


def hsl_to_rgb(h, s, l):
    h = (h % 360) / 360
    if s == 0:
        v = round(l * 255)
        return (v, v, v)

    def hue(p, q, t):
        if t < 0: t += 1
        if t > 1: t -= 1
        if t < 1 / 6: return p + (q - p) * 6 * t
        if t < 1 / 2: return q
        if t < 2 / 3: return p + (q - p) * (2 / 3 - t) * 6
        return p

    q = l * (1 + s) if l < 0.5 else l + s - l * s
    p = 2 * l - q
    r = hue(p, q, h + 1 / 3)
    g = hue(p, q, h)
    b = hue(p, q, h - 1 / 3)
    return (round(r * 255), round(g * 255), round(b * 255))


# ----------------------------------------------------------------------------
# Luminância + contraste (WCAG 2.x)
# ----------------------------------------------------------------------------

def _composite(fg, bg):
    """Compõe fg (com alpha) sobre bg (assume bg opaco). Retorna (r,g,b)."""
    fr, fg_, fb, fa = fg
    br, bg_, bb, _ = bg
    return (
        fr * fa + br * (1 - fa),
        fg_ * fa + bg_ * (1 - fa),
        fb * fa + bb * (1 - fa),
    )


def relative_luminance(r, g, b):
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast_ratio(fg_str, bg_str, base="#ffffff"):
    """Razão de contraste entre fg e bg. Compõe alpha quando houver.

    `base` é o fundo "por baixo" do bg, usado se o próprio bg for translúcido
    (ex.: um overlay sobre a página). Padrão branco.
    """
    fg = parse_color(fg_str)
    bg = parse_color(bg_str)
    base_rgb = parse_color(base)[:3]
    # bg pode ser translúcido -> compõe sobre base
    if bg[3] < 1:
        bg = (*_composite(bg, (*base_rgb, 1.0)), 1.0)
    # fg pode ser translúcido -> compõe sobre bg já resolvido
    fr, fgc, fb = _composite(fg, bg)
    l1 = relative_luminance(fr, fgc, fb)
    l2 = relative_luminance(*bg[:3])
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


# ----------------------------------------------------------------------------
# Classificação
# ----------------------------------------------------------------------------

def classify(ratio, large=False, ui=False, level="AA"):
    """Retorna dict com pass/fail por critério. `large`=texto grande
    (>=24px normal ou >=18.66px bold). `ui`=componente/objeto gráfico/borda."""
    if ui:
        req = 3.0
        passed = ratio >= 3.0
        return {"ratio": round(ratio, 2), "required": req,
                "passes": passed, "criterion": "UI/gráfico (3:1)"}
    if level == "AAA":
        req = 4.5 if large else 7.0
    else:
        req = 3.0 if large else 4.5
    return {"ratio": round(ratio, 2), "required": req,
            "passes": ratio >= req,
            "criterion": f"texto {'grande' if large else 'normal'} {level} ({req}:1)"}


# ----------------------------------------------------------------------------
# Sugestão de correção (menor mudança possível)
# ----------------------------------------------------------------------------

def _redmean_distance(c1, c2):
    """Distância perceptual barata (redmean) entre dois RGB."""
    r1, g1, b1 = c1
    r2, g2, b2 = c2
    rm = (r1 + r2) / 2
    dr, dg, db = r1 - r2, g1 - g2, b1 - b2
    return math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg
                     + (2 + (255 - rm) / 256) * db * db)


def suggest(fg_str, bg_str, target, palette=None, base="#ffffff"):
    """Menor mudança em fg para atingir `target` contra bg.

    Preferência: se houver `palette` (lista de hex), escolhe a cor da paleta
    que passa E é perceptualmente mais próxima do fg original — assim a
    sugestão fica consistente com o design system. Só cai para ajuste de
    luminosidade (mantendo H e S) quando nenhuma cor da paleta serve.
    """
    fg = parse_color(fg_str)
    orig_rgb = _composite(fg, parse_color(bg_str)) if fg[3] < 1 else fg[:3]
    orig_rgb = tuple(orig_rgb)

    # 1) tentar a paleta existente
    if palette:
        candidates = []
        for hexc in palette:
            try:
                if contrast_ratio(hexc, bg_str, base) >= target:
                    cr = parse_color(hexc)[:3]
                    candidates.append((_redmean_distance(orig_rgb, cr), hexc))
            except ColorError:
                continue
        if candidates:
            candidates.sort(key=lambda x: x[0])
            best = candidates[0][1]
            return {"value": to_hex(*parse_color(best)[:3]),
                    "ratio": round(contrast_ratio(best, bg_str, base), 2),
                    "source": "paleta", "changed": "cor trocada por token da paleta"}

    # 2) ajustar só a luminosidade em HSL (preserva matiz e saturação)
    h, s, _ = rgb_to_hsl(*orig_rgb)
    # decidir direção: o que dá mais contraste contra esse bg?
    to_black = contrast_ratio("#000000", bg_str, base)
    to_white = contrast_ratio("#ffffff", bg_str, base)
    go_dark = to_black >= to_white
    lo, hi = (0.0, rgb_to_hsl(*orig_rgb)[2]) if go_dark else (rgb_to_hsl(*orig_rgb)[2], 1.0)
    # busca binária na luminosidade
    best_l = 0.0 if go_dark else 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        r, g, b = hsl_to_rgb(h, s, mid)
        if contrast_ratio(to_hex(r, g, b), bg_str, base) >= target:
            best_l = mid
            if go_dark:
                lo = mid  # pode clarear um pouco (menos mudança) e ainda passar
            else:
                hi = mid
        else:
            if go_dark:
                hi = mid
            else:
                lo = mid
    r, g, b = hsl_to_rgb(h, s, best_l)
    val = to_hex(r, g, b)
    return {"value": val, "ratio": round(contrast_ratio(val, bg_str, base), 2),
            "source": "ajuste-luminosidade",
            "changed": "mesma matiz/saturação, luminosidade ajustada ao mínimo p/ passar"}


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------

def _cmd_ratio(args):
    r = contrast_ratio(args.fg, args.bg, args.base)
    out = {
        "fg": args.fg, "bg": args.bg, "ratio": round(r, 2),
        "AA": {
            "normal": classify(r, large=False, level="AA"),
            "large": classify(r, large=True, level="AA"),
            "ui": classify(r, ui=True),
        },
        "AAA": {
            "normal": classify(r, large=False, level="AAA"),
            "large": classify(r, large=True, level="AAA"),
        },
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


def _cmd_check(args):
    with open(args.file, encoding="utf-8") as f:
        data = json.load(f)
    level = data.get("level", "AA")
    results = []
    for p in data.get("pairs", []):
        r = contrast_ratio(p["fg"], p["bg"], p.get("base", "#ffffff"))
        c = classify(r, large=p.get("large", False), ui=p.get("ui", False), level=level)
        results.append({
            "id": p.get("id"), "fg": p["fg"], "bg": p["bg"],
            "ratio": c["ratio"], "required": c["required"],
            "passes": c["passes"], "criterion": c["criterion"],
        })
    fails = [r for r in results if not r["passes"]]
    print(json.dumps({"level": level, "total": len(results),
                      "fails": len(fails), "results": results},
                     ensure_ascii=False, indent=2))


def _cmd_suggest(args):
    palette = None
    if args.palette:
        with open(args.palette, encoding="utf-8") as f:
            palette = json.load(f)
        if isinstance(palette, dict):
            palette = list(palette.values())
    before = round(contrast_ratio(args.fg, args.bg, args.base), 2)
    s = suggest(args.fg, args.bg, args.target, palette, args.base)
    print(json.dumps({
        "fg": args.fg, "bg": args.bg, "target": args.target,
        "before_ratio": before, "suggested": s["value"],
        "after_ratio": s["ratio"], "source": s["source"], "note": s["changed"],
    }, ensure_ascii=False, indent=2))


def main():
    # Garante UTF-8 no stdout (no Windows o default é cp1252 e corrompe acentos
    # quando a saída é capturada como UTF-8 pelo agente).
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Contraste WCAG + sugestões (dudu-check-cores)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    pr = sub.add_parser("ratio", help="razão de contraste entre duas cores")
    pr.add_argument("fg"); pr.add_argument("bg")
    pr.add_argument("--base", default="#ffffff", help="fundo sob bg translúcido")
    pr.set_defaults(func=_cmd_ratio)

    pc = sub.add_parser("check", help="checagem em lote a partir de JSON")
    pc.add_argument("file")
    pc.set_defaults(func=_cmd_check)

    ps = sub.add_parser("suggest", help="cor corrigida de menor mudança")
    ps.add_argument("fg"); ps.add_argument("bg")
    ps.add_argument("--target", type=float, default=4.5)
    ps.add_argument("--palette", help="JSON com lista de hex da paleta/tokens")
    ps.add_argument("--base", default="#ffffff")
    ps.set_defaults(func=_cmd_suggest)

    args = ap.parse_args()
    try:
        args.func(args)
    except ColorError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(2)


if __name__ == "__main__":
    main()
