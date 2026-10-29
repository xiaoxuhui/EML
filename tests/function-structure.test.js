const test = require("node:test");
const assert = require("node:assert/strict");
const Structure = require("../src/function-structure.js");
const C = require("../src/eml-composition.js");
const E = require("../src/expression.js");
const parameter = (name) => ({ type: "parameter", name });
const call = (name, ...args) => ({ type: "call", name, arguments: args });
const definition = (text) => C.parseDefinition(text).definition;

test("空 EML 保留 X/Y 灰槽，结构构建不修改草稿", () => {
  const draft = { type: "eml", left: null, right: null };
  const before = JSON.stringify(draft);
  const tree = Structure.expand(draft);
  assert.equal(tree.label, "EML");
  assert.deepEqual(tree.inputs.map((input) => [input.label, input.node.type]), [["X", "hole"], ["Y", "hole"]]);
  assert.equal(JSON.stringify(draft), before);
});

test("自定义函数展示参数并以实参替换函数体", () => {
  const f = definition("f(x) = EML(x, 1)");
  const tree = Structure.expand(call("f", parameter("y")), [f]);
  assert.equal(tree.inputs[0].label, "x");
  assert.equal(tree.inputs[0].node.label, "y");
  assert.equal(tree.body.label, "EML");
  assert.equal(tree.body.inputs[0].node.label, "y");
  assert.equal(tree.body.inputs[1].node.label, "1");
});

test("数值式计算树直接使用EML，不暴露内部用户函数名", () => {
  const f = definition("f(x) = EML(x, 1)");
  const g = definition("g(y) = EML(f(y), f(y))");
  const tree = Structure.toEmlTree(Structure.expand(call("g", parameter("z")), [f, g]));
  assert.equal(tree.type, "eml");
  assert.equal(tree.inputs[0].type, "eml");
  assert.equal(tree.inputs[1].inputs[0].label, "z");
  assert.doesNotMatch(JSON.stringify(tree), /"[fg]"|"call"/);
  assert.doesNotMatch(tree.result, /\?/);
  assert.equal(tree.inputs[0].result, "e^(z)");
});

test("未赋值参数沿用公式库化简，但不能保存为数值或假定非零", () => {
  const Rules = require("../src/formula-rules.js");
  const Properties = require("../src/expression-properties.js");
  const x = E.symbol("x");
  assert.equal(E.isValidExpression(x), false);
  assert.equal(Properties.isProvablyNonZero(x), false);
  assert.equal(E.render(Rules.simplify(E.sub(x, x)).expression), "0");
  assert.equal(E.render(Rules.simplify(E.div(x, x)).expression), "x / x");
  const f = definition("f(x) = EML(x,1)");
  const tree = Structure.toEmlTree(Structure.expand(call("f", parameter("x")), [f]));
  assert.equal(tree.result, "e^(x)");
  assert.equal(E.renderTex(tree.expression), "{e}^{x}");
});

test("多层同名参数采用词法绑定，兄弟重复调用均展开", () => {
  const f = definition("f(x) = EML(x, 1)");
  const g = definition("g(x) = EML(f(x), f(x))");
  const tree = Structure.expand(call("g", parameter("z")), [f, g]);
  for (const input of tree.body.inputs) {
    assert.equal(input.node.body.inputs[0].node.label, "z");
  }
  const nested = Structure.expand(call("f", call("f", parameter("x"))), [f]);
  assert.equal(nested.body.inputs[0].node.body.inputs[0].node.label, "x");
});

test("未填实参和固定数学表达式完整保留，不求值", () => {
  const f = definition("f(x) = EML(x, 1)");
  assert.equal(Structure.expand(call("f", null), [f]).body.inputs[0].node.type, "hole");
  const expression = E.ln(E.I);
  const tree = Structure.expand({ type: "eml", left: { type: "constant", expression, displayText: "ln(i)" }, right: null });
  assert.deepEqual(tree.inputs[0].node.expression, expression);
});

test("循环、缺失定义及参数数量错误明确报告", () => {
  const f = { name: "f", parameterNames: ["x"], body: call("g", parameter("x")) };
  const g = { name: "g", parameterNames: ["x"], body: call("f", parameter("x")) };
  assert.match(Structure.expand(call("f", null), [f, g]).body.body.message, /循环/);
  assert.match(Structure.expand(call("missing")).message, /未定义/);
  assert.match(Structure.expand(call("f"), [f]).message, /参数数量/);
});

test("超过原32层仍完整处理，并复用重复实参结构", () => {
  const definitions = [definition("f(x) = EML(x, 1)")];
  let node = parameter("x");
  for (let index = 0; index < 40; index++) node = call("f", node);
  const tree = Structure.expand(node, definitions);
  const seen = new Set(), pending = [tree];
  while (pending.length) {
    const current = pending.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    assert.notEqual(current.type, "error");
    if (current.body) pending.push(current.body);
    for (const input of current.inputs || []) pending.push(input.node);
  }
  assert.ok(seen.size < 200, "通过共享子结构避免仅实参代入就产生指数副本");
  let emlTree = Structure.toEmlTree(tree), depth = 0;
  while (emlTree.type === "eml") { depth++; emlTree = emlTree.inputs[0]; }
  assert.equal(depth, 40);
  assert.equal(emlTree.label, "x");
});

test("超过原512节点仍保留全部分支", () => {
  const build = (depth) => depth === 0 ? parameter("x") : { type: "eml", left: build(depth - 1), right: build(depth - 1) };
  const tree = Structure.expand(build(9));
  let count = 0;
  const pending = [tree];
  while (pending.length) {
    const current = pending.pop();
    assert.notEqual(current.type, "error");
    count++;
    for (const input of current.inputs || []) pending.push(input.node);
  }
  assert.equal(count, 1023);
});
