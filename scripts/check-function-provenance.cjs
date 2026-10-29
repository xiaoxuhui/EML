const assert = require("node:assert/strict");
const E = require("../src/expression.js"), V = require("../src/value-store.js"), P = require("../src/persistence.js");
const C = require("../src/eml-composition.js"), Eval = require("../src/evaluator.js");

module.exports = async (browser, mobile, url) => {
  let state = V.createInitialState();
  const add = (x, y) => {
    const evaluation = Eval.evaluateEML(state.values[x].canonicalExpression, state.values[y].canonicalExpression);
    const result = V.addEvaluation(state, evaluation, x, y);
    state = result.state;
    return result.resultValueId;
  };
  const e = add(V.initialValueId, V.initialValueId), ee = add(e, V.initialValueId), zero = add(V.initialValueId, ee);
  assert.equal(state.values[zero].displayText, "0");
  for (const [name, expression, sourceValueId] of [["fixed", E.ZERO, zero], ["missing", E.neg(E.E), "removed-value"], ["legacy", E.neg(E.E), undefined]]) {
    const body = { type: "eml", left: { type: "parameter", name: "x" }, right: { type: "constant", expression, displayText: E.render(expression), sourceValueId } };
    const definition = C.createDefinition(name, ["x"], body).definition;
    state = V.addCustomFunction(state, name, definition.displayText, 1, { parameterNames: ["x"], body }).state;
  }
  const parent = C.parseDefinition("parent(x) = EML(fixed(x), 1)").definition;
  state = V.addCustomFunction(state, parent.name, parent.displayText, 1, { parameterNames: ["x"], body: parent.body }).state;
  const value = P.serialize(state);
  assert.equal(P.deserialize(value).ok, true);
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: mobile });
  try {
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: P.CACHE_KEY, value });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const before = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    for (const [name, expected] of [["fixed", /ln\(0\) 未定义/], ["missing", /原来源已不存在/], ["legacy", /未记录生成来源/], ["parent", /输入未定义/]]) {
      const button = page.getByRole("button", { name: `查看 ${name} 的计算树`, exact: true });
      if (mobile) await button.tap(); else await button.click();
      const text = await page.locator("#calculationTree").innerText();
      assert.match(text, expected);
      if (name === "fixed" || name === "parent") assert.match(text, /EML\(1, e\^\(e\)\) = 0/);
      assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), before);
    }
    assert.deepEqual(errors, []);
    console.log(`${mobile ? "mobile" : "desktop"}: fixed-value provenance, missing-source explanation and undefined propagation passed`);
  } finally { await context.close(); }
};
