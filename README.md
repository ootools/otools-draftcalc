# otools-draftcalc · 稿纸计算器

OTools 独立插件：稿纸画布上用鼠标手写算式（四则、分数、乘方、根号），写完 `=` 自动识别求值；等号右侧已有手写内容时进入验算模式，自动打 ✓ / ✗。一行一条算式，纯前端离线运行。

> 占位 README，完整文档见 `docs/SPEC.md`（集成阶段补齐）。

## 开发

```bash
pnpm install
pnpm dev      # http://127.0.0.1:6547
pnpm test
pnpm build
```

## 打包验证

```bash
node scripts/pack-plugin.mjs      # 产出 dist-pack/otools-draftcalc-<version>.oplg
node scripts/verify-plugin.mjs
```
