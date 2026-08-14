const test = require("node:test");
const assert = require("node:assert/strict");

const Expr = require("../src/expression.js");
const Evaluator = require("../src/evaluator.js");
const Store = require("../src/value-store.js");

function addChain(length) {
  let state = Store.createInitialState();
  let valueId = Store.initialValueId;
  for (let index = 0; index < length; index += 1) {
    const value = state.values[valueId];
    const evaluation = Evaluator.evaluateEML(value.canonicalExpression, Expr.ONE);
    const added = Store.addEvaluation(state, evaluation, valueId, Store.initialValueId);
    state = added.state;
    valueId = added.resultValueId;
  }
  return { state, valueId };
}

test("计算树可以按深度延迟构建", () => {
  const { state, valueId } = addChain(8);
  const tree = Store.buildValueTree(state, valueId, { maxDepth: 2, maxNodes: 100 });
  assert.equal(Store.treeHasDeferredBranches(tree), true);
  assert.equal(tree.derivations[0].x.derivations[0].x.type, "deferred");
});

test("计算树节点预算阻止宽分支无限展开", () => {
  const { state, valueId } = addChain(8);
  const tree = Store.buildValueTree(state, valueId, { maxDepth: 20, maxNodes: 2 });
  assert.equal(Store.treeHasDeferredBranches(tree), true);
  assert.ok(JSON.stringify(tree).includes('"reason":"node-limit"'));
});

test("不传限制时保持完整计算树兼容行为", () => {
  const { state, valueId } = addChain(5);
  const tree = Store.buildValueTree(state, valueId);
  assert.equal(Store.treeHasDeferredBranches(tree), false);
});
