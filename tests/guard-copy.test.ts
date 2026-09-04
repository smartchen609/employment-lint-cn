import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { EndpointTemplateFile, EvidenceChecklistFile } from "../src/schema/index.js";

/**
 * 守卫测试 A · 文案禁止表达扫描。round2 §6.5、CLAUDE.md §P4。
 *
 * 扫描**全部面向用户的文案**：rules/copy/ 下的三个 YAML，
 * 以及规则 YAML 中会被展示的 headline / explanation / claim_guidance。
 *
 * 命中任一禁止字符串即失败。**本清单不设豁免。**
 * 唯一的例外是裸词「合法」—— 见下方 LAWFUL_ASSERTIONS 的说明。
 */

const ROOT = new URL("..", import.meta.url).pathname;

/** round2 §6.5 明令禁止的表达。 */
const FORBIDDEN = [
  "一定能拿",
  "稳了",
  "稳赢",
  "100%违法",
  "必然支持",
  "一定败诉",
  "足够胜诉",
  "通过检查",
  "没有风险",
  "成功率",
  "系统已经认定",
  "PASS",
  "ALL CHECKS PASSED",
  "建议你马上仲裁",
];

/**
 * 「合法」是裸词，会误伤"不代表解除合法""公司后来解除是否合法"
 * 这类正当句子 —— 那恰恰是本产品必须说的话。
 * 因此对它改用**断言式搭配**匹配：只拦真正下结论的用法。
 * 该豁免经维护人确认（2026-09-03）。
 */
const LAWFUL_ASSERTIONS = [
  /属于合法/,
  /确认合法/,
  /认定为合法/,
  /已经合法/,
  /解除合法(?![，。」"]*$)/,
];

function walk(dir: string, ext = ".yml"): string[] {
  let out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, ext));
    else if (e.endsWith(ext)) out.push(p);
  }
  return out.sort();
}

const load = (f: string) => parse(readFileSync(f, "utf8"), { version: "1.2", uniqueKeys: true });

/** 收集一个模板中全部会显示给用户的字符串。 */
function stringsOf(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => stringsOf(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      // deviation_note 是给维护者看的元数据，不展示给用户；
      // 它需要引用原文中的禁止表达来说明为什么改写，故排除。
      if (k === "deviation_note") continue;
      stringsOf(v, out);
    }
  }
  return out;
}

const classification = EndpointTemplateFile.parse(
  load(join(ROOT, "rules/copy/classification.yml")),
);
const claimPaths = EndpointTemplateFile.parse(load(join(ROOT, "rules/copy/claim-paths.yml")));
const evidence = EvidenceChecklistFile.parse(load(join(ROOT, "rules/copy/evidence.yml")));

const allTemplates = [...classification.templates, ...claimPaths.templates];

describe("守卫 A · 输出模板不含禁止表达", () => {
  it.each(allTemplates)("$id", (template) => {
    for (const text of stringsOf(template)) {
      for (const word of FORBIDDEN) {
        expect(text.includes(word), `${template.id} 命中禁止表达「${word}」：${text}`).toBe(false);
      }
      for (const re of LAWFUL_ASSERTIONS) {
        expect(re.test(text), `${template.id} 出现断言式「合法」：${text}`).toBe(false);
      }
    }
  });

  it("证据清单与边界提示不含禁止表达", () => {
    for (const text of stringsOf(evidence)) {
      for (const word of FORBIDDEN) {
        expect(text.includes(word), `证据清单命中「${word}」：${text}`).toBe(false);
      }
    }
  });
});

describe("守卫 A · 规则中的展示文案不含禁止表达", () => {
  const ruleFiles = walk(join(ROOT, "rules")).filter((f) => !f.includes("/copy/"));
  it.each(ruleFiles.map((f) => ({ file: f.replace(ROOT, ""), path: f })))(
    "$file",
    ({ path }) => {
      const rule = load(path) as Record<string, unknown>;
      const shown = stringsOf([rule["findings"], rule["claim_guidance"], rule["title"]]);
      for (const text of shown) {
        for (const word of FORBIDDEN) {
          expect(text.includes(word), `命中「${word}」：${text}`).toBe(false);
        }
        for (const re of LAWFUL_ASSERTIONS) {
          expect(re.test(text), `出现断言式「合法」：${text}`).toBe(false);
        }
      }
    },
  );
});

describe("守卫 A · 不得出现全局通过状态", () => {
  it("没有任何模板宣称整体通过", () => {
    for (const t of allTemplates) {
      const text = stringsOf(t).join("");
      expect(text).not.toMatch(/全部(检查|规则)?(均)?(已)?通过/);
      expect(text).not.toMatch(/未发现任何(问题|风险)/);
    }
  });

  it("C16 的表述限定在覆盖范围内，而不是宣告解除成立", () => {
    const c16 = classification.templates.find((t) => t.id === "C16")!;
    const text = stringsOf(c16).join("\n");
    expect(text).toContain("暂未发现明显冲突");
    expect(text).toContain("本工具没有完整审查");
  });
});

describe("守卫 A · 结构纪律", () => {
  it("每个终点有且只有一条最高优先级 Warning", () => {
    for (const t of allTemplates) {
      expect(t.primary_warning.trim().length, `${t.id} 缺 primary_warning`).toBeGreaterThan(0);
    }
  });

  it("规格书里的 29 个终点全部落地", () => {
    const ids = allTemplates.map((t) => t.id).sort();
    const expected = [
      ...Array.from({ length: 23 }, (_, i) => `C${String(i).padStart(2, "0")}`),
      ...Array.from({ length: 6 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`),
    ].sort();
    expect(ids).toEqual(expected);
  });

  it("偏离规格书原文的模板必须写明 deviation_note", () => {
    // C15 / C16 / C19 因规格书原文含 §6.5 禁止表达而改写，必须留档
    for (const id of ["C15", "C16", "C19"]) {
      const t = classification.templates.find((x) => x.id === id)!;
      expect(t.deviation_note, `${id} 改写了原文但未留档`).toBeTruthy();
    }
  });
});
