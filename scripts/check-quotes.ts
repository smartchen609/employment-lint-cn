/**
 * 手册引文逐字核对。
 *
 * 手册（含 docs/handbook/drafts/ 草稿）里每一段 `>` 引用的原文，按句切开后，
 * 每一句都必须满足其一：
 *   1. 能在 docs/law-corpus/ 维护人汇编里逐字找到（忽略空白与全角空格）；
 *   2. 登记在 docs/handbook/external-quotes.yml，并指向 sources.yml 里的来源。
 *
 * 这把"引文逐字确认"从维护人的人工核对变成了机器检查。
 * 维护人仍需判断的是：条文是否现行有效、白话解释是否准确 —— 那是机器做不了的。
 *
 * 用法：
 *   npx tsx scripts/check-quotes.ts                 # 检查全部章节与草稿
 *   npx tsx scripts/check-quotes.ts path/to/a.md    # 只检查指定文件
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname, "..");
const CORPUS_DIR = join(ROOT, "docs", "law-corpus");
const HANDBOOK_DIR = join(ROOT, "docs", "handbook");
const DRAFTS_DIR = join(HANDBOOK_DIR, "drafts");

export const normalize = (t: string): string => t.replace(/[\s　]+/g, "");

export interface QuoteMiss {
  file: string;
  sentence: string;
}

/** 从 Markdown 中抽出引用块（跳过章节头部的「状态：」块）。 */
export function extractBlockquotes(md: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of md.split("\n")) {
    if (line.startsWith(">")) cur.push(line.replace(/^>\s?/, ""));
    else if (cur.length) {
      blocks.push(cur.join("\n"));
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur.join("\n"));
  return blocks.filter((b) => !b.trim().startsWith("状态："));
}

/** 引用块 → 需要逐字核对的句子。省略号两侧分开核对；过短的片段（<8 字）不核。 */
export function sentencesOf(block: string): string[] {
  const out: string[] = [];
  for (const seg of block.split(/……|\.\.\./)) {
    for (const raw of seg.split(/(?<=[。；：])/)) {
      const cleaned = raw.replace(/^\s*（[一二三四五六七八九十]+）/, "").replace(/^\s*\(\d+\)/, "");
      if (normalize(cleaned).length >= 8) out.push(raw.trim());
    }
  }
  return out;
}

export function loadCorpus(): string[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => normalize(readFileSync(join(CORPUS_DIR, f), "utf8")));
}

export function loadExternalQuotes(): Array<{ source_id: string; text: string }> {
  const f = join(HANDBOOK_DIR, "external-quotes.yml");
  if (!existsSync(f)) return [];
  const data = parse(readFileSync(f, "utf8")) as { quotes?: Array<{ source_id: string; text: string }> };
  return data.quotes ?? [];
}

export function handbookFiles(): string[] {
  const published = readdirSync(HANDBOOK_DIR)
    .filter((f) => /^\d{2}-.+\.md$/.test(f))
    .map((f) => join(HANDBOOK_DIR, f));
  const drafts = existsSync(DRAFTS_DIR)
    ? readdirSync(DRAFTS_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => join(DRAFTS_DIR, f))
    : [];
  return [...published, ...drafts].sort();
}

export function checkFiles(files: string[]): QuoteMiss[] {
  const corpus = loadCorpus();
  const external = loadExternalQuotes().map((q) => normalize(q.text.replace(/^\s*（[一二三四五六七八九十]+）/, "")));
  const misses: QuoteMiss[] = [];
  for (const file of files) {
    const md = readFileSync(file, "utf8");
    for (const block of extractBlockquotes(md)) {
      for (const sentence of sentencesOf(block)) {
        const n = normalize(sentence.replace(/^\s*（[一二三四五六七八九十]+）/, ""));
        const inCorpus = corpus.some((c) => c.includes(n));
        const inExternal = external.some((e) => e.includes(n) || n.includes(e));
        if (!inCorpus && !inExternal) misses.push({ file: relative(ROOT, file), sentence });
      }
    }
  }
  return misses;
}

// 直接运行时
if (process.argv[1] && process.argv[1].endsWith("check-quotes.ts")) {
  const args = process.argv.slice(2).map((a) => resolve(a));
  const files = args.length ? args : handbookFiles();
  const misses = checkFiles(files);
  console.log(`── check-quotes ── 检查 ${files.length} 个文件`);
  if (misses.length) {
    for (const m of misses) console.error(`  ✗ ${m.file}\n      ${m.sentence}`);
    console.error(`\n${misses.length} 句引文在汇编与外部来源登记中都找不到。` +
      `\n请从 docs/law-corpus/ 原文逐字复制，或删去该引文。`);
    process.exit(1);
  }
  console.log("  · 全部引文均可在汇编或已登记外部来源中逐字找到");
}
