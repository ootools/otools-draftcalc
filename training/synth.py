#!/usr/bin/env python3
"""参数化合成 ( ) sqrt x_cross 训练样本（Task 9 Step 2）。

- ( 与 ) 互为镜像形状（bulge 方向相反）、不同类；sqrt 为「钩形 + 横杠」一笔。
- x_cross（两对角线交叉的 ×）映射到 CNN 类 '*'：计划 Step 2 的映射假定 bhmsds
  的 '*' 类是叉形，实际 bhmsds 的 '*' 类（文件前缀 dot）是实心圆点——见
  dataset.py 说明。为覆盖推理侧「两笔对角交叉」字形，补合成 × 形（偏差，已记录）。
- 抖动：随机弧度轮廓指数、长宽比、粗细（并行描线）、微旋转、逐点噪声。
- 栅格化复用 preprocess.normalize_glyph（与 TS normalizeGlyph 同一算法），
  保证训练图与推理图同域（crop → 长边 20px → 居中 pad → 1px Bresenham）。
- 输出 PNG 28×28 灰度（0=背景 / 255=墨迹）到 training/data/synth/<label>/。
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image

from preprocess import SIZE, bbox_of, normalize_glyph

SEED = 20261113
N_PER_CLASS = 400
OUT_ROOT = Path(__file__).resolve().parent / "data" / "synth"


def _rot(pts, theta_deg):
    """绕质心微旋转。"""
    th = math.radians(theta_deg)
    c, s = math.cos(th), math.sin(th)
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c)
            for x, y in pts]


def _offset_line(pts, dist):
    """沿法线方向平移 dist 生成并行描线（粗细抖动用）。"""
    out = []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == n - 1:
            dx, dy = x - pts[i - 1][0], y - pts[i - 1][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        ln = math.hypot(dx, dy) or 1.0
        # 左法线
        out.append((x - dy / ln * dist, y + dx / ln * dist))
    return out


def _paren_pts(rng, side):
    """side=-1 → '('（向左鼓）；side=+1 → ')'（向右鼓，镜像）。"""
    H = rng.uniform(90.0, 200.0)
    B = H * rng.uniform(0.30, 0.75)          # 长宽比抖动
    p = rng.uniform(1.6, 2.6)                # 弧度轮廓指数（2≈椭圆）
    n = rng.randint(22, 30)
    pts = []
    for i in range(n):
        t = i / (n - 1)
        bulge = 1.0 - abs(2 * t - 1) ** p
        x = side * B * bulge + rng.uniform(-1, 1) * H * 0.012
        y = H * (t - 0.5) + rng.uniform(-1, 1) * H * 0.012
        pts.append((x, y))
    return _rot(pts, rng.uniform(-6.0, 6.0)), H


def _xcross_pts(rng):
    """×：两笔对角线交叉（对应推理侧分割几何合并后的 '*' 字形）。"""
    W = rng.uniform(100.0, 200.0)
    H = W * rng.uniform(0.7, 1.3)            # 长宽比抖动
    cx, cy = rng.uniform(-0.08, 0.08) * W, rng.uniform(-0.08, 0.08) * W
    n = rng.randint(14, 20)
    s1, s2 = [], []
    for i in range(n):
        t = i / (n - 1)
        j = rng.uniform(-1, 1) * W * 0.014
        s1.append((cx + W * (t - 0.5) + j, cy + H * (t - 0.5) + j))    # ↘
        s2.append((cx + W * (0.5 - t) + j, cy + H * (t - 0.5) + j))    # ↙
    return [_rot(s1, rng.uniform(-8.0, 8.0)), _rot(s2, rng.uniform(-8.0, 8.0))], W


def _sqrt_pts(rng):
    """√：短尾下垂 → 底部顶点 → 上挑至峰顶 → 横杠（一笔）。"""
    W = rng.uniform(110.0, 220.0)
    H = W * rng.uniform(0.7, 1.1)            # 长宽比抖动
    key = [
        (0.30 + rng.uniform(-0.04, 0.04), 0.30 + rng.uniform(-0.05, 0.05)),
        (0.44 + rng.uniform(-0.03, 0.03), 0.82 + rng.uniform(-0.05, 0.05)),
        (0.56 + rng.uniform(-0.03, 0.03), 0.04 + rng.uniform(-0.03, 0.03)),
        (rng.uniform(0.94, 1.02), 0.10 + rng.uniform(-0.05, 0.05)),
    ]
    key = [(fx * W, fy * H) for fx, fy in key]
    # 每段插入带垂向弯折噪声的中间点，避免纯直线感
    pts = []
    for a, b in zip(key, key[1:]):
        pts.append(a)
        for k in range(1, 4):
            t = k / 4
            jx = rng.uniform(-1, 1) * W * 0.012
            jy = rng.uniform(-1, 1) * H * 0.020
            pts.append((a[0] + (b[0] - a[0]) * t + jx,
                        a[1] + (b[1] - a[1]) * t + jy))
    pts.append(key[-1])
    return _rot(pts, rng.uniform(-5.0, 5.0)), H


def _thicken(rng, strokes, scale):
    """粗细抖动：概率性给单笔字形加 1~2 条并行描线。"""
    if len(strokes) != 1:
        return strokes
    pts = [(p["x"], p["y"]) for p in strokes[0]["pts"]]
    r = rng.random()
    if r < 0.30:
        strokes.append({"id": 1, "pts": [{"x": x, "y": y, "t": float(i)}
                                         for i, (x, y) in
                                         enumerate(_offset_line(pts, scale * rng.uniform(0.010, 0.016)))]})
    elif r < 0.40:
        for k, d in enumerate((scale * 0.012, -scale * 0.012)):
            strokes.append({"id": 1 + k, "pts": [{"x": x, "y": y, "t": float(i)}
                                                 for i, (x, y) in enumerate(_offset_line(pts, d))]})
    return strokes


def _build_strokes(rng, label):
    if label in ("(", ")"):
        pts, H = _paren_pts(rng, -1.0 if label == "(" else 1.0)
        return _thicken(rng, [{"id": 0, "pts": [{"x": x, "y": y, "t": float(i)}
                                                for i, (x, y) in enumerate(pts)]}], H)
    if label == "sqrt":
        pts, H = _sqrt_pts(rng)
        return _thicken(rng, [{"id": 0, "pts": [{"x": x, "y": y, "t": float(i)}
                                                for i, (x, y) in enumerate(pts)]}], H)
    if label == "x_cross":
        two, W = _xcross_pts(rng)
        return [{"id": k, "pts": [{"x": x, "y": y, "t": float(i)}
                                  for i, (x, y) in enumerate(pl)]}
                for k, pl in enumerate(two)]
    raise ValueError(label)


def render_png(strokes) -> Image.Image:
    flat = normalize_glyph(strokes, bbox_of(strokes))
    img = Image.new("L", (SIZE, SIZE), 0)
    img.putdata([round(v * 255) for v in flat])
    return img


def main() -> int:
    rng = random.Random(SEED)
    fg_stats = {}
    for label in ("(", ")", "sqrt", "x_cross"):
        out_dir = OUT_ROOT / label
        out_dir.mkdir(parents=True, exist_ok=True)
        fgs = []
        for i in range(N_PER_CLASS):
            strokes = _build_strokes(rng, label)
            img = render_png(strokes)
            data = list(img.getdata())
            fg = sum(1 for v in data if v > 0) / (SIZE * SIZE)
            fgs.append(fg)
            if not (0.02 <= fg <= 0.55):
                print(f"WARN {label}#{i} fg={fg:.3f} 越界")
            img.save(out_dir / f"{label}_{i:04d}.png")
        fg_stats[label] = (sum(fgs) / len(fgs), min(fgs), max(fgs))
        print(f"{label}: {N_PER_CLASS} 张, 前景占比 mean={fg_stats[label][0]:.3f} "
              f"min={fg_stats[label][1]:.3f} max={fg_stats[label][2]:.3f}")

    # ASCII 预览每类首张
    for label in ("(", ")", "sqrt", "x_cross"):
        img = Image.open(OUT_ROOT / label / f"{label}_0000.png")
        print(f"--- {label} preview ---")
        px = list(img.getdata())
        for r in range(SIZE):
            print("".join("#" if px[r * SIZE + c] > 0 else "." for c in range(SIZE)))
    print("SYNTH DONE ->", OUT_ROOT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
