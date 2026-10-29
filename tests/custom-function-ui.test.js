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
    "definitionStructure",
    "definitionStructureTree",
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

test("函数结构预览使用独立只读模块和可键盘激活的函数名按钮", () => {
  const app = read("src/app.js");
  assert.match(app, /FunctionStructure\.expand\(node, definitions\)/);
  assert.match(app, /name\.type = "button"/);
  const renderer = app.slice(app.indexOf("  function renderDefinitionStructure()"), app.indexOf("  function renderCustomCalculators()"));
  assert.doesNotMatch(renderer, /commitState|persistState|\.evaluate\(/);
  assert.match(read("scripts/build.mjs"), /"function-structure.js"/);
});

test("函数定义复用应用输入框、数值数学排版和指针拖动", () => {
  const app = read("src/app.js");
  assert.match(app, /slot\.className = "input-slot definition-slot"/);
  assert.match(app, /setMath\(value, node\.expression, node\.displayText\)/);
  assert.match(app, /setMath\(source, payload\.expression, label\)/);
  assert.match(app, /bindSourcePointerDrag\(source/);
  assert.match(app, /bindSourcePointerDrag\(button/);
  assert.match(app, /"pointercancel", "lostpointercapture"/);
  assert.doesNotMatch(app, /let suppressValueClick/);
  assert.match(app, /source\.cloneNode\(true\)/);
  assert.match(app, /source-drag-preview/);
  assert.match(app, /clearGhost\(\)/);
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
