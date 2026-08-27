# Changelog

本文件记录 EML 计算台的重要变更。版本格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [1.1.0] - 2026-08-28

### 新增
- 公式引擎模块化：拆分定义域/性质证明、统一规则注册表、超越函数与代数规则模块
- 完整计算树改为按层展开，并加入最大节点数（800）与最大展开深度（32）预算，避免一次性生成全部 DOM
- 保存文件严格 schema 校验、循环依赖线性图检测、导入大小（5 MiB）/数值数（≤2000）/字符串长度上限
- 计算树视图控制器（缩放/平移/滚轮/WASD）从 `app.js` 抽离为 `tree-controller.js` / `tree-viewport.js`
- 新增规则注册顺序回归测试、表达式严格校验与深度限制测试、计算树延迟构建测试

### 修复
- **S1**：`LN_EXP_QUOTIENT` 增加 `isProvablyReal(指数) && isProvablyPositive(分母)` 前置，消除负实数分母下相差 `2πi` 的分支错误（与 `LN_QUOTIENT_POSITIVE_DENOMINATOR` 一致）
- **S3**：指数函数形式化反函数的零参数保护由 `!isInteger(arg, 0)` 改为 `isProvablyNonZero`，使 `ln(0)` 域安全不再依赖化简顺序
- **M2**：求值器 `ln(0)` 检测由 `1e-12` 数值阈值改为结构化零判定，消除对真实极小值（如 `e^-1000` 下溢）的误杀

### 文档与工程
- 统一版本号与规则数量（实际 **50** 条）；在 `doc/设计文档.md` 中明确 `ln` 形式化反函数约定（S2）为有意设计选择并说明去重局限
- 新增 `LICENSE`（MIT）、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、本文件与 GitHub Actions CI（`.github/workflows/ci.yml`，Node 18/20/22）

### 兼容性
- 保持 **V2** 保存文件格式不变，旧缓存与导出文件可继续导入

## [1.0.0] - 2026-08-15

### 初始版本
- 本地符号计算小程序，公式 `EML(x, y) = e^x - ln(y)`
- 复数域运算、公式化简、数值与公式双重去重
- 本地缓存、JSON 保存与导入
- 鼠标/触摸拖放、选择后点击输入
- Windows 发布包 `release/EML-v1.0.0.zip`
