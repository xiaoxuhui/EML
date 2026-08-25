# 代码评审报告 — EML (eml-workbench)

- **评审日期**：2026-08-25
- **评审人**：WorkBuddy AI
- **技术栈**：零依赖原生 JavaScript（UMD 双模式：浏览器 `globalThis` + Node `require`），单文件 HTML 构建（`scripts/build.mjs` 内联 `src/*.js`）
- **源码规模**：`src/` 共 14 个文件约 78 KB；核心规则 23（超越）+ 27（代数）= **50 条**（注：任务描述称“54 条”，`doc/重构版测试报告-v1.1.0.md` 称“47 条”，均与实际不符）
- **测试结果**：83 个用例，**通过 83 / 失败 0**

---

## 一、总体评价

- **可维护性评级**：B+（良好）
- **一句话总结**：架构分层清晰、持久化与求值防护到位、测试覆盖率可观；但**符号化简引擎存在“形式化反函数”与“主值规则”混用导致的语义不一致**，且若干回归测试把不一致的结果固化成了“正确预期”，是项目最大的正确性风险。

---

## 二、核心架构分析

分层合理，依赖方向单向：

1. **AST 层**（`expression.js`）：常量/整数/neg/add/sub/mul/div/pow/ln/sqrt/sin；`canonicalKey` 用于去重；`approximate` 实现复数四则/指数/对数；`validateExpression` 限制深度 ≤64、节点 ≤2000。ADD/MUL 的 `canonicalKey` 对两侧排序，天然处理交换律。
2. **性质谓词层**（`expression-properties.js`）：`isProvablyReal / isProvablyPositive / isProvablyNonZero / isProvablyPureImaginaryNonZero` 提供“可证明安全”的前置条件。`realBounds` 用区间算术做保守推断。
3. **规则引擎层**（`formula-rules.js` + `rules-transcendental.js` + `rules-algebra.js`）：注册表模式，固定点迭代（≤50 轮），先化简子节点再尝试重写（`rewriteChildren` → `rewriteNode`），以 `canonicalKey` 不变作为收敛判据。
4. **求值层**（`evaluator.js`）：构造 `e^x - ln(y)`，入口处做 `ln(0)` 定义域保护，记录每一步规则。
5. **状态层**（`value-store.js`）：数值/公式双重去重、`formulaKey` 由输入+结果规范键生成、初始值 `1` 保护、计算树按层/预算展开（`MAX_TREE_NODES=800`/`MAX_TREE_DEPTH=32`）。
6. **持久化层**（`persistence.js`）：严格 schema 校验（V2）、循环依赖线性图检测、导入大小/数量/字符串长度上限。
7. **UMD 双模式**：每个模块 `(function(root, factory){...})` 同时支持浏览器全局与 Node `require`；`scripts/build.mjs` 把 `src/` 全量内联进 `dist/eml-workbench.html`。

---

## 三、测试结果

- **实测命令**：`cd "D:/soft/EML" && node --test tests/*.test.js`
- **结果**：`# tests 83  # pass 83  # fail 0  # cancelled 0`（全部通过）
- **覆盖评价**：
  - 正向覆盖了各规则的命中、反例、组合化简；持久化校验、计算树延迟构建、表达式严格校验均有独立测试文件。
  - **关键缺口**：`doc/重构待办.md` 明确列出了若干“未勾选”项——规则循环/上限触发测试、共享上游节点缓存、深/宽/循环数据测试、自动浏览器交互测试（I01-I38）、构建后冒烟测试——均未落地。
  - **更隐蔽的问题**：部分回归测试（见下文“严重”项）把**语义不一致的预期值**写成了断言，于是“全绿”掩盖了化简正确性的真实风险。

---

## 四、发现的问题

### 严重（符号化简正确性问题 — 重点！）

**S1. `LN_EXP_QUOTIENT` 前置条件过弱，负实数分母下产生分支错误**
- 位置：`src/rules-transcendental.js:190-198`
- 现状：仅用 `isProvablyNonZero(expression.argument.denominator)` 作为前置条件，既**未要求分子指数 `a` 为实数**，也**未要求分母 `b>0`**。
- 影响：当分母为负实数时，结果与复数主值相差 `2πi`。实测 `ln(e^e / -2)` 被化简为 `e - ln(-2)`（= `e - ln2 - iπ`），而主值应为 `e - ln2 + iπ`。该规则还与**亲兄弟规则** `LN_QUOTIENT_POSITIVE_DENOMINATOR`（同文件 `:209-217`，明确要求 `isProvablyPositive(b)`）自相矛盾。
- 建议修复：将前置条件改为 `isProvablyReal(a) && isProvablyPositive(b)`，与 `LN_QUOTIENT_POSITIVE_DENOMINATOR` 保持一致；或若坚持“形式化”，则统一约定并显式说明分支取舍。
- 关联：**`tests/unit.test.js:369-374` 把错误结果 `e - ln(-2)` 断言为“正确”**，固化了该缺陷。

**S2. 形式化反函数 `ln(e^a)=a` 与本项目主值规则内部不一致，使 `ln` 变成“表示相关”**
- 位置：`src/rules-transcendental.js:168-170`（`LN_EXP_FORMAL`）
- 现状：`doc/设计文档.md §8` 与 `doc/公式覆盖审计.md` **明确把“`ln(e^a)=a`（不施加实数条件）”列为项目约定**，有意保留生成结构而非复对数主值。
- 问题：这与同引擎里的**主值规则** `LN_MINUS_ONE`（`:203`，`ln(-1)=iπ`）、`EULER_IDENTITY`（`:124`，`e^(iπ)=-1`）冲突。实测：
  - `ln(-1)` → `iπ`（主值规则）
  - `ln(e^(-iπ))` → `-iπ`（形式化反函数）
  - 但 `e^(-iπ) = -1`，**同一个数学对象 `-1` 得到两个不同的 `canonicalKey`（`mul(const:i,const:pi)` vs `neg(mul(const:i,const:pi))`）**。
- 影响：破坏“规范表达式一致才合并”的确定性去重承诺；`EML(1, e^(e - iπ))` 被算成 `iπ`，而按主值应为 `-iπ`（见 `tests/unit.test.js:258-264`、`:266-271`，两者均把不一致值断言为通过）。这是符号化简工作台的**头号架构风险**。
- 建议修复（二选一并落到文档）：
  1. 严谨路线：`LN_EXP_FORMAL` 增加 `isProvablyReal(expression.argument.exponent)` 前置，使其与 `EXP_LN_FORMAL` 方向及 `LN_MINUS_ONE`/`EULER_*` 主值语义一致；或
  2. 形式化路线：保留 `ln(e^a)=a`，但**同时**让 `LN_MINUS_ONE`/`EULER_IDENTITY` 也走同一“不取主值”的约定，并在设计与审计文档中写明：`ln` 在此引擎中是“表示相关”的，跨表示形式的去重可能不产生同一规范键——并接受这一点。

**S3. 多处“零参数”保护依赖 `isInteger(argument,0)` 而非 `isProvablyNonZero`，仅因化简顺序“碰巧安全”**
- 位置：`src/rules-transcendental.js:128`（`EXP_LN_FORMAL`）、`:146-147`（`EXP_ADD_LN`）、`:158`（`EXP_SUM_LN_FACTOR`）、`:117`（`EXP_HALF_LN`）
- 现状：这些规则用 `!isInteger(argument,0)` 排除“明确零”，但只识别整数 `0` 节点。
- 影响：凡是能在父规则“看到”之前被化简为整数 `0` 的符号零（如 `1-1`）会被拦下；**但安全性完全依赖 `formula-rules.js:74` 的“先 `rewriteChildren` 再 `rewriteNode`”这一隐含顺序**。一旦某个零无法被归约为整数 `0` 节点（例如未来的新节点类型或新规则未先化简），规则就会把 `ln(0)`（未定义）错误消去为确定值。这是一种**脆弱耦合**而非健壮防护。
- 建议修复：将 `!isInteger(argument,0)` 统一替换为既有的 `isProvablyNonZero(argument)`（或增加 `isProvablyNonZero` 的判定覆盖），使“域安全”不依赖化简顺序。

### 中等（设计 / 可维护性）

**M1. `isProvablyReal` 对 `POW` 仅识别 `e^实数`**
- 位置：`src/expression-properties.js:28-29`
- 影响：`2^3`、`(-2)^2` 等整数幂不被判为“可证明实数”，会**保守地阻止**本可安全进行的化简（如 `LN_REAL_EXP_PRODUCT` 无法触发）。属完备性损失，非正确性问题，但会限制化简能力。

**M2. 求值器 `ln(0)` 检测使用数值阈值 `1e-12`**
- 位置：`src/evaluator.js:16`
- 影响：`Math.abs(re)<1e-12 && Math.abs(im)<1e-12` 是浮点近似判等。对真实的非零极小值（如 `e^(-1000)` 下溢到 `0`，或 `1e-13`）会**误报“ln(0) 未定义”**；反之对恰好近似为 0 的符号零则正确拦截。建议改用“结构化零判定”（整数 `0` 或已知化简为 `0`）而非数值阈值，至少把阈值与 `approximate` 的精度解耦。

**M3. 文档与实现的版本/规则数/状态模型漂移**
- `README.md:3` 称“当前稳定发布版本：v1.0.0”，但 `package.json` 为 `1.1.0`；`release/EML-v1.0.0.zip` 仍是**旧的 v1.0.0 单文件原型**（内联模块名与 `dist/` 的模块化构建不同）。
- 规则数：任务描述“54”、`doc/重构版测试报告-v1.1.0.md`“47”、实际 `tests/rule-registry.test.js:8` 断言“50”——三处不一致，实际为 50。
- `doc/设计文档.md §10` 的状态模型含 `preview`、`notice` 字段，但 `src/value-store.js:31-42` 的 `createInitialState` 并无这两字段（实际由 `app.js` 内存变量承载）。属文档漂移。

**M4. 持久化对“额外字段”宽松**
- 位置：`src/persistence.js:46-104`（`validateState`）
- 现状：`validateState` 只校验必要字段，未拒绝未知字段；`deserialize` 末尾 `JSON.parse(JSON.stringify(candidate))` 会把多余字段一并深拷贝进状态。
- 影响：低危，但恶意/损坏文件可注入未在 schema 中定义的字段并被原样保存，建议显式白名单或至少文档化“仅信任已知字段”。

### 轻微（代码味道 / 小瑕疵）

- **无 LICENSE、无 CI 配置、无 linter**：`doc/重构待办.md` 已列出这些缺口（构建后冒烟、交互测试自动化、规则循环/上限测试均未勾选）。
- **状态每次变更都 `JSON.parse(JSON.stringify(state))` 全量深拷贝**（`src/value-store.js:44`）：在 2000 数值规模下为 O(n) 每操作，是可接受的，但属于明显可优化的热路径。
- **`canonicalKey` 仅对二元 ADD/MUL 排序**，不做结合律展平：`a+(b+c)` 与 `(a+b)+c` 不会合并（设计文档已声明“非目标”，仅为已知限制）。
- **测试把不一致值固化为正确预期**（同 S1/S2）：`tests/unit.test.js:258-264`、`:266-271`、`:369-374` 应随 S1/S2 的修复一并改为断言主值一致的结果。

---

## 五、安全风险

- **严格 schema 校验（正面）**：`persistence.js` 对 `schemaVersion`、表达式节点类型/常量名/整数范围、`derivation`/`rewriteSteps`、引用完整性、初始值保护均有校验，并设导入大小 5 MiB、数值 ≤2000、公式 ≤5000、步骤 ≤200 等上限——防护充分。
- **循环依赖检测（正面）**：`hasDependencyCycle` 用 `visiting/visited` 双集合做线性 DFS，可正确拒绝自环与成环导入。
- **XSS（正面）**：`src/app.js` 全程使用 `textContent`/`createElement` 渲染用户数据，未见把用户提供内容写入 `innerHTML`，对导入文件与数值显示安全。
- **`ln(0)` 定义域保护（正面但有精度隐患）**：`evaluator.js:15-18` 在 EML 入口拦截；但如 M2 所述，数值阈值可能误杀极小值或（极端）漏判，建议结构化判零。
- **多余字段注入（低危）**：见 M4。

---

## 六、性能风险

- **化简迭代上限 50 轮**（`formula-rules.js:20,72`）：以 `canonicalKey` 固定为收敛判据，能防止规则循环；但固定上限意味着极深表达式链（>50 步才收敛）可能被截断并提示“达到安全上限”，属有界但可能“欠化简”。建议对“轮数耗尽”增加可观测指标（已记录 `limitReached`，但未统计平均步数/热点）。
- **计算树节点预算**（`value-store.js:16-17`，800 节点 / 32 层）：按层 + 预算展开，避免一次性生成全部 DOM，设计合理。
- **近似求值精度**：`approximate` 基于 JS `double` 的复数运算，精度约 `1e-12`；与 `ln(0)` 的 `1e-12` 阈值相邻，存在精度互相干扰风险（见 M2）。
- **深拷贝热路径**：每次状态变更全量 `JSON` 深拷贝（`value-store.js:44`），大列表下为 O(n) 每操作，是潜在瓶颈。

---

## 七、一致性问题

- **版本叙事不一致**：`README.md` 把 v1.0.0 称为稳定版，而 `dist/` 实为 1.1.0 模块化构建；`release/EML-v1.0.0.zip` 仍是旧单文件原型。
- **根目录启动器指向旧原型（确认任务前提）**：任务提到的 `D:/soft/eml-chrome-launch.bat`、`.url` 与 `eml-workbench.html` **确实存在**（位于工作区根目录 `D:\soft`，不在 EML git 仓库内）。`eml-chrome-launch.bat` 实际打开 `file:///D:/soft/eml-workbench.html`，即 22 KB 的旧单文件 v1.0.0 原型（无规则引擎、无计算树），而当前模块化构建为 `D:/soft/EML/dist/eml-workbench.html`（91 KB）。两者不一致：双击启动器会加载陈旧原型而非当前构建。建议将启动器改为指向 `D:/soft/EML/dist/eml-workbench.html`，或将根目录旧文件归档/删除。
- **规则数量文档不一致**：54（任务）/47（测试报告）/50（实际）三处不符。
- **JSON 格式与文档偏差（纠正任务前提）**：实际 `serialize`（`persistence.js:106-113`）产出 `{schemaVersion:2, app:"EML Workbench", savedAt, ...state}`，与 `doc/设计文档.md §11` 的示例**完全一致**，未发现偏差；偏差只存在于版本号与规则数，而非文件格式本身。
- **状态模型文档漂移**：见 M3。

---

## 八、后续维护建议（按优先级）

1. **【P0 正确性】修复 S2/S1**：明确 `ln` 的语义约定（主值 vs 形式化），补齐 `LN_EXP_QUOTIENT` 的 `isProvablyReal(a) && isProvablyPositive(b)` 前置，消除“同一数两种规范键”的语义不一致；并同步修改把错误值固化的回归测试（`:258-264`、`:266-271`、`:369-374`）。
2. **【P0 健壮性】修复 S3**：把 `!isInteger(arg,0)` 类零保护替换为 `isProvablyNonZero`，使域安全不依赖化简顺序。
3. **【P1 精度】修复 M2**：用结构化零判定替代 `evaluator.js` 的 `1e-12` 数值阈值，消除极小值误杀。
4. **【P1 文档】统一版本与计数**：更正 README 版本叙述、规则数量（50）、状态模型字段，使文档与 `dist` 构建、实际代码一致。
5. **【P1 测试】补齐待办缺口**：规则循环/上限触发测试、共享上游缓存、深/宽/循环数据测试、自动浏览器交互测试（I01-I38）、构建后冒烟与校验和。
6. **【P2 工程】补 LICENSE / CI / lint**：避免无许可证发布，加入最小 CI（自动跑 `node --test` + 构建校验）。
7. **【P2 完备性】放宽 `isProvablyReal` 的 POW 判定**（M1），提升整数幂等本可安全化简场景的覆盖。
8. **【P2 性能】评估 `cloneState` 全量深拷贝**，在超大列表下改为结构共享或增量更新。

---

## 九、结论

EML 的工程分层、持久化校验、计算树预算与 UMD 双模式构建都达到了良好水平，测试“全绿”（83/83）给人安全感。但**最大的风险在符号化简正确性**：项目同时采用了“形式化反函数 `ln(e^a)=a`”与“主值规则 `ln(-1)=iπ`、`e^(iπ)=-1`”，二者在同一引擎内互不相容，导致 `ln` 对同一个数 `-1` 给出 `iπ` 与 `-iπ` 两种结果、两种规范键，破坏了确定性去重的前提；`LN_EXP_QUOTIENT` 对负实数分母还会产生相差 `2πi` 的分支错误。更关键的是，这些不一致值已被回归测试**写死为“正确预期”**，使全绿测试无法暴露问题。建议优先按 P0 两项收敛 `ln` 语义并修复零参数保护，再补齐文档与 CI，方可将该项目从“可用原型”推向“可信任的符号化简工具”。
