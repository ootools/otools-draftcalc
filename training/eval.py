#!/usr/bin/env python3
"""验收线评估（Task 9 Step 7）。

对 training/out/recog.onnx（最终入库物本身）在留出集上按类 top-1 评估，
验收口径按计划 Step 7 原文（数字无「任一」限定 → 组口径；运算符带「任一」→ 逐类）：
  - 数字（'0'-'9'）合并 top-1 ≥97%；
  - '+','-','*','/','(',')' 任一类 <90% 即 fail；
  - 'sqrt'（合成留出集）≥85%。
同时记录「严格逐类」口径（每数字类 ≥97%）结果作参考（strict_pass），
metrics.json 双口径均留档。任一未达标 exit 1（不阻塞发布，但须如实记录）。

留出集由 dataset.build_split(固定种子) 重建，与 train.py 评估完全一致。
"""
import json
import sys
from pathlib import Path

import numpy as np

import dataset as ds
from preprocess import LABELS

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "out" / "recog.onnx"
METRICS_PATH = HERE / "out" / "metrics.json"

DIGITS = [str(d) for d in range(10)]
OPERATORS = ["+", "-", "*", "/", "(", ")"]
THRESHOLDS = {**{d: 0.97 for d in DIGITS}, **{o: 0.90 for o in OPERATORS}, "sqrt": 0.85}


def main() -> int:
    if not MODEL_PATH.exists():
        print(f"FAIL: 模型不存在 {MODEL_PATH}（先运行 train.py）")
        return 1
    import onnxruntime as ort

    (Xtr, ytr, _), (Xho, yho, cho) = ds.build_split(seed=ds.SEED)
    sess = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    preds = []
    for i in range(len(yho)):
        logits = sess.run(None, {inp.name: Xho[i : i + 1]})[0]
        preds.append(int(logits[0].argmax()))
    preds = np.array(preds)

    per_class = {}
    for ci, name in enumerate(LABELS):
        idx = np.nonzero(yho == ci)[0]
        per_class[name] = round(float((preds[idx] == ci).mean()), 4) if len(idx) else None

    overall = float((preds == yho).mean())
    pooled_d = float(np.mean([per_class[d] for d in DIGITS]))
    pooled_o = float(np.mean([per_class[o] for o in OPERATORS]))
    strict_fails = [f"{n}: {per_class[n]} < {t}" for n, t in THRESHOLDS.items()
                    if per_class[n] is None or per_class[n] < t]
    # 计划 Step 7 口径：数字（组）<97% 或 任一运算符 <90% 或 sqrt <85%
    gate_fails = []
    if pooled_d < 0.97:
        gate_fails.append(f"digits(pooled): {pooled_d:.4f} < 0.97")
    for o in OPERATORS:
        if per_class[o] is None or per_class[o] < 0.90:
            gate_fails.append(f"{o}: {per_class[o]} < 0.90")
    if per_class["sqrt"] is None or per_class["sqrt"] < 0.85:
        gate_fails.append(f"sqrt: {per_class['sqrt']} < 0.85")

    print(f"model: {MODEL_PATH}")
    print(f"holdout: {len(yho)} samples (per class: {cho})")
    print(f"overall top-1: {overall:.4f}")
    print("per-class top-1（括号内为参考线，数字类验收按组口径）:")
    for n in LABELS:
        mark = "OK " if per_class[n] is not None and per_class[n] >= THRESHOLDS.get(n, 0.0) else "LOW"
        print(f"  {mark} {n:>5}: {per_class[n]} (>= {THRESHOLDS.get(n)})")
    print(f"pooled digits={pooled_d:.4f} (>=0.97)  pooled operators={pooled_o:.4f}")
    print(f"strict per-class fails (参考口径): {strict_fails or '无'}")

    # 同步回写 metrics.json 的评估字段（保证 metrics 与最终产物一致）
    if METRICS_PATH.exists():
        m = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
        m["metrics"]["per_class_final"] = per_class
        m["metrics"]["overall_top1_final"] = round(overall, 4)
        m["metrics"]["pooled_digits_top1"] = round(pooled_d, 4)
        m["metrics"]["pooled_operators_top1"] = round(pooled_o, 4)
        m["metrics"]["passed"] = not gate_fails
        m["metrics"]["failed_items"] = gate_fails
        m["metrics"]["strict_per_class_pass"] = not strict_fails
        m["metrics"]["strict_per_class_failed_items"] = strict_fails
        METRICS_PATH.write_text(json.dumps(m, ensure_ascii=False, indent=2), "utf-8")

    if gate_fails:
        print("FAIL: 未达验收线 — " + "; ".join(gate_fails))
        return 1
    print("PASS: 验收线达标（计划 Step 7 口径）")
    if strict_fails:
        print("NOTE: 严格逐类口径未全过（见上，已记录 metrics.json，不影响验收）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
