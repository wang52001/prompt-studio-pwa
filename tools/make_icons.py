#!/usr/bin/env python3
"""按设计稿 Logo 生成 PWA 图标。

设计稿依据：
- 启动页 Logo：104x104 圆角方块，圆角 30（比例 0.288）
- 填充：线性渐变 左→右 #4F8CFF → #9B6DFF
- 图形：白色描边铅笔（viewBox 46x46，描边宽 2.6）
"""
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
SS = 4  # 超采样倍数，保证边缘平滑

C_START = (0x4F, 0x8C, 0xFF)
C_END = (0x9B, 0x6D, 0xFF)
WHITE = (255, 255, 255)

# 铅笔笔画（viewBox 46x46 坐标系）
PENCIL = [
    [(31, 8.5), (37.5, 15)],
    [(37.5, 15), (15, 37.5)],
    [(15, 37.5), (7, 40)],
    [(7, 40), (9.5, 32)],
    [(9.5, 32), (31, 8.5)],
    [(28, 11.5), (34.5, 18)],
]
STROKE = 2.6  # 46 单位坐标系下的描边宽


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_icon(size, pad_ratio=0.0, bg=None):
    """pad_ratio > 0 时用于 maskable 图标（四周留安全区）"""
    full = size * SS
    img = Image.new("RGBA", (full, full), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    inner = int(full * (1 - pad_ratio * 2))
    offset = (full - inner) // 2

    if bg:
        d.rectangle([offset, offset, offset + inner - 1, offset + inner - 1], fill=bg)

    # 渐变圆角方块
    radius = int(inner * 0.288)
    grad = Image.new("RGB", (inner, inner))
    gd = ImageDraw.Draw(grad)
    for x in range(inner):
        gd.line([(x, 0), (x, inner)], fill=lerp(C_START, C_END, x / max(inner - 1, 1)))
    grad.putalpha(rounded_mask(inner, radius))
    img.paste(grad, (offset, offset), grad)

    # 白色铅笔（按 46 单位坐标系等比缩放）
    scale = inner / 46.0
    w = max(1, int(STROKE * scale))
    for (p0, p1) in PENCIL:
        x0 = offset + p0[0] * scale
        y0 = offset + p0[1] * scale
        x1 = offset + p1[0] * scale
        y1 = offset + p1[1] * scale
        d.line([(x0, y0), (x1, y1)], fill=WHITE + (255,), width=w)
        # 圆角接头
        r = w / 2.0
        for (cx, cy) in ((x0, y0), (x1, y1)):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE + (255,))

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 0.0, None),
        ("icon-512.png", 512, 0.0, None),
        ("icon-maskable-192.png", 192, 0.18, (0x0F, 0x11, 0x15)),
        ("icon-maskable-512.png", 512, 0.18, (0x0F, 0x11, 0x15)),
        ("apple-touch-icon.png", 180, 0.0, None),
        ("favicon-32.png", 32, 0.0, None),
    ]
    for name, size, pad, bg in targets:
        img = draw_icon(size, pad, bg)
        path = os.path.join(OUT_DIR, name)
        img.save(path, "PNG", optimize=True)
        print(f"  {name:26s} {size}x{size}")


if __name__ == "__main__":
    main()
