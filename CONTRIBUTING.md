# 贡献指南 (CONTRIBUTING)

感谢你考虑为 **EML 计算台** 做贡献！

## 反馈问题

- 提交 Issue 前请先搜索是否已有相同或相关问题。
- 请尽量包含：复现步骤、输入框的 `x` / `y`、期望结果与实际结果、浏览器与系统信息。
- 数学/化简相关问题请注明你期望的**数学约定**（例如是否要求复对数主值一致），便于我们判断是 bug 还是设计约定（`doc/设计文档.md` §8）。

## 开发流程

本仓库**零第三方运行时依赖**，只需 Node.js（18+，仅用于运行内置测试器与构建脚本）。

```bash
# 1. Fork 并克隆
git clone https://github.com/<你的用户名>/EML.git
cd EML

# 2. 创建分支（建议 feat/fix/docs 前缀）
git checkout -b fix/ln-quotient-branch

# 3. 修改代码，保持在 src/ 内
# 4. 跑测试，确保全绿
npm test
# 5. 如需改动界面/构建，重建单文件产物
npm run build

# 6. 提交并推送，发起 PR 到 main
```

## 代码规范

- 纯原生 JavaScript，**不要引入第三方依赖**；新增模块保持 UMD 双模式（`(function(root, factory){...})` 同时支持浏览器全局与 Node `require`）。
- 每个公式规则在 `src/rules-transcendental.js` 或 `src/rules-algebra.js` 注册，并补充 `label`（人类可读）。
- **测试先行**：新增/修改规则必须配套 `tests/` 下的断言；性质谓词（实数/正数/非零）改动需覆盖正例与反例。
- 提交信息建议前缀：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `release:`。

## 提交 PR

- 目标分支：`main`。
- PR 描述请说明：动机、改动点、测试覆盖、是否影响保存文件格式（V2 需保持兼容）。
- CI 会在 Node 18/20/22 上自动运行 `npm test` 与 `npm run build`，请确保其通过。

## 行为准则

参与本仓库即视为同意遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。
