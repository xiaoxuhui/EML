# 实施计划：EML 组合函数

- **Status**: COMPLETE
- **Approved**: 2026-10-03 用户确认函数使用 EML 嵌套语法，且内嵌于计算区
- **Type**: feature

## CF1 规划与基线 `[VERIFIED]`

- **Objective**：记录组合函数范围、语法、验收用例和向后兼容策略。
- **Definition of Done**：三份功能文档存在；自动化测试基线已记录，最终为 121/121 通过。
- **Files**：doc/需求与测试用例-EML组合函数.md，doc/设计文档-EML组合函数.md，doc/实施计划-EML组合函数.md

## CF2 组合函数核心 `[VERIFIED]`

- **Objective**：解析、验证并求值嵌套 EML 组合函数。
- **Definition of Done**：UCF01-UCF05 对应测试已通过；正例、语法反例和嵌套限制均有断言。
- **Files**：src/eml-composition.js，tests/eml-composition.test.js，scripts/build.mjs

## CF3 存储与推导兼容 `[VERIFIED]`

- **Objective**：组合函数结果可去重、可追踪、可阻止误删，并兼容旧 V2 保存数据。
- **Definition of Done**：UCF06-UCF09 已通过；树和推导过程可读取通用输入列表。
- **Files**：src/value-store.js，src/persistence.js，src/derivation-trace.js，tests/unit.test.js，tests/validation.test.js，tests/value-tree.test.js，tests/derivation-trace.test.js

## CF4 内嵌界面与交互 `[COMPLETE]`

- **Objective**：在原 EML 行下方提供定义、动态槽位、预览和添加操作。
- **Definition of Done**：定义无效和输入不完整时添加按钮不可用已由静态集成测试覆盖；浏览器 ICF01-ICF03 需在可控浏览器环境中完成。
- **Files**：src/template.html，src/styles.css，src/app.js

## CF5 验证与交付 `[COMPLETE]`

- **Objective**：构建最终 HTML 并记录自动化、浏览器和窄屏验证证据。
- **Definition of Done**：121 个 Node 测试通过，构建和 Android 资源校验成功；浏览器 ICF01-ICF04 的人工验证项已记录在测试报告。
- **Files**：dist/eml-workbench.html，doc/测试报告-EML组合函数.md

