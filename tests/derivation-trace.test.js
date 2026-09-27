const test = require("node:test");
const assert = require("node:assert/strict");

const Expr = require("../src/expression.js");
const Rules = require("../src/formula-rules.js");
const Evaluator = require("../src/evaluator.js");
const Store = require("../src/value-store.js");
const Trace = require("../src/derivation-trace.js");

const evaluate = (x, y) => Evaluator.evaluateEML(x, y);
const add = (state, evaluation, xId = Store.initialValueId, yId = Store.initialValueId) =>
  Store.addEvaluation(state, evaluation, xId, yId);

/** 构造 1 → e → e-1 的链，返回 { state, eId, em1Id }。 */
function chain() {
  const first = add(Store.createInitialState(), evaluate(Expr.ONE, Expr.ONE));
  const eId = first.resultValueId;
  const second = add(first.state, evaluate(Expr.ONE, Expr.E), Store.initialValueId, eId);
  return { state: second.state, eId, em1Id: second.resultValueId };
}

test("TR01 目标为初始值时返回单步链", () => {
  const trace = Trace.buildDerivationTrace(Store.createInitialState(), Store.initialValueId);
  assert.equal(trace.ok, true);
  assert.equal(trace.steps.length, 1);
  assert.equal(trace.steps[0].kind, "initial");
  assert.equal(trace.steps[0].displayText, "1");
  assert.equal(trace.steps[0].index, 1);
  assert.equal(trace.steps[0].isTarget, true);
  assert.equal(trace.steps[0].x, undefined, "初始值不应带输入");
});

test("TR02 单层推导得到两步链", () => {
  const { state, resultValueId } = add(Store.createInitialState(), evaluate(Expr.ONE, Expr.ONE));
  const trace = Trace.buildDerivationTrace(state, resultValueId);
  assert.equal(trace.steps.length, 2);
  assert.deepEqual(trace.steps.map((step) => step.kind), ["initial", "derived"]);
  assert.equal(trace.steps[1].displayText, "e");
  assert.equal(trace.steps[1].directFormula, "EML(1, 1) = e");
  assert.equal(trace.steps[1].x.refIndex, 1);
  assert.equal(trace.steps[1].y.refIndex, 1);
});

test("TR03 多层链按建造顺序线性排列", () => {
  const { state, em1Id } = chain();
  const trace = Trace.buildDerivationTrace(state, em1Id);
  assert.deepEqual(trace.steps.map((step) => step.displayText), ["1", "e", "e - 1"]);
  assert.equal(trace.steps[0].kind, "initial");
  assert.deepEqual(trace.steps.slice(1).map((step) => step.kind), ["derived", "derived"]);
});

test("TR04 每个步骤引用的输入都在它之前", () => {
  const { state, em1Id } = chain();
  const trace = Trace.buildDerivationTrace(state, em1Id);
  for (const step of trace.steps) {
    if (step.kind !== "derived") continue;
    for (const ref of [step.x, step.y]) {
      assert.ok(ref.refIndex !== null, `步骤 ${step.index} 的输入应可定位`);
      assert.ok(ref.refIndex < step.index, `步骤 ${step.index} 引用了未推导的输入 ${ref.refIndex}`);
    }
  }
});

test("TR05 重复使用的值只推导一次，后续以步号引用", () => {
  const { state, eId } = chain();
  // EML(e, e)：同一个 e 作为两个输入
  const { state: next, resultValueId } = add(state, evaluate(Expr.E, Expr.E), eId, eId);
  const trace = Trace.buildDerivationTrace(next, resultValueId);
  assert.equal(trace.steps.length, 3, "e 不应被展开两次");
  const last = trace.steps.at(-1);
  assert.equal(last.x.refIndex, 2);
  assert.equal(last.y.refIndex, 2);
});

test("TR06 最后一步一定是选中的目标", () => {
  const { state, em1Id } = chain();
  const trace = Trace.buildDerivationTrace(state, em1Id);
  assert.equal(trace.steps.at(-1).valueId, em1Id);
  assert.equal(trace.steps.at(-1).isTarget, true);
  assert.equal(trace.steps.filter((step) => step.isTarget).length, 1);
});

test("TR07 超出步数预算时明确标记截断", () => {
  const { state, em1Id } = chain();
  const trace = Trace.buildDerivationTrace(state, em1Id, { maxSteps: 1 });
  assert.equal(trace.truncated, true);
  assert.equal(trace.reason, "step-limit");
  assert.equal(trace.ok, false);
  assert.equal(trace.steps.length, 1, "不应超过预算");
});

test("TR08 一个值有多条来源时取第一条并报告其余条数", () => {
  const state = {
    values: {
      "v:one": { id: "v:one", displayText: "1", derivationIds: [] },
      "v:target": { id: "v:target", displayText: "X", derivationIds: ["d:a", "d:b", "d:c"] },
    },
    derivations: {
      "d:a": { id: "d:a", operation: "EML", xValueId: "v:one", yValueId: "v:one", directFormula: "EML(1, 1)", rewriteSteps: [] },
      "d:b": { id: "d:b", operation: "EML", xValueId: "v:one", yValueId: "v:one", directFormula: "EML(1, 1) 之二", rewriteSteps: [] },
      "d:c": { id: "d:c", operation: "EML", xValueId: "v:one", yValueId: "v:one", directFormula: "EML(1, 1) 之三", rewriteSteps: [] },
    },
  };
  const trace = Trace.buildDerivationTrace(state, "v:target");
  assert.equal(trace.extraSourceCount, 2);
  assert.equal(trace.steps.at(-1).directFormula, "EML(1, 1)");
});

test("TR09 目标不存在时返回失败而不抛异常", () => {
  const trace = Trace.buildDerivationTrace(Store.createInitialState(), "value:不存在");
  assert.equal(trace.ok, false);
  assert.equal(trace.reason, "missing-value");
  assert.deepEqual(trace.steps, []);
});

test("TR10 不修改传入的状态（纯函数）", () => {
  const { state, em1Id } = chain();
  const snapshot = JSON.stringify(state);
  Trace.buildDerivationTrace(state, em1Id);
  assert.equal(JSON.stringify(state), snapshot);
});

test("TR11 化简过程与推导记录同源", () => {
  const { state, em1Id } = chain();
  const trace = Trace.buildDerivationTrace(state, em1Id);
  const last = trace.steps.at(-1);
  const derivation = state.derivations[state.values[em1Id].derivationIds[0]];
  assert.equal(last.directFormula, derivation.directFormula);
  assert.deepEqual(last.rewriteSteps, derivation.rewriteSteps);
  assert.equal(last.operation, "EML");
});

test("TR12 推导链中每个数值只出现一次", () => {
  const { state, eId } = chain();
  const { state: next, resultValueId } = add(state, evaluate(Expr.E, Expr.E), eId, eId);
  const trace = Trace.buildDerivationTrace(next, resultValueId);
  const ids = trace.steps.map((step) => step.valueId);
  assert.equal(new Set(ids).size, ids.length, `出现重复值：${ids.join(", ")}`);
});

test("TR13 折叠规则修好后，推导链里的化简步骤可用", () => {
  // 1 - (e - 1) 现在能化简为 2 - e，这是 v1.3.0 的修复；
  // 推导链应原样带出这些步骤，供页面展示。
  const result = Rules.simplify(Expr.sub(Expr.ONE, Expr.sub(Expr.E, Expr.ONE)));
  assert.equal(Expr.render(result.expression), "2 - e");
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_NESTED_FOLD"));
});
