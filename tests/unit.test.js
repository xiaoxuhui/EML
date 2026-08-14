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
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_FORMAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_SELF"));
});

test("形式化反函数规则支持复指数", () => {
  const result = Rules.simplify(Expr.ln(Expr.pow(Expr.E, Expr.I)));
  assert.equal(Expr.render(result.expression), "i");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_EXP_FORMAL"));
});

test("回归：嵌套实数对数指数继续化简", () => {
  const exponent = Expr.sub(Expr.E, Expr.ln(Expr.sub(Expr.E, Expr.ONE)));
  const result = evaluate(Expr.ONE, Expr.pow(Expr.E, exponent));
  assert.equal(result.displayText, "ln(e - 1)");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_FORMAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_NESTED_LEFT"));
});

test("只有能证明为正数的对数参数才判定为实数", () => {
  assert.equal(Rules.isProvablyPositive(Expr.sub(Expr.E, Expr.ONE)), true);
  assert.equal(Rules.isProvablyReal(Expr.ln(Expr.sub(Expr.E, Expr.ONE))), true);
  assert.equal(Rules.isProvablyReal(Expr.ln(Expr.integer(-1))), false);
});

test("回归：e^(ln(e - 1)) - e 化简为 -1", () => {
  const expression = Expr.sub(
    Expr.pow(Expr.E, Expr.ln(Expr.sub(Expr.E, Expr.ONE))),
    Expr.E
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "-1");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"));
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_NESTED_RIGHT"));
  assert.ok(result.steps.some((step) => step.ruleId === "NEG_INTEGER"));
});

test("e^(ln(a)) 不对非正实数参数进行消去", () => {
  const result = Rules.simplify(Expr.pow(Expr.E, Expr.ln(Expr.integer(-1))));
  assert.equal(Expr.render(result.expression), "-1");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"), false);
  assert.ok(result.steps.some((step) => step.ruleId === "LN_MINUS_ONE"));
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_IDENTITY"));
});

test("回归：1 - -1 化简为 2", () => {
  const result = Rules.simplify(Expr.sub(Expr.ONE, Expr.integer(-1)));
  assert.equal(Expr.render(result.expression), "2");
  assert.ok(result.steps.some((step) => step.ruleId === "INTEGER_SUB"));
});

test("EML(0, e^(-1)) 完成对数和整数运算", () => {
  const result = evaluate(Expr.ZERO, Expr.pow(Expr.E, Expr.integer(-1)));
  assert.equal(result.displayText, "2");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_FORMAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "INTEGER_SUB"));
});

test("整数加法和乘法直接计算", () => {
  const sum = Rules.simplify(Expr.add(Expr.integer(2), Expr.integer(-3)));
  const product = Rules.simplify(Expr.mul(Expr.integer(-2), Expr.integer(3)));
  assert.equal(Expr.render(sum.expression), "-1");
  assert.equal(Expr.render(product.expression), "-6");
});

test("回归：e - ln(e^(e - iπ)) 按形式化反函数规则化简为 iπ", () => {
  const exponent = Expr.sub(Expr.E, Expr.mul(Expr.I, Expr.PI));
  const result = evaluate(Expr.ONE, Expr.pow(Expr.E, exponent));
  assert.equal(result.displayText, "iπ");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_FORMAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_NESTED_LEFT"));
});

test("形式化反函数保留复指数中的正负号", () => {
  const plus = Rules.simplify(Expr.ln(Expr.pow(Expr.E, Expr.add(Expr.E, Expr.mul(Expr.I, Expr.PI)))));
  const minus = Rules.simplify(Expr.ln(Expr.pow(Expr.E, Expr.sub(Expr.E, Expr.mul(Expr.I, Expr.PI)))));
  assert.equal(Expr.render(plus.expression), "e + iπ");
  assert.equal(Expr.render(minus.expression), "e - iπ");
});

test("基础代数组合规则审计", () => {
  const a = Expr.E;
  const b = Expr.PI;
  const cases = [
    [Expr.neg(Expr.neg(a)), "e"],
    [Expr.add(a, Expr.neg(a)), "0"],
    [Expr.add(Expr.sub(a, b), b), "e"],
    [Expr.sub(a, Expr.neg(b)), "e + π"],
    [Expr.sub(a, Expr.add(a, b)), "-π"],
    [Expr.sub(Expr.add(a, b), a), "π"],
    [Expr.mul(Expr.integer(-1), a), "-e"],
    [Expr.mul(Expr.I, Expr.I), "-1"],
    [Expr.pow(Expr.E, Expr.neg(Expr.mul(Expr.I, Expr.PI))), "-1"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(Expr.render(Rules.simplify(input).expression), expected);
  }
});

test("回归：e^(ln(ln(iπ))) - ln(2) 化简为 ln(iπ / 2)", () => {
  const x = Expr.ln(Expr.ln(Expr.mul(Expr.I, Expr.PI)));
  const result = evaluate(x, Expr.integer(2));
  assert.equal(result.displayText, "ln(iπ / 2)");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "EXP_LN_FORMAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_QUOTIENT_POSITIVE_DENOMINATOR"));
});

test("除法节点保持符号形式并支持近似计算", () => {
  const expression = Expr.div(Expr.mul(Expr.I, Expr.PI), Expr.integer(2));
  assert.equal(Expr.render(expression), "iπ / 2");
  assert.equal(Expr.canonicalKey(expression), "div(mul(const:i,const:pi),int:2)");
  assert.ok(Math.abs(Expr.approximate(expression).im - Math.PI / 2) < 1e-12);
});

test("对数差不与非正分母合并", () => {
  const expression = Expr.sub(Expr.ln(Expr.I), Expr.ln(Expr.integer(-2)));
  const result = Rules.simplify(expression);
  assert.equal(result.steps.some((step) => step.ruleId === "LN_QUOTIENT_POSITIVE_DENOMINATOR"), false);
});

test("欧拉特殊角：e^(iπ / 2) 化简为 i", () => {
  const exponent = Expr.div(Expr.mul(Expr.I, Expr.PI), Expr.integer(2));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "i");
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_HALF_IDENTITY"));
});

test("欧拉特殊角：e^(-iπ / 2) 化简为 -i", () => {
  const exponent = Expr.neg(Expr.div(Expr.mul(Expr.I, Expr.PI), Expr.integer(2)));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "-i");
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_NEG_HALF_IDENTITY"));
});

test("回归：e^(iπ / 2 - ln(2)) 化简为 i / 2", () => {
  const halfIpi = Expr.div(Expr.mul(Expr.I, Expr.PI), Expr.integer(2));
  const exponent = Expr.sub(halfIpi, Expr.ln(Expr.integer(2)));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "i / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_SUB_LN"));
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_HALF_IDENTITY"));
});

test("指数差规则不消去 ln(0)", () => {
  const exponent = Expr.sub(Expr.ONE, Expr.ln(Expr.ZERO));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "e^(1 - ln(0))");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_SUB_LN"), false);
});

test("回归：e - ln(e^e / 2) 化简为 ln(2)", () => {
  const y = Expr.div(Expr.pow(Expr.E, Expr.E), Expr.integer(2));
  const result = evaluate(Expr.ONE, y);
  assert.equal(result.displayText, "ln(2)");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_QUOTIENT"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_NESTED_LEFT"));
});

test("指数商对数形式化规则支持非零负分母", () => {
  const argument = Expr.div(Expr.pow(Expr.E, Expr.E), Expr.integer(-2));
  const result = Rules.simplify(Expr.ln(argument));
  assert.equal(Expr.render(result.expression), "e - ln(-2)");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_EXP_QUOTIENT"));
});

test("指数商对数规则不展开零分母", () => {
  const argument = Expr.div(Expr.pow(Expr.E, Expr.E), Expr.ZERO);
  const result = Rules.simplify(Expr.ln(argument));
  assert.equal(Expr.render(result.expression), "ln(e^(e) / 0)");
  assert.equal(result.steps.some((step) => step.ruleId === "LN_EXP_QUOTIENT"), false);
});

test("回归：e^(ln(i - ln(4))) 化简为 i - ln(4)", () => {
  const argument = Expr.sub(Expr.I, Expr.ln(Expr.integer(4)));
  const result = Rules.simplify(Expr.pow(Expr.E, Expr.ln(argument)));
  assert.equal(Expr.render(result.expression), "i - ln(4)");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"));
});

test("非零判断识别虚部且不消去 ln(0)", () => {
  const complex = Expr.sub(Expr.I, Expr.ln(Expr.integer(4)));
  assert.equal(Rules.isProvablyNonZero(complex), true);

  const zeroArgument = Expr.sub(Expr.ONE, Expr.ONE);
  const result = Rules.simplify(Expr.pow(Expr.E, Expr.ln(zeroArgument)));
  assert.equal(Expr.render(result.expression), "e^(ln(0))");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"), false);
});

test("回归：e^(-ln(4)) 化简为 1 / 4", () => {
  const expression = Expr.pow(Expr.E, Expr.neg(Expr.ln(Expr.integer(4))));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "1 / 4");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_NEG_LN"));
});

test("负对数指数规则不消去 ln(0)", () => {
  const expression = Expr.pow(Expr.E, Expr.neg(Expr.ln(Expr.ZERO)));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(-ln(0))");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_NEG_LN"), false);
});

test("回归：e - ln(e^e / (e - i)) 化简为 ln(e - i)", () => {
  const denominator = Expr.sub(Expr.E, Expr.I);
  const y = Expr.div(Expr.pow(Expr.E, Expr.E), denominator);
  const result = evaluate(Expr.ONE, y);
  assert.equal(result.displayText, "ln(e - i)");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_QUOTIENT"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_NESTED_LEFT"));
});

test("回归：e^(ln(i - ln(iπ))) - i 化简为 -ln(iπ)", () => {
  const argument = Expr.sub(Expr.I, Expr.ln(Expr.mul(Expr.I, Expr.PI)));
  const expression = Expr.sub(Expr.pow(Expr.E, Expr.ln(argument)), Expr.I);
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "-ln(iπ)");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"));
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_NESTED_RIGHT"));
});

test("形式化 e^ln 规则仍阻止明确的零参数", () => {
  const expression = Expr.pow(Expr.E, Expr.ln(Expr.sub(Expr.ONE, Expr.ONE)));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(ln(0))");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"), false);
});
