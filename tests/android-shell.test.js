/**
 * 安卓外壳的结构性校验。
 *
 * 这些用例不需要 Android 工具链即可运行，用于在 CI 里守住：
 * 应用身份（包名/版本/SDK）、离线要求（无网络权限）、
 * 网页资源同步（U03）、图标与关键 WebView 配置不丢失。
 *
 * 模块系统：必须是 CommonJS。package.json 没有声明 "type"，所以 .js 一律按 CJS 解析；
 * 而 CI 矩阵含 Node 18（README 对外承诺支持 18/20/22），Node 18 不会像 20.19+/22 那样
 * 自动探测 ESM 语法 —— 这里写成 `import` 会直接在 Node 18 上抛
 * 「Cannot use import statement outside a module」，而本地 Node 22 完全看不出来。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
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
  // 具体版本号不在断言里硬编码：它是「随发版变化的量」，硬编码等于同一事实维护两处。
  // 格式正确性与「与 package.json 同线」分别由下面的专项测试把关。
  assert.match(gradle, /versionCode\s*=\s*\d+/);
  assert.match(gradle, /versionName\s*=\s*"\d+\.\d+\.\d+"/);
  assert.match(gradle, /namespace\s*=\s*"com\.xiaoxuhui\.eml"/);
});

/**
 * 「无法更新」的直接原因之二：签名不一致。
 *
 * AGP 在没配 signingConfig 时会为每台构建机自动生成随机 debug key。
 * GitHub Actions 每次都是全新 runner，于是每次发布的 APK 签名都不同，
 * 老用户装新包被系统拒绝（INSTALL_FAILED_UPDATE_INCOMPATIBLE）——
 * 表现为「有新版本，但装不上」。
 *
 * 实证：v1.2.0 的线上 APK 里，签名证书的 notBefore 是 Sep 11 00:55:48 2026，
 * 与那次 Release 的发布时间只差 18 秒 —— 证书是构建时现场生成的，不是仓库里的固定文件。
 * 所以 keystore 必须入库且被显式引用。
 */
test("固定 debug 签名存在且被 gradle 引用（否则新包无法覆盖安装）", async () => {
  const gradle = await read(path.join(ANDROID, "app", "build.gradle.kts"));

  assert.match(gradle, /signingConfigs\s*\{/, "build.gradle.kts 缺少 signingConfigs 块");
  assert.match(
    gradle,
    /storeFile\s*=\s*file\("debug\.keystore"\)/,
    "debug 签名没有指向仓库内的 debug.keystore"
  );
  assert.match(gradle, /storeType\s*=\s*"PKCS12"/, '缺少 storeType = "PKCS12"');
  assert.match(gradle, /keyAlias\s*=\s*"androiddebugkey"/);

  assert.ok(
    existsSync(path.join(ANDROID, "app", "debug.keystore")),
    "android/app/debug.keystore 缺失 —— 它必须入库，否则 CI 只能用随机签名签发，老用户装不上新版"
  );
});

/**
 * v1.2.1 的真实教训：网页升版后安卓包没跟着动，versionCode 没递增，
 * 用户「重启之后无法更新」—— 因为 Release 上没有新包，且同 versionCode 的包
 * 会被部分安装器判定为「无更新」而拒绝覆盖。
 *
 * 这两条把「网页升版必须同步安卓包」钉死：
 *  - versionCode 严格大于上一版的 2（Android 只认递增，回退会导致装不上）
 *  - versionName 与 package.json 的 version 同线（用户能一眼看出装的是哪一版）
 */
test("版本号与网页版同线且 versionCode 已递增（防止装不上新包）", async () => {
  const gradle = await read(path.join(ANDROID, "app", "build.gradle.kts"));
  const pkg = JSON.parse(await read(path.join(ROOT, "package.json")));

  const versionCode = Number((gradle.match(/versionCode\s*=\s*(\d+)/) || [])[1]);
  const versionName = (gradle.match(/versionName\s*=\s*"([^"]+)"/) || [])[1];

  assert.ok(
    Number.isInteger(versionCode) && versionCode > 2,
    `versionCode 必须大于 2（v1.2.0 用的是 2），当前为 ${versionCode}`
  );
  assert.equal(
    versionName,
    pkg.version,
    `安卓 versionName（${versionName}）应与 package.json 的 version（${pkg.version}）一致；` +
      "安卓包内嵌的就是同一份网页产物，版本线分开会让用户分不清装的是哪一版"
  );
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
