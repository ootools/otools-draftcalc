#!/usr/bin/env python3
"""训练 + 导出（Task 9 Step 5/6）。

- 模型：model.RecogNet（计划钉死结构）；Adam、5 epoch、batch 128；
  随机仿射增广（±15°、0.8–1.2 缩放、平移 ±2px）仅作用于训练切分。
- 数据：dataset.build_split()（按类分层 90/10，固定种子）。
- 导出：torch.onnx.export（输入 [1,1,28,28] float32 → 输出 [1,17] logits，
  维序 = preprocess.LABELS = TS Task 4 LABELS）→ onnxruntime.quantization
  quantize_dynamic 量化；量化失败或量化后留出集 top-1 相对 fp32 掉点
  超过 2 个百分点则保留 fp32。
- 产物：training/out/recog.onnx（最终入库物）+ training/out/recog_fp32.onnx
  （量化前留档）+ metrics.json（真实运行产物）。
"""
import argparse
import json
import platform
import random
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

import torchvision.transforms.functional as TF

import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic

import dataset as ds
from model import RecogNet
from preprocess import LABELS

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
REPO = HERE.parent

DIGITS = [str(d) for d in range(10)]
OPERATORS = ["+", "-", "*", "/", "(", ")"]
THRESHOLDS = {**{d: 0.97 for d in DIGITS}, **{o: 0.90 for o in OPERATORS}, "sqrt": 0.85}


class GlyphDataset(Dataset):
    def __init__(self, X: np.ndarray, y: np.ndarray, augment: bool, rng: random.Random):
        self.X = torch.from_numpy(X)  # [N,1,28,28] float32
        self.y = torch.from_numpy(y)
        self.augment = augment
        self.rng = rng

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, i: int):
        x = self.X[i]
        if self.augment:
            x = TF.affine(
                x,
                angle=self.rng.uniform(-15.0, 15.0),
                translate=[self.rng.randint(-2, 2), self.rng.randint(-2, 2)],
                scale=self.rng.uniform(0.8, 1.2),
                shear=[0.0, 0.0],
                interpolation=TF.InterpolationMode.BILINEAR,
                fill=0.0,
            )
        return x, int(self.y[i])


def evaluate_torch(model: nn.Module, X: np.ndarray, y: np.ndarray) -> tuple[float, list[int]]:
    """留出集 top-1（torch 侧，无增广）。返回 (整体 acc, 每样本预测)。"""
    model.eval()
    preds = []
    with torch.no_grad():
        for i in range(0, len(y), 512):
            logits = model(torch.from_numpy(X[i : i + 512]))
            preds.append(logits.argmax(dim=1).numpy())
    preds = np.concatenate(preds)
    return float((preds == y).mean()), preds.tolist()


def evaluate_onnx(model_path: Path, X: np.ndarray, y: np.ndarray) -> tuple[float, list[int], dict]:
    """ONNX 产物逐条推理（固定 [1,1,28,28]，与 TS OrtRecognizer 同路径）。"""
    sess = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    shape_info = {"input_name": inp.name, "input_shape": list(inp.shape),
                  "output_name": sess.get_outputs()[0].name,
                  "output_shape": list(sess.get_outputs()[0].shape)}
    preds = []
    x0 = X[:, 0:1, :, :]  # [N,1,28,28]
    for i in range(len(y)):
        logits = sess.run(None, {inp.name: x0[i : i + 1]})[0]
        preds.append(int(logits[0].argmax()))
    acc = float((np.array(preds) == y).mean())
    return acc, preds, shape_info


def per_class(y: np.ndarray, preds: list[int]) -> dict[str, float]:
    out = {}
    yl = y.tolist()
    for ci, name in enumerate(LABELS):
        idx = [i for i, v in enumerate(yl) if v == ci]
        if not idx:
            out[name] = None
            continue
        correct = sum(1 for i in idx if preds[i] == ci)
        out[name] = round(correct / len(idx), 4)
    return out


def thresholds_ok(pc: dict[str, float]) -> tuple[bool, list[str]]:
    """计划 Step 7 验收口径：数字（组）≥0.97、运算符逐类 ≥0.90、sqrt ≥0.85。

    返回 (是否达标, 未达标项列表)。严格逐类口径另行记录（strict_per_class_*）。
    """
    fails = []
    digits = [v for d, v in pc.items() if d in DIGITS and v is not None]
    if len(digits) < len(DIGITS) or sum(digits) / len(DIGITS) < 0.97:
        pooled = sum(digits) / len(digits) if digits else 0.0
        fails.append(f"digits(pooled): {pooled:.4f} < 0.97")
    for name in OPERATORS + ["sqrt"]:
        thr = 0.90 if name in OPERATORS else 0.85
        v = pc.get(name)
        if v is None or v < thr:
            fails.append(f"{name}: {v} < {thr}")
    return (len(fails) == 0), fails


def strict_per_class_fails(pc: dict[str, float]) -> list[str]:
    return [f"{name}: {v} < {thr}" for name, thr in THRESHOLDS.items()
            if (v := pc.get(name)) is None or v < thr]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--seed", type=int, default=ds.SEED)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--schedule", choices=["none", "cosine"], default="cosine")
    ap.add_argument("--aug-seed", type=int, default=None,
                    help="增广随机源种子（默认 seed+1；不影响数据切分）")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    aug_seed = args.aug_seed if args.aug_seed is not None else args.seed + 1
    aug_rng = random.Random(aug_seed)

    t_data0 = time.perf_counter()
    (Xtr, ytr, ctr), (Xho, yho, cho) = ds.build_split(seed=args.seed)
    t_data = time.perf_counter() - t_data0
    print(f"[data] train={len(ytr)} holdout={len(yho)} ({t_data:.1f}s)")
    print(f"[data] train per class: {ctr}")

    train_ds = GlyphDataset(Xtr, ytr, augment=True, rng=aug_rng)
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=0)

    model = RecogNet()
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.wd)
    sched = None
    if args.schedule == "cosine":
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    loss_fn = nn.CrossEntropyLoss()

    t_train0 = time.perf_counter()
    epoch_log = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss, n = 0.0, 0
        for xb, yb in train_dl:
            opt.zero_grad()
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            opt.step()
            total_loss += float(loss) * len(yb)
            n += len(yb)
        acc, _ = evaluate_torch(model, Xho, yho)
        epoch_log.append({"epoch": epoch, "train_loss": round(total_loss / n, 5),
                          "lr": opt.param_groups[0]["lr"],
                          "holdout_top1": round(acc, 4)})
        print(f"[epoch {epoch}/{args.epochs}] loss={total_loss/n:.4f} "
              f"lr={opt.param_groups[0]['lr']:.5f} holdout_top1={acc:.4f}")
        if sched is not None:
            sched.step()
    t_train = time.perf_counter() - t_train0

    # ---- 导出 fp32 ONNX（固定 [1,1,28,28] → [1,17]，维序 = LABELS）----
    fp32_path = OUT / "recog_fp32.onnx"
    model.eval()
    dummy = torch.zeros(1, 1, 28, 28)
    export_kwargs = dict(input_names=["input"], output_names=["logits"], opset_version=17)
    try:
        torch.onnx.export(model, dummy, str(fp32_path), dynamo=False, **export_kwargs)
    except TypeError:
        torch.onnx.export(model, dummy, str(fp32_path), **export_kwargs)
    print(f"[export] fp32 -> {fp32_path} ({fp32_path.stat().st_size} bytes)")

    acc_fp32, preds_fp32, shape_info = evaluate_onnx(fp32_path, Xho, yho)
    pc_fp32 = per_class(yho, preds_fp32)
    print(f"[eval fp32] top1={acc_fp32:.4f}")
    print(f"[eval fp32] per class: {pc_fp32}")

    # ---- 动态量化（失败或掉点 >2pp 则保留 fp32）----
    quant_path = OUT / "recog_quant.onnx"
    final_path = OUT / "recog.onnx"
    quant_ok, quant_err, acc_quant, pc_quant = False, None, None, None
    try:
        quantize_dynamic(str(fp32_path), str(quant_path), weight_type=QuantType.QInt8)
        acc_quant, preds_q, _ = evaluate_onnx(quant_path, Xho, yho)
        pc_quant = per_class(yho, preds_q)
        if acc_quant >= acc_fp32 - 0.02:
            quant_ok = True
        else:
            quant_err = f"量化后 top1 {acc_quant:.4f} 较 fp32 {acc_fp32:.4f} 掉点超 2pp，保留 fp32"
    except Exception as e:  # noqa: BLE001 —— 计划 Step 6：量化失败保留 fp32
        quant_err = f"{type(e).__name__}: {e}"
    if quant_ok:
        shutil.copyfile(quant_path, final_path)
        final_src = "int8-dynamic"
        pc_final = pc_quant
    else:
        shutil.copyfile(fp32_path, final_path)
        final_src = "fp32"
        pc_quant = None
    acc_final = acc_quant if quant_ok else acc_fp32
    ok, fails = thresholds_ok(pc_final)
    strict_fails = strict_per_class_fails(pc_final)
    size = final_path.stat().st_size
    print(f"[final] {final_path.name} mode={final_src} size={size} bytes "
          f"({size/1024:.0f} KiB) top1={acc_final:.4f} thresholds_ok={ok}")
    if fails:
        print("[final] 未达标项: " + "; ".join(fails))
    if strict_fails:
        print("[final] 严格逐类参考口径未全过: " + "; ".join(strict_fails))

    metrics = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "aug_seed": aug_seed,
        "python": platform.python_version(),
        "torch": torch.__version__,
        "onnxruntime": ort.__version__,
        "labels": LABELS,
        "dataset": {
            "bhmsds_mapping": ds.BHMSDS_MAP,
            "bhmsds_dropped": ["w", "x", "y", "z"],
            "synth_mapping": ds.SYNTH_MAP,
            "train": len(ytr),
            "holdout": len(yho),
            "train_per_class": ctr,
            "holdout_per_class": cho,
            "split": f"stratified {int(ds.TRAIN_FRAC*100)}/{int((1-ds.TRAIN_FRAC)*100)} seed={args.seed}",
            "build_seconds": round(t_data, 2),
        },
        "training": {
            "epochs": args.epochs,
            "optimizer": f"Adam(wd={args.wd})",
            "lr": args.lr,
            "lr_schedule": args.schedule,
            "batch_size": args.batch,
            "augmentation": "random affine: ±15°, scale 0.8-1.2, translate ±2px (train only)",
            "epochs_log": epoch_log,
            "train_seconds": round(t_train, 1),
        },
        "model": {
            "final_path": str(final_path.relative_to(REPO)),
            "mode": final_src,
            "fp32_bytes": fp32_path.stat().st_size,
            "final_bytes": size,
            "quantized": quant_ok,
            "quant_note": quant_err,
            "input": shape_info["input_shape"],
            "output": shape_info["output_shape"],
        },
        "metrics": {
            "eval_on": "holdout split via onnxruntime (CPUExecutionProvider), fixed [1,1,28,28]",
            "overall_top1_fp32": round(acc_fp32, 4),
            "overall_top1_quantized": round(acc_quant, 4) if acc_quant is not None else None,
            "overall_top1_final": round(acc_final, 4),
            "per_class_final": pc_final,
            "per_class_fp32": pc_fp32,
            "pooled_digits_top1": round(float(np.mean([pc_final[d] for d in DIGITS])), 4),
            "pooled_operators_top1": round(float(np.mean([pc_final[o] for o in OPERATORS])), 4),
            "thresholds": THRESHOLDS,
            "threshold_rule": "计划 Step 7 口径：数字合并 top-1 ≥0.97；+ - * / ( ) 任一类 <0.90 fail；sqrt ≥0.85。"
                              "另记录 strict_per_class_*（每数字类 ≥0.97 的参考口径）。",
            "passed": ok,
            "failed_items": fails,
            "strict_per_class_pass": not strict_fails,
            "strict_per_class_failed_items": strict_fails,
        },
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), "utf-8")
    print(f"[metrics] -> {OUT/'metrics.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
