const test = require("node:test");
const assert = require("node:assert/strict");

const Rules = require("../src/formula-rules.js");

test("规则注册表按领域拆分且编号唯一", () => {
  assert.deepEqual(Rules.registries.map((registry) => registry.name), ["transcendental", "algebra"]);
  assert.equal(Rules.rules.length, 47);
  assert.equal(new Set(Rules.rules.map((rule) => rule.id)).size, Rules.rules.length);
});

test("每个注册规则都具有可审计的说明", () => {
  for (const rule of Rules.rules) {
    assert.match(rule.id, /^[A-Z][A-Z0-9_]+$/);
    assert.equal(typeof rule.label, "string");
    assert.ok(rule.label.length > 0);
  }
});
