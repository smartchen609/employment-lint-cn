import { describe, expect, it } from "vitest";
import { pruneAnswers, QUESTIONS, visibleQuestions } from "../src/questions/tree.js";
import { buildFacts } from "../src/questions/build-facts.js";
import { evaluateAllApplicableRules } from "../src/engine/evaluate.js";
import { detectConflicts, resolveResult } from "../src/findings/resolve.js";
import { buildCaseExport } from "../src/export/case-export.js";
import type { Answers } from "../src/questions/types.js";
import { DERIVED_FACT_PATHS, DIRECT_FACT_PATHS } from "../src/engine/fact-paths.js";
import { loadRules, ROOT, parseYamlFile } from "./helpers.js";
import { EndpointTemplateFile, EvidenceChecklistFile } from "../src/schema/index.js";
import { join } from "node:path";

/**
 * 问题树与端到端走查。
 *
 * 「单次实际可见问题控制在 12–16 个」是 round2 §15.1 的硬指标，
 * 但它只能在**具体路径**上验证 —— 全部问题加起来当然超过 16。
 * 因此这里对每条主要路径各走一遍。
 */

const rules = loadRules().map((r) => r.rule);
const classification = EndpointTemplateFile.parse(
  parseYamlFile(join(ROOT, "rules/copy/classification.yml")),
).templates;
const claimPaths = EndpointTemplateFile.parse(
  parseYamlFile(join(ROOT, "rules/copy/claim-paths.yml")),
).templates;
const evidence = EvidenceChecklistFile.parse(parseYamlFile(join(ROOT, "rules/copy/evidence.yml")));
const templates = [...classification, ...claimPaths];

const EVAL_DATE = "2026-09-04";

function run(answers: Answers) {
  const facts = buildFacts(answers, { evaluationDate: EVAL_DATE });
  const engine = evaluateAllApplicableRules(facts, rules, { evaluationDate: EVAL_DATE });
  const resolved = resolveResult(engine, answers, templates, evidence.checklists);
  return { engine, resolved, visible: visibleQuestions(answers) };
}

/* ------------------------------------------------------------------ */
/* 场景                                                                */
/* ------------------------------------------------------------------ */

const SHENZHEN_EXTENSION: Answers = {
  G01: "FIXED_TERM_EXPIRY", G02: "EFFECTIVE", G02__date: "2026-06-30", G03: "CN-GD-SZ",
  A01: "FIXED_TERM", A02: "NONE", A03: "1", A04: "YES", A05: "NEGOTIATED",
  A06: [{ from: "2025-11-30", to: "2026-06-30" }] as never,
  A09: "false", A12: "WRITTEN", A13: "false", A14: "NONE", A15: "false",
  P01: "NOT_FILED", P02: "DAMAGES",
};

const TWO_CONTRACTS: Answers = {
  G01: "FIXED_TERM_EXPIRY", G02: "EFFECTIVE", G02__date: "2026-08-31", G03: "CN-OTHER",
  A01: "FIXED_TERM", A02: "NONE", A03: "2", A04: "NO", A07: "NONE",
  A09: "false", A11: [], A12: "WRITTEN", A13: "false", A14: "NONE", A15: "false",
  P01: "NOT_FILED", P02: "CONTINUE_PERFORMANCE", P03: "false",
};

const AI_REPLACEMENT: Answers = {
  G01: "ARTICLE_40_3", G02: "EFFECTIVE", G02__date: "2026-07-15", G03: "CN-GD-SZ",
  B01: "WRITTEN", B02: "AT_OR_BEFORE_TERMINATION", B03: "AI_AUTOMATION",
  B04: "BY_COLLEAGUES_AND_AI", B06: "SEVERANCE_ONLY", B07: "false",
  B09: "NO_OPPORTUNITY", B10: "NEITHER", P01: "NOT_FILED", P02: "DAMAGES",
};

const POST_EXPIRY_WORK: Answers = {
  G01: "FIXED_TERM_EXPIRY", G02: "EFFECTIVE", G02__date: "2026-05-31", G03: "CN-OTHER",
  A01: "FIXED_TERM", A02: "NONE", A03: "1", A04: "NO", A07: "NONE", A09: "false",
  A12: "WRITTEN", A13: "false", A15: "true", "A15.1": "NEVER", "A15.4": "STILL_WORKING",
  P01: "NOT_FILED", P02: "CONTINUE_PERFORMANCE", P03: "false",
};

const MUTUAL_SIGNED: Answers = {
  G01: "MUTUAL_TERMINATION", G02: "EFFECTIVE", G02__date: "2026-08-01", G03: "CN-GD-SZ",
  M01: "EMPLOYER", M02: "SIGNED_AGREEMENT", M03: "true",
};

const DE_FACTO: Answers = {
  G01: "DE_FACTO_TERMINATION", G02: "EFFECTIVE", G02__date: "2026-08-20", G03: "CN-GD-SZ",
  D01: "ORAL", D02: ["ACCOUNT_DISABLED", "NO_WORK_ASSIGNED", "SALARY_STOPPED"] as never,
  D03: "WRITTEN", D04: "false",
};

const OVER_ONE_YEAR: Answers = {
  G01: "ARTICLE_40_3", G02: "EFFECTIVE", G02__date: "2025-03-10", G03: "CN-OTHER",
  B01: "WRITTEN", B02: "AT_OR_BEFORE_TERMINATION", B03: "TEAM_REDUCTION",
  B04: "BY_COLLEAGUES", B06: "NONE", B07: "false", B09: "NO_OPPORTUNITY",
  B10: "NEITHER", P01: "NOT_FILED", P02: "UNDECIDED", P07: "NONE",
};

const PLAIN_EXPIRY: Answers = {
  G01: "FIXED_TERM_EXPIRY", G02: "EFFECTIVE", G02__date: "2026-08-31", G03: "CN-OTHER",
  A01: "FIXED_TERM", A02: "NONE", A03: "1", A04: "NO", A07: "NONE", A09: "false",
  A12: "WRITTEN", A13: "false", A15: "false", A16: "NOT_OFFERED",
  P01: "NOT_FILED", P02: "UNDECIDED",
};

describe("问题树结构", () => {
  it("问题编号唯一", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("写入事实的题目，其 factPath 必须已声明", () => {
    const known = new Set<string>([...DIRECT_FACT_PATHS, ...DERIVED_FACT_PATHS]);
    for (const q of QUESTIONS) {
      if (q.factPath) expect(known.has(q.factPath), `${q.id} 的 factPath ${q.factPath} 未声明`).toBe(true);
    }
  });

  it("每个选择题都有选项，且选项值唯一", () => {
    for (const q of QUESTIONS.filter((x) => x.kind === "single" || x.kind === "multi")) {
      expect(q.options?.length, `${q.id} 没有选项`).toBeGreaterThan(1);
      const vals = q.options!.map((o) => o.value);
      expect(new Set(vals).size, `${q.id} 选项值重复`).toBe(vals.length);
    }
  });

  it("只回答第一题时，不会一次性暴露全部问题", () => {
    expect(visibleQuestions({ G01: "FIXED_TERM_EXPIRY" }).length).toBeLessThan(QUESTIONS.length);
  });
});

describe("单次可见问题数控制在 12–16（round2 §15.1）", () => {
  const paths: Array<[string, Answers, number]> = [
    ["深圳协商延长", SHENZHEN_EXTENSION, 16],
    ["实签两次到期", TWO_CONTRACTS, 16],
    ["AI 替岗", AI_REPLACEMENT, 16],
    ["普通一次到期", PLAIN_EXPIRY, 16],
    ["超过一年时效", OVER_ONE_YEAR, 16],
  ];

  it.each(paths)("%s 不超过 %d 题", (_name, answers, max) => {
    expect(visibleQuestions(answers).length).toBeLessThanOrEqual(max);
  });

  it("第十一条路径最长，但不超过 17 题", () => {
    // 期满后继续用工会同时展开合同历史与第十一条两组问题，
    // 是全树最长的一条。见 docs/open-questions.md Q9。
    expect(visibleQuestions(POST_EXPIRY_WORK).length).toBeLessThanOrEqual(17);
  });

  it("协商解除与事实解除是短路径", () => {
    expect(visibleQuestions(MUTUAL_SIGNED).length).toBeLessThanOrEqual(10);
    expect(visibleQuestions(DE_FACTO).length).toBeLessThanOrEqual(10);
  });
});

describe("端到端：每条路径都产出完整结果", () => {
  const paths: Array<[string, Answers]> = [
    ["深圳协商延长", SHENZHEN_EXTENSION],
    ["实签两次到期", TWO_CONTRACTS],
    ["AI 替岗", AI_REPLACEMENT],
    ["期满后继续工作", POST_EXPIRY_WORK],
    ["协商解除已签字", MUTUAL_SIGNED],
    ["事实解除", DE_FACTO],
    ["超过一年时效", OVER_ONE_YEAR],
    ["普通一次到期", PLAIN_EXPIRY],
  ];

  it.each(paths)("%s 有定性候选、主 Warning 与证据清单", (_name, answers) => {
    const { resolved } = run(answers);
    expect(resolved).not.toBeNull();
    expect(resolved!.classification.length).toBeGreaterThan(0);
    expect(resolved!.primary.primary_warning.trim().length).toBeGreaterThan(0);
    expect(resolved!.evidence.length).toBeGreaterThan(0);
  });

  it("次级警告最多三条（round2 §1甲）", () => {
    for (const [, answers] of paths) {
      expect(run(answers).resolved!.secondary.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("路径定性正确", () => {
  it("深圳延长七个月：命中深圳规则，不命中全国一年规则", () => {
    const { engine, resolved } = run(SHENZHEN_EXTENSION);
    expect(engine.firedRuleIds).toContain("CN-SZ-HARMONIOUS-LABOR-18-2");
    expect(engine.firedRuleIds).not.toContain("CN-NAT-SPC-LABOR-II-10-1");
    expect(resolved!.primary.id).toBe("C08");
    expect(engine.complexityTriggers).toContain("深圳 6—12 个月延长合同规则成为关键依据");
  });

  it("只签过一份合同时不显示 C06（它的标题会对用户说假话）", () => {
    const ids = run(SHENZHEN_EXTENSION).resolved!.classification.map((t) => t.id);
    expect(ids).not.toContain("C06");
  });

  it("实签两次：显示 C06，主张方向为继续履行", () => {
    const { resolved } = run(TWO_CONTRACTS);
    expect(resolved!.classification.map((t) => t.id)).toContain("C06");
    expect(resolved!.claimDirection?.id).toBe("R01");
  });

  it("到期路径不得出现第四十条第三项的卡片", () => {
    for (const a of [SHENZHEN_EXTENSION, TWO_CONTRACTS, PLAIN_EXPIRY, POST_EXPIRY_WORK]) {
      const ids = run(a).resolved!.classification.map((t) => t.id);
      expect(ids).not.toContain("C13");
      expect(ids).not.toContain("C14");
      expect(ids).not.toContain("C15");
      expect(ids).not.toContain("C16");
    }
  });

  it("AI 替岗：C14 与 C13 并行出现", () => {
    const ids = run(AI_REPLACEMENT).resolved!.classification.map((t) => t.id);
    expect(ids).toContain("C14");
    expect(ids).toContain("C13");
  });

  it("超过一年：时效置顶，压过其他争点（round2 §7 R06）", () => {
    const { resolved } = run(OVER_ONE_YEAR);
    expect(resolved!.primary.id).toBe("R06");
  });

  it("已签署退出文件：进入未覆盖范围，停止自动判断", () => {
    const ids = run(MUTUAL_SIGNED).resolved!.classification.map((t) => t.id);
    expect(ids).toContain("C18");
    expect(ids).toContain("C02");
  });

  it("普通一次到期：只出 C04，不产生违法终止候选", () => {
    const { engine, resolved } = run(PLAIN_EXPIRY);
    expect(resolved!.primary.id).toBe("C04");
    expect(engine.findings.some((f) => f.id === "UNLAWFUL_TERMINATION_CANDIDATE")).toBe(false);
  });
});

describe("Case Export", () => {
  const md = buildCaseExport({
    answers: SHENZHEN_EXTENSION,
    ...run(SHENZHEN_EXTENSION),
    generatedAt: "2026-09-04T10:00:00+08:00",
  });

  it("含工具版本与规则集版本", () => {
    expect(md).toContain("tool_version: 0.1.0");
    expect(md).toContain("ruleset_version:");
    expect(md).toContain("privacy_mode: local-only");
  });

  it("含定性候选、最高优先级 Warning 与证据固定", () => {
    expect(md).toContain("## 2. 定性候选");
    expect(md).toContain("## 3. 最高优先级 Warning");
    expect(md).toContain("## 6. 证据固定");
  });

  it("不包含姓名、身份证号或公司全称字段", () => {
    for (const word of ["姓名", "身份证", "公司名称", "公司全称"]) {
      expect(md.includes(word), `Case Export 出现了 ${word}`).toBe(false);
    }
  });

  it("延长区间按日历月展开，不出现 [object Object]", () => {
    expect(md).not.toContain("[object Object]");
    expect(md).toContain("2025-11-30 至 2026-06-30（7 个日历月）");
    expect(md).toContain("累计 7 个日历月");
  });

  it("不输出任何金额或倍数结论", () => {
    expect(md).not.toMatch(/你(可以|能|将)(拿到|获得)/);
    expect(md).not.toMatch(/\d+\s*个月工资/);
  });

  it("含「需要律师重点复核的问题」，且问题由本次 Finding 生成", () => {
    expect(md).toContain("## 8. 需要律师重点复核的问题");
    expect(md).toContain("深圳地方规则与全国司法解释在本案中如何并行适用？");
    expect(md).toContain("是否存在尚未识别的程序或时效问题？");
  });

  it("未命中的 Finding 不会生成对应的复核问题", () => {
    // 本场景没有第四十条第三项相关 Finding
    expect(md).not.toContain("实质性合同变更协商");
  });

  it("使用者粘贴的解除理由原文进入报告，并标明工具不解析", () => {
    const withReason = { ...AI_REPLACEMENT, B02T: "因公司引入AI提升人效，岗位取消。" };
    const m = buildCaseExport({
      answers: withReason, ...run(withReason), generatedAt: "2026-09-04T10:00:00+08:00",
    });
    expect(m).toContain("> 因公司引入AI提升人效，岗位取消。");
    expect(m).toContain("本工具不解析该文本");
  });

  it("高复杂度时才出现专业复核区块", () => {
    expect(md).toContain("## 7. 建议专业复核");
    const plain = buildCaseExport({
      answers: PLAIN_EXPIRY,
      ...run(PLAIN_EXPIRY),
      generatedAt: "2026-09-04T10:00:00+08:00",
    });
    expect(plain.includes("## 7. 建议专业复核")).toBe(run(PLAIN_EXPIRY).engine.complexity === "HIGH");
  });
});

describe("陈旧答案剪枝", () => {
  /**
   * 用户回头改前面的答案时，后面被隐藏的题不得继续影响定性。
   * 否则规则会依据用户在界面上看不到、也改不了的事实命中。
   */
  const STALE: Answers = {
    G01: "FIXED_TERM_EXPIRY", G02: "EFFECTIVE", G02__date: "2026-06-30", G03: "CN-GD-SZ",
    A01: "FIXED_TERM", A02: "NONE",
    A03: "2",                                   // 改成了两份及以上
    A04: "YES", A05: "NEGOTIATED",              // 这两题已因此不可见
    A06: [{ from: "2025-05-30", to: "2026-06-30" }] as never,
    A09: "false", A11: [], A12: "WRITTEN", A13: "false", A14: "NONE", A15: "false",
    P01: "NOT_FILED", P02: "DAMAGES",
  };

  it("不可见问题的答案被剪掉", () => {
    const pruned = pruneAnswers(STALE);
    expect(pruned["A04"]).toBeUndefined();
    expect(pruned["A05"]).toBeUndefined();
    expect(pruned["A06"]).toBeUndefined();
    expect(pruned["A03"]).toBe("2");
  });

  it("级联隐藏也被处理（A04 不可见后 A05 也不该留下）", () => {
    const visible = visibleQuestions(pruneAnswers(STALE)).map((q) => q.id);
    expect(visible).not.toContain("A04");
    expect(visible).not.toContain("A05");
    expect(visible).not.toContain("A06");
  });

  it("附带日期随主答案一起剪掉", () => {
    const pruned = pruneAnswers({ ...STALE, "A15.1": "NEVER", "A15.1__date": "2026-08-01" });
    expect(pruned["A15.1"]).toBeUndefined();
    expect(pruned["A15.1__date"]).toBeUndefined();
  });

  it("陈旧的延长答案不再命中延长规则", () => {
    const { engine } = run(STALE);
    expect(engine.firedRuleIds).not.toContain("CN-NAT-SPC-LABOR-II-10-1");
    expect(engine.firedRuleIds).not.toContain("CN-SZ-HARMONIOUS-LABOR-18-2");
  });

  it("Case Export 不列已被剪掉的问题", () => {
    const md = buildCaseExport({ answers: STALE, ...run(STALE), generatedAt: "2026-09-04T10:00:00+08:00" });
    expect(md).not.toContain("**A05**");
    expect(md).not.toContain("**A06**");
  });

  it("非问题键（evaluation_date）不被剪掉", () => {
    const pruned = pruneAnswers({ ...STALE, evaluation_date: "2026-09-04" } as Answers);
    expect(pruned["evaluation_date"]).toBe("2026-09-04");
  });
});

describe("答案冲突检测（C19）", () => {
  it("公司先说不续签又持续派活 —— 报冲突并说清是哪两条", () => {
    const a: Answers = {
      ...POST_EXPIRY_WORK, "A15.1": "CONFLICTING",
    };
    const c = detectConflicts(a);
    expect(c.length).toBeGreaterThan(0);
    expect(c[0]).toContain("表态不一致");
    expect(c[0]).toContain("第十一条");
  });

  it("拒绝续订又主张无固定期限义务 —— 报冲突", () => {
    const c = detectConflicts({ ...TWO_CONTRACTS, A12: "REFUSED" });
    expect(c.some((x) => x.includes("拒绝续订"))).toBe(true);
  });

  it("没有书面文件却填了书面理由时点 —— 报冲突", () => {
    const c = detectConflicts({ ...AI_REPLACEMENT, B01: "NONE" });
    expect(c.some((x) => x.includes("书面解除文件"))).toBe(true);
  });

  it("说清了岗位条款却又说没谈过岗位 —— 报冲突", () => {
    const c = detectConflicts({ ...AI_REPLACEMENT, B07: "true", B06: "SEVERANCE_ONLY" });
    expect(c.some((x) => x.includes("具体方案"))).toBe(true);
  });

  it("无冲突的正常路径不误报", () => {
    for (const a of [SHENZHEN_EXTENSION, TWO_CONTRACTS, PLAIN_EXPIRY, DE_FACTO]) {
      expect(detectConflicts(a), JSON.stringify(a["G01"])).toEqual([]);
    }
  });

  it("冲突会触发 C19，并进入 Case Export", () => {
    const a: Answers = { ...POST_EXPIRY_WORK, "A15.1": "CONFLICTING" };
    const { resolved } = run(a);
    expect(resolved!.classification.map((t) => t.id)).toContain("C19");
    const md = buildCaseExport({ answers: a, ...run(a), generatedAt: "2026-09-04T10:00:00+08:00" });
    expect(md).toContain("## 7b. 你的答案中存在的冲突");
  });
});
