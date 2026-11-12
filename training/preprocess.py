#!/usr/bin/env python3
"""Python 侧字形归一化（Task 9）——与 src/core/strokes.ts normalizeGlyph 逐位对齐。

算法契约（tests/fixtures/normalize_case1.json 的 algorithm 块钉死，与
strokes.ts 头注释一致，实现必须保持同一运算顺序、同一 IEEE-754 双精度语义）：

  1. crop     ：以 bbox.x0/y0 为原点平移笔画；
  2. scale    ：长边（max(w,h)）缩放到 20px，短边等比；长边为 0（单点）时 s=1；
  3. pad      ：缩放后内容尺寸 w2=w*s、h2=h*s，偏移 off=(28-w2)/2 使内容居中于 28×28；
  4. rasterize：各点变换后按 floor(v+0.5) 取整到像素格点（不用 round），
                笔内相邻点之间画标准整数 Bresenham 线段（err = dx + dy 变体，1px 线宽）；
  5. 输出     ：行主序 Float32Array(784)，黑底白字（MNIST 极性约定）
                → 背景 0.0、笔迹 1.0，img[row*28+col]，row=y、col=x。

本模块仅依赖标准库（parity_check / synth 均在 torch 环境外可用）。
另含 CNN 17 类标签常量 LABELS（与计划 Task 4 的 TS LABELS 顺序一致，= 模型输出维序）。
"""
import math
import sys
from typing import Dict, List, Sequence

# CNN 输出维序 = 模型 17 类固定顺序（'0'-'9','+','-','*','/','(',')','sqrt'）。
# '.'、'='、'fracbar' 走几何规则，不进 CNN。
LABELS: List[str] = [str(d) for d in range(10)] + ["+", "-", "*", "/", "(", ")", "sqrt"]
assert len(LABELS) == 17

SIZE = 28   # 输出栅格边长
TARGET = 20.0  # 内容长边目标像素（MNIST 风格：20px 内容 + 居中留白）


def bbox_of(strokes: Sequence[dict]) -> Dict[str, float]:
    """所有笔画的并集包围盒（对应 TS bboxOf）。"""
    x0 = y0 = math.inf
    x1 = y1 = -math.inf
    for st in strokes:
        for p in st["pts"]:
            x0 = min(x0, p["x"])
            y0 = min(y0, p["y"])
            x1 = max(x1, p["x"])
            y1 = max(y1, p["y"])
    if not math.isfinite(x0):
        return {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def _plot(img: List[float], x: int, y: int) -> None:
    """单像素落墨（越界忽略；正常输入经变换后必然落在 0..27 内）。"""
    if 0 <= x < SIZE and 0 <= y < SIZE:
        img[y * SIZE + x] = 1.0


def _draw_line(img: List[float], x0: int, y0: int, x1: int, y1: int) -> None:
    """标准整数 Bresenham 直线（全八向，err=dx+dy 变体），1px 线宽。

    与 strokes.ts drawLine 逐分支一致（含 e2>=dy / e2<=dx 同步推进的边界分支）。
    """
    x, y = x0, y0
    dx = abs(x1 - x0)
    sx = 1 if x0 < x1 else -1
    dy = -abs(y1 - y0)
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        _plot(img, x, y)
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy


def normalize_glyph(strokes: Sequence[dict], bbox: Dict[str, float]) -> List[float]:
    """字形归一化：crop → 长边 20px → 居中 pad 28×28 → 1px 线宽栅格化。

    strokes: [{"id": int, "pts": [{"x": float, "y": float, "t": float}, ...]}, ...]
    bbox:    {"x0","y0","x1","y1"}（与 TS 侧传入的 bboxOf 结果一致）
    返回:    长度 784 的行主序列表，背景 0.0、笔迹 1.0。
    """
    img = [0.0] * (SIZE * SIZE)
    w = bbox["x1"] - bbox["x0"]
    h = bbox["y1"] - bbox["y0"]
    long = max(w, h)
    s = TARGET / long if long > 0 else 1.0
    w2 = w * s
    h2 = h * s
    off_x = (SIZE - w2) / 2
    off_y = (SIZE - h2) / 2

    for st in strokes:
        pts = st["pts"]
        if not pts:
            continue
        # floor(v + 0.5)：与 JS Math.floor(v + 0.5) 语义一致（含负数分支语义相同）
        pix = [
            (
                math.floor((p["x"] - bbox["x0"]) * s + off_x + 0.5),
                math.floor((p["y"] - bbox["y0"]) * s + off_y + 0.5),
            )
            for p in pts
        ]
        if len(pix) == 1:
            _plot(img, pix[0][0], pix[0][1])
            continue
        for i in range(len(pix) - 1):
            _draw_line(img, pix[i][0], pix[i][1], pix[i + 1][0], pix[i + 1][1])
    return img


def glyph_to_image(strokes: Sequence[dict], bbox: Dict[str, float]) -> List[List[float]]:
    """28×28 二维视图（row=y, col=x），便于可视化/写 PNG。"""
    flat = normalize_glyph(strokes, bbox)
    return [flat[r * SIZE : (r + 1) * SIZE] for r in range(SIZE)]


if __name__ == "__main__":
    # 快速自检：单点字形 → 内容居中于 (14,14)
    g = [{"id": 0, "pts": [{"x": 5.0, "y": 5.0, "t": 0.0}]}]
    out = normalize_glyph(g, bbox_of(g))
    ink = [(i // SIZE, i % SIZE) for i, v in enumerate(out) if v > 0]
    print("single-point ink at:", ink)
    assert ink == [(14, 14)], ink
    print("preprocess self-check OK; LABELS =", LABELS)
    sys.exit(0)
