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

test("深度及节点预算限制指数展开", () => {
  const definitions = [definition("f(x) = EML(x, x)")];
  let node = parameter("x");
  for (let index = 0; index < 10; index++) node = call("f", node);
  const json = JSON.stringify(Structure.expand(node, definitions));
  assert.match(json, /上限/);
  assert.ok(json.length < 100000);
});
