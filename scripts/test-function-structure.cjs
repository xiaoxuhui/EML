const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = path.resolve(__dirname, "../dist");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
const server = http.createServer((request, response) => {
  const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  response.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: mobile });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
      await page.goto(`http://127.0.0.1:${server.address().port}/eml-workbench.html`);
      const snapshot = () => page.evaluate(() => JSON.stringify({ ...localStorage }));
      const baseline = await snapshot();
      const source = (section, text) => page.locator(section).getByRole("button", { name: text, exact: true });
      const slot = (position) => page.locator(`.definition-slot[data-definition-path="${position}"]`);
      async function insert(section, text, position) {
        if (mobile) {
          await source(section, text).tap();
          await slot(position).tap();
        } else await source(section, text).dragTo(slot(position));
      }
      await page.locator("#customDefinitionName").fill("f");
      await page.locator("#customDefinitionParameters").fill("x");
      await insert("#definitionFunctionSources", "EML", "root");
      assert.equal(await page.locator("#definitionStructure").isVisible(), false, "拖入函数不自动显示结构");
      await page.locator('[data-definition-path="root"] > .definition-call-name').click();
      assert.equal(await page.locator("#definitionStructure .structure-hole").count(), 2);
      assert.equal(await page.locator(".definition-slot").count(), 2);
      await insert("#definitionParameterSources", "x", "root.left");
      assert.equal(await page.locator("#definitionStructure").isVisible(), false, "填写参数隐藏结构");
      await insert("#definitionValueSources", "1", "root.right");
      await page.locator('[data-definition-path="root"] > .definition-call-name').click();
      assert.equal(await page.locator("#definitionStructure .structure-hole").count(), 0);
      assert.match(await page.locator("#definitionStructure").innerText(), /X:[\s\S]*x[\s\S]*Y:/);
      assert.equal(await snapshot(), baseline, "草稿与预览不得修改缓存");
      await page.locator("#customApplyButton").click();
      assert.equal(await page.locator("#definitionStructure").isVisible(), false);
      const saved = await snapshot();
      await page.locator("#customDefinitionName").fill("g");
      await page.locator("#customDefinitionParameters").fill("y");
      await insert("#definitionFunctionSources", "EML", "root");
      for (const position of ["left", "right"]) {
        await insert("#definitionFunctionSources", "f", `root.${position}`);
        assert.equal(await slot(`root.${position}.arguments.0`).count(), 1);
        await insert("#definitionParameterSources", "y", `root.${position}.arguments.0`);
      }
      const rootButton = page.locator('[data-definition-path="root"] > .definition-call-name');
      await rootButton.click();
      assert.equal(await page.locator("#definitionStructure .structure-call").count(), 5, "两个 f 分别展开 EML");
      const branches = page.locator("#definitionStructureTree > .structure-branches > li");
      const first = await branches.nth(0).boundingBox();
      const second = await branches.nth(1).boundingBox();
      assert.ok(second.y > first.y + first.height, "Y 分支位于 X 下方");
      await page.locator('[data-definition-path="root.left"] > .definition-call-name').click();
      assert.equal(await page.locator("#definitionStructure .structure-call").count(), 2);
      assert.match(await page.locator("#definitionStructureTree").innerText(), /^f/);
      await rootButton.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#definitionStructure .structure-call").count(), 5);
      assert.equal(await snapshot(), saved);
      await page.locator('[data-definition-path="root.right.arguments.0"]').click({ button: "right" });
      assert.equal(await page.locator("#definitionStructure").isVisible(), false, "删除参数隐藏结构");
      await rootButton.click();
      assert.equal(await page.locator("#definitionStructure .structure-hole").count(), 2, "实参与被替换形参均显示空槽");
      await insert("#definitionParameterSources", "y", "root.right.arguments.0");
      await rootButton.click();
      assert.equal(await page.locator("#definitionStructure .structure-hole").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator("#customApplyButton").click();
      const beforeApplicationClick = await snapshot();
      await page.getByRole("button", { name: "查看 g 的计算树", exact: true }).click();
      assert.equal(await page.locator("#detailsContent").isVisible(), true);
      assert.equal(await page.locator("#selectedValue").innerText(), "g(y)");
      assert.equal(await page.locator("#calculationTree .expanded-eml-node").count(), 3);
      assert.equal(await page.locator("#calculationTree .structure-call").count(), 0);
      assert.doesNotMatch(await page.locator("#calculationTree").innerText(), /\b[fg]\(/);
      assert.doesNotMatch(await page.locator("#calculationTree").innerText(), /\?/);
      assert.match(await page.locator("#calculationTree").innerText(), /e\^\(y\)/);
      assert.doesNotMatch(await page.locator("#calculationTree").innerText(), /展开[:：]/);
      assert.equal(await page.locator("#customCancelEditButton").isVisible(), false, "主界面查看不进入编辑");
      assert.equal(await page.locator("#definitionStructure").isVisible(), false, "不显示定义编辑区预览");
      assert.equal(await snapshot(), beforeApplicationClick, "主界面查看不写缓存");
      const treeBounds = await page.locator("#calculationTreeViewport").boundingBox();
      assert.ok(treeBounds.y >= 0 && treeBounds.y < (mobile ? 844 : 1000), "点击后立即定位到最下方树区域");
      await page.locator("#treeZoomOut").click();
      assert.notEqual(await page.locator("#treeZoomLevel").innerText(), "100%");
      await page.getByRole("button", { name: "查看 EML 的计算树", exact: true }).click();
      assert.equal(await page.locator("#calculationTree .expanded-eml-node").count(), 1);
      assert.equal(await page.locator("#treeZoomLevel").innerText(), "100%");
      await page.locator("#valueList .value-button").first().click();
      assert.equal(await page.locator("#selectedDetailLabel").innerText(), "当前数值：");
      assert.equal(await page.locator("#calculationTree .structure-call").count(), 0);
      const fSlot = page.locator("#customFunctionApplications .custom-input-slots .input-slot").first();
      await page.getByRole("button", { name: "查看 f 的计算树", exact: true }).click();
      const symbolicTree = await page.locator("#calculationTree").innerHTML();
      await fSlot.click();
      const filledSnapshot = await snapshot();
      await page.getByRole("button", { name: "查看 f 的计算树", exact: true }).click();
      assert.match(await page.locator("#calculationTree .expanded-eml-heading").first().innerText(), /EML\(x, 1\) = e\^\(x\)/);
      assert.equal(await page.locator("#selectedValue").innerText(), "f(x)");
      assert.equal(await page.locator("#calculationTree").innerHTML(), symbolicTree, "应用填值前后，函数结构保持变量形式");
      assert.equal(await snapshot(), filledSnapshot);
      await page.getByRole("button", { name: "编辑函数", exact: true }).last().click();
      await page.locator('[data-definition-path="root"] > .definition-call-name').click();
      assert.equal(await page.locator("#definitionStructure").isVisible(), true);
      await page.locator("#customDefinitionParameters").dispatchEvent("input");
      assert.equal(await page.locator("#definitionStructure").isVisible(), false, "编辑签名隐藏结构");
      await page.locator('[data-definition-path="root"] > .definition-call-name').click();
      const beforeCancel = await snapshot();
      await page.locator("#customCancelEditButton").click();
      assert.equal(await page.locator("#definitionStructure").isVisible(), false);
      assert.equal(await snapshot(), beforeCancel);
      const compatible = await page.evaluate(() => {
        const text = EMLPersistence.serialize(EMLApp.getState());
        const parsed = EMLPersistence.deserialize(text);
        return parsed.ok && parsed.state.valueOrder.length === 1 && EMLValueStore.getCustomFunctions(parsed.state).length === 2;
      });
      assert.equal(compatible, true);
      assert.deepEqual(errors, []);
      const out = path.resolve(__dirname, "../_browser_test/function-structure");
      fs.mkdirSync(out, { recursive: true });
      // 留下已展开的结构供截图检查，不操作用户浏览器的会话或存档。
      await page.getByRole("button", { name: "编辑函数", exact: true }).last().click();
      await page.locator('[data-definition-path="root"] > .definition-call-name').click();
      await page.locator("#definitionStructure").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, mobile ? "mobile.png" : "desktop.png") });
      console.log(`${mobile ? "mobile" : "desktop"}: interaction assertions passed; no page/resource errors`);
      await context.close();
      await require("./check-unified-editor.cjs")(browser, mobile, `http://127.0.0.1:${server.address().port}/eml-workbench.html`);
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
