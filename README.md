# EML 计算台 (eml-workbench)

[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

一个**零依赖、纯前端**的本地符号计算工作台。核心公式为：

```
EML(x, y) = e^x - ln(y)
```

从初始值 `1` 出发，把数值两两代入公式、逐步生成并保存新数值；支持**复数域**运算、符号公式化简，并可在「公式详情」面板查看每个数值的**直接公式**与**完整计算树**。

> 当前版本：`v1.2.0`（新增安卓版，网页端算法与交互不变）。许可证：**MIT**。

---

## 快速开始

本工具是单文件 HTML，无需安装、无需联网。

**方式一：直接打开**
打开仓库内的 `dist/eml-workbench.html` 即可使用。

**方式二：本地静态服务（推荐）**
部分浏览器对 `file://` 下的存储/交互更严格，建议用任意静态服务器托管仓库根目录后访问：

```bash
# 在仓库根目录执行，然后浏览器打开 http://127.0.0.1:8080/dist/eml-workbench.html
python -m http.server 8080
```

**方式三：安卓 APK（离线安装版）**
在手机/平板上安装 `EML 计算台`，自带网页资源、完全离线运行、不申请任何权限。
构建方式与产物获取见 [`android/README.md`](./android/README.md)。

> ⚠️ 仓库根目录 `../eml-workbench.html`（工作区 `D:\soft\`）是 **v1.0.0 的旧单文件原型**，没有规则引擎与计算树。请使用 `dist/eml-workbench.html`。

---

## 开发

```bash
git clone https://github.com/xiaoxuhui/EML.git
cd EML

# 运行单元测试（Node 内置测试器，无需安装依赖）
npm test
# 或： node --test tests/*.test.js

# 重新构建单文件 dist/eml-workbench.html（内联 src/*.js）
npm run build
# 或： node scripts/build.mjs
```

- 源码位于 `src/`，测试位于 `tests/`，构建脚本为 `scripts/build.mjs`。
- 无第三方运行时依赖，构建产物 `dist/eml-workbench.html` 可直接分发。
- 持续集成见 `.github/workflows/ci.yml`：在 Node 18/20/22 上自动跑测试与构建。

---

## 核心能力

- 复数域符号计算与基础公式化简（50 条规则：超越 + 代数）
- 数值与公式**双重去重**，同一数值可保存多个公式来源
- 直接公式 + 完整计算树（可缩放/平移/WASD 浏览）
- 初始值 `1` 保护
- 本地缓存、JSON 保存与导入（严格 schema 校验、循环依赖检测）
- 鼠标/触摸拖放、选择后点击输入

---

## 公式约定（重要）

本工具对 `ln`（自然对数）采用**形式化反函数**约定：

- `ln(e^a) = a`（不施加实数条件），以保留生成/推导结构；
- 同时，`ln(-1) = iπ`、`e^(iπ) = -1` 等按复对数**主值**处理。

这意味着 `ln` 在本引擎中是**表示相关**的：对少数输入（如 `e^(-iπ)` 与 `-1`），不同表示可能得到不同规范键、去重不会把它们合并。这是项目的**有意设计选择**，目的是保留推导历史而非追求复对数的全局主值一致性。若你的场景要求严格的复对数主值，请在导入/比较前自行归一化。

> 相关代码见 `src/rules-transcendental.js`，设计取舍记录在 `doc/设计文档.md`。

---

## 项目结构

```
EML/
├── src/                 # 源码（UMD 双模式：浏览器 + Node）
│   ├── expression.js          # AST 与复数近似
│   ├── expression-properties.js# 实数/正数/非零 可证明谓词
│   ├── formula-rules.js       # 规则注册表与固定点化简
│   ├── rules-transcendental.js# 指数/对数/欧拉/正弦规则
│   ├── rules-algebra.js       # 整数/加减乘除/虚数单位规则
│   ├── evaluator.js           # EML(x, y) 求值入口
│   ├── value-store.js         # 状态/去重/计算树预算
│   ├── persistence.js         # 保存文件严格校验
│   ├── app.js / tree-*.js     # 界面与计算树视图
│   └── template.html / styles.css
├── tests/               # 单元测试（node --test）
├── dist/                # 构建产物（单文件 HTML，可直接打开）
├── android/             # 安卓 APK 外壳（WebView 容器，见 android/README.md）
├── doc/                 # 需求/设计/测试报告/重构待办
├── scripts/build.mjs    # 构建脚本
└── release/             # 发布包
```

---

## 文档

- 需求与用例：`doc/需求与测试用例.md`
- 设计文档：`doc/设计文档.md`
- 实施计划：`doc/实施计划.md`
- 测试报告：`doc/第一版本测试报告.md`、`doc/重构版测试报告-v1.1.0.md`
- 重构待办：`doc/重构待办.md`
- 变更记录：[CHANGELOG.md](./CHANGELOG.md)

---

## 贡献

欢迎 Issue 与 PR。开发流程与规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

[MIT](./LICENSE) © 2026 xiaoxuhui
