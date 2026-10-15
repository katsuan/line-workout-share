#!/usr/bin/env python3
"""キロっく（kiloQ）の OGP 画像（ogp.png、1200x630）を作る。リンクを共有したときの画像に使う。

キロっくのオレンジにうっすらノートの罫線を引き、
左にアイコン（tools/icon.py と同じ形）、右に名前「キロっく」・英字「kiloQ」・説明。
macOS のヒラギノ角ゴシック・Jua（~/Library/Fonts/Jua.ttf）・Pillow が必要。

使い方: python3 tools/ogp.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from icon import FONT_PATH, ORANGE_DARK, ORANGE_LIGHT, png

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ogp.png"
W, H = 1200, 630
S = 2  # 2倍で描いてから縮める


def hira(weight, size):
    return ImageFont.truetype(f"/System/Library/Fonts/ヒラギノ角ゴシック W{weight}.ttc", size * S)


def main():
    big = (W * S, H * S)
    img = Image.new("RGB", big)
    px = img.load()
    for y in range(big[1]):
        for x in range(big[0]):
            t = (x / big[0] + y / big[1]) / 2
            px[x, y] = tuple(round(ORANGE_LIGHT[i] + (ORANGE_DARK[i] - ORANGE_LIGHT[i]) * t) for i in range(3))
    img = img.convert("RGBA")

    # うっすらノートの罫線（横線を等間隔に。左に余白の縦線）
    lines = Image.new("RGBA", big, (0, 0, 0, 0))
    d = ImageDraw.Draw(lines)
    faint = (255, 255, 255, 50)
    lw = 3 * S
    for y in range(75, H, 80):
        d.line((40 * S, y * S, big[0] - 40 * S, y * S), fill=faint, width=lw)
    d.line((88 * S, 30 * S, 88 * S, big[1] - 30 * S), fill=(255, 255, 255, 70), width=lw)
    img = Image.alpha_composite(img, lines)

    # 左：アイコン（影を少し付ける）
    icon = png(300 * S)
    shadow = Image.new("RGBA", big, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((138 * S, 177 * S, 438 * S, 477 * S), radius=69 * S, fill=(80, 30, 0, 70))
    img = Image.alpha_composite(img, shadow)
    img.alpha_composite(icon, (130 * S, 165 * S))

    # 右：名前・英字・説明
    d = ImageDraw.Draw(img)
    x = 490 * S
    d.text((x, 250 * S), "キロっく", font=hira(8, 110), fill=(255, 255, 255), anchor="ls")
    jua = ImageFont.truetype(str(FONT_PATH), 46 * S)
    cx = x
    for ch in "kiloQ":  # 字の間を少しあける
        d.text((cx, 322 * S), ch, font=jua, fill=(255, 255, 255, 230), anchor="ls")
        cx += d.textlength(ch, font=jua) + 10 * S
    d.text((x, 410 * S), "筋トレの種目・重さ・回数を", font=hira(6, 40), fill=(255, 255, 255), anchor="ls")
    d.text((x, 466 * S), "LINE にカードで送れる", font=hira(6, 40), fill=(255, 255, 255), anchor="ls")

    img.resize((W, H), Image.LANCZOS).convert("RGB").save(OUT, optimize=True)
    print(f"{OUT.name} を書き出しました")


if __name__ == "__main__":
    main()
