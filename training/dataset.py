#!/usr/bin/env python3
"""数据集构建（Task 9 Step 2/5）。

来源（全离线，数据在 training/data/ 下，已 gitignore）：

- bhmsds（MIT，wblachowski/bhmsds，27k 张 28×28 灰度 PNG，白底黑墨）：
    文件名前缀 → CNN 标签映射：
      '0'-'9' → 同名数字类；
      'plus'→'+'、'minus'→'-'、'slash'→'/'、'dot'→'*'；
      'w','x','y','z' → 丢弃（计划 Step 2）。
    注意：bhmsds 的 README 把第 14 类叫 '*'，实际文件前缀是 'dot'
    （实心圆点，cropped 后撑满画幅）。本管线按计划映射 dot→'*'。
    但推理侧 '*' 的常见字形是「两笔对角交叉的 ×」（分割几何合并后仍会
    落到 CNN 兜底分类），dot 与 × 形状迥异——因此另由 synth.py 合成
    × 交叉样本补 '*' 类（见 synth.py 头注释，偏差已记录）。
- synth/：synth.py 产物（28×28，0=背景/255=墨迹，已走 normalize_glyph 管线）：
    '('、')'、'sqrt'、'x_cross'（→'*'）。

加载处理：
- bhmsds 原图为白底黑墨（border≈255）→ 反相为「背景 0 / 墨迹 1」极性，
  并按与 normalizeGlyph 相同的版式约定再归一化（墨迹 bbox 内切 →
  长边 20px → 居中 pad 28×28），消除 bhmsds 撑满画幅与推理侧
  20px 内容 + 4px 边距的域差；
- synth PNG 已是 0 背景/255 墨迹且版式同推理侧，仅 /255。

切分：按类分层 90/10（train/holdout），固定种子可复现；
eval.py 用同一函数重建同一 holdout。
"""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image

from preprocess import LABELS

SEED = 20261113
TRAIN_FRAC = 0.9
SIZE = 28
TARGET = 20.0

# 目录/文件前缀 → CNN 标签
BHMSDS_MAP = {str(d): str(d) for d in range(10)}
BHMSDS_MAP.update({"plus": "+", "minus": "-", "slash": "/", "dot": "*"})
SYNTH_MAP = {"(": "(", ")": ")", "sqrt": "sqrt", "x_cross": "*"}

REPO = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(__file__).resolve().parent / "data"
BHMSDS_DIR = DATA_ROOT / "bhmsds" / "symbols"
SYNTH_DIR = DATA_ROOT / "synth"


def _renorm_20px(ink: np.ndarray) -> np.ndarray:
    """墨迹图（[28,28] float，0/1，黑底白字极性）按版式约定再归一化。

    墨迹 bbox → 长边缩放 20px（双线性）→ 居中 pad 28×28。
    与矢量侧（crop→scale→pad）同一版式约定；栅格边长取 round。
    """
    ys, xs = np.nonzero(ink > 0.5)
    if len(xs) == 0:
        return ink
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    w, h = int(x1 - x0 + 1), int(y1 - y0 + 1)
    s = TARGET / max(w, h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    patch = Image.fromarray((ink[y0 : y1 + 1, x0 : x1 + 1] * 255).astype(np.uint8), "L")
    patch = patch.resize((nw, nh), Image.BILINEAR)
    out = np.zeros((SIZE, SIZE), dtype=np.float32)
    off_x = math.floor((SIZE - nw) / 2 + 0.5)
    off_y = math.floor((SIZE - nh) / 2 + 0.5)
    out[off_y : off_y + nh, off_x : off_x + nw] = np.asarray(patch, dtype=np.float32) / 255.0
    return out


def _load_bhmsds() -> list[tuple[np.ndarray, int]]:
    out: list[tuple[np.ndarray, int]] = []
    files = sorted(BHMSDS_DIR.glob("*.png"))
    assert files, f"bhmsds 数据缺失：{BHMSDS_DIR}"
    for f in files:
        prefix = f.name.rsplit("-", 1)[0]
        if prefix not in BHMSDS_MAP:  # w/x/y/z 丢弃
            continue
        a = np.asarray(Image.open(f).convert("L"), dtype=np.float32) / 255.0
        ink = 1.0 - a  # 白底黑墨 → 黑底白墨（背景0/墨迹1）
        out.append((_renorm_20px(ink), LABELS.index(BHMSDS_MAP[prefix])))
    return out


def _load_synth() -> list[tuple[np.ndarray, int]]:
    out: list[tuple[np.ndarray, int]] = []
    for sub, label in SYNTH_MAP.items():
        d = SYNTH_DIR / sub
        files = sorted(d.glob("*.png"))
        assert files, f"synth 数据缺失：{d}（先运行 synth.py）"
        for f in files:
            a = np.asarray(Image.open(f).convert("L"), dtype=np.float32) / 255.0
            out.append((a, LABELS.index(label)))
    return out


def build_split(seed: int = SEED, train_frac: float = TRAIN_FRAC):
    """按类分层 90/10 切分。返回 (train, holdout) 两个 (samples, labels) 列表。

    samples: np.ndarray [N,28,28] float32（背景0/墨迹1）；labels: np.int64 [N]。
    """
    all_samples = _load_bhmsds() + _load_synth()
    rng = random.Random(seed)
    by_class: dict[int, list[np.ndarray]] = {}
    for img, y in all_samples:
        by_class.setdefault(y, []).append(img)

    train_imgs, train_ys, hold_imgs, hold_ys = [], [], [], []
    counts_train, counts_hold = {}, {}
    for y in sorted(by_class):
        imgs = by_class[y]
        rng.shuffle(imgs)
        n_hold = max(1, round(len(imgs) * (1 - train_frac)))
        hold, tr = imgs[:n_hold], imgs[n_hold:]
        train_imgs += tr
        train_ys += [y] * len(tr)
        hold_imgs += hold
        hold_ys += [y] * len(hold)
        counts_train[LABELS[y]] = len(tr)
        counts_hold[LABELS[y]] = len(hold)

    X_train = np.stack(train_imgs).astype(np.float32)[:, None, :, :]  # [N,1,28,28]
    X_hold = np.stack(hold_imgs).astype(np.float32)[:, None, :, :]
    y_train = np.array(train_ys, dtype=np.int64)
    y_hold = np.array(hold_ys, dtype=np.int64)
    return (X_train, y_train, counts_train), (X_hold, y_hold, counts_hold)


if __name__ == "__main__":
    (Xtr, ytr, ctr), (Xho, yho, cho) = build_split()
    print(f"train={len(ytr)} holdout={len(yho)}")
    print("train per class:", ctr)
    print("holdout per class:", cho)
    assert Xtr.shape[1:] == (1, 28, 28) and Xtr.min() >= 0 and Xtr.max() <= 1
    print("DATASET OK")
