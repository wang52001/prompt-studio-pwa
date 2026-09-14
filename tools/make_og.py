#!/usr/bin/env python3
"""生成社交分享卡 og-image.png（1200x630），风格与设计稿一致。"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "og-image.png")
W, H = 1200, 630

BG        = (15, 17, 21)      # #0F1115
CARD      = (26, 29, 36)      # #1A1D24
BORDER    = (42, 46, 55)      # #2A2E37
PRIMARY   = (79, 140, 255)    # #4F8CFF
SECONDARY = (155, 109, 255)   # #9B6DFF
TEXT      = (232, 234, 237)   # #E8EAED
MUTED     = (154, 160, 166)   # #9AA0A6

FONT_PATHS = [
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def load_font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def horizontal_gradient(size, a, b):
    mask = Image.linear_gradient("L").resize((256, 256)).transpose(Image.ROTATE_270)
    mask = mask.resize((size, size))
    return Image.composite(Image.new("RGB", (size, size), b),
                           Image.new("RGB", (size, size), a), mask)


def draw_pencil(draw, box, color, width_scale=1.0):
    """在 box (x0,y0,size) 内绘制设计稿同款铅笔"""
    x0, y0, s = box
    k = s / 46.0
    P = lambda pts: [(x0 + x * k, y0 + y * k) for x, y in pts]
    body = [(31, 8.5), (37.5, 15), (15, 37.5), (7, 40), (9.5, 32)]
    draw.polygon(P(body), outline=color, width=max(1, int(2.6 * k * width_scale)))
    draw.line(P([(28, 11.5), (34.5, 18)]), fill=color,
              width=max(1, int(2.6 * k * width_scale)))


def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # 左上角柔光
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    for i in range(120, 0, -1):
        r = i * 6
        alpha = i / 120.0
        col = tuple(int(PRIMARY[c] * 0.55 * alpha + BG[c] * (1 - alpha)) for c in range(3))
        gd.ellipse([-260 - r * 0.2, -260 - r * 0.2, 340 + r, 470 + r], fill=col)
    img = Image.blend(img, glow, 0.75)
    d = ImageDraw.Draw(img)

    # 卡片容器
    d.rounded_rectangle([80, 96, W - 80, H - 96], radius=32, fill=CARD, outline=BORDER, width=2)

    # Logo：渐变圆角方块 + 白色铅笔
    logo_s, lx, ly = 176, 152, 196
    grad = horizontal_gradient(logo_s, PRIMARY, SECONDARY)
    mask = Image.new("L", (logo_s, logo_s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, logo_s, logo_s], radius=52, fill=255)
    img.paste(grad, (lx, ly), mask)
    draw_pencil(d, (lx + 33, ly + 33, logo_s - 66), (255, 255, 255))

    # 文案
    f_big = load_font(72)
    f_sub = load_font(36)
    f_tag = load_font(26)

    tx = lx + logo_s + 56
    d.text((tx, 218), "Prompt Studio", font=f_big, fill=TEXT)
    d.text((tx, 312), "提示词工坊", font=f_sub, fill=(201, 210, 255))
    d.text((tx, 376), "离线可用的提示词创作、调试与游乐箱", font=f_tag, fill=MUTED)

    # 底部导航色点
    colors = [PRIMARY, SECONDARY, (52, 211, 153), (251, 191, 36), (248, 113, 113)]
    for i, c in enumerate(colors):
        cx = 152 + i * 44
        d.ellipse([cx, H - 200, cx + 16, H - 184], fill=c)

    d.text((152, H - 168), "pwa.jdhsf.top", font=f_tag, fill=MUTED)

    img.save(OUT, "PNG", optimize=True)
    print("og-image.png", img.size, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
