/**
 * 安卓外壳的结构性校验。
 *
 * 这些用例不需要 Android 工具链即可运行，用于在 CI 里守住：
 * 应用身份（包名/版本/SDK）、离线要求（无网络权限）、
 * 网页资源同步（U03）、图标与关键 WebView 配置不丢失。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID = path.join(ROOT, "android");
const APP = path.join(ANDROID, "app", "src", "main");

const read = (file) => readFile(file, "utf8");

test("U03 assets 中的网页与 dist 产物字节一致", async () => {
  const dist = await readFile(path.join(ROOT, "dist", "eml-workbench.html"));
  const assetPath = path.join(APP, "assets", "eml-workbench.html");
  assert.ok(
    existsSync(assetPath),
    "缺少 assets/eml-workbench.html，请先执行 npm run sync:android"
  );
  const asset = await readFile(assetPath);
  assert.equal(
    Buffer.compare(dist, asset),
    0,
    "assets 与 dist 不一致，请执行 npm run sync:android"
  );
});

test("应用身份与需求一致（包名/SDK/版本）", async () => {
  const gradle = await read(path.join(ANDROID, "app", "build.gradle.kts"));
  assert.match(gradle, /applicationId\s*=\s*"com\.xiaoxuhui\.eml"/);
  assert.match(gradle, /minSdk\s*=\s*24/);
  assert.match(gradle, /targetSdk\s*=\s*34/);
  assert.match(gradle, /versionCode\s*=\s*2/);
  assert.match(gradle, /versionName\s*=\s*"1\.2\.0"/);
  assert.match(gradle, /namespace\s*=\s*"com\.xiaoxuhui\.eml"/);
});

test("应用显示名为「EML 计算台」", async () => {
  const strings = await read(path.join(APP, "res", "values", "strings.xml"));
  assert.match(strings, /<string name="app_name">EML 计算台<\/string>/);
});

test("清单声明启动入口且不申请任何权限（离线运行）", async () => {
  const manifest = await read(path.join(APP, "AndroidManifest.xml"));
  assert.match(manifest, /android\.intent\.category\.LAUNCHER/);
  assert.match(manifest, /android:name="\.MainActivity"/);
  assert.doesNotMatch(manifest, /uses-permission/, "外壳不应申请任何权限");
  assert.doesNotMatch(
    manifest,
    /android\.permission\.INTERNET/,
    "应用必须完全离线，不得声明网络权限"
  );
});

test("旋转屏幕不重建 Activity 且不锁定方向", async () => {
  const manifest = await read(path.join(APP, "AndroidManifest.xml"));
  const configChanges = manifest.match(/android:configChanges="([^"]+)"/);
  assert.ok(configChanges, "MainActivity 应声明 configChanges");
  for (const flag of ["orientation", "screenSize", "keyboardHidden"]) {
    assert.ok(
      configChanges[1].includes(flag),
      `configChanges 应包含 ${flag}，以保证旋转时状态不丢失`
    );
  }
  assert.doesNotMatch(
    manifest,
    /android:screenOrientation/,
    "不应锁定屏幕方向，需同时支持手机竖屏与平板横屏"
  );
});

test("WebView 关键配置齐备（JS/本地存储/离线资源/返回键）", async () => {
  const activity = await read(
    path.join(APP, "java", "com", "xiaoxuhui", "eml", "MainActivity.kt")
  );
  assert.match(activity, /javaScriptEnabled\s*=\s*true/, "需启用 JavaScript");
  assert.match(activity, /domStorageEnabled\s*=\s*true/, "需启用 localStorage（U13）");
  assert.match(activity, /WebViewAssetLoader/, "需通过资产加载器提供本地页面（U09）");
  assert.match(activity, /allowFileAccess\s*=\s*false/, "不应开放文件系统访问");
  assert.match(activity, /onBackPressedDispatcher/, "需处理返回键（U20）");
  assert.match(activity, /canGoBack\(\)/, "返回键需优先回退网页历史（U20）");
  assert.match(activity, /setOnApplyWindowInsetsListener/, "需处理系统栏遮挡（U19）");
  assert.match(activity, /appassets\.androidplatform\.net/, "应以固定域名加载，保证存储 origin 稳定");
  assert.match(activity, /addJavascriptInterface/, "需桥接导出功能（U14）");
  assert.match(activity, /onShowFileChooser/, "需支持网页选择文件（U14）");
});

test("图标资源齐全（各密度传统图标 + 自适应图标前景）", () => {
  const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  for (const density of densities) {
    assert.ok(
      existsSync(path.join(APP, "res", `mipmap-${density}`, "ic_launcher.png")),
      `缺少 mipmap-${density}/ic_launcher.png`
    );
    assert.ok(
      existsSync(path.join(APP, "res", `mipmap-${density}`, "ic_launcher_foreground.png")),
      `缺少 mipmap-${density}/ic_launcher_foreground.png`
    );
  }
  assert.ok(existsSync(path.join(APP, "res", "mipmap-anydpi-v26", "ic_launcher.xml")));
  assert.ok(existsSync(path.join(APP, "res", "mipmap-anydpi-v33", "ic_launcher.xml")));
  assert.ok(existsSync(path.join(APP, "res", "drawable", "ic_launcher_background.xml")));
});
