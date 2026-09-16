import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EndpointTemplateFile,
  HandbookMapFile,
  SourceRegistry,
  publishedSections,
} from "../src/schema/index.js";
import {
  buildAll,
  buildSourcesPage,
  linkifySourceIds,
  markdownToHtml,
  recordForPublic,
  renderSection,
  sourceIdsIn,
  whereToRead,
} from "../scripts/build-handbook.js";
import { ROOT, parseYamlFile } from "./helpers.js";

/**
 * 「手册是骨架，工具是皮」的机械保证：
 * 每个终点都能翻到章节，每个章节文件都在，草稿不上线，
 * 来源页只列已核验来源，排版加工不把标记漏成原文。
 */

const map = HandbookMapFile.parse(parseYamlFile(join(ROOT, "rules/copy/handbook-map.yml")));
const registry = SourceRegistry.parse(parseYamlFile(join(ROOT, "sources.yml")));
const templates = [
  ...EndpointTemplateFile.parse(parseYamlFile(join(ROOT, "rules/copy/classification.yml"))).templates,
  ...EndpointTemplateFile.parse(parseYamlFile(join(ROOT, "rules/copy/claim-paths.yml"))).templates,
];
const published = publishedSections(map);

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

  it("已发布章节在 docs/handbook/，草稿在 docs/handbook/drafts/，且首行是 H1", () => {
    for (const s of map.sections) {
      const dir = s.status === "published" ? "docs/handbook" : "docs/handbook/drafts";
      const f = join(ROOT, dir, s.file);
      expect(existsSync(f), `缺文件 ${dir}/${s.file}`).toBe(true);
      expect(readFileSync(f, "utf8").split("\n")[0]).toMatch(/^# \d{2} · /);
    }
  });

  it("章节编号连续且与文件名一致", () => {
    map.sections.forEach((s, i) => {
      expect(s.id).toBe(String(i + 1).padStart(2, "0"));
      expect(s.file.startsWith(`${s.id}-`)).toBe(true);
    });
  });

  it("已发布章节都有首页简介", () => {
    for (const s of published) expect(s.summary, `${s.id} 缺 summary`).toBeTruthy();
  });
});

describe("草稿不上线", () => {
  const base = {
    sections: [
      { id: "01", file: "01-a.md", title: "甲", status: "published" },
      { id: "02", file: "02-b.md", title: "乙", status: "draft" },
    ],
  };

  it("终点不得指向草稿章节", () => {
    const bad = HandbookMapFile.safeParse({ ...base, endpoints: { C00: ["02"] } });
    expect(bad.success).toBe(false);
    const ok = HandbookMapFile.safeParse({ ...base, endpoints: { C00: ["01"] } });
    expect(ok.success).toBe(true);
  });

  it("publishedSections 只返回已发布章节；status 缺省视为已发布", () => {
    const m = HandbookMapFile.parse({
      sections: [
        { id: "01", file: "01-a.md", title: "甲" },
        { id: "02", file: "02-b.md", title: "乙", status: "draft" },
      ],
      endpoints: {},
    });
    expect(publishedSections(m).map((s) => s.id)).toEqual(["01"]);
  });

  it("实际构建只产出已发布章节，drafts/ 下的文件一个都不产出", () => {
    const out = mkdtempSync(join(tmpdir(), "hb-"));
    try {
      const { pages } = buildAll(out);
      const files = readdirSync(out);
      for (const s of map.sections) {
        const html = `${s.id}.html`;
        if (s.status === "published") expect(files).toContain(html);
        else expect(files, `草稿 ${s.id} 被构建了`).not.toContain(html);
      }
      expect(pages).toContain("sources.html");
      expect(pages).toContain("index.html");
      // 草稿标题不得出现在目录页
      const index = readFileSync(join(out, "index.html"), "utf8");
      for (const s of map.sections.filter((x) => x.status === "draft")) {
        expect(index.includes(s.title), `目录页出现了草稿标题 ${s.title}`).toBe(false);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("章节排版", () => {
  const sample = [
    "# 99 · 样例",
    "",
    "> 状态：草稿。",
    "",
    "## 这一节说什么",
    "",
    "开头。",
    "",
    "## 法律怎么规定",
    "",
    "### 一、某条",
    "",
    "> 用人单位应当按时支付工资。",
    "",
    "**这条的意思**：要按时发钱。",
    "",
    "## 你现在该做什么",
    "",
    "1. 留证据",
    "",
    "## 依据",
    "",
    "| 依据 | 条文 | 来源 |",
    "| --- | --- | --- |",
    "| 某法 | 第一条 | CN-LCL-2012 |",
  ].join("\n");

  const { html, toc } = renderSection(sample);

  it("状态块与法条原文分开排版", () => {
    expect(html).toContain('<blockquote class="status">');
    expect(html).toContain('<blockquote class="law">');
  });

  it("「这条的意思」段落单独排版", () => {
    expect(html).toContain('<p class="plain">');
  });

  it("「这一节说什么」「你现在该做什么」加框，且框正确闭合", () => {
    expect(html).toContain('<section class="callout callout-intro">');
    expect(html).toContain('<section class="callout callout-action">');
    expect((html.match(/<section/g) ?? []).length).toBe((html.match(/<\/section>/g) ?? []).length);
    // 「法律怎么规定」不在框里
    const introEnd = html.indexOf("</section>");
    expect(html.indexOf("法律怎么规定")).toBeGreaterThan(introEnd);
  });

  it("h2/h3 有锚点并进入目录", () => {
    expect(toc.map((t) => t.text)).toEqual(["这一节说什么", "法律怎么规定", "一、某条", "你现在该做什么", "依据"]);
    for (const t of toc) expect(html).toContain(`id="${t.id}"`);
  });

  it("来源编号变成指向来源页的链接，编号前后粘连的不误伤", () => {
    const linked = linkifySourceIds(html, ["CN-LCL-2012"], (id) => `sources.html#${id}`);
    expect(linked).toContain('<a class="src" href="sources.html#CN-LCL-2012">CN-LCL-2012</a>');
    expect(sourceIdsIn("见 CN-LCL-2012X 与 XCN-LCL-2012", ["CN-LCL-2012"])).toEqual([]);
    expect(sourceIdsIn("见 CN-LCL-2012。", ["CN-LCL-2012"])).toEqual(["CN-LCL-2012"]);
  });

  it("已有链接内部与标签属性里的编号不再套链接", () => {
    const h = '<a href="x">CN-LCL-2012</a><span title="CN-LCL-2012">t</span>';
    expect(linkifySourceIds(h, ["CN-LCL-2012"], () => "y")).toBe(h);
  });
});

describe("Markdown 渲染安全（markdown-it，html:false）", () => {
  it("原始 HTML 被转义，不会注入", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("javascript: 链接不会生成 <a>", () => {
    const html = markdownToHtml("[x](javascript:alert(1))");
    expect(html).not.toContain("<a");
  });

  it("引用块内跨行粗体能闭合", () => {
    const html = markdownToHtml("> 状态：**第一行开头\n> 第二行结尾**）。");
    expect(html).not.toContain("**");
  });

  it("全部已发布章节排版后不残留原始标记", () => {
    for (const s of published) {
      const { html } = renderSection(readFileSync(join(ROOT, "docs/handbook", s.file), "utf8"));
      expect(html, `${s.file} 残留 **`).not.toMatch(/\*\*[^<]/);
      expect(html, `${s.file} 残留 ## `).not.toMatch(/^##? /m);
      expect(html, `${s.file} 残留表格分隔行`).not.toContain("| ---");
      expect(html, `${s.file} 框未闭合`).toSatisfy(
        (h: string) => (h.match(/<section/g) ?? []).length === (h.match(/<\/section>/g) ?? []).length,
      );
    }
  });
});

describe("来源与核验页", () => {
  const texts = published.map((section) => ({
    section,
    text: readFileSync(join(ROOT, "docs/handbook", section.file), "utf8"),
  }));
  const html = buildSourcesPage(registry.sources, texts);

  it("列出全部已核验来源，每条有锚点", () => {
    for (const s of registry.sources.filter((x) => x.page_opened_and_checked)) {
      expect(html, `缺 ${s.id}`).toContain(`id="${s.id}"`);
    }
  });

  it("未核验来源不出现在来源页", () => {
    const fake = {
      ...registry.sources[0]!,
      id: "ZZ-UNVERIFIED",
      page_title: "一份尚未核验的文件",
      page_opened_and_checked: false,
      last_verified_at: "",
      verified_by: "",
    };
    const h = buildSourcesPage([...registry.sources, fake], texts);
    expect(h).not.toContain("ZZ-UNVERIFIED");
    expect(h).not.toContain("一份尚未核验的文件");
  });

  it("每个已发布章节依据表里的来源编号，都能在来源页找到", () => {
    const ids = registry.sources.map((s) => s.id);
    for (const { section, text } of texts) {
      for (const id of sourceIdsIn(text, ids)) {
        expect(html.includes(`id="${id}"`), `${section.id} 引用的 ${id} 不在来源页`).toBe(true);
      }
    }
  });

  it("未经维护人确认的 official_url 不展示", () => {
    const s = { ...registry.sources[0]!, url: "CORPUS" as const, corpus_file: "x.txt", official_url: "https://example.gov.cn/a", official_url_checked: false };
    expect(whereToRead(s)).not.toContain("example.gov.cn");
    expect(whereToRead({ ...s, official_url_checked: true })).toContain("example.gov.cn");
  });

  it("核验记录里的网址不外露", () => {
    expect(recordForPublic("经 https://a.example.com/x 取得")).not.toContain("https://");
  });
});
