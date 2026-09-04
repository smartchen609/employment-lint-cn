/**
 * 打包产物隐私审计。
 *
 * tests/guard-privacy.test.ts 扫的是**源码**；本脚本扫的是**产物**。
 * 两者必须都干净 —— 依赖、构建工具或插件都可能往 bundle 里注入
 * 源码中看不到的网络调用（例如 Vite 的 modulepreload polyfill）。
 *
 * 用户能自己打开 devtools 验证这件事，所以我们得先自己验证。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(import.meta.dirname, "..", "dist");

const FORBIDDEN = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document.cookie",
  "XMLHttpRequest",
  "sendBeacon",
  "fetch(",
  "new WebSocket",
  "EventSource",
  "gtag",
  "googletagmanager",
  "dataLayer",
];

/** 允许出现的外链：只有 React 的报错说明页，且它只是一个字符串常量。 */
const ALLOWED_URL_PREFIXES = [
  "http://www.w3.org/", // XML / SVG 命名空间
  "https://reactjs.org/docs/error-decoder.html",
];

if (!existsSync(DIST)) {
  console.error("dist/ 不存在。先运行 npx vite build。");
  process.exit(1);
}

const files = readdirSync(join(DIST, "assets"))
  .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
  .map((f) => join(DIST, "assets", f));
files.push(join(DIST, "index.html"));

const problems: string[] = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const token of FORBIDDEN) {
    let i = text.indexOf(token);
    while (i !== -1) {
      const context = text.slice(Math.max(0, i - 60), i + token.length + 60).replace(/\s+/g, " ");
      problems.push(`${file.replace(DIST, "dist")} 含「${token}」\n    …${context}…`);
      i = text.indexOf(token, i + 1);
    }
  }
  for (const m of text.matchAll(/https?:\/\/[a-zA-Z0-9./_%-]+/g)) {
    const url = m[0];
    if (!ALLOWED_URL_PREFIXES.some((p) => url.startsWith(p))) {
      problems.push(`${file.replace(DIST, "dist")} 含未预期的外链 ${url}`);
    }
  }
}

console.log("── audit-bundle ──");
console.log(`  · 扫描 ${files.length} 个产物文件`);

if (problems.length > 0) {
  console.error("\n产物中发现违反隐私承诺的内容：");
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log("  · 未发现持久化存储、网络调用或第三方外链");
