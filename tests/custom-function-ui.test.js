const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("组合函数界面嵌入原计算区并具备定义、动态槽位和添加控件", () => {
  const template = read("src/template.html");
  const calculatorStart = template.indexOf('<section class="calculator"');
  const calculatorEnd = template.indexOf("</section>", calculatorStart);
  const composer = template.indexOf('class="custom-composer"');
  assert.ok(composer > calculatorStart && composer < calculatorEnd);
  for (const id of ["customDefinition", "customApplyButton", "customInputSlots", "customResultOutput", "customAddButton"]) {
    assert.match(template, new RegExp(`id="${id}"`));
  }
});

test("页面将动态槽位接入组合求值与原有添加机制", () => {
  const app = read("src/app.js");
  assert.match(app, /Composition\.parseDefinition/);
  assert.match(app, /Composition\.evaluate/);
  assert.match(app, /Store\.setCustomInput/);
  assert.match(app, /Store\.addCompositionEvaluation/);
  assert.match(app, /bindSlot\(slot, slot\.dataset\.slot\)/);
});
