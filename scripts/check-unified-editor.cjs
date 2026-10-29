const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../src/expression.js");
const S = require("../src/value-store.js");
const P = require("../src/persistence.js");

module.exports = async function checkUnifiedEditor(browser, mobile, url) {
  const seed = S.createInitialState();
  const samples = [E.sqrt(E.integer(2)), E.div(E.ONE, E.integer(2)), E.pow(E.E, E.integer(2))];
  for (const expression of samples) {
    const canonicalKey = E.canonicalKey(expression), id = S.valueIdFor(canonicalKey);
    seed.values[id] = { id, canonicalKey, canonicalExpression: expression, displayText: E.render(expression), protected: false, derivationIds: [], createdAt: new Date(0).toISOString() };
    seed.valueOrder.push(id);
  }
  const serialized = P.serialize(seed);
  assert.equal(P.deserialize(serialized).ok, true);
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: mobile, isMobile: mobile });
  try {
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: P.CACHE_KEY, value: serialized });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const snapshot = () => page.evaluate(() => JSON.stringify({ ...localStorage }));
    if (mobile) {
      await page.locator("#valueList .value-button").first().tap();
      await page.waitForFunction((id) => EMLApp.getState().selectedValueId === id, S.initialValueId, { timeout: 1000 });
      await page.reload();
    }
    const before = await snapshot();
    const source = (section, name) => page.locator(section).getByRole("button", { name, exact: true });
    const activate = (element) => mobile ? element.tap() : element.click();
    const slot = (position) => page.locator(`.definition-slot[data-definition-path="${position}"]`);
    const touch = mobile ? await context.newCDPSession(page) : null;
    async function drag(from, to, cancel = false, allowed = true) {
      await to.scrollIntoViewIfNeeded();
      await from.scrollIntoViewIfNeeded();
      const a = await from.boundingBox(), b = await to.boundingBox();
      const x = a.x + a.width / 2, y = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + b.height / 2;
      async function checkGhost() {
        const preview = page.locator(".source-drag-preview");
        assert.equal(await preview.count(), 1);
        assert.equal(await preview.isVisible(), true);
        assert.equal(await preview.evaluate((element) => getComputedStyle(element).pointerEvents), "none");
        assert.equal(await from.evaluate((element) => element.classList.contains("drag-source-active")), true);
        assert.equal(await preview.innerHTML(), await from.innerHTML(), "拖动预览保留原数学排版");
        const bounds = await preview.boundingBox();
        assert.ok(Math.abs(bounds.x - tx) < bounds.width + 20 && Math.abs(bounds.y - ty) < bounds.height + 25, "预览跟随指针");
        if (await from.getAttribute("aria-label") === "√(2)") {
          const out = path.resolve(__dirname, "../_browser_test/function-structure");
          fs.mkdirSync(out, { recursive: true });
          await page.screenshot({ path: path.join(out, mobile ? "drag-mobile.png" : "drag-desktop.png") });
        }
      }
      assert.ok(y >= 0 && y <= (mobile ? 844 : 1000) && ty >= 0 && ty <= (mobile ? 844 : 1000), "起终点均须可见");
      if (touch) {
        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        for (let step = 1; step <= 6; step++) {
          await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (tx - x) * step / 6, y: y + (ty - y) * step / 6 }] });
          await page.evaluate(() => new Promise(requestAnimationFrame));
        }
        assert.equal(await to.evaluate((element) => element.classList.contains("drag-over")), allowed);
        await checkGhost();
        await touch.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(tx, ty, { steps: 6 });
        assert.equal(await to.evaluate((element) => element.classList.contains("drag-over")), allowed);
        await checkGhost();
        await page.mouse.up();
      }
      assert.equal(await page.locator(".drag-over").count(), 0);
      assert.equal(await page.locator(".source-drag-preview, .drag-source-active").count(), 0);
    }
    await page.locator("#customDefinitionName").fill("h");
    await page.locator("#customDefinitionParameters").fill("x,y");
    await drag(source("#definitionFunctionSources", "EML"), slot("root"));
    const style = (element) => {
      const s = getComputedStyle(element);
      return [s.width, s.minHeight, s.padding, s.borderWidth, s.borderStyle, s.borderRadius, s.backgroundColor, s.fontSize];
    };
    assert.deepEqual(await slot("root.left").evaluate(style), await page.locator("#slotX").evaluate(style));
    assert.equal(await slot("root.left").innerText(), "x");
    assert.equal(await slot("root.right").innerText(), "y");
    if (mobile) {
      await drag(source("#definitionParameterSources", "x"), slot("root.left"), true);
      assert.equal(await slot("root.left").innerText(), "x");
      assert.equal(await slot("root.left").evaluate((element) => element.classList.contains("filled")), false);
    }
    for (const expression of samples) {
      const label = E.render(expression);
      const definitionValue = source("#definitionValueSources", label);
      const dataValue = page.locator(`#valueList [data-value-id="${S.valueIdFor(E.canonicalKey(expression))}"] .value-button`);
      assert.equal(await definitionValue.locator(".katex").count(), 1);
      assert.equal(await definitionValue.locator(".katex").innerHTML(), await dataValue.locator(".katex").innerHTML());
      await drag(definitionValue, slot("root.left"));
      assert.equal(await slot("root.left").locator(".katex").innerHTML(), await dataValue.locator(".katex").innerHTML());
      assert.equal(await slot("root.left").evaluate((element) => element.classList.contains("filled")), true);
    }
    await drag(source("#definitionParameterSources", "x"), slot("root.left"));
    await drag(source("#definitionValueSources", "1"), slot("root.right"));
    assert.equal(await snapshot(), before, "编辑和拖放预览不写缓存");
    await drag(source("#definitionFunctionSources", "EML"), page.locator(mobile ? "#customDefinitionStatus" : "#slotX"), false, false);
    assert.equal(await page.locator("#slotX").innerText(), "x", "函数不能当数值拖进应用框");
    assert.equal(await snapshot(), before);
    await activate(source("#definitionFunctionSources", "EML"));
    await activate(slot("root.left"));
    assert.equal(await slot("root.left.left").count(), 1, "已填参数可被嵌套函数覆盖");
    await activate(page.locator('[data-definition-path="root.left"] > .definition-call-name'));
    assert.match(await page.locator("#definitionStructureTree").innerText(), /^EML/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    const out = path.resolve(__dirname, "../_browser_test/function-structure");
    fs.mkdirSync(out, { recursive: true });
    await page.locator("#customDefinitionExpression").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, mobile ? "unified-mobile.png" : "unified-desktop.png") });
    // 原应用区在手机仍保留跨屏选择/点击方式；鼠标另验两种数值来源的拖入。
    if (mobile) {
      await page.locator("#valueList .value-button").first().tap();
      await page.waitForFunction((id) => EMLApp.getState().selectedValueId === id, S.initialValueId, { timeout: 2000 });
      assert.equal(await page.evaluate(() => EMLApp.getState().selectedValueId), S.initialValueId, "触摸选择数值1");
      await page.locator("#slotX").tap();
      assert.equal(await page.evaluate(() => EMLApp.getState().inputXId), S.initialValueId, "触摸填入x");
      await page.locator("#slotY").tap();
    } else {
      await drag(page.locator("#valueList .value-button").first(), page.locator("#slotX"));
      await drag(source("#definitionValueSources", "1"), page.locator("#slotY"));
    }
    assert.equal(await page.locator("#slotX").getAttribute("aria-label"), "1");
    assert.equal(await page.locator("#slotY").getAttribute("aria-label"), "1");
    assert.equal(await page.locator("#resultOutput").getAttribute("aria-label"), "e");
    console.log(`${mobile ? "mobile touch" : "desktop mouse"}: shared styles, math DOM, overwrite, drag feedback, cache checks passed`);
  } finally {
    await context.close();
  }
};
