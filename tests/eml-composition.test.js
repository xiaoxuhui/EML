const test = require("node:test");
const assert = require("node:assert/strict");

const Expr = require("../src/expression.js");
const Composition = require("../src/eml-composition.js");
const Store = require("../src/value-store.js");

const nestedDefinition = "F(x, y, z) = EML(EML(x, y), z)";

test("UCF01 解析嵌套 EML 组合函数", () => {
  const parsed = Composition.parseDefinition(nestedDefinition);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.definition.name, "F");
  assert.deepEqual(parsed.definition.parameterNames, ["x", "y", "z"]);
  assert.equal(parsed.definition.body.type, "eml");
  assert.equal(parsed.definition.displayText, nestedDefinition);
});

test("UCF02-UCF04 拒绝重复、残缺和未声明参数", () => {
  assert.equal(Composition.parseDefinition("F(x, x) = EML(x, x)").ok, false);
  assert.equal(Composition.parseDefinition("F(x) = EML(x)").ok, false);
  assert.equal(Composition.parseDefinition("F(x) = EML(x, z)").ok, false);
});

test("UCF05 嵌套 EML 使用多个输入得到符号结果", () => {
  const parsed = Composition.parseDefinition(nestedDefinition);
  const result = Composition.evaluate(parsed.definition, [Expr.ONE, Expr.ONE, Expr.ONE]);
  assert.equal(result.ok, true);
  assert.equal(result.displayText, "e^(e)");
  assert.equal(result.directFormula, "EML(EML(1, 1), 1) = e^(e)");
  assert.equal(result.expandedFormula, "EML(EML(1, 1), 1) = e^(e)");
  assert.equal(result.emlTree.type, "eml");
  assert.equal(result.emlTree.inputs[0].type, "eml");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "EXP_ONE"));
});

test("组合函数传播内层 EML 的定义域错误", () => {
  const parsed = Composition.parseDefinition("F(x, y, z) = EML(x, EML(y, z))");
  const result = Composition.evaluate(parsed.definition, [Expr.ONE, Expr.ONE, Expr.ZERO]);
  assert.equal(result.ok, false);
  assert.equal(result.error, "ln(0) 未定义");
});

test("UCF06-UCF08 组合函数结果加入数值栏并保护全部输入", () => {
  const parsed = Composition.parseDefinition(nestedDefinition);
  const evaluation = Composition.evaluate(parsed.definition, [Expr.ONE, Expr.ONE, Expr.ONE]);
  const added = Store.addCompositionEvaluation(
    Store.createInitialState(),
    evaluation,
    [Store.initialValueId, Store.initialValueId, Store.initialValueId]
  );
  assert.equal(added.status, "added-value");
  const derivation = added.state.derivations[added.state.values[added.resultValueId].derivationIds[0]];
  assert.equal(derivation.operation, "EML_COMPOSITION");
  assert.deepEqual(derivation.inputValueIds, [Store.initialValueId, Store.initialValueId, Store.initialValueId]);
  assert.equal(Store.isReferenced(added.state, Store.initialValueId), true);
  const tree = Store.getDetails(added.state, added.resultValueId).tree;
  assert.equal(tree.derivations[0].emlTree.type, "eml");
  assert.deepEqual(Store.getDetails(added.state, added.resultValueId).directFormulas, ["EML(EML(1, 1), 1) = e^(e)"]);
  assert.equal(tree.derivations[0].inputs.length, 3);
  assert.deepEqual(tree.derivations[0].inputs.map((input) => input.name), ["x", "y", "z"]);
});

test("UCF07 相同组合定义和输入不重复保存", () => {
  const parsed = Composition.parseDefinition(nestedDefinition);
  const evaluation = Composition.evaluate(parsed.definition, [Expr.ONE, Expr.ONE, Expr.ONE]);
  const first = Store.addCompositionEvaluation(
    Store.createInitialState(), evaluation,
    [Store.initialValueId, Store.initialValueId, Store.initialValueId]
  );
  const duplicate = Store.addCompositionEvaluation(
    first.state, evaluation,
    [Store.initialValueId, Store.initialValueId, Store.initialValueId]
  );
  assert.equal(duplicate.status, "duplicate-formula");
});

test("MF03-MF06 支持多个函数、独立输入和删除定义", () => {
  let state = Store.createInitialState();
  const f = Composition.parseDefinition("f(x) = EML(x, 1)").definition;
  const g = Composition.parseDefinition("g(x) = EML(x, 1)").definition;
  state = Store.addCustomFunction(state, f.name, f.displayText, 1).state;
  state = Store.addCustomFunction(state, g.name, g.displayText, 1).state;
  const [fState, gState] = Store.getCustomFunctions(state);
  state = Store.setCustomInput(state, fState.id, 0, Store.initialValueId);
  assert.equal(Store.getCustomFunctions(state)[0].inputValueIds[0], Store.initialValueId);
  assert.equal(Store.getCustomFunctions(state)[1].inputValueIds[0], null);
  assert.equal(Store.addCustomFunction(state, f.name, f.displayText, 1).status, "duplicate-name");
  state = Store.deleteCustomFunction(state, fState.id).state;
  assert.deepEqual(Store.getCustomFunctions(state).map((item) => item.name), ["g"]);
});

test("MF09 已定义函数可被新函数调用并展开求值", () => {
  const f = Composition.parseDefinition("f(x) = EML(x, 1)").definition;
  const g = Composition.parseDefinition("g(x) = f(x)").definition;
  assert.deepEqual(Composition.validateDefinitionCalls(g, [f]), { ok: true });
  const result = Composition.evaluate(g, [Expr.ONE], [f, g]);
  assert.equal(result.ok, true);
  assert.equal(result.displayText, "e");
  assert.equal(result.directFormula, "EML(1, 1) = e");
  assert.equal(result.expandedFormula, "EML(1, 1) = e");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "FUNCTION_EXPANSION"));
});

test("MF10 拒绝未定义函数、自引用和参数数量不匹配", () => {
  const f = Composition.parseDefinition("f(x) = EML(x, 1)").definition;
  const unknown = Composition.parseDefinition("g(x) = h(x)").definition;
  const self = Composition.parseDefinition("g(x) = g(x)").definition;
  const wrongArity = Composition.parseDefinition("g(x) = f(x, 1)").definition;
  assert.equal(Composition.validateDefinitionCalls(unknown, [f]).ok, false);
  assert.equal(Composition.validateDefinitionCalls(self, [f]).ok, false);
  assert.equal(Composition.validateDefinitionCalls(wrongArity, [f]).ok, false);
});
