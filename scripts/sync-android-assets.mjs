#!/usr/bin/env node
/**
 * 把构建产物 dist/eml-workbench.html 同步到安卓工程的 assets 中。
 *
 * 单一数据源原则：网页只在 dist/ 维护，安卓外壳只做拷贝，
 * assets 目录不纳入版本库（见 android/.gitignore）。
 *
 * 用法：
 *   node scripts/sync-android-assets.mjs          写入同步
 *   node scripts/sync-android-assets.mjs --check   只校验，不一致时退出码 1
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "dist", "eml-workbench.html");
const TARGET_DIR = path.join(ROOT, "android", "app", "src", "main", "assets");
const TARGET = path.join(TARGET_DIR, "eml-workbench.html");

const checkOnly = process.argv.includes("--check");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`✗ 找不到网页产物：${path.relative(ROOT, SOURCE)}`);
    console.error("  请先执行 npm run build");
    process.exit(1);
  }

  const source = await readFile(SOURCE);
  const sourceHash = sha256(source);
  const target = existsSync(TARGET) ? await readFile(TARGET) : null;

  if (target && sha256(target) === sourceHash) {
    console.log(`✓ assets 已是最新（${source.length} 字节，sha256 ${sourceHash.slice(0, 12)}）`);
    return;
  }

  if (checkOnly) {
    console.error("✗ assets 与 dist 不一致，请执行 npm run sync:android");
    if (!target) {
      console.error(`  缺少文件：${path.relative(ROOT, TARGET)}`);
    }
    process.exit(1);
  }

  await mkdir(TARGET_DIR, { recursive: true });
  await writeFile(TARGET, source);
  console.log(`✓ 已同步 ${path.relative(ROOT, TARGET)}`);
  console.log(`  ${source.length} 字节，sha256 ${sourceHash.slice(0, 12)}`);
}

main().catch((error) => {
  console.error(`✗ 同步失败：${error.message}`);
  process.exit(1);
});
