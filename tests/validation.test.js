const test = require("node:test");
const assert = require("node:assert/strict");

const Expr = require("../src/expression.js");
const Persistence = require("../src/persistence.js");
const Store = require("../src/value-store.js");

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
  state.derivations.loop = {
    id: "loop",
    operation: "EML",
    xValueId: Store.initialValueId,
    yValueId: Store.initialValueId,
    resultValueId: Store.initialValueId,
    directFormula: "loop",
    rawExpression: Expr.ONE,
    rewriteSteps: [],
  };
  state.values[Store.initialValueId].derivationIds.push("loop");
  assert.equal(Persistence.hasDependencyCycle(state), true);
});

test("导入文本大小受到限制", () => {
  assert.equal(Persistence.deserialize(" ".repeat(Persistence.MAX_IMPORT_BYTES + 1)).error, "文件大小超过限制");
});
