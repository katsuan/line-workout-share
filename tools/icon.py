#!/usr/bin/env python3
"""きろく（kiloQ）のアイコンを作る。英字の「kilo」は重さの kg のキロ（きろく＝kilo＋Q。kilo は小文字、Q だけ大文字）。

おくるん（OQRN）・さくせん盤（SAQSEN）のアイコンと同じ角の丸い四角に、きろくのオレンジのグラデーション
（js/constants.js の DEFAULT_THEME.baseColor #C96A2D が濃いほう）。
中は、白いウエイトのプレート（太い輪＋面の溝＋まん中の穴）と、輪の右下（45°）のふちに斜めに置いた小さなダンベル。
プレート（輪）＋ダンベル（しっぽ）で Q に見せる（バーを1本出すだけだと虫めがねに見えるので、ダンベルにする）（kiloQ の Q）。後ろにうっすらノートの罫線（記録）。

  icon.svg              … ファビコン
  apple-touch-icon.png  … iPhone のホーム画面（180px）
  icon-512.png          … 大きいアイコン（512px。角は丸い）
  icon-maskable-512.png … ホーム画面に追加したとき用（四隅まで塗る。端末が自分で丸や角丸に切る）
  icon-32.png           … SVG のファビコンを使えないブラウザ用（32px）
  logo.svg              … 横長のロゴ「kiloQ」。ノートの罫線の上に文字を並べ、Q はアイコンと同じプレート＋ダンベル。
                          k・i・l・o の字形は Jua（SIL Open Font License 1.1、~/Library/Fonts/Jua.ttf。おくるん・さくせん盤のロゴと同じ）。fontTools が必要

Pillow が必要。使い方: python3 tools/icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

ORANGE_DARK = (201, 106, 45)  # DEFAULT_THEME.baseColor
ORANGE_LIGHT = (240, 160, 88)
WHITE = (255, 255, 255)

# 形（100 × 100 の座標）
RADIUS = 23  # 角の丸み（おくるん・さくせん盤と同じ）
PLATE = (43, 43, 22)  # プレートの輪（中心 x, y, 線の真ん中の半径）
RING_W = 11  # 輪の太さ
FACE_ALPHA = 0.2  # 輪の内側（プレートの面）をうっすら塗る
GROOVE = (12, 2.2, 0.6)  # プレートの面の溝（半径・太さ・濃さ）
HUB_R = 6.5  # まん中の白い丸（バーを通す所）
HOLE_R = 2.6  # その穴
# Q のしっぽ：輪の右下（45°）のふちに、しっぽの向きに沿って置いた小さなダンベル
DB_ANGLE = 45
DB_AT = 29  # 輪の中心からダンベルの中心まで（輪の外ふちあたり。内側の重りが輪に重なる）
DB_HALF = 10.5  # ダンベルの中心から端の重りの真ん中まで
DB_BAR = 5  # 握りの太さ
DB_PLATE = (19, 8.5)  # 重りの幅（握りと直角。丸い端を含む）・厚さ
DB_GAP = 2.4  # ダンベルのまわりを背景の色でふち取る幅（輪と重なっても見分けられる）
RULES = (17, 83)  # うっすらノートの罫線（y）
RULE_ALPHA = 0.28


def hex_(rgb):
    return "#%02x%02x%02x" % rgb


def num(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def dumbbell(cx, cy, k=1.0):
    """ダンベルを、丸い端の線（始点・終点・太さ）の並びで返す。k は大きさの倍率（輪の中心 cx, cy から）"""
    ux, uy = math.cos(math.radians(DB_ANGLE)), math.sin(math.radians(DB_ANGLE))
    px, py = -uy, ux  # 握りと直角
    dx, dy = cx + ux * DB_AT * k, cy + uy * DB_AT * k
    caps = [((dx - ux * DB_HALF * k, dy - uy * DB_HALF * k), (dx + ux * DB_HALF * k, dy + uy * DB_HALF * k), DB_BAR * k)]
    for along, (width, thick) in ((DB_HALF, DB_PLATE),):
        half = (width - thick) / 2 * k  # 丸い端のぶんを引く
        for sign in (-1, 1):
            mx, my = dx + ux * along * sign * k, dy + uy * along * sign * k
            caps.append(((mx - px * half, my - py * half), (mx + px * half, my + py * half), thick * k))
    return caps


def mark_svg(cx, cy, r, ring_w, k, hole_fill):
    """プレート＋ダンベル（Q）の SVG。k はアイコンからの倍率、hole_fill は穴とふち取りの色（背景と同じ塗り）"""
    caps = dumbbell(cx, cy, k)

    def lines(color, extra):
        return "".join(
            f'<path d="M{num(a[0])} {num(a[1])}L{num(b[0])} {num(b[1])}" stroke="{color}" stroke-width="{num(w + extra)}" stroke-linecap="round"/>'
            for a, b, w in caps
        )

    return (
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}" fill="#ffffff" fill-opacity="{FACE_ALPHA}"/>'
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(GROOVE[0] * k)}" fill="none" stroke="#ffffff" stroke-opacity="{GROOVE[2]}" stroke-width="{num(GROOVE[1] * k)}"/>'
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}" fill="none" stroke="#ffffff" stroke-width="{num(ring_w)}"/>'
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(HUB_R * k)}" fill="#ffffff"/>'
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(HOLE_R * k)}" fill="{hole_fill}"/>'
        + lines(hole_fill, DB_GAP * 2 * k)
        + lines("#ffffff", 0)
    )


def svg():
    cx, cy, r = PLATE
    rules = "".join(f'<path d="M12 {y}H88" stroke="#ffffff" stroke-opacity="{RULE_ALPHA}" stroke-width="2.5" stroke-linecap="round"/>' for y in RULES)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100"><stop offset="0" stop-color="{hex_(ORANGE_LIGHT)}"/>'
        f'<stop offset="1" stop-color="{hex_(ORANGE_DARK)}"/></linearGradient></defs>'
        f'<rect width="100" height="100" rx="{RADIUS}" fill="url(#g)"/>'
        + rules
        + mark_svg(cx, cy, r, RING_W, 1.0, "url(#g)")
        + "</svg>"
    )


def bg_at(x, y):
    """背景のグラデーションの (x, y)（100 × 100 の座標）の色"""
    t = (x + y) / 200
    return tuple(round(ORANGE_LIGHT[i] + (ORANGE_DARK[i] - ORANGE_LIGHT[i]) * t) for i in range(3))


def png(size, rounded=True):
    """size px の PNG。4 倍で描いて縮め、ふちをなめらかにする。rounded=False は角まで塗る（iPhone が自分で丸める）"""
    scale = size * 4 / 100
    big = size * 4
    s = lambda v: v * scale  # noqa: E731
    grad = Image.new("RGB", (big, big))
    px = grad.load()
    for y in range(big):
        for x in range(big):
            t = (x + y) / (2 * (big - 1))
            px[x, y] = tuple(round(ORANGE_LIGHT[i] + (ORANGE_DARK[i] - ORANGE_LIGHT[i]) * t) for i in range(3))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=s(RADIUS) if rounded else 0, fill=255)
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    # うっすら罫線とプレートの面・溝
    cx, cy, r = PLATE
    faint = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(faint)
    rule = (255, 255, 255, round(255 * RULE_ALPHA))
    for y in RULES:
        d.rounded_rectangle((s(12) - s(1.25), s(y) - s(1.25), s(88) + s(1.25), s(y) + s(1.25)), radius=s(1.25), fill=rule)
    d.ellipse((s(cx - r), s(cy - r), s(cx + r), s(cy + r)), fill=(255, 255, 255, round(255 * FACE_ALPHA)))
    img = Image.alpha_composite(img, faint)
    groove = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    gr, gw, ga = GROOVE
    go = gr + gw / 2
    ImageDraw.Draw(groove).ellipse((s(cx - go), s(cy - go), s(cx + go), s(cy + go)), outline=(255, 255, 255, round(255 * ga)), width=round(s(gw)))
    img = Image.alpha_composite(img, groove)

    d = ImageDraw.Draw(img)
    # プレートの輪・まん中の白い丸と穴
    o = r + RING_W / 2
    d.ellipse((s(cx - o), s(cy - o), s(cx + o), s(cy + o)), outline=WHITE, width=round(s(RING_W)))
    d.ellipse((s(cx - HUB_R), s(cy - HUB_R), s(cx + HUB_R), s(cy + HUB_R)), fill=WHITE)
    d.ellipse((s(cx - HOLE_R), s(cy - HOLE_R), s(cx + HOLE_R), s(cy + HOLE_R)), fill=bg_at(cx, cy))

    # ダンベル：丸い端の線は丸を細かく並べて描く。先に背景の色で太めに描いてふち取る
    caps = dumbbell(cx, cy)

    def capsule(a, b, w, color):
        half = s(w) / 2
        for i in range(301):
            t = i / 300
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            d.ellipse((s(x) - half, s(y) - half, s(x) + half, s(y) + half), fill=color)

    for a, b, w in caps:
        capsule(a, b, w + DB_GAP * 2, bg_at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
    for a, b, w in caps:
        capsule(a, b, w, WHITE)
    return img.resize((size, size), Image.LANCZOS)


# ---- 横長のロゴ「kiloQ」（ノートの罫線の上の文字。Q＝プレート＋ダンベル） ----

FONT_PATH = Path.home() / "Library" / "Fonts" / "Jua.ttf"


def logo_svg():
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont

    font = TTFont(str(FONT_PATH))
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()

    def bounds(char):
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(char)]].draw(pen)
        return pen.bounds

    top, bottom = bounds("I")[3], bounds("I")[1]  # 上下が平らな大文字の I で字の高さ（Q の輪の高さ）を決める。小文字はベースラインにそろう
    h = top - bottom
    gap = h * 0.09
    thin = h * 0.05  # ふちを背景の色でなぞる線の幅（内側に半分ずつ削れる）
    w = h * 0.21 - thin  # Q（プレートの輪）の線は、細くした字と同じ太さ
    r = h / 2 - w / 2
    paths, x, q = [], 0.0, None
    for char in "kiloQ":
        if char == "Q":
            q = (x + r + w / 2, h / 2)
            x += 2 * r + w + gap
            continue
        b = bounds(char)
        origin = x - b[0]
        pen = SVGPathPen(glyphs)
        glyphs[cmap[ord(char)]].draw(TransformPen(pen, (1, 0, 0, -1, origin, top)))
        paths.append(pen.getCommands())
        x = origin + b[2] + gap
    qx, qy = q
    # ダンベル：アイコンと同じ比（輪の半径に対する大きさ）
    k = r / PLATE[2]
    caps = dumbbell(qx, qy, k)
    right = max(x - gap, max(max(p[0], q_[0]) + w_ / 2 for p, q_, w_ in caps) + DB_GAP * k)
    bottom_edge = max(max(p[1], q_[1]) + w_ / 2 for p, q_, w_ in caps) + DB_GAP * k
    pad_x, pad_y = h * 0.62, h * 0.5
    x0, y0 = -pad_x, -pad_y
    width = right + pad_x * 2
    height = bottom_edge + pad_y + h * 0.12
    # ノートの罫線：字の上と下（ベースライン）を左右いっぱいに
    rule = f'stroke="#ffffff" stroke-opacity="{RULE_ALPHA + 0.05}" stroke-width="{num(h * 0.045)}" stroke-linecap="round"'
    inset = h * 0.22
    rules = "".join(f'<path d="M{num(x0 + inset)} {num(y)}H{num(x0 + width - inset)}" {rule}/>' for y in (-h * 0.2, h * 1.2))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{num(x0)} {num(y0)} {num(width)} {num(height)}" role="img" aria-label="kiloQ（きろく）">'
        f'<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="{num(x0)}" y1="{num(y0)}" x2="{num(x0 + width)}" y2="{num(y0 + height)}">'
        f'<stop offset="0" stop-color="{hex_(ORANGE_LIGHT)}"/><stop offset="1" stop-color="{hex_(ORANGE_DARK)}"/></linearGradient></defs>'
        f'<rect x="{num(x0)}" y="{num(y0)}" width="{num(width)}" height="{num(height)}" rx="{num(h * 0.3)}" fill="url(#g)"/>'
        + rules
        # フォントの字（k・i・l・o）は太さが1種類なので、ふちを背景と同じ色でなぞって少し細く見せる
        + f'<g fill="#ffffff" stroke="url(#g)" stroke-width="{num(thin)}" stroke-linejoin="round">' + "".join(f'<path d="{d}"/>' for d in paths) + "</g>"
        + mark_svg(qx, qy, r, w, k, "url(#g)")
        + "</svg>\n"
    )


def main():
    (ROOT / "icon.svg").write_text(svg() + "\n", encoding="utf-8")
    (ROOT / "logo.svg").write_text(logo_svg(), encoding="utf-8")
    png(180, rounded=False).convert("RGB").save(ROOT / "apple-touch-icon.png", optimize=True)
    png(512).save(ROOT / "icon-512.png", optimize=True)
    png(512, rounded=False).convert("RGB").save(ROOT / "icon-maskable-512.png", optimize=True)
    png(32).save(ROOT / "icon-32.png", optimize=True)
    print("icon.svg / logo.svg / apple-touch-icon.png / icon-512.png / icon-maskable-512.png / icon-32.png を書き出しました")


if __name__ == "__main__":
    main()
