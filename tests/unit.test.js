const test = require("node:test");
const assert = require("node:assert/strict");

const Expr = require("../src/expression.js");
const Rules = require("../src/formula-rules.js");
const Evaluator = require("../src/evaluator.js");
const Store = require("../src/value-store.js");
const Persistence = require("../src/persistence.js");

const evaluate = (x, y) => Evaluator.evaluateEML(x, y);
const initial = () => Store.createInitialState();
const add = (state, evaluation, xId = Store.initialValueId, yId = Store.initialValueId) =>
  Store.addEvaluation(state, evaluation, xId, yId);

test("U01 EML(1, 1) 化简为 e", () => {
  const result = evaluate(Expr.ONE, Expr.ONE);
  assert.equal(result.ok, true);
  assert.equal(result.displayText, "e");
  assert.equal(result.directFormula, "EML(1, 1) = e");
});

test("U02 EML(0, 1) 化简为 1", () => {
  assert.equal(evaluate(Expr.ZERO, Expr.ONE).displayText, "1");
});

test("U03 EML(1, e) 化简为 e - 1", () => {
  assert.equal(evaluate(Expr.ONE, Expr.E).displayText, "e - 1");
});

test("U04 欧拉公式 EML(iπ, 1) 化简为 -1", () => {
  const ipi = Expr.mul(Expr.I, Expr.PI);
  const result = evaluate(ipi, Expr.ONE);
  assert.equal(result.displayText, "-1");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "EULER_IDENTITY"));
});

test("U05 π 和 ln 保持符号形式", () => {
  const result = evaluate(Expr.PI, Expr.ln(Expr.integer(2)));
  assert.equal(result.displayText, "e^(π) - ln(ln(2))");
  assert.doesNotMatch(result.displayText, /3\.14|0\.69/);
});

test("U06 i 保持符号形式", () => {
  const result = evaluate(Expr.I, Expr.ONE);
  assert.equal(result.displayText, "e^(i)");
  assert.doesNotMatch(result.displayText, /0\.54|0\.84/);
});

test("U07 根式保持符号形式", () => {
  assert.equal(Expr.render(Expr.sqrt(Expr.integer(2))), "√(2)");
});

test("U08 相同结果只建立一个数值项目", () => {
  const first = add(initial(), evaluate(Expr.ONE, Expr.ONE));
  const second = add(first.state, evaluate(Expr.ONE, Expr.ONE));
  assert.equal(second.state.valueOrder.filter((id) => second.state.values[id].displayText === "e").length, 1);
});

test("U09 相同公式只保存一次", () => {
  const first = add(initial(), evaluate(Expr.ONE, Expr.ONE));
  const second = add(first.state, evaluate(Expr.ONE, Expr.ONE));
  assert.equal(second.status, "duplicate-formula");
  assert.equal(second.state.values[first.resultValueId].derivationIds.length, 1);
});

test("U10 同一数值允许保存多条不同公式", () => {
  const state = initial();
  const firstEvaluation = evaluate(Expr.ONE, Expr.ONE);
  const first = add(state, firstEvaluation);
  const synthetic = { ...firstEvaluation, directFormula: "EML(来源二, 1) = e", xExpression: Expr.pow(Expr.E, Expr.ZERO) };
  const sourceId = Store.valueIdFor(Expr.canonicalKey(synthetic.xExpression));
  const prepared = JSON.parse(JSON.stringify(first.state));
  prepared.values[sourceId] = {
    id: sourceId,
    canonicalExpression: synthetic.xExpression,
    canonicalKey: Expr.canonicalKey(synthetic.xExpression),
    displayText: "e^(0)", protected: false, derivationIds: [], createdAt: new Date().toISOString(),
  };
  prepared.valueOrder.push(sourceId);
  const second = add(prepared, synthetic, sourceId, Store.initialValueId);
  assert.equal(second.status, "added-formula");
  assert.equal(second.state.values[first.resultValueId].derivationIds.length, 2);
});

test("U11 公式详情包含直接公式", () => {
  const added = add(initial(), evaluate(Expr.ONE, Expr.ONE));
  assert.deepEqual(Store.getDetails(added.state, added.resultValueId).directFormulas, ["EML(1, 1) = e"]);
});

test("U12 选择项目可切换", () => {
  const added = add(initial(), evaluate(Expr.ONE, Expr.ONE));
  const selectedOne = Store.selectValue(added.state, Store.initialValueId);
  const selectedE = Store.selectValue(selectedOne, added.resultValueId);
  assert.equal(selectedE.selectedValueId, added.resultValueId);
});

test("U13 初始值 1 不允许删除", () => {
  const result = Store.deleteValue(initial(), Store.initialValueId);
  assert.equal(result.status, "protected");
  assert.ok(result.state.values[Store.initialValueId]);
});

test("U14 完整计算树展开输入和化简步骤", () => {
  const added = add(initial(), evaluate(Expr.ONE, Expr.ONE));
  const tree = Store.getDetails(added.state, added.resultValueId).tree;
  assert.equal(tree.derivations[0].x.initial, true);
  assert.equal(tree.derivations[0].y.initial, true);
  assert.ok(tree.derivations[0].rewriteSteps.some((step) => step.ruleId === "EXP_ONE"));
});

test("U15 输入值可以被覆盖", () => {
  const state = initial();
  const piId = Store.valueIdFor(Expr.canonicalKey(Expr.PI));
  state.values[piId] = { id: piId, canonicalExpression: Expr.PI, canonicalKey: Expr.canonicalKey(Expr.PI), displayText: "π", protected: false, derivationIds: [], createdAt: new Date().toISOString() };
  state.valueOrder.push(piId);
  const withOne = Store.setInput(state, "x", Store.initialValueId);
  const withPi = Store.setInput(withOne, "x", piId);
  assert.equal(withPi.inputXId, piId);
});

test("U16 y 为 0 时结果无效", () => {
  const result = evaluate(Expr.ONE, Expr.ZERO);
  assert.equal(result.ok, false);
  assert.equal(result.error, "ln(0) 未定义");
});

test("U17 保存和导入恢复数值、符号与公式", () => {
  const added = add(initial(), evaluate(Expr.ONE, Expr.ONE));
  const restored = Persistence.deserialize(Persistence.serialize(added.state));
  assert.equal(restored.ok, true);
  assert.equal(restored.state.values[added.resultValueId].displayText, "e");
  assert.equal(restored.state.values[added.resultValueId].derivationIds.length, 1);
});

test("被其他公式引用的数值不允许删除", () => {
  const addedE = add(initial(), evaluate(Expr.ONE, Expr.ONE));
  const eId = addedE.resultValueId;
  const stateWithInput = Store.setInput(Store.setInput(addedE.state, "x", eId), "y", Store.initialValueId);
  const addedNext = Store.addEvaluation(stateWithInput, evaluate(Expr.E, Expr.ONE), eId, Store.initialValueId);
  assert.equal(Store.deleteValue(addedNext.state, eId).status, "referenced");
});

test("无效导入不会通过校验", () => {
  assert.equal(Persistence.deserialize('{"schemaVersion":2}').ok, false);
  assert.equal(Persistence.deserialize("not json").error, "文件不是有效的 JSON");
});

test("回归：e - ln(e^(e)) 继续化简为 0", () => {
  const result = evaluate(Expr.ONE, Expr.pow(Expr.E, Expr.E));
  assert.equal(result.displayText, "0");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_REAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_SELF"));
});

test("ln(e^a) 不对无法证明为实数的指数进行化简", () => {
  const result = Rules.simplify(Expr.ln(Expr.pow(Expr.E, Expr.I)));
  assert.equal(Expr.render(result.expression), "ln(e^(i))");
  assert.equal(result.steps.some((step) => step.ruleId === "LN_EXP_REAL"), false);
});
