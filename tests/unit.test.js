const test = require("node:test");
const assert = require("node:assert/strict");

const Expr = require("../src/expression.js");
const Rules = require("../src/formula-rules.js");
const Evaluator = require("../src/evaluator.js");
const Store = require("../src/value-store.js");
const Persistence = require("../src/persistence.js");
const TreeViewport = require("../src/tree-viewport.js");

const evaluate = (x, y) => Evaluator.evaluateEML(x, y);
const initial = () => Store.createInitialState();
const add = (state, evaluation, xId = Store.initialValueId, yId = Store.initialValueId) =>
  Store.addEvaluation(state, evaluation, xId, yId);

test("计算树缩放限制在 40% 到 140%", () => {
  assert.equal(TreeViewport.normalizeScale(0.1), 0.4);
  assert.equal(TreeViewport.normalizeScale(2), 1.4);
  assert.equal(TreeViewport.normalizeScale(0.74), 0.7);
});

test("计算树缩放围绕指定位置并限制位移", () => {
  const dimensions = { viewportWidth: 500, viewportHeight: 300, contentWidth: 1000, contentHeight: 900 };
  const zoomed = TreeViewport.zoomAt({ scale: 1, x: 0, y: 0 }, 0.8, { x: 250, y: 150 }, dimensions);
  assert.deepEqual(zoomed, { scale: 0.8, x: 0, y: 0 });
  const enlarged = TreeViewport.zoomAt({ scale: 1, x: -100, y: -100 }, 1.2, { x: 250, y: 150 }, dimensions);
  assert.deepEqual(enlarged, { scale: 1.2, x: -170, y: -150 });
});

test("计算树平移不会把内容完全移出可视区域", () => {
  const dimensions = { viewportWidth: 500, viewportHeight: 300, contentWidth: 1000, contentHeight: 900 };
  assert.deepEqual(
    TreeViewport.pan({ scale: 1, x: 0, y: 0 }, -5000, -5000, dimensions),
    { scale: 1, x: -500, y: -600 }
  );
  assert.deepEqual(
    TreeViewport.pan({ scale: 1, x: -100, y: -100 }, 5000, 5000, dimensions),
    { scale: 1, x: 0, y: 0 }
  );
});

test("计算树滚轮增量统一转换为像素", () => {
  assert.equal(TreeViewport.wheelDeltaToPixels(5, 0, 300), 5);
  assert.equal(TreeViewport.wheelDeltaToPixels(5, 1, 300), 80);
  assert.equal(TreeViewport.wheelDeltaToPixels(2, 2, 300), 600);
});

test("计算树纵向拖杆与视图位置双向换算", () => {
  const dimensions = { viewportWidth: 400, viewportHeight: 200, contentWidth: 400, contentHeight: 800 };
  assert.deepEqual(TreeViewport.verticalScrollState({ scale: 1, x: 0, y: 0 }, dimensions), { value: 0, disabled: false });
  const bottom = TreeViewport.setVerticalScroll({ scale: 1, x: 0, y: 0 }, 1000, dimensions);
  assert.equal(bottom.y, -600);
  assert.deepEqual(TreeViewport.verticalScrollState(bottom, dimensions), { value: 1000, disabled: false });
  assert.deepEqual(
    TreeViewport.verticalScrollState({ scale: 1, x: 0, y: 0 }, { ...dimensions, contentHeight: 100 }),
    { value: 0, disabled: true }
  );
});

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
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "EULER_FORMULA"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "COS_INTEGER_PI"));
});

test("欧拉公式对一般纯虚指数展开为 cos 与 sin", () => {
  const result = Rules.simplify(Expr.pow(Expr.E, Expr.I));
  assert.equal(Expr.render(result.expression), "cos(1) + i × sin(1)");
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_FORMULA"));
});

test("欧拉公式：e^(2iπ) 经三角函数化简为 1", () => {
  const exponent = Expr.mul(Expr.integer(2), Expr.mul(Expr.I, Expr.PI));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "1");
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_FORMULA"));
  assert.ok(result.steps.some((step) => step.ruleId === "COS_INTEGER_PI"));
  assert.ok(result.steps.some((step) => step.ruleId === "SIN_INTEGER_PI"));
});

test("指数中的 ππ 先合并为 π²", () => {
  const expression = Expr.pow(Expr.E, Expr.neg(Expr.mul(Expr.PI, Expr.PI)));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(-(π^(2)))");
  assert.ok(result.steps.some((step) => step.ruleId === "MUL_SELF_POWER"));
});

test("整数因子置左使嵌套指数显示为 e 的 -2π 次方", () => {
  const innerExponent = Expr.add(
    Expr.ln(Expr.mul(Expr.PI, Expr.integer(2))),
    Expr.mul(Expr.I, Expr.PI)
  );
  const expression = Expr.pow(Expr.E, Expr.pow(Expr.E, innerExponent));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(-2π)");
  assert.ok(result.steps.some((step) => step.ruleId === "MUL_INTEGER_LEFT"));
});

test("π² 作为对数真数时可继续完成嵌套指数化简", () => {
  const innerExponent = Expr.add(
    Expr.ln(Expr.mul(Expr.PI, Expr.PI)),
    Expr.mul(Expr.I, Expr.PI)
  );
  const expression = Expr.pow(Expr.E, Expr.pow(Expr.E, innerExponent));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(-(π^(2)))");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_SUM_LN_FACTOR"));
  assert.equal(Rules.isProvablyNonZero(Expr.pow(Expr.PI, Expr.integer(2))), true);
});

test("对数可识别欧拉展开式及其同分母缩放形式", () => {
  const euler = Expr.add(Expr.cos(Expr.ONE), Expr.mul(Expr.I, Expr.sin(Expr.ONE)));
  const scaledEuler = Expr.add(
    Expr.div(Expr.cos(Expr.ONE), Expr.integer(2)),
    Expr.div(Expr.mul(Expr.I, Expr.sin(Expr.ONE)), Expr.integer(2))
  );
  assert.equal(Expr.render(Rules.simplify(Expr.ln(euler)).expression), "i");
  assert.equal(Expr.render(Rules.simplify(Expr.ln(scaledEuler)).expression), "i - ln(2)");
});

test("正实数对数之和可合并为乘积对数", () => {
  const result = Rules.simplify(Expr.add(Expr.ln(Expr.PI), Expr.ln(Expr.integer(2))));
  assert.equal(Expr.render(result.expression), "ln(2π)");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_PRODUCT_POSITIVE"));
});

test("回归：嵌套欧拉展开与对数可化简为 1", () => {
  const euler = Expr.add(Expr.cos(Expr.ONE), Expr.mul(Expr.I, Expr.sin(Expr.ONE)));
  const scaledEuler = Expr.add(
    Expr.div(Expr.cos(Expr.ONE), Expr.integer(2)),
    Expr.div(Expr.mul(Expr.I, Expr.sin(Expr.ONE)), Expr.integer(2))
  );
  const exponent = Expr.sub(
    Expr.sub(Expr.I, Expr.sub(Expr.sub(Expr.I, Expr.ln(Expr.mul(Expr.I, Expr.PI))), Expr.ln(euler))),
    Expr.ln(scaledEuler)
  );
  const result = Rules.simplify(Expr.pow(Expr.E, Expr.pow(Expr.E, exponent)));
  assert.equal(Expr.render(result.expression), "1");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_EULER_FORMAL"));
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_FORMULA"));
});

test("回归：指数中的欧拉形式乘积与 iπ 对数化简为 π", () => {
  const euler = Expr.add(Expr.cos(Expr.ONE), Expr.mul(Expr.I, Expr.sin(Expr.ONE)));
  const exponent = Expr.sub(
    Expr.add(Expr.I, Expr.ln(Expr.mul(Expr.I, Expr.PI))),
    Expr.ln(Expr.mul(euler, Expr.I))
  );
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "π");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_EULER_PRODUCT_FORMAL"));
  assert.ok(result.steps.some((step) => step.ruleId === "LN_I_REAL_PRODUCT"));
});

test("加减树中夹着实数项的纯虚项仍可合并", () => {
  const halfPi = Expr.div(Expr.PI, Expr.integer(2));
  const expression = Expr.sub(
    Expr.add(Expr.add(Expr.I, Expr.ln(Expr.PI)), Expr.mul(Expr.I, halfPi)),
    Expr.mul(Expr.I, Expr.add(Expr.ONE, halfPi))
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "ln(π)");
  assert.ok(result.steps.some((step) => step.ruleId === "ADD_COLLECT_IMAGINARY_TERMS"));
});

test("U05 π 和 ln 保持符号形式", () => {
  const result = evaluate(Expr.PI, Expr.ln(Expr.integer(2)));
  assert.equal(result.displayText, "e^(π) - ln(ln(2))");
  assert.doesNotMatch(result.displayText, /3\.14|0\.69/);
});

test("U06 i 保持符号形式并按欧拉公式展开", () => {
  const result = evaluate(Expr.I, Expr.ONE);
  assert.equal(result.displayText, "cos(1) + i × sin(1)");
  assert.doesNotMatch(result.displayText, /[0-9]\.[0-9]/);
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

test("重复添加同一公式会刷新计算步骤", () => {
  const evaluation = evaluate(Expr.ONE, Expr.ONE);
  const first = add(initial(), evaluation);
  const refreshedSteps = [{ ruleId: "REFRESHED", before: "旧", after: "新" }];
  const second = add(first.state, { ...evaluation, rewriteSteps: refreshedSteps });
  const derivationId = second.state.values[first.resultValueId].derivationIds[0];
  assert.equal(second.status, "duplicate-formula");
  assert.deepEqual(second.state.derivations[derivationId].rewriteSteps, refreshedSteps);
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
  assert.equal(tree.derivations[0].y.type, "value");
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

test("结果等于自身的公式不阻止删除数值", () => {
  const state = initial();
  const zeroId = Store.valueIdFor(Expr.canonicalKey(Expr.ZERO));
  state.values[zeroId] = {
    id: zeroId,
    canonicalExpression: Expr.ZERO,
    canonicalKey: Expr.canonicalKey(Expr.ZERO),
    displayText: "0",
    protected: false,
    derivationIds: ["self-zero"],
    createdAt: new Date().toISOString(),
  };
  state.valueOrder.push(zeroId);
  state.derivations["self-zero"] = {
    id: "self-zero",
    operation: "EML_COMPOSITION",
    inputValueIds: [zeroId],
    inputNames: ["x"],
    functionDefinition: "identity(x) = x",
    resultValueId: zeroId,
    directFormula: "identity(0) = 0",
    rawExpression: Expr.ZERO,
    rewriteSteps: [],
  };
  assert.equal(Store.isReferenced(state, zeroId), false);
  assert.equal(Store.deleteValue(state, zeroId).status, "deleted");
});

test("重复计算已知结果时不保存循环公式来源", () => {
  const state = initial();
  const zeroId = Store.valueIdFor(Expr.canonicalKey(Expr.ZERO));
  state.values[zeroId] = {
    id: zeroId,
    canonicalExpression: Expr.ZERO,
    canonicalKey: Expr.canonicalKey(Expr.ZERO),
    displayText: "0",
    protected: false,
    derivationIds: [],
    createdAt: new Date().toISOString(),
  };
  state.valueOrder.push(zeroId);
  const evaluation = {
    ok: true,
    canonicalKey: Expr.canonicalKey(Expr.ZERO),
    resultExpression: Expr.ZERO,
    xExpression: Expr.ZERO,
    yExpression: Expr.ZERO,
    displayText: "0",
    rawExpression: Expr.ZERO,
    directFormula: "EML(0, 0) = 0",
    rewriteSteps: [],
  };
  const added = Store.addEvaluation(state, evaluation, zeroId, zeroId);
  assert.equal(added.status, "cyclic-formula");
  assert.equal(added.state.values[zeroId].derivationIds.length, 0);
});

test("双循环数值可通过级联删除一起移除", () => {
  const state = initial();
  const aId = Store.valueIdFor("cycle-a");
  const bId = Store.valueIdFor("cycle-b");
  for (const [id, label, derivationId] of [[aId, "a", "cycle-a"], [bId, "b", "cycle-b"]]) {
    state.values[id] = { id, canonicalExpression: Expr.ZERO, canonicalKey: id, displayText: label, protected: false, derivationIds: [derivationId], createdAt: new Date().toISOString() };
    state.valueOrder.push(id);
  }
  state.derivations["cycle-a"] = { id: "cycle-a", operation: "EML", xValueId: bId, yValueId: bId, resultValueId: aId, directFormula: "a = b", rawExpression: Expr.ZERO, rewriteSteps: [] };
  state.derivations["cycle-b"] = { id: "cycle-b", operation: "EML", xValueId: aId, yValueId: aId, resultValueId: bId, directFormula: "b = a", rawExpression: Expr.ZERO, rewriteSteps: [] };
  assert.deepEqual(new Set(Store.deletionClosure(state, aId)), new Set([aId, bId]));
  const deleted = Store.deleteValueCascade(state, aId);
  assert.equal(deleted.status, "deleted");
  assert.equal(deleted.state.values[aId], undefined);
  assert.equal(deleted.state.values[bId], undefined);
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
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_FORMULA"));
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

test("回归：e^(ln(ln(iπ))) - ln(2) 保留主值对数的虚部", () => {
  const x = Expr.ln(Expr.ln(Expr.mul(Expr.I, Expr.PI)));
  const result = evaluate(x, Expr.integer(2));
  assert.equal(result.displayText, "ln(π) + iπ / 2 - ln(2)");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "EXP_LN_FORMAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_I_REAL_PRODUCT"));
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

test("欧拉公式与三角函数标准值：e^(iπ / 2) 化简为 i", () => {
  const exponent = Expr.div(Expr.mul(Expr.I, Expr.PI), Expr.integer(2));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "i");
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_FORMULA"));
  assert.ok(result.steps.some((step) => step.ruleId === "SIN_HALF_INTEGER_PI"));
});

test("欧拉公式与三角函数标准值：e^(-iπ / 2) 化简为 -i", () => {
  const exponent = Expr.neg(Expr.div(Expr.mul(Expr.I, Expr.PI), Expr.integer(2)));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "-i");
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_FORMULA"));
  assert.ok(result.steps.some((step) => step.ruleId === "SIN_HALF_INTEGER_PI"));
});

test("基础对数：ln(√(e)) 化简为 1 / 2", () => {
  const result = Rules.simplify(Expr.ln(Expr.sqrt(Expr.E)));
  assert.equal(Expr.render(result.expression), "1 / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_SQRT_E"));
});

test("回归：e^(iπ / 2 - ln(2)) 化简为 i / 2", () => {
  const halfIpi = Expr.div(Expr.mul(Expr.I, Expr.PI), Expr.integer(2));
  const exponent = Expr.sub(halfIpi, Expr.ln(Expr.integer(2)));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "i / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_SUB_LN"));
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_FORMULA"));
});

test("回归：e^(ln(e^e × √2 / 2) - e) 化简为 √2 / 2", () => {
  const expression = Expr.pow(
    Expr.E,
    Expr.sub(
      Expr.ln(Expr.div(Expr.mul(Expr.pow(Expr.E, Expr.E), Expr.sqrt(Expr.integer(2))), Expr.integer(2))),
      Expr.E
    )
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "√(2) / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_LN_SUB"));
  assert.ok(result.steps.some((step) => step.ruleId === "DIV_COMMON_FACTOR_CANCEL"));
});

test("指数对数差规则不消去 ln(0)", () => {
  const expression = Expr.pow(Expr.E, Expr.sub(Expr.ln(Expr.ZERO), Expr.E));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(ln(0) - e)");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_LN_SUB"), false);
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
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_EXP_QUOTIENT_FORMAL"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_NESTED_LEFT"));
});

test("回归：e - ln(e^e × i) 化简为 -iπ / 2", () => {
  const y = Expr.mul(Expr.pow(Expr.E, Expr.E), Expr.I);
  const result = evaluate(Expr.ONE, y);
  assert.equal(result.displayText, "-iπ / 2");
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_REAL_EXP_PRODUCT"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "LN_I"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "SUB_ADDED_LEFT"));
  assert.ok(result.rewriteSteps.some((step) => step.ruleId === "NEG_DIV"));
});

test("乘积对数规则不展开复指数或零因子", () => {
  const complexExponent = Expr.mul(Expr.I, Expr.PI);
  const complexResult = Rules.simplify(Expr.ln(Expr.mul(Expr.pow(Expr.E, complexExponent), Expr.I)));
  const zeroResult = Rules.simplify(Expr.ln(Expr.mul(Expr.pow(Expr.E, Expr.E), Expr.ZERO)));
  assert.equal(complexResult.steps.some((step) => step.ruleId === "LN_REAL_EXP_PRODUCT"), false);
  assert.equal(zeroResult.steps.some((step) => step.ruleId === "LN_REAL_EXP_PRODUCT"), false);
});

test("指数商对数规则对非零分母使用形式化展开", () => {
  const positive = Rules.simplify(Expr.ln(Expr.div(Expr.pow(Expr.E, Expr.E), Expr.integer(2))));
  assert.equal(Expr.render(positive.expression), "e - ln(2)");
  assert.ok(positive.steps.some((step) => step.ruleId === "LN_EXP_QUOTIENT_FORMAL"));

  const negative = Rules.simplify(Expr.ln(Expr.div(Expr.pow(Expr.E, Expr.E), Expr.integer(-2))));
  assert.equal(Expr.render(negative.expression), "e - ln(-2)");

  const complex = Rules.simplify(Expr.ln(Expr.div(Expr.pow(Expr.E, Expr.E), Expr.mul(Expr.I, Expr.PI))));
  assert.equal(Expr.render(complex.expression), "e - (ln(π) + iπ / 2)");
  assert.ok(complex.steps.some((step) => step.ruleId === "LN_EXP_QUOTIENT_FORMAL"));
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

test("回归：纯虚数系数相减后仍可消去 e^(ln(...))", () => {
  const argument = Expr.sub(Expr.I, Expr.div(Expr.I, Expr.integer(2)));
  assert.equal(Rules.isProvablyNonZero(argument), true);

  const result = Rules.simplify(Expr.pow(Expr.E, Expr.ln(argument)));
  assert.equal(Expr.render(result.expression), "i / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"));
});

test("回归：多层纯虚数嵌套不会阻断外层 e^(ln(...)) 化简", () => {
  let expression = Expr.pow(Expr.E, Expr.ln(Expr.sub(Expr.I, Expr.div(Expr.I, Expr.integer(2)))));
  for (let index = 0; index < 12; index += 1) {
    expression = Expr.pow(Expr.E, Expr.ln(Expr.sub(Expr.I, Expr.sub(expression, Expr.I))));
  }

  const result = Rules.simplify(expression);
  assert.equal(result.limitReached, undefined);
  assert.equal(Expr.render(result.expression).includes("e^(ln"), false);
  assert.ok(result.steps.filter((step) => step.ruleId === "EXP_LN_FORMAL").length >= 13);
});

test("多层纯虚数加减可作为指数对数合并规则的非零参数", () => {
  const nestedImaginary = Expr.sub(
    Expr.sub(Expr.I, Expr.neg(Expr.div(Expr.I, Expr.integer(2)))),
    Expr.add(Expr.I, Expr.I)
  );
  assert.equal(Rules.isProvablyNonZero(nestedImaginary), true);

  const expression = Expr.pow(
    Expr.E,
    Expr.add(Expr.ln(nestedImaginary), Expr.ln(Expr.div(Expr.I, Expr.integer(2))))
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "1 / 4");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_ADD_LN"));
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

test("回归：EML(1, e^e/(e-i)) 数值上等于 ln(e-i)（严格规则下不再强行符号化简，但无 2πi 分支错误）", () => {
  const denominator = Expr.sub(Expr.E, Expr.I);
  const y = Expr.div(Expr.pow(Expr.E, Expr.E), denominator);
  const result = evaluate(Expr.ONE, y);
  const expected = Expr.approximate(Expr.ln(denominator));
  const actual = Expr.approximate(result.resultExpression);
  assert.ok(Math.abs(actual.re - expected.re) < 1e-9);
  assert.ok(Math.abs(actual.im - expected.im) < 1e-9);
});

test("回归：e^(ln(i - ln(iπ))) - i 数值上等于 -ln(iπ)（严格零保护下不再强行化简，但无分支错误）", () => {
  const argument = Expr.sub(Expr.I, Expr.ln(Expr.mul(Expr.I, Expr.PI)));
  const expression = Expr.sub(Expr.pow(Expr.E, Expr.ln(argument)), Expr.I);
  const result = Rules.simplify(expression);
  const expected = Expr.approximate(Expr.neg(Expr.ln(Expr.mul(Expr.I, Expr.PI))));
  const actual = Expr.approximate(result.expression);
  assert.ok(Math.abs(actual.re - expected.re) < 1e-9);
  assert.ok(Math.abs(actual.im - expected.im) < 1e-9);
});

test("形式化 e^ln 规则仍阻止明确的零参数", () => {
  const expression = Expr.pow(Expr.E, Expr.ln(Expr.sub(Expr.ONE, Expr.ONE)));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(ln(0))");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"), false);
});

test("形式化 e^ln 规则不要求证明嵌套复数参数非零", () => {
  const argument = Expr.sub(Expr.I, Expr.ln(Expr.div(Expr.I, Expr.integer(2))));
  assert.equal(Rules.isProvablyNonZero(argument), false);

  const result = Rules.simplify(Expr.pow(Expr.E, Expr.ln(argument)));
  assert.equal(Expr.render(result.expression), "i - ln(i / 2)");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_LN_FORMAL"));
});

test("回归：ln(-i) - ln(1 / (iπ)) 展开 iπ 的主值对数", () => {
  const ipi = Expr.mul(Expr.I, Expr.PI);
  const expression = Expr.sub(
    Expr.ln(Expr.neg(Expr.I)),
    Expr.ln(Expr.div(Expr.ONE, ipi))
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "ln(-i) + ln(π) + iπ / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_RECIPROCAL"));
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_NEGATIVE"));
});

test("对数倒数规则不化简零分母", () => {
  const expression = Expr.ln(Expr.div(Expr.ONE, Expr.ZERO));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "ln(1 / 0)");
  assert.equal(result.steps.some((step) => step.ruleId === "LN_RECIPROCAL"), false);
});

test("回归：e^(ln(-i) + ln(iπ)) 化简为 π", () => {
  const exponent = Expr.add(
    Expr.ln(Expr.neg(Expr.I)),
    Expr.ln(Expr.mul(Expr.I, Expr.PI))
  );
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "π");
  assert.ok(result.steps.some((step) => step.ruleId === "LN_I_REAL_PRODUCT"));
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_SUM_LN_FACTOR"));
  assert.ok(result.steps.some((step) => step.ruleId === "MUL_IMAGINARY_FACTORS"));
  assert.ok(result.steps.some((step) => step.ruleId === "NEG_DOUBLE"));
});

test("对数和指数规则不消去明确的零参数", () => {
  const exponent = Expr.add(Expr.ln(Expr.ZERO), Expr.ln(Expr.ONE));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "e^(ln(0))");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_ADD_LN"), false);
});

test("回归：e^(1 / 2 + ln(2)) 化简为 2 × √(e)", () => {
  const half = Expr.div(Expr.ONE, Expr.integer(2));
  const expression = Expr.pow(Expr.E, Expr.add(half, Expr.ln(Expr.integer(2))));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "2 × √(e)");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_SUM_LN_FACTOR"));
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_HALF"));
});

test("指数和对数相加规则支持 ln 项在左侧", () => {
  const half = Expr.div(Expr.ONE, Expr.integer(2));
  const expression = Expr.pow(Expr.E, Expr.add(Expr.ln(Expr.integer(2)), half));
  assert.equal(Expr.render(Rules.simplify(expression).expression), "2 × √(e)");
});

test("指数和对数相加规则不消去 ln(0)", () => {
  const half = Expr.div(Expr.ONE, Expr.integer(2));
  const expression = Expr.pow(Expr.E, Expr.add(half, Expr.ln(Expr.ZERO)));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "e^(1 / 2 + ln(0))");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_SUM_LN_FACTOR"), false);
});

test("回归：e^(ln(2) × 1 / 2) 化简为 √(2)", () => {
  const exponent = Expr.div(Expr.mul(Expr.ln(Expr.integer(2)), Expr.ONE), Expr.integer(2));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "√(2)");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_HALF_LN"));
});

test("半对数指数支持乘以结构化二分之一", () => {
  const half = Expr.div(Expr.ONE, Expr.integer(2));
  const exponent = Expr.mul(Expr.ln(Expr.integer(2)), half);
  assert.equal(Expr.render(Rules.simplify(Expr.pow(Expr.E, exponent)).expression), "√(2)");
});

test("半对数指数不消去 ln(0)", () => {
  const exponent = Expr.div(Expr.ln(Expr.ZERO), Expr.integer(2));
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "e^(ln(0) / 2)");
  assert.equal(result.steps.some((step) => step.ruleId === "EXP_HALF_LN"), false);
});

test("回归：2 / -i 化简为 2i", () => {
  const result = Rules.simplify(Expr.div(Expr.integer(2), Expr.neg(Expr.I)));
  assert.equal(Expr.render(result.expression), "2i");
  assert.ok(result.steps.some((step) => step.ruleId === "DIV_NEG_I"));
});

test("根式分母有理化：1 / √2 化简为 √2 / 2", () => {
  const result = Rules.simplify(Expr.div(Expr.ONE, Expr.sqrt(Expr.integer(2))));
  assert.equal(Expr.render(result.expression), "√(2) / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "DIV_RATIONALIZE_SQRT"));
});

test("根式分母有理化不改写 √0 分母", () => {
  const result = Rules.simplify(Expr.div(Expr.ONE, Expr.sqrt(Expr.ZERO)));
  assert.equal(Expr.render(result.expression), "1 / √(0)");
  assert.equal(result.steps.some((step) => step.ruleId === "DIV_RATIONALIZE_SQRT"), false);
});

test("纯虚数系数归一化让嵌套 i 乘 i 和减负数可继续化简", () => {
  const product = Rules.simplify(Expr.mul(Expr.div(Expr.I, Expr.integer(2)), Expr.I));
  assert.equal(Expr.render(product.expression), "-1 / 2");
  assert.ok(product.steps.some((step) => step.ruleId === "I_TIMES_DIV"));
  assert.ok(product.steps.some((step) => step.ruleId === "I_SQUARED"));

  const difference = Rules.simplify(
    Expr.sub(Expr.mul(Expr.I, Expr.PI), Expr.neg(Expr.div(Expr.I, Expr.integer(2))))
  );
  assert.equal(Expr.render(difference.expression), "i × (π + 1 / 2)");
  assert.ok(difference.steps.some((step) => step.ruleId === "SUB_NEGATIVE_FRACTION"));
  assert.ok(difference.steps.some((step) => step.ruleId === "ADD_COLLECT_IMAGINARY_TERMS"));
});

test("整数分数乘法继续化简双重负号", () => {
  const expression = Expr.neg(Expr.mul(
    Expr.div(Expr.integer(-1), Expr.integer(2)),
    Expr.div(Expr.ONE, Expr.integer(2))
  ));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "1 / 4");
  assert.ok(result.steps.some((step) => step.ruleId === "INTEGER_FRACTION_MUL"));
});

test("整数分数加减与约分支持负分数", () => {
  const expression = Expr.sub(
    Expr.div(Expr.ONE, Expr.integer(4)),
    Expr.div(Expr.integer(-1), Expr.integer(4))
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "1 / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "INTEGER_FRACTION_SUB"));
  assert.ok(result.steps.some((step) => step.ruleId === "INTEGER_FRACTION_REDUCE"));
});

test("回归：用户长式的残余代数表达式化简为 π", () => {
  const shared = Expr.sub(Expr.div(Expr.integer(3), Expr.integer(2)), Expr.sub(Expr.ONE, Expr.PI));
  const expression = Expr.sub(
    Expr.sub(
      Expr.sub(
        Expr.add(Expr.add(Expr.I, Expr.div(Expr.integer(-1), Expr.integer(4))), Expr.mul(shared, Expr.div(Expr.ONE, Expr.integer(2)))),
        Expr.add(Expr.add(Expr.I, Expr.div(Expr.ONE, Expr.integer(2))), Expr.mul(shared, Expr.div(Expr.integer(-1), Expr.integer(2))))
      ),
      Expr.div(Expr.integer(-1), Expr.integer(4))
    ),
    Expr.ZERO
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "π");
  assert.ok(result.steps.some((step) => step.ruleId === "ADD_SUB_TERM_CANCEL"));
  assert.ok(result.steps.some((step) => step.ruleId === "ADD_SAME_HALF"));
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_NESTED_RATIONAL_FOLD"));
});

test("纯虚数系数规则不改写普通实数加法", () => {
  const result = Rules.simplify(Expr.add(Expr.PI, Expr.integer(2)));
  assert.equal(Expr.render(result.expression), "π + 2");
  assert.equal(result.steps.some((step) => step.ruleId === "ADD_IMAGINARY_COEFFICIENT"), false);
});

test("除以 i 时保留正确的负号", () => {
  const result = Rules.simplify(Expr.div(Expr.integer(2), Expr.I));
  assert.equal(Expr.render(result.expression), "-2i");
  assert.ok(result.steps.some((step) => step.ruleId === "DIV_I"));
});

test("i / -i 继续化简为 -1", () => {
  assert.equal(Expr.render(Rules.simplify(Expr.div(Expr.I, Expr.neg(Expr.I))).expression), "-1");
});

test("回归：iπ × e^i / (e^i × i) 约分为 π", () => {
  const exponential = Expr.pow(Expr.E, Expr.I);
  const expression = Expr.div(
    Expr.mul(Expr.mul(Expr.I, Expr.PI), exponential),
    Expr.mul(exponential, Expr.I)
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "π");
  assert.ok(result.steps.some((step) => step.ruleId === "DIV_COMMON_FACTOR_CANCEL"));
});

test("回归：e^(i - ln(2) - i × (1 - π / 2)) 化简为 i / 2", () => {
  const exponent = Expr.sub(
    Expr.sub(Expr.I, Expr.ln(Expr.integer(2))),
    Expr.mul(Expr.I, Expr.sub(Expr.ONE, Expr.div(Expr.PI, Expr.integer(2))))
  );
  const result = Rules.simplify(Expr.pow(Expr.E, exponent));
  assert.equal(Expr.render(result.expression), "i / 2");
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_I_UNIT_PRODUCT"));
});

test("回归：嵌套 e^(ln(ln(√2)) + ln(√2)) 化简为 √2 的 √2 次方", () => {
  const squareRootOfTwo = Expr.sqrt(Expr.integer(2));
  const expression = Expr.pow(
    Expr.E,
    Expr.pow(Expr.E, Expr.add(Expr.ln(Expr.ln(squareRootOfTwo)), Expr.ln(squareRootOfTwo)))
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "√(2)^(√(2))");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_ADD_LN"));
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_PRODUCT_LN"));
});

test("回归：双层指数中的 -i(1-π) 化简为外层负号", () => {
  const logarithm = Expr.ln(Expr.ln(Expr.sqrt(Expr.integer(2))));
  const innerExponent = Expr.add(Expr.I, logarithm);
  const expression = Expr.pow(
    Expr.E,
    Expr.sub(
      Expr.pow(Expr.E, innerExponent),
      Expr.mul(Expr.I, Expr.sub(Expr.ONE, Expr.PI))
    )
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "-(e^(ln(√(2)) × (cos(1) + i × sin(1)) - i))");
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_SUM_LN_FACTOR"));
  assert.ok(result.steps.some((step) => step.ruleId === "EXP_SUB_I_ONE_MINUS_PI"));
});

test("TeX 数学渲染覆盖上标、根式、分式和数学常量", () => {
  const expression = Expr.pow(Expr.sqrt(Expr.div(Expr.integer(2), Expr.E)), Expr.sqrt(Expr.integer(2)));
  const tex = Expr.renderTex(expression);
  assert.match(tex, /\\sqrt/);
  assert.match(tex, /\\frac/);
  assert.match(tex, /\^\{/);
  assert.match(tex, /e/);
  assert.equal(tex.includes("^("), false);
  assert.equal(Expr.renderTex(Expr.neg(Expr.pow(Expr.PI, Expr.integer(2)))), "-{\\pi}^{2}");
});

test("sin、cos 表达式支持符号显示、近似计算和保存校验", () => {
  const expression = Expr.sin(Expr.ONE);
  const cosine = Expr.cos(Expr.ONE);
  assert.equal(Expr.render(expression), "sin(1)");
  assert.equal(Expr.render(cosine), "cos(1)");
  assert.ok(Math.abs(Expr.approximate(expression).re - Math.sin(1)) < 1e-12);
  assert.ok(Math.abs(Expr.approximate(cosine).re - Math.cos(1)) < 1e-12);
  assert.equal(Expr.isValidExpression(expression), true);
  assert.equal(Expr.isValidExpression(cosine), true);
});

test("回归：(e^i - e^(-i)) / (2i) 化简为 sin(1)", () => {
  const numerator = Expr.sub(Expr.pow(Expr.E, Expr.I), Expr.pow(Expr.E, Expr.neg(Expr.I)));
  const denominator = Expr.mul(Expr.integer(2), Expr.I);
  const result = Rules.simplify(Expr.div(numerator, denominator));
  assert.equal(Expr.render(result.expression), "sin(1)");
  assert.ok(result.steps.some((step) => step.ruleId === "EULER_SINE"));
});

test("欧拉正弦公式支持一般符号参数", () => {
  const positive = Expr.mul(Expr.I, Expr.E);
  const numerator = Expr.sub(Expr.pow(Expr.E, positive), Expr.pow(Expr.E, Expr.neg(positive)));
  const result = Rules.simplify(Expr.div(numerator, Expr.mul(Expr.I, Expr.integer(2))));
  assert.equal(Expr.render(result.expression), "sin(e)");
});

test("欧拉正弦公式不匹配错误分母", () => {
  const numerator = Expr.sub(Expr.pow(Expr.E, Expr.I), Expr.pow(Expr.E, Expr.neg(Expr.I)));
  const expression = Expr.div(numerator, Expr.integer(2));
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "(cos(1) - cos(-1) + i × (sin(1) - sin(-1))) / 2");
  assert.equal(result.steps.some((step) => step.ruleId === "EULER_SINE"), false);
});

test("复数乘法计算树中的负号显示无歧义", () => {
  const nestedProduct = Expr.neg(Expr.mul(Expr.I, Expr.mul(Expr.I, Expr.PI)));
  const doubleNegative = Expr.neg(Expr.neg(Expr.PI));
  assert.equal(Expr.render(nestedProduct), "-(i × iπ)");
  assert.equal(Expr.render(doubleNegative), "-(-π)");
});

// ─────────────────────────────────────────────────────────────
// 减法去括号规则族（v1.3.0）
//
// 背景：化简器原本对「减法嵌套 / 去括号」整族失明 —— `1 - (e - 1)` 这类表达式
// 会 0 步重写、原地不动。根因是规则库只有匹配相同子式的特例规则
// （`SUB_NESTED_LEFT`：a - (a - b) = b），缺少通用的去括号规则，
// 于是任何「被减数与内层不相等」的嵌套减法都卡死。
// ─────────────────────────────────────────────────────────────

test("回归：a - (b - c) 去括号后可继续合并整数", () => {
  const cases = [
    [Expr.sub(Expr.ONE, Expr.sub(Expr.E, Expr.ONE)), "2 - e"],
    [Expr.sub(Expr.integer(2), Expr.sub(Expr.E, Expr.ONE)), "3 - e"],
    [Expr.sub(Expr.ONE, Expr.sub(Expr.E, Expr.integer(2))), "3 - e"],
    [Expr.sub(Expr.ZERO, Expr.sub(Expr.E, Expr.ONE)), "1 - e"],
    // 被减数与内层减数同为整数时改走 (a - b) + c，否则会卡在「2 + e - 1」
    [Expr.sub(Expr.integer(2), Expr.sub(Expr.ONE, Expr.E)), "1 + e"],
    // 多重嵌套需要两轮折叠
    [Expr.sub(Expr.ONE, Expr.sub(Expr.sub(Expr.E, Expr.ONE), Expr.ONE)), "3 - e"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(Expr.render(Rules.simplify(input).expression), expected, Expr.render(input));
  }
});

test("回归：-(a - b) 化为 b - a", () => {
  assert.equal(Expr.render(Rules.simplify(Expr.neg(Expr.sub(Expr.E, Expr.ONE))).expression), "1 - e");
  assert.equal(Expr.render(Rules.simplify(Expr.neg(Expr.sub(Expr.ONE, Expr.E))).expression), "e - 1");
});

test("回归：(a - b) - (a - c) 化为 c - b", () => {
  const result = Rules.simplify(Expr.sub(Expr.sub(Expr.E, Expr.ONE), Expr.sub(Expr.E, Expr.integer(2))));
  assert.equal(Expr.render(result.expression), "1");
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_NESTED_SAME_LEFT"));
});

test("回归：(a + b) - (a - c) 化为 b + c", () => {
  const expression = Expr.sub(
    Expr.add(Expr.I, Expr.ln(Expr.integer(2))),
    Expr.sub(Expr.I, Expr.ln(Expr.integer(3)))
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "ln(6)");
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_ADD_SUB_SAME_LEFT"));
});

test("回归：(a - b) - (a + c) 化为 -(b + c)", () => {
  const expression = Expr.sub(
    Expr.sub(Expr.I, Expr.div(Expr.ONE, Expr.integer(2))),
    Expr.add(Expr.I, Expr.ln(Expr.integer(2)))
  );
  const result = Rules.simplify(expression);
  assert.equal(Expr.render(result.expression), "-(1 / 2 + ln(2))");
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_NESTED_ADD_SAME_LEFT"));
});

test("回归：a - (b + c) 去括号后可继续合并整数", () => {
  const result = Rules.simplify(Expr.sub(Expr.integer(2), Expr.add(Expr.E, Expr.ONE)));
  assert.equal(Expr.render(result.expression), "1 - e");
  assert.ok(result.steps.some((step) => step.ruleId === "SUB_SUM_FOLD"));
});

test("减法去括号只在能立刻合并整数时改写", () => {
  // 全符号情形得不到更简的形式，应保持原样：
  // 否则只是等长改写（π - (i - e) → (π + e) - i），白白污染化简步骤。
  const symbolic = Rules.simplify(Expr.sub(Expr.PI, Expr.sub(Expr.I, Expr.E)));
  assert.equal(Expr.render(symbolic.expression), "π - (i - e)");
  assert.equal(symbolic.steps.length, 0);

  // 已有特例规则覆盖的场景仍走原规则，保持更短路径
  assert.ok(
    Rules.simplify(Expr.sub(Expr.E, Expr.sub(Expr.E, Expr.ONE))).steps
      .some((step) => step.ruleId === "SUB_NESTED_LEFT")
  );
  assert.ok(
    Rules.simplify(Expr.sub(Expr.ONE, Expr.add(Expr.E, Expr.ONE))).steps
      .some((step) => step.ruleId === "SUB_ADDED_LEFT")
  );
});

test("减法去括号不改变原表达式的数值", () => {
  // 用复数近似值交叉验证改写前后的值：代数推导若写错，这里会立刻暴露
  const cases = [
    Expr.sub(Expr.ONE, Expr.sub(Expr.E, Expr.ONE)),
    Expr.neg(Expr.sub(Expr.E, Expr.ONE)),
    Expr.sub(Expr.integer(2), Expr.sub(Expr.ONE, Expr.E)),
    Expr.sub(Expr.sub(Expr.E, Expr.ONE), Expr.sub(Expr.E, Expr.integer(2))),
    Expr.sub(Expr.integer(2), Expr.add(Expr.E, Expr.ONE)),
    Expr.sub(Expr.PI, Expr.sub(Expr.I, Expr.E)),
    Expr.neg(Expr.sub(Expr.mul(Expr.I, Expr.PI), Expr.E)),
  ];
  for (const input of cases) {
    const before = Expr.approximate(input);
    const after = Expr.approximate(Rules.simplify(input).expression);
    assert.ok(before && after, `近似值不可用：${Expr.render(input)}`);
    assert.ok(Math.abs(before.re - after.re) < 1e-9, `实部不一致：${Expr.render(input)}`);
    assert.ok(Math.abs(before.im - after.im) < 1e-9, `虚部不一致：${Expr.render(input)}`);
  }
});
