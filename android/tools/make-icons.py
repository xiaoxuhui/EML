#!/usr/bin/env python3
"""EML 计算台 安卓图标生成脚本（可复现）

输入：ImageGen 产出的两张 1024x1024 原图
  - icon-source/raw-full.png    整图（渐变背景 + 公式）
  - icon-source/raw-fore.png    透明背景 + 公式（自适应图标前景）

处理：
  1. 对称裁剪去掉生成水印（水印固定在右下角）
  2. 生成传统 mipmap PNG（API 24-25 用）
  3. 生成自适应图标前景 PNG（内容缩进安全区，API 26+ 用）

用法：
  python make-icons.py            # 在 android/ 目录下执行
依赖：Pillow（pip install Pillow）
"""

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent.parent          # android/
SRC = HERE / "icon-source"
RES = HERE / "app" / "src" / "main" / "res"

# 传统图标各密度尺寸（mdpi 基准 48dp）
LEGACY = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
# 自适应图标前景各密度尺寸（108dp 画布）
FOREGROUND = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# 去水印裁剪框（对称裁剪，保持内容中心不变）
FULL_CROP = (62, 112, 962, 912)     # 900x900
FORE_CROP = (100, 60, 1000, 900)    # 900x900


def crop_mark(img: Image.Image, box: tuple) -> Image.Image:
    """对称裁剪，去掉右下角生成水印"""
    return img.crop(box)


def resize_to(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    full = Image.open(SRC / "icon-full.png").convert("RGB")
    fore = Image.open(SRC / "icon-foreground.png").convert("RGBA")

    full_c = crop_mark(full, FULL_CROP)
    fore_c = crop_mark(fore, FORE_CROP)

    # 归档去水印版（512x512，应用商店素材尺寸）
    resize_to(full_c, 512).save(SRC / "store-icon-512.png", optimize=True)

    # 传统图标
    for folder, size in LEGACY.items():
        d = RES / folder
        d.mkdir(parents=True, exist_ok=True)
        resize_to(full_c, size).save(d / "ic_launcher.png", optimize=True)
        print(f"  ic_launcher.png  {folder}  {size}x{size}")

    # 自适应图标前景：内容缩进到安全区（约 60% 画布宽）
    for folder, size in FOREGROUND.items():
        d = RES / folder
        d.mkdir(parents=True, exist_ok=True)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = round(size * 0.90)
        small = resize_to(fore_c, inner)
        off = (size - inner) // 2
        canvas.alpha_composite(small, (off, off))
        canvas.save(d / "ic_launcher_foreground.png", optimize=True)
        print(f"  ic_launcher_foreground.png  {folder}  {size}x{size}")

    print("图标生成完成")


if __name__ == "__main__":
    main()
