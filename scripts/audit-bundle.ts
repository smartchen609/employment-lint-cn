/**
 * 打包产物隐私审计。
 *
 * tests/guard-privacy.test.ts 扫的是**源码**；本脚本扫的是**产物**。
 * 两者必须都干净 —— 依赖、构建工具或插件都可能往 bundle 里注入
 * 源码中看不到的网络调用（例如 Vite 的 modulepreload polyfill）。
 *
 * 用户能自己打开 devtools 验证这件事，所以我们得先自己验证。
 *
 * 两类产物分开审：
 *   - 应用（dist/assets/*.js|css、dist/index.html）：不得有任何网络调用、存储 API、
 *     未登记外链字符串。
 *   - 手册（dist/handbook/*.html）：纯静态文档。不得有脚本、事件处理器、
 *     任何自动加载的外部资源（img/iframe/link/src/srcset/@import）；
 *     用户点击的外链只允许指向**已由维护人核验的来源**的原文页，或本项目仓库。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const REPO_PREFIX = "https://github.com/smartchen609/employment-lint-cn";

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

/**
 * 应用产物里允许出现的外链字符串。
 *
 * 关键区别：**用户点击才跳转的链接** ≠ **页面自动发起的请求**。
 * 前者是用户的自主动作，后者才违反"无网络调用"的承诺。
 * 本清单只放前者，且每一条都要写明理由。
 *
 * FORBIDDEN 里的 fetch / XHR / sendBeacon 等仍然一律拦截，
 * 所以即使某个外链被放行，页面也无法拿它去发请求。
 */
const APP_ALLOWED_URL_PREFIXES = [
  // XML / SVG 命名空间，只是字符串常量
  "http://www.w3.org/",
  // React 生产构建的报错说明页，只是字符串常量
  "https://reactjs.org/docs/error-decoder.html",
  // 自愿反馈入口（round2 §1乙）：<a target="_blank">，用户点击才跳转。
  // 链接只预填工具版本与 Rule ID，不含任何案件答案。
  REPO_PREFIX,
];

/** 手册页里不得出现的：脚本、事件处理器、任何会自动加载外部内容的标签或属性。 */
const HANDBOOK_FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/<script/i, "<script>"],
  [/\son[a-z]+\s*=/i, "内联事件处理器"],
  [/<iframe/i, "<iframe>"],
  [/<object/i, "<object>"],
  [/<embed/i, "<embed>"],
  [/<img/i, "<img>"],
  [/<link/i, "<link>"],
  [/\ssrc\s*=/i, "src 属性"],
  [/\ssrcset\s*=/i, "srcset 属性"],
  [/@import/i, "@import"],
  [/url\(\s*['"]?https?:/i, "CSS 外部 url()"],
];

/** 手册页允许的外链：已核验来源的原文页（url 或已确认的 official_url），以及本项目仓库。 */
function verifiedSourceUrls(): Set<string> {
  const reg = parse(readFileSync(join(ROOT, "sources.yml"), "utf8")) as {
    sources: Array<{
      url: string;
      official_url?: string;
      official_url_checked?: boolean;
      page_opened_and_checked: boolean;
    }>;
  };
  const out = new Set<string>();
  for (const s of reg.sources) {
    if (!s.page_opened_and_checked) continue;
    if (s.url.startsWith("http")) out.add(s.url);
    if (s.official_url && s.official_url_checked === true) out.add(s.official_url);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error("dist/ 不存在。先运行 npm run build。");
  process.exit(1);
}

const problems: string[] = [];
const rel = (f: string) => f.replace(DIST, "dist");

/* ---------------- 应用产物 ---------------- */

const appFiles = readdirSync(join(DIST, "assets"))
  .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
  .map((f) => join(DIST, "assets", f));
appFiles.push(join(DIST, "index.html"));

for (const file of appFiles) {
  const text = readFileSync(file, "utf8");
  for (const token of FORBIDDEN) {
    let i = text.indexOf(token);
    while (i !== -1) {
      const context = text.slice(Math.max(0, i - 60), i + token.length + 60).replace(/\s+/g, " ");
      problems.push(`${rel(file)} 含「${token}」\n    …${context}…`);
      i = text.indexOf(token, i + 1);
    }
  }
  for (const m of text.matchAll(/https?:\/\/[a-zA-Z0-9./_%-]+/g)) {
    const url = m[0];
    if (!APP_ALLOWED_URL_PREFIXES.some((p) => url.startsWith(p))) {
      problems.push(`${rel(file)} 含未预期的外链 ${url}`);
    }
  }
}

/* ---------------- 草稿不进产物 ---------------- */

/**
 * docs/drafts/ 是维护人尚未确认的规则与文案（CLAUDE.md §L2、§1b.6）。
 * 线上产物里不得出现草稿入口取值、草稿规则编号、草稿卡片标题、草稿题目。
 * main.tsx 的草稿分支在线上构建中是死代码；这里验证它确实被删掉了。
 */
function draftMarkers(): string[] {
  const walk = (d: string, ext: string): string[] =>
    existsSync(d)
      ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(join(d, e.name), ext) : e.name.endsWith(ext) ? [join(d, e.name)] : [],
        )
      : [];
  const leaves = (node: unknown, out: string[]): void => {
    if (typeof node === "string") out.push(node.trim());
    else if (Array.isArray(node)) node.forEach((n) => leaves(n, out));
    else if (node && typeof node === "object") Object.values(node).forEach((n) => leaves(n, out));
  };

  // 草稿规则、卡片、清单、用例里的全部字符串，加上草稿题目模块里的全部字符串字面量
  const candidates: string[] = [];
  for (const f of walk(join(ROOT, "docs", "drafts"), ".yml")) leaves(parse(readFileSync(f, "utf8"), { version: "1.2" }), candidates);
  // 手册草稿章节：按标点切成片段（渲染成 HTML 后引号、粗体会变，整行比不上，片段比得上）
  for (const f of walk(join(ROOT, "docs", "handbook", "drafts"), ".md")) {
    for (const seg of readFileSync(f, "utf8").split(/[，。；：、？！“”"「」『』（）()\[\]*`|>\n#-]+/)) candidates.push(seg);
  }
  for (const f of walk(join(ROOT, "src", "questions", "drafts"), ".ts")) {
    for (const m of readFileSync(f, "utf8").matchAll(/"([^"\\\n]+)"/g)) candidates.push(m[1]!);
  }

  // 线上内容里本来就有的字符串不算标记（草稿卡片多是从已发布章节、规格书文案里摘的）
  const production = [
    ...walk(join(ROOT, "rules"), ".yml"),
    ...readdirSync(join(ROOT, "docs", "handbook"))
      .filter((f) => /^\d{2}-.+\.md$/.test(f))
      .map((f) => join(ROOT, "docs", "handbook", f)),
    ...walk(join(ROOT, "src"), ".ts").filter((f) => !f.includes("/drafts/") && !f.includes(".drafts.") && !f.includes("/generated/")),
    ...walk(join(ROOT, "src"), ".tsx"),
  ]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n")
    .replace(/\s+/g, ""); // YAML 折行、Markdown 换行不同，比较时忽略空白

  const markers = new Set<string>();
  for (const c of candidates) {
    // 太短或纯通用取值（UNKNOWN、true、CN-OTHER…）会误报，只取有辨识度的：含 6 个以上汉字，或草稿专用的大写标识
    const distinctive = (c.match(/[\u4e00-\u9fff]/g)?.length ?? 0) >= 10 || /^[A-Z][A-Z0-9_-]{7,}$/.test(c);
    if (distinctive && !production.includes(c.replace(/\s+/g, ""))) markers.add(c);
  }
  return [...markers];
}

const markers = draftMarkers();
const distAll = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.(js|css|html|json)$/.test(e.name))
  .map((e) => join(e.parentPath, e.name));
for (const file of distAll) {
  const text = readFileSync(file, "utf8");
  for (const m of markers) {
    if (text.includes(m)) problems.push(`${rel(file)} 含草稿内容「${m}」`);
  }
}
if (existsSync(join(DIST, "handbook", "drafts"))) problems.push("dist/handbook/drafts/ 不应存在");

/* ---------------- 手册产物 ---------------- */

const hbDir = join(DIST, "handbook");
const hbFiles = existsSync(hbDir)
  ? readdirSync(hbDir)
      .filter((f) => f.endsWith(".html"))
      .map((f) => join(hbDir, f))
  : [];
const allowedHrefs = verifiedSourceUrls();

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

for (const file of hbFiles) {
  const text = readFileSync(file, "utf8");
  for (const token of FORBIDDEN) {
    if (text.includes(token)) problems.push(`${rel(file)} 手册页含「${token}」`);
  }
  for (const [re, label] of HANDBOOK_FORBIDDEN_PATTERNS) {
    if (re.test(text)) problems.push(`${rel(file)} 手册页含 ${label}`);
  }
  // 外链只能出现在 href 里，且必须是已核验来源或本项目仓库
  const hrefs = [...text.matchAll(/\shref="([^"]*)"/g)].map((m) => decode(m[1]!));
  for (const h of hrefs) {
    if (!/^https?:/i.test(h)) continue;
    if (h.startsWith(REPO_PREFIX) || allowedHrefs.has(h)) continue;
    problems.push(`${rel(file)} 手册页链接到未经核验的外部地址 ${h}`);
  }
  const withoutHrefs = text.replace(/\shref="[^"]*"/g, "");
  for (const m of withoutHrefs.matchAll(/https?:\/\/[a-zA-Z0-9./_%-]+/g)) {
    // 打印样式里的 a[href^="http"] 选择器只是字符串 "http"，不会匹配到完整地址
    problems.push(`${rel(file)} 手册页正文里出现了外部地址 ${m[0]}`);
  }
}

console.log("── audit-bundle ──");
console.log(`  · 应用产物 ${appFiles.length} 个，手册页面 ${hbFiles.length} 个`);
console.log(`  · 草稿标记 ${markers.length} 个，逐一确认未进入产物`);

if (problems.length > 0) {
  console.error("\n产物中发现违反隐私承诺的内容：");
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log("  · 未发现持久化存储、网络调用、自动加载的外部资源或未经核验的外链");
