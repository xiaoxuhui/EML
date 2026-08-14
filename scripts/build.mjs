import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

const template = fs.readFileSync(path.join(srcDir, "template.html"), "utf8");
const styles = fs.readFileSync(path.join(srcDir, "styles.css"), "utf8");
const scriptFiles = [
  "expression.js",
  "formula-rules.js",
  "evaluator.js",
  "value-store.js",
  "persistence.js",
  "tree-viewport.js",
  "app.js",
];
const scripts = scriptFiles
  .map((file) => `/* ${file} */\n${fs.readFileSync(path.join(srcDir, file), "utf8")}`)
  .join("\n\n");

const output = template
  .replace("/*__STYLES__*/", styles)
  .replace("/*__SCRIPTS__*/", scripts);

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "eml-workbench.html"), output, "utf8");
console.log(`Built dist/eml-workbench.html (${Buffer.byteLength(output)} bytes)`);
