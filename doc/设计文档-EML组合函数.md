# EML 组合函数设计文档

- **Status**: PENDING
- **Approved**: 2026-10-03 用户确认函数采用 `EML(...)` 嵌套语法，并嵌入计算区
- **Type**: feature

## 设计目标

保持现有 EML 的符号计算、数值去重、公式来源和计算树机制，不引入通用数学文本解析器。组合函数只描述多个 EML 调用的树状组合。

## 模块边界

```text
eml-composition.js
  定义解析、语法校验、参数替换和嵌套 EML 求值

value-store.js
  保存组合函数推导、通用输入引用、删除引用保护和计算树输入分支

persistence.js
  校验可选组合函数状态和组合函数推导；兼容旧 V2 数据

app.js + template.html + styles.css
  在计算区中渲染定义编辑、动态槽位、预览和添加行为
```

## 语法

```text
Definition := Identifier "(" ParameterList ")" "=" Composition
ParameterList := Identifier ("," Identifier){0,5}
Composition := Identifier | "EML" "(" Composition "," Composition ")"
```

`Identifier` 采用 ASCII 字母开头、后接字母数字或下划线的形式。参数必须唯一；函数体中的标识符必须是参数名。函数定义最大 1,000 个字符，嵌套最大 16 层，避免异常输入耗尽页面资源。

## 求值与来源

组合函数的叶节点映射到数值栏中被选定的表达式。每个 `EML(left, right)` 节点调用现有 `Evaluator.evaluateEML`；内层结果作为外层输入。最终结果沿用现有符号化简规则。

组合推导采用：

```text
operation: "EML_COMPOSITION"
inputValueIds: ["value:...", ...]
functionDefinition: "F(x, y, z) = EML(EML(x, y), z)"
```

现有 EML 推导继续保留 `xValueId` 和 `yValueId`。计算树和推导过程统一读取派生记录的输入列表，显示参数名而非固定 x、y。

## 状态与兼容性

应用状态增加可选 `customFunction`：

```json
{
  "definitionText": "",
  "inputValueIds": []
}
```

新保存文件包含该字段。旧 V2 文件没有该字段时视作空定义和空输入，其他数值与推导不改变。缓存键和现有 V2 EML 推导格式保持兼容。

## 界面

组合函数区域归入同一个 `calculator` section，位于原 EML 的预览下方。它包含：定义文本输入框、应用定义按钮、动态输入槽位、结果输出、添加按钮和直接公式预览。定义或输入改变后即时重新计算；拖动处理复用 `.input-slot` 和原有值卡片的指针拖动协议。

## 测试策略

对解析器覆盖有效语法、未知参数、重复参数、错误 EML 参数数、嵌套限制。对求值覆盖嵌套 EML、参数顺序、错误传播和结果文本。对存储覆盖去重、引用保护、树/推导过程输入分支和 V2 兼容导入。浏览器验证动态槽位拖放、点击填入、添加、详情区和窄屏布局。

