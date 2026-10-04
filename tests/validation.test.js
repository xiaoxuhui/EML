const test = require("node:test");
const assert = require("node:assert/strict");

const Expr = require("../src/expression.js");
const Persistence = require("../src/persistence.js");
const Store = require("../src/value-store.js");
const Composition = require("../src/eml-composition.js");

test("表达式校验拒绝未知常量和伪整数", () => {
  assert.equal(Expr.isValidExpression({ type: "constant", name: "bogus" }), false);
  assert.equal(Expr.isValidExpression({ type: "integer", value: "2" }), false);
  assert.equal(Expr.isValidExpression({ type: "integer", value: Number.MAX_SAFE_INTEGER + 1 }), false);
});

test("表达式校验限制深度", () => {
  let expression = Expr.ONE;
  for (let index = 0; index < Expr.MAX_EXPRESSION_DEPTH + 1; index += 1) expression = Expr.neg(expression);
  assert.equal(Expr.isValidExpression(expression), false);
});

test("导入校验拒绝畸形推导表达式和步骤", () => {
  const state = Store.createInitialState();
  const invalid = JSON.parse(Persistence.serialize(state));
  invalid.derivations.bad = {
    id: "bad",
    operation: "EML",
    xValueId: Store.initialValueId,
    yValueId: Store.initialValueId,
    resultValueId: Store.initialValueId,
    directFormula: "bad",
    rawExpression: { type: "constant", name: "bogus" },
    rewriteSteps: [],
  };
  invalid.values[Store.initialValueId].derivationIds.push("bad");
  assert.equal(Persistence.validateState(invalid).ok, false);
});

test("依赖循环使用线性图检查拒绝", () => {
  const state = Store.createInitialState();
  const eId = Store.valueIdFor(Expr.canonicalKey(Expr.E));
  state.values[eId] = {
    id: eId,
    canonicalExpression: Expr.E,
    canonicalKey: Expr.canonicalKey(Expr.E),
    displayText: "e",
    protected: false,
    derivationIds: ["loop-e"],
    createdAt: new Date().toISOString(),
  };
  state.valueOrder.push(eId);
  state.derivations["loop-one"] = {
    id: "loop-one",
    operation: "EML",
    xValueId: eId,
    yValueId: eId,
    resultValueId: Store.initialValueId,
    directFormula: "loop",
    rawExpression: Expr.ONE,
    rewriteSteps: [],
  };
  state.derivations["loop-e"] = {
    id: "loop-e",
    operation: "EML",
    xValueId: Store.initialValueId,
    yValueId: Store.initialValueId,
    resultValueId: eId,
    directFormula: "loop",
    rawExpression: Expr.E,
    rewriteSteps: [],
  };
  state.values[Store.initialValueId].derivationIds.push("loop-one");
  assert.equal(Persistence.hasDependencyCycle(state), true);
});

test("公式结果引用自身不作为依赖循环", () => {
  const state = Store.createInitialState();
  state.derivations.self = {
    id: "self",
    operation: "EML",
    xValueId: Store.initialValueId,
    yValueId: Store.initialValueId,
    resultValueId: Store.initialValueId,
    directFormula: "EML(1, 1) = 1",
    rawExpression: Expr.ONE,
    rewriteSteps: [],
  };
  state.values[Store.initialValueId].derivationIds.push("self");
  assert.equal(Persistence.hasDependencyCycle(state), false);
});

test("导入文本大小受到限制", () => {
  assert.equal(Persistence.deserialize(" ".repeat(Persistence.MAX_IMPORT_BYTES + 1)).error, "文件大小超过限制");
});

test("UCF09 与 MF07-MF08：旧保存文件和单函数状态可迁移", () => {
  const oldState = Store.createInitialState();
  assert.equal(Persistence.validateState(oldState).ok, true);

  const legacy = Store.createInitialState();
  delete legacy.customFunctions;
  legacy.customFunction = { definitionText: "f(x) = EML(x, 1)", inputValueIds: [null] };
  const migrated = Persistence.validateState(legacy);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.customFunctions[0].name, "f");

  const parsed = Composition.parseDefinition("F(x, y, z) = EML(EML(x, y), z)");
  const evaluation = Composition.evaluate(parsed.definition, [Expr.ONE, Expr.ONE, Expr.ONE]);
  const added = Store.addCompositionEvaluation(
    Store.createInitialState(), evaluation,
    [Store.initialValueId, Store.initialValueId, Store.initialValueId]
  );
  const restored = Persistence.deserialize(Persistence.serialize(added.state));
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.state.customFunctions, []);
});
