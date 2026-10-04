const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("EML 与用户函数共享函数应用区，定义区只负责保存定义", () => {
  const template = read("src/template.html");
  const calculatorStart = template.indexOf('<section class="calculator"');
  const calculatorEnd = template.indexOf("</section>", calculatorStart);
  const definition = template.indexOf('class="function-definition-section"');
  const applications = template.indexOf('id="customFunctionApplications"');
  assert.ok(applications > calculatorStart && applications < calculatorEnd);
  assert.ok(definition > calculatorEnd);
  for (const id of [
    "customDefinitionName",
    "customDefinitionParameters",
    "customDefinitionExpression",
    "definitionFunctionSources",
    "definitionParameterSources",
    "definitionValueSources",
    "customApplyButton",
    "customCancelEditButton",
    "customFunctionApplications",
  ]) {
    assert.match(template, new RegExp(`id="${id}"`));
  }
});

test("页面将动态槽位接入组合求值与原有添加机制", () => {
  const app = read("src/app.js");
  assert.match(app, /Composition\.parseDefinition/);
  assert.match(app, /Composition\.createDefinition/);
  assert.match(app, /Composition\.evaluate/);
  assert.match(app, /Store\.addCustomFunction/);
  assert.match(app, /Store\.setCustomInput/);
  assert.match(app, /Store\.deleteCustomFunction/);
  assert.match(app, /Store\.updateCustomFunction/);
  assert.match(app, /startEditCustomFunction/);
  assert.match(app, /contextmenu/);
  assert.match(app, /请先右键删除该函数中的全部输入/);
  assert.match(app, /Store\.addCompositionEvaluation/);
  assert.match(app, /bindSlot\(slot, slot\.dataset\.slot\)/);
  assert.match(app, /undoLastChange/);
  assert.match(app, /event\.key\.toLowerCase\(\) === "z"/);
  assert.match(app, /application\/x-eml-definition-source/);
  assert.match(app, /definition-slot/);
});
