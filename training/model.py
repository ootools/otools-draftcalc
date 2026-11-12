#!/usr/bin/env python3
"""CNN 模型定义（Task 9 Step 5，按计划钉死的结构）：

  Conv(1→16, 3×3, pad=1) - ReLU - MaxPool2     # 28→28→14
  Conv(16→32, 3×3, pad=1) - ReLU - MaxPool2    # 14→14→7
  FC(32·7·7 → 96) - ReLU
  FC(96 → 17)

输入 [1,1,28,28] float32（NCHW，行主序、背景 0/笔迹 1），
输出 [1,17] logits，维序 = preprocess.LABELS（= TS 侧 Task 4 LABELS）。
padding=1 使两次池化后恰为 7×7，与计划的 FC(32·7·7→96) 一致。
"""
import torch
import torch.nn as nn

from preprocess import LABELS


class RecogNet(nn.Module):
    NUM_CLASSES = len(LABELS)  # 17

    def __init__(self) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.relu = nn.ReLU()
        self.fc1 = nn.Linear(32 * 7 * 7, 96)
        self.fc2 = nn.Linear(96, self.NUM_CLASSES)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.pool(self.relu(self.conv1(x)))   # [N,16,14,14]
        x = self.pool(self.relu(self.conv2(x)))   # [N,32,7,7]
        x = torch.flatten(x, 1)                   # [N,1568]
        x = self.relu(self.fc1(x))                # [N,96]
        return self.fc2(x)                        # [N,17] logits


if __name__ == "__main__":
    m = RecogNet()
    y = m(torch.zeros(1, 1, 28, 28))
    assert y.shape == (1, len(LABELS)), y.shape
    n_params = sum(p.numel() for p in m.parameters())
    print(f"RecogNet OK: out={tuple(y.shape)}, params={n_params}")
