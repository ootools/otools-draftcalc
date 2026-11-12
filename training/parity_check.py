#!/usr/bin/env python3
"""奇偶校验（Task 9 Step 3/4）。

读取 Task 2 产出的 tests/fixtures/normalize_case1.json，用 Python 侧
preprocess.normalize_glyph 从 strokes+bbox 重建 28×28 归一化图，
与 TS normalizeGlyph 输出（fixture 的 expected）逐点比对，
要求 max|diff| < 0.02。

算法契约（fixture 的 algorithm 块钉死，与 src/core/strokes.ts 注释一致）：
  crop → 长边 20px → 居中 pad 28×28 → floor(v+0.5) 取整
  → 整数 Bresenham（err = dx + dy）1px 栅格化 → 行主序，背景 0.0、笔迹 1.0。

本脚本仅依赖标准库（fixture 不大，json 足够）。
"""
import json
import math
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from preprocess import LABELS  # noqa: E402  (导入即校验共享常量存在)
from preprocess import normalize_glyph  # noqa: E402

FIXTURE = REPO / "tests" / "fixtures" / "normalize_case1.json"
TOL = 0.02


def main() -> int:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    expected = data["expected"]
    algo = data.get("algorithm", {})
    assert algo.get("size") == 28 and algo.get("target") == 20, "fixture 算法契约变化"
    assert algo.get("rounding") == "floor(v + 0.5)", "fixture 算法契约变化"

    got = normalize_glyph(data["strokes"], data["bbox"])
    if len(got) != 784 or len(expected) != 784:
        print(f"PARITY FAIL: 长度不符 got={len(got)} expected={len(expected)}")
        return 1

    max_diff = 0.0
    worst = -1
    for i, (g, e) in enumerate(zip(got, expected)):
        d = abs(g - e)
        if d > max_diff:
            max_diff, worst = d, i
    print(f"LABELS({len(LABELS)}): {LABELS}")
    print(f"max|diff| = {max_diff:.6f} (idx={worst}, tol={TOL})")
    if max_diff < TOL:
        print("PARITY OK")
        return 0
    print("PARITY FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())
