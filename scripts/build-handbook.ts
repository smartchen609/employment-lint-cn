/**
 * 手册 Markdown → 静态 HTML。
 *
 * 用 markdown-it（维护人 2026-09-09 批准新增该依赖）。
 * 关键安全设置：
 *   - html: false —— 原始 HTML 一律按文本转义，手册里不允许内嵌 HTML
 *   - linkify: false —— 不自动把 URL 变链接
 *   - markdown-it 默认的 validateLink 会拦掉 javascript:/vbscript:/data: 链接
 *
 * 输出（全部在 dist/handbook/）：
 *   index.html     章节目录
 *   NN.html        每个**已发布**章节（草稿不构建）
 *   sources.html   来源与核验：每条来源是什么、去哪里查原文、谁在哪天怎么核的
 *
 * 每个章节页：本节目录、重点段落加框、法条原文与白话解释分开排版、
 * 「依据」表里的来源编号链到来源页、上一节/下一节。
 *
 * 无脚本、无外部资源、无追踪 —— 与主应用同一套隐私承诺，由 audit-bundle 校验。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import MarkdownIt from "markdown-it";
import { HandbookMapFile, publishedSections, type HandbookSection } from "../src/schema/copy.js";
import { SourceRegistry, type SourceRecord } from "../src/schema/source.js";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "docs", "handbook");
const OUT = join(ROOT, "dist", "handbook");
export const REPO_URL = "https://github.com/smartchen609/employment-lint-cn";

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

type MdToken = ReturnType<typeof md.parse>[number];

// 表格外包一层可横向滚动的容器，手机上宽表格不撑破版面
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
md.renderer.rules.table_close = () => "</table></div>";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 仅做 Markdown 渲染，不做手册专用的排版加工。 */
export function markdownToHtml(source: string): string {
  return md.render(source);
}

/* ------------------------------------------------------------------ */
/* 章节渲染                                                            */
/* ------------------------------------------------------------------ */

export interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

/** 加框的二级标题：读者最该先看、最该照做的两段。 */
const CALLOUTS: Record<string, string> = {
  "这一节说什么": "callout callout-intro",
  "你现在该做什么": "callout callout-action",
};

/** 白话解释段落的开头。 */
const PLAIN_LEAD = /^这(条|两条|三条|四条|句话|两句话|三句话)的意思/;

function inlineText(tok: MdToken | undefined): string {
  return (tok?.children ?? []).map((c) => (c.type === "text" || c.type === "code_inline" ? c.content : "")).join("");
}

/** markdown-it v14 不直接导出 Token；从一个 StateCore 实例上取构造函数。 */
const TokenCtor = (
  new (md.core as unknown as { State: new (src: string, m: unknown, env: object) => { Token: new (t: string, tag: string, n: number) => MdToken } }).State("", md, {})
).Token;

function htmlBlock(content: string): MdToken {
  const t = new TokenCtor("html_block", "", 0);
  t.content = content;
  return t;
}

/**
 * 在 markdown-it 的 token 流上做手册排版：
 *   - 章节头部「状态：」引用块 → 低调的元信息行
 *   - 其余引用块 → 法条原文样式
 *   - 「这条的意思」段落 → 白话解释样式
 *   - h2/h3 → 稳定锚点 + 收集目录
 *   - 「这一节说什么」「你现在该做什么」两节 → 加框
 */
export function renderSection(source: string): { html: string; toc: TocItem[] } {
  const tokens = md.parse(source, {});
  const toc: TocItem[] = [];
  let headingN = 0;
  let firstBlockquote = true;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;

    if (t.type === "blockquote_open") {
      // 找到引用块里第一段文字
      const inline = tokens.slice(i).find((x) => x.type === "inline");
      const text = inlineText(inline);
      t.attrSet("class", firstBlockquote && text.startsWith("状态：") ? "status" : "law");
      firstBlockquote = false;
    }

    if (t.type === "paragraph_open" && tokens[i - 1]?.type !== "blockquote_open") {
      const inline = tokens[i + 1];
      // markdown-it 在以粗体开头的段落前放一个空 text 节点
      const children = (inline?.children ?? []).filter((c) => !(c.type === "text" && c.content === ""));
      if (children[0]?.type === "strong_open" && PLAIN_LEAD.test(children[1]?.content ?? "")) {
        t.attrSet("class", "plain");
      }
    }

    if (t.type === "heading_open" && (t.tag === "h2" || t.tag === "h3")) {
      headingN += 1;
      const id = `s${headingN}`;
      t.attrSet("id", id);
      toc.push({ level: t.tag === "h2" ? 2 : 3, text: inlineText(tokens[i + 1]), id });
    }
  }

  // 加框：在匹配的 h2 前插入 <section>，在下一个 h2（或文末）前闭合
  const out: MdToken[] = [];
  let open = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type === "heading_open" && t.tag === "h2") {
      if (open) {
        out.push(htmlBlock("</section>\n"));
        open = false;
      }
      const cls = CALLOUTS[inlineText(tokens[i + 1]).trim()];
      if (cls) {
        out.push(htmlBlock(`<section class="${cls}">\n`));
        open = true;
      }
    }
    out.push(t);
  }
  if (open) out.push(htmlBlock("</section>\n"));

  return { html: md.renderer.render(out, md.options, {}), toc };
}

/* ------------------------------------------------------------------ */
/* 来源编号 → 来源页链接                                               */
/* ------------------------------------------------------------------ */

/** 找出文本里出现的已登记来源编号（前后不能紧挨字母、数字或连字符）。 */
export function sourceIdsIn(text: string, ids: readonly string[]): string[] {
  return ids.filter((id) => new RegExp(`(?<![A-Z0-9-])${id.replace(/-/g, "\\-")}(?![A-Z0-9-])`).test(text));
}

/** 把 HTML 文本节点里的来源编号变成指向来源页的链接；标签内部与已有链接内部不动。 */
export function linkifySourceIds(html: string, ids: readonly string[], href: (id: string) => string): string {
  if (ids.length === 0) return html;
  const sorted = [...ids].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![A-Z0-9-])(${sorted.map((id) => id.replace(/-/g, "\\-")).join("|")})(?![A-Z0-9-])`, "g");
  let insideAnchor = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<a[\s>]/i.test(part)) insideAnchor += 1;
        else if (/^<\/a>/i.test(part)) insideAnchor = Math.max(0, insideAnchor - 1);
        return part;
      }
      if (insideAnchor > 0) return part;
      return part.replace(re, (id) => `<a class="src" href="${href(id)}">${id}</a>`);
    })
    .join("");
}

/* ------------------------------------------------------------------ */
/* 页面外壳                                                            */
/* ------------------------------------------------------------------ */

export const CSS = `
:root{--bg:#fbfaf8;--surface:#fff;--ink:#1c1b1a;--soft:#55524e;--line:#e2ded8;--accent:#7a4a2b;--quote:#f3ebe4;--intro:#eef3f7;--intro-line:#7c96ab;--action:#f5f1e6;--action-line:#b08a3e}
@media(prefers-color-scheme:dark){:root{--bg:#16150f;--surface:#1e1d17;--ink:#ece7dd;--soft:#a9a49a;--line:#35332b;--accent:#d8a271;--quote:#2a2620;--intro:#1c232a;--intro-line:#6f8aa0;--action:#27231a;--action-line:#b99449}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.8 system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
main{max-width:44rem;margin:0 auto;padding:1.25rem 1rem 4rem}
h1{font-size:1.55rem;line-height:1.4;margin:.5rem 0 1rem}
h2{font-size:1.22rem;margin-top:2.2rem;border-bottom:1px solid var(--line);padding-bottom:.3rem;scroll-margin-top:1rem}
h3{font-size:1.05rem;margin-top:1.6rem;scroll-margin-top:1rem}
h4{font-size:.95rem;color:var(--soft)}
a{color:var(--accent)}
:where(a,summary):focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:4px}
code{font-family:ui-monospace,Menlo,monospace;font-size:.9em;background:var(--quote);padding:.1em .35em;border-radius:4px}
pre{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.8rem 1rem;overflow-x:auto}pre code{background:none;padding:0}
.table-wrap{overflow-x:auto;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{border:1px solid var(--line);padding:.5rem .6rem;text-align:left;vertical-align:top}th{background:var(--surface)}
blockquote{margin:1rem 0}
blockquote.law{padding:.8rem 1rem;background:var(--quote);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;font-size:.95rem}
blockquote.law p{margin:.35rem 0}
blockquote.status{margin:0 0 1rem;padding:0;font-size:.82rem;color:var(--soft)}
blockquote.status p{margin:0}
p.plain{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.7rem .9rem}
.callout{border-radius:10px;padding:.2rem 1.1rem 1rem;margin:1.6rem 0}
.callout h2{border-bottom:none;margin-top:1rem}
.callout-intro{background:var(--intro);border-left:5px solid var(--intro-line)}
.callout-action{background:var(--action);border-left:5px solid var(--action-line)}
.topnav{font-size:.88rem;color:var(--soft);margin-bottom:1rem;display:flex;flex-wrap:wrap;gap:.3rem 1rem}
.notice{font-size:.85rem;color:var(--soft);border:1px dashed var(--line);border-radius:8px;padding:.6rem .9rem;margin:1rem 0}
details.toc{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.5rem .9rem;margin:1rem 0 1.5rem;font-size:.92rem}
details.toc summary{cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center}
details.toc ol{margin:.3rem 0 .5rem;padding-left:1.2rem}details.toc ol ol{margin:0;padding-left:1.1rem;font-size:.95em}
details.toc li{margin:.15rem 0}
.pager{display:flex;justify-content:space-between;gap:1rem;margin:3rem 0 1rem;font-size:.92rem}
.pager a{display:block;max-width:48%;padding:.6rem .8rem;border:1px solid var(--line);border-radius:8px;text-decoration:none;min-height:44px}
.pager a[rel=next]{margin-left:auto;text-align:right}
.pager small{display:block;color:var(--soft)}
a.src{font-family:ui-monospace,Menlo,monospace;font-size:.85em}
.chapter-list{list-style:none;padding:0;margin:1rem 0}
.chapter-list li{border:1px solid var(--line);border-radius:10px;background:var(--surface);margin:.6rem 0}
.chapter-list a{display:block;padding:.75rem 1rem;text-decoration:none;color:var(--ink);min-height:44px}
.chapter-list .num{font-family:ui-monospace,Menlo,monospace;color:var(--accent);margin-right:.4rem}
.chapter-list .sum{display:block;font-size:.88rem;color:var(--soft)}
.source{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:.8rem 1rem;margin:1rem 0;scroll-margin-top:1rem}
.source h3{margin:.2rem 0 .4rem;font-size:1rem}
.source dl{display:grid;grid-template-columns:6.5rem 1fr;gap:.25rem .8rem;margin:.5rem 0;font-size:.9rem}
.source dt{color:var(--soft)}.source dd{margin:0}
.source .sid{font-family:ui-monospace,Menlo,monospace;font-size:.8rem;color:var(--soft)}
.source details{font-size:.88rem;margin-top:.4rem}
.source details summary{cursor:pointer;color:var(--soft)}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.85rem;color:var(--soft)}
@media print{
  :root{--bg:#fff;--surface:#fff;--ink:#000;--soft:#444;--line:#999;--quote:#f2f2f2;--intro:#fff;--action:#fff}
  body{font-size:11pt;line-height:1.6}
  main{max-width:none;padding:0}
  .topnav,.notice,details.toc,.pager,footer{display:none}
  .callout{border:1px solid #999}
  blockquote.law,table,.callout,.source,p.plain{break-inside:avoid}
  h2,h3{break-after:avoid}
  a[href^="http"]::after{content:" (" attr(href) ")";font-size:8pt;color:#555;word-break:break-all}
  a.src::after{content:""}
}
`.trim();

function page(opts: { title: string; body: string; nav: string }): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${esc(opts.title)} — 劳动者自助仲裁手册</title><style>${CSS}</style></head>
<body><main>
<nav class="topnav" aria-label="站点导航">${opts.nav}</nav>
<div class="notice">这是一份手册，不是法律意见。每条法条都标注了来源；来源是什么、去哪里查原文、何时由谁核验，见<a href="sources.html">来源与核验</a>。</div>
${opts.body}
<footer><p>劳动者自助仲裁手册 · 七八十分的覆盖，一百分的来源。</p><p>本页为静态文件，不含脚本，不记录你的任何信息。</p></footer>
</main></body></html>`;
}

const NAV = `<a href="../">← 回到首页</a><a href="./">手册目录</a><a href="sources.html">来源与核验</a>`;

function tocHtml(toc: TocItem[]): string {
  if (toc.length === 0) return "";
  const items: string[] = [];
  let openSub = false;
  for (const t of toc) {
    if (t.level === 2) {
      if (openSub) {
        items.push("</ol></li>");
        openSub = false;
      } else if (items.length) {
        items.push("</li>");
      }
      items.push(`<li><a href="#${t.id}">${esc(t.text)}</a>`);
    } else {
      if (!openSub) {
        items.push("<ol>");
        openSub = true;
      }
      items.push(`<li><a href="#${t.id}">${esc(t.text)}</a></li>`);
    }
  }
  items.push(openSub ? "</ol></li>" : "</li>");
  const h2count = toc.filter((t) => t.level === 2).length;
  return `<details class="toc"><summary>本节目录（${h2count} 部分）</summary><ol>${items.join("")}</ol></details>`;
}

function pagerHtml(prev: HandbookSection | undefined, next: HandbookSection | undefined): string {
  const link = (s: HandbookSection, rel: "prev" | "next") =>
    `<a rel="${rel}" href="${s.id}.html"><small>${rel === "prev" ? "← 上一节" : "下一节 →"}</small>${esc(s.id)} · ${esc(s.title)}</a>`;
  return `<nav class="pager" aria-label="翻页">${prev ? link(prev, "prev") : "<span></span>"}${next ? link(next, "next") : ""}</nav>`;
}

/** 在章节正文 HTML 的 H1 之后插入目录。 */
function withToc(html: string, toc: TocItem[]): string {
  const idx = html.indexOf("</h1>");
  if (idx === -1) return tocHtml(toc) + html;
  // 状态行紧跟 H1，目录放在状态行之后
  const afterH1 = idx + "</h1>".length;
  const statusEnd = html.indexOf("</blockquote>", afterH1);
  const statusStart = html.indexOf('<blockquote class="status">', afterH1);
  const insertAt = statusStart !== -1 && statusStart - afterH1 < 5 && statusEnd !== -1 ? statusEnd + "</blockquote>".length : afterH1;
  return html.slice(0, insertAt) + "\n" + tocHtml(toc) + html.slice(insertAt);
}

/* ------------------------------------------------------------------ */
/* 来源页                                                              */
/* ------------------------------------------------------------------ */

const TIERS: Array<{ label: string; levels: string[] }> = [
  { label: "法律与行政法规", levels: ["national-statute"] },
  { label: "司法解释", levels: ["national-judicial"] },
  { label: "地方性法规", levels: ["special-economic-zone-legislation", "provincial-regulation", "local-regulation"] },
  { label: "地方法院裁判口径", levels: ["local-court-guidance"] },
  { label: "指导性案例", levels: ["guiding-case", "published-case"] },
  { label: "官方实务文章与案例分析", levels: ["court-practice-article", "labor-authority-case-analysis"] },
  { label: "媒体报道", levels: ["media-report"] },
];

export function corpusUrl(file: string): string {
  return `${REPO_URL}/blob/main/docs/law-corpus/${encodeURIComponent(file)}`;
}

/** 来源页上"去哪里查原文"一栏。只展示已经确认的链接。 */
export function whereToRead(s: SourceRecord): string {
  const parts: string[] = [];
  if (s.url.startsWith("http")) {
    parts.push(`<a href="${esc(s.url)}" rel="noreferrer noopener">官方原文页</a>`);
    if (s.insecure_url_reason) parts.push("（该站点仅 http 可访问）");
  } else if (s.url === "CORPUS" && s.corpus_file) {
    parts.push(`文本取自维护人整理的法规汇编：<a href="${esc(corpusUrl(s.corpus_file))}" rel="noreferrer noopener">查看全文</a>`);
  } else if (s.url === "NO_PUBLIC_PAGE") {
    parts.push("无公开的官方原文页");
  }
  if (s.official_url && s.official_url_checked === true) {
    parts.push(`；发布机关官网：<a href="${esc(s.official_url)}" rel="noreferrer noopener">原文页</a>`);
  }
  return parts.join("");
}

/**
 * 核验记录公开展示时，把其中提到的网址替换成说明文字。
 * 记录里的网址是核验过程中看过的页面（可能是转载页），不是经维护人确认的原文页；
 * 它们留在仓库的 sources.yml 里供复核，不在公开页面上作为链接或文字出现。
 */
export function recordForPublic(record: string): string {
  return record.trim().replace(/https?:\/\/\S+/g, "〔网址见仓库 sources.yml〕");
}

export function buildSourcesPage(
  sources: readonly SourceRecord[],
  sections: ReadonlyArray<{ section: HandbookSection; text: string }>,
): string {
  const verified = sources.filter((s) => s.page_opened_and_checked && s.status === "active");
  const ids = verified.map((s) => s.id);
  const citedBy = new Map<string, HandbookSection[]>();
  for (const { section, text } of sections) {
    for (const id of sourceIdsIn(text, ids)) {
      citedBy.set(id, [...(citedBy.get(id) ?? []), section]);
    }
  }

  const cards = TIERS.map((tier) => {
    const list = verified.filter((s) => tier.levels.includes(s.authority_level));
    if (list.length === 0) return "";
    const items = list
      .map((s) => {
        const refs = citedBy.get(s.id) ?? [];
        return `<article class="source" id="${esc(s.id)}">
<h3>${esc(s.page_title)}</h3>
<div class="sid">${esc(s.id)}</div>
<dl>
<dt>发布机关</dt><dd>${esc(s.publisher)}</dd>
<dt>原文</dt><dd>${whereToRead(s)}</dd>
<dt>引用的条文</dt><dd>${esc(s.pinpoint.join("、"))}</dd>
<dt>核验</dt><dd>${esc(s.last_verified_at)} 经维护人确认</dd>
<dt>引用章节</dt><dd>${refs.length ? refs.map((r) => `<a href="${r.id}.html">${esc(r.id)}</a>`).join("、") : "—"}</dd>
</dl>
${s.verification_record ? `<details><summary>核验记录</summary><p>${esc(recordForPublic(s.verification_record))}</p></details>` : ""}
</article>`;
      })
      .join("\n");
    return `<h2 id="tier-${TIERS.indexOf(tier)}">${esc(tier.label)}</h2>\n${items}`;
  }).join("\n");

  const body = `<h1>来源与核验</h1>
<p>手册里每一段法条原文都能在下面找到出处。一条来源进入这个页面，需要维护人（深圳执业律师）确认过它。确认方式有三种：</p>
<ul>
<li><strong>官方原文页</strong>：维护人打开发布机关的网页核对过标题、条文和施行日期。</li>
<li><strong>维护人汇编</strong>：文本取自维护人自己整理的法规汇编，放在本项目的公开仓库里，任何人都可以查看全文。</li>
<li><strong>无公开原文页</strong>：发布机关没有公开原文（例如部分法院内部下发的裁判指引），文本经多处比对后由维护人确认。</li>
</ul>
<p>另外，手册里的每一句引文都由自动测试逐字核对：必须能在汇编或已确认的官方页面中找到原句，否则构建失败。</p>
<p>尚未经维护人确认的来源不会出现在这里，引用它们的章节草稿也不会上线。</p>
${cards}`;
  return page({ title: "来源与核验", body, nav: NAV });
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function loadMap(): HandbookMapFile {
  return HandbookMapFile.parse(
    parse(readFileSync(join(ROOT, "rules", "copy", "handbook-map.yml"), "utf8"), { version: "1.2", uniqueKeys: true }),
  );
}

function loadSources(): SourceRecord[] {
  return SourceRegistry.parse(parse(readFileSync(join(ROOT, "sources.yml"), "utf8"), { version: "1.2", uniqueKeys: true })).sources;
}

export function buildAll(outDir = OUT): { pages: string[] } {
  const map = loadMap();
  const sources = loadSources();
  const published = publishedSections(map);
  const verifiedIds = sources.filter((s) => s.page_opened_and_checked && s.status === "active").map((s) => s.id);

  mkdirSync(outDir, { recursive: true });
  const pages: string[] = [];
  const texts: Array<{ section: HandbookSection; text: string }> = [];

  published.forEach((sec, i) => {
    const text = readFileSync(join(SRC, sec.file), "utf8");
    texts.push({ section: sec, text });
    const { html, toc } = renderSection(text);
    const linked = linkifySourceIds(withToc(html, toc), verifiedIds, (id) => `sources.html#${id}`);
    const body = linked + pagerHtml(published[i - 1], published[i + 1]);
    writeFileSync(join(outDir, `${sec.id}.html`), page({ title: sec.title, body, nav: NAV }));
    pages.push(`${sec.id}.html`);
  });

  const list = published
    .map(
      (s) =>
        `<li><a href="${s.id}.html"><span class="num">${esc(s.id)}</span>${esc(s.title)}${s.summary ? `<span class="sum">${esc(s.summary)}</span>` : ""}</a></li>`,
    )
    .join("");
  writeFileSync(
    join(outDir, "index.html"),
    page({
      title: "目录",
      body: `<h1>劳动者自助仲裁手册</h1>
<p>写给在签字、回复公司、提交仲裁之前，想先把事情弄清楚的人。每一节都讲清楚法律怎么规定、常见的误解、广东和深圳的裁判口径、你现在该做什么。</p>
<p>这不是赔偿计算器，也不会判断你一定能赢。</p>
<ol class="chapter-list">${list}</ol>
<p><a href="sources.html">来源与核验</a> · <a href="../">不确定看哪节？回首页答几道题帮你定位</a></p>`,
      nav: `<a href="../">← 回到首页</a><a href="sources.html">来源与核验</a>`,
    }),
  );
  pages.push("index.html");

  writeFileSync(join(outDir, "sources.html"), buildSourcesPage(sources, texts));
  pages.push("sources.html");

  return { pages };
}

function main(): void {
  const { pages } = buildAll();
  console.log(`手册生成完成：${pages.length - 2} 节 + 目录 + 来源页 → dist/handbook/`);
}

// 直接运行时才生成；被测试 import 时只导出函数
if (process.argv[1] && process.argv[1].endsWith("build-handbook.ts")) main();
