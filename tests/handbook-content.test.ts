import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { ROOT } from "./helpers.js";
import { checkFiles, extractBlockquotes, handbookFiles, sentencesOf } from "../scripts/check-quotes.js";

/**
 * 手册内容防线。
 *
 * 1. 引文逐字：每段 `>` 原文必须能在维护人汇编里逐字找到，或登记在 external-quotes.yml。
 * 2. 锚点：维护人确认过的关键内容不得被改丢（含 drafts/ 下的同名修订稿）。
 *
 * 设置 HANDBOOK_CHECK_DRAFTS=0 可在草稿写作途中只检查已发布章节。
 */

const HB = join(ROOT, "docs/handbook");
const DRAFTS = join(HB, "drafts");
const includeDrafts = process.env["HANDBOOK_CHECK_DRAFTS"] !== "0";

const published = readdirSync(HB).filter((f) => /^\d{2}-.+\.md$/.test(f));

describe("引文逐字核对", () => {
  it("核对器能识别引用块与句子，跳过章节状态块", () => {
    const blocks = extractBlockquotes(
      "> 状态：草稿\n\n正文\n\n> 用人单位应当按时支付工资。劳动者应当完成工作任务；\n> ……\n> 第三句也要足够长才会被核对。",
    );
    expect(blocks).toHaveLength(1);
    expect(sentencesOf(blocks[0]!)).toEqual([
      "用人单位应当按时支付工资。",
      "劳动者应当完成工作任务；",
      "第三句也要足够长才会被核对。",
    ]);
  });

  it("核对器会抓出编造的引文", () => {
    const dir = join(ROOT, "node_modules", ".tmp-quote-test");
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, "fake.md");
    writeFileSync(tmp, "> 用人单位应当向劳动者支付三倍工资作为特别奖励，本条为测试用的编造条文。\n");
    try {
      expect(checkFiles([tmp]).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("核对器放行汇编里真实存在的原文", () => {
    const dir = join(ROOT, "node_modules", ".tmp-quote-test-2");
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, "real.md");
    writeFileSync(tmp, "> 劳动者提前三十日以书面形式通知用人单位，可以解除劳动合同。\n");
    try {
      expect(checkFiles([tmp])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const files = handbookFiles().filter((f) => includeDrafts || !f.includes("/drafts/"));
  it.each(files.map((f) => f.replace(ROOT, "")))("%s 的引文均可逐字溯源", (rel) => {
    const misses = checkFiles([join(ROOT, rel)]);
    expect(
      misses.map((m) => m.sentence),
      "以下引文在汇编与外部登记中都找不到",
    ).toEqual([]);
  });

  it("external-quotes.yml 的来源均已登记", () => {
    const ext = parse(readFileSync(join(HB, "external-quotes.yml"), "utf8")) as {
      quotes: Array<{ source_id: string }>;
    };
    const reg = parse(readFileSync(join(ROOT, "sources.yml"), "utf8")) as { sources: Array<{ id: string }> };
    const ids = new Set([...reg.sources.map((s) => s.id), "PROJECT-COPY"]);
    for (const q of ext.quotes) expect(ids.has(q.source_id), `${q.source_id} 未登记`).toBe(true);
  });
});

describe("维护人确认内容的锚点", () => {
  const anchors = parse(readFileSync(join(HB, "anchors.yml"), "utf8")) as {
    sections: Record<string, string[]>;
  };

  it("每个锚点章节都存在", () => {
    for (const id of Object.keys(anchors.sections)) {
      expect(
        published.some((f) => f.startsWith(`${id}-`)),
        `锚点指向不存在的章节 ${id}`,
      ).toBe(true);
    }
  });

  for (const [id, list] of Object.entries(anchors.sections)) {
    const file = published.find((f) => f.startsWith(`${id}-`));
    if (!file) continue;
    it(`${id} 已发布版保留全部锚点`, () => {
      const text = readFileSync(join(HB, file), "utf8");
      for (const a of list) expect(text.includes(a), `丢失：${a}`).toBe(true);
    });
    if (includeDrafts && existsSync(join(DRAFTS, file))) {
      it(`${id} 修订草稿保留全部锚点`, () => {
        const text = readFileSync(join(DRAFTS, file), "utf8");
        for (const a of list) expect(text.includes(a), `草稿丢失：${a}`).toBe(true);
      });
    }
  }
});
