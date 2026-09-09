import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EndpointTemplateFile, HandbookMapFile } from "../src/schema/index.js";
import { markdownToHtml } from "../scripts/build-handbook.js";
import { ROOT, parseYamlFile } from "./helpers.js";

/**
 * 「手册是骨架，工具是皮」的机械保证：
 * 每个终点都能翻到章节，每个章节文件都在，转换器不把标记漏成原文。
 */

const map = HandbookMapFile.parse(parseYamlFile(join(ROOT, "rules/copy/handbook-map.yml")));
const templates = [
  ...EndpointTemplateFile.parse(parseYamlFile(join(ROOT, "rules/copy/classification.yml"))).templates,
  ...EndpointTemplateFile.parse(parseYamlFile(join(ROOT, "rules/copy/claim-paths.yml"))).templates,
];

describe("终点 → 手册映射", () => {
  it("29 个终点全部有章节可看", () => {
    for (const t of templates) {
      expect(map.endpoints[t.id]?.length ?? 0, `${t.id} 没有对应章节`).toBeGreaterThan(0);
    }
  });

  it("映射里没有幽灵终点", () => {
    const known = new Set(templates.map((t) => t.id));
    for (const id of Object.keys(map.endpoints)) expect(known.has(id), `${id} 不是已登记终点`).toBe(true);
  });

  it("每个章节文件都存在，且首行是 H1", () => {
    for (const s of map.sections) {
      const f = join(ROOT, "docs/handbook", s.file);
      expect(existsSync(f), `缺文件 ${s.file}`).toBe(true);
      expect(readFileSync(f, "utf8").split("\n")[0]).toMatch(/^# \d{2} · /);
    }
  });

  it("章节编号连续且与文件名一致", () => {
    map.sections.forEach((s, i) => {
      expect(s.id).toBe(String(i + 1).padStart(2, "0"));
      expect(s.file.startsWith(`${s.id}-`)).toBe(true);
    });
  });
});

describe("Markdown 转换器（手册用到的子集）", () => {
  it("标题、段落、粗体、行内代码", () => {
    const html = markdownToHtml("# 标题\n\n一段 **重点** 和 `代码`。");
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<p>一段 <strong>重点</strong> 和 <code>代码</code>。</p>");
  });

  it("多行引用块合并为一个 blockquote", () => {
    const html = markdownToHtml("> 第一款\n> 第二款");
    expect(html).toBe("<blockquote>第一款<br>第二款</blockquote>");
  });

  it("表格", () => {
    const html = markdownToHtml("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("有序与无序列表，含续行", () => {
    const html = markdownToHtml("1. 一\n   续\n2. 二\n\n- x\n- y");
    expect(html).toContain("<ol><li>一 续</li><li>二</li></ol>");
    expect(html).toContain("<ul><li>x</li><li>y</li></ul>");
  });

  it("HTML 会被转义，不会注入", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("不安全链接被置空", () => {
    const html = markdownToHtml("[x](javascript:alert(1))");
    expect(html).toContain('href="#"');
  });

  it("全部十节转换后不残留原始标记", () => {
    for (const s of map.sections) {
      const html = markdownToHtml(readFileSync(join(ROOT, "docs/handbook", s.file), "utf8"));
      expect(html, `${s.file} 残留 **`).not.toMatch(/\*\*[^<]/);
      expect(html, `${s.file} 残留 ## `).not.toMatch(/^##? /m);
      expect(html, `${s.file} 残留表格分隔行`).not.toContain("| ---");
    }
  });
});
