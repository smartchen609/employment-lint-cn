/**
 * 手册 Markdown → 静态 HTML。
 *
 * ## 为什么不引 markdown 库
 *
 * CLAUDE.md §E1：任何新增依赖必须先问维护人。维护人在休息，
 * 而手册用到的 Markdown 子集很小（标题、段落、列表、引用、表格、粗体、
 * 行内代码、代码块、链接），一百来行就能覆盖。先用这个，
 * 换正规库的决定放在 docs/handbook/CONFIRM.md。
 *
 * 输出：dist/handbook/index.html + 每节一个 HTML。
 * 无脚本、无外链资源、无追踪 —— 与主应用同一套隐私承诺。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { HandbookMapFile } from "../src/schema/copy.js";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "docs", "handbook");
const OUT = join(ROOT, "dist", "handbook");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 行内：粗体、行内代码、链接。先转义再替换，避免把标记本身当 HTML。 */
function inline(s: string): string {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
    const safe = /^(https?:\/\/|\.\/|\.\.\/|[\w\-一-鿿]+\.html)/.test(href) ? href : "#";
    return `<a href="${esc(safe)}">${text}</a>`;
  });
  return out;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  const flushPara = (buf: string[]) => {
    if (buf.length) html.push(`<p>${inline(buf.join(" "))}</p>`);
    buf.length = 0;
  };

  const para: string[] = [];

  while (i < lines.length) {
    const line = lines[i]!;

    // 代码块
    if (line.startsWith("```")) {
      flushPara(para);
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1;
      html.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara(para);
      const level = h[1]!.length;
      html.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      i += 1;
      continue;
    }

    // 引用块（连续 > 行合并，内部按行 <br>）
    if (line.startsWith(">")) {
      flushPara(para);
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        buf.push(lines[i]!.replace(/^>\s?/, ""));
        i += 1;
      }
      // 整块一起做行内转换，再把换行还原成 <br>。
      // 逐行处理会让跨行的 **粗体** 永远闭不上（06 节顶部就有一处）。
      html.push(`<blockquote>${inline(buf.join("\n")).replace(/\n/g, "<br>")}</blockquote>`);
      continue;
    }

    // 表格
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1]!)) {
      flushPara(para);
      const cells = (l: string) =>
        l
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => inline(c.trim()));
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        rows.push(cells(lines[i]!));
        i += 1;
      }
      html.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }

    // 列表（有序 / 无序，支持一层）
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      flushPara(para);
      const ordered = /\d+\./.test(li[2]!);
      const tag = ordered ? "ol" : "ul";
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        // 续行：下一行缩进且不是新项
        let text = m[3]!;
        i += 1;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*([-*]|\d+\.)\s/.test(lines[i]!)) {
          text += " " + lines[i]!.trim();
          i += 1;
        }
        items.push(`<li>${inline(text)}</li>`);
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // 分隔线
    if (/^---+$/.test(line.trim())) {
      flushPara(para);
      html.push("<hr>");
      i += 1;
      continue;
    }

    // 空行
    if (line.trim() === "") {
      flushPara(para);
      i += 1;
      continue;
    }

    para.push(line.trim());
    i += 1;
  }
  flushPara(para);
  return html.join("\n");
}

const CSS = `
:root{--bg:#fbfaf8;--surface:#fff;--ink:#1c1b1a;--soft:#55524e;--line:#e2ded8;--accent:#7a4a2b;--quote:#f3ebe4}
@media(prefers-color-scheme:dark){:root{--bg:#16150f;--surface:#1e1d17;--ink:#ece7dd;--soft:#a9a49a;--line:#35332b;--accent:#d8a271;--quote:#2a2620}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
main{max-width:44rem;margin:0 auto;padding:1.25rem 1rem 4rem}
h1{font-size:1.5rem;line-height:1.4}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid var(--line);padding-bottom:.3rem}h3{font-size:1.05rem;margin-top:1.5rem}h4{font-size:.95rem;color:var(--soft)}
blockquote{margin:1rem 0;padding:.8rem 1rem;background:var(--quote);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;font-size:.95rem}
code{font-family:ui-monospace,Menlo,monospace;font-size:.9em;background:var(--quote);padding:.1em .35em;border-radius:4px}
pre{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.8rem 1rem;overflow-x:auto}pre code{background:none;padding:0}
.table-wrap{overflow-x:auto;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{border:1px solid var(--line);padding:.5rem .6rem;text-align:left;vertical-align:top}th{background:var(--surface)}
a{color:var(--accent)}nav{font-size:.88rem;color:var(--soft);margin-bottom:1.5rem}nav a{margin-right:.8rem}
.notice{font-size:.88rem;color:var(--soft);border:1px dashed var(--line);border-radius:8px;padding:.7rem .9rem;margin:1rem 0}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.85rem;color:var(--soft)}
@media print{nav,footer{display:none}}
`.trim();

function page(title: string, body: string, nav: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${esc(title)} — 劳动者自助仲裁手册</title><style>${CSS}</style></head>
<body><main><nav>${nav}</nav>
<div class="notice">这是一份手册，不是法律意见。每条法条都标注了来源与核验状态；标「待核验」的内容尚未经维护人核对官方原文。</div>
${body}
<footer><p>劳动者自助仲裁手册 · 七八十分的覆盖，一百分的来源。</p><p>本页为静态文件，不含脚本，不记录你的任何信息。</p></footer>
</main></body></html>`;
}

function main(): void {
const map = HandbookMapFile.parse(
  parse(readFileSync(join(ROOT, "rules", "copy", "handbook-map.yml"), "utf8"), { version: "1.2", uniqueKeys: true }),
);

mkdirSync(OUT, { recursive: true });

const nav = `<a href="../">← 回到预检工具</a><a href="./">手册目录</a>`;

for (const sec of map.sections) {
  const md = readFileSync(join(SRC, sec.file), "utf8");
  const body = markdownToHtml(md);
  writeFileSync(join(OUT, `${sec.id}.html`), page(sec.title, body, nav));
}

const readme = readFileSync(join(SRC, "README.md"), "utf8");
const toc = map.sections.map((s) => `<li><a href="./${s.id}.html">${esc(s.id)} · ${esc(s.title)}</a></li>`).join("");
writeFileSync(
  join(OUT, "index.html"),
  page("目录", `${markdownToHtml(readme.split("## 章节")[0] ?? readme)}<h2>章节</h2><ol>${toc}</ol>`, `<a href="../">← 回到预检工具</a>`),
);

console.log(`手册生成完成：${map.sections.length} 节 + 目录 → dist/handbook/`);
}

// 直接运行时才生成；被测试 import 时只导出 markdownToHtml
if (process.argv[1] && process.argv[1].endsWith("build-handbook.ts")) main();
