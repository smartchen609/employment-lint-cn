import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { RuleRecord } from "../src/schema/index.js";
import { evaluateAllApplicableRules } from "../src/engine/evaluate.js";
import { evaluateCondition } from "../src/engine/conditions.js";
import { deriveFacts, getFact } from "../src/engine/facts.js";

/**
 * 引擎语义测试 —— CLAUDE.md §5 的四条不可违反的语义。
 *
 * 这些测试与 fixture 回放是两回事：回放验证"结果对不对"，
 * 本文件验证"结构对不对"，即使将来规则改了也必须成立。
 */

const ROOT = new URL("..", import.meta.url).pathname;
function walk(dir: string): string[] {
  let out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (e.endsWith(".yml")) out.push(p);
  }
  return out.sort();
}
const rules = walk(join(ROOT, "rules")).map((f) =>
  RuleRecord.parse(parse(readFileSync(f, "utf8"), { version: "1.2", uniqueKeys: true })),
);

const baseExpiry = {
  evaluation_date: "2026-09-04",
  scope: { principal_place_of_performance: "CN-GD-SZ", dispute_category: "TERMINATION_OR_EXPIRY" },
  operation: { selected_shape: "FIXED_TERM_EXPIRY", effective_status: "EFFECTIVE" },
  contract: {
    type: "FIXED_TERM",
    expired: true,
    fixed_term_count: 1,
    deemed_second_fixed_term: false,
    extension: { nature: "NONE", period_expired: false },
    automatic_extension: { agreed: false, continued_performance: false, extended_period_expired: false },
    entity_change: { occurred: false },
    avoidance_patterns: [],
  },
  post_expiry: { actual_work_continued: false, employer_later_terminated: false },
  renewal: { employee_willingness: "WRITTEN", employee_requested_fixed_term: false, statutory_exception: "NONE" },
};

describe("语义一 · 多 Finding 并行，不得命中一条就停止", () => {
  it("第十条第一项与第三项可同时命中", () => {
    const facts = structuredClone(baseExpiry) as Record<string, any>;
    facts["contract"].extension = { nature: "NEGOTIATED", period_expired: true, cumulative_calendar_months: 13 };
    facts["contract"].entity_change = {
      occurred: true, not_at_employee_request: true,
      same_workplace: true, same_role: true, management_continued: true,
    };
    const r = evaluateAllApplicableRules(facts, rules);
    expect(r.firedRuleIds).toContain("CN-NAT-SPC-LABOR-II-10-1");
    expect(r.firedRuleIds).toContain("CN-NAT-SPC-LABOR-II-10-3");
  });

  it("第十条与第十一条并行 —— 命中第十条不得阻止第十一条（round3 §4）", () => {
    const facts = structuredClone(baseExpiry) as Record<string, any>;
    facts["contract"].fixed_term_count = 2;
    facts["contract"].expiry_date = "2026-05-31";
    facts["post_expiry"] = {
      actual_work_continued: true,
      employer_first_objection_date: null,
      employer_later_terminated: false,
    };
    facts["indefinite_term"] = { eligibility_candidate: true };
    const r = evaluateAllApplicableRules(facts, rules);
    expect(r.firedRuleIds).toContain("CN-NAT-SPC-LABOR-II-11");
    expect(r.firedRuleIds).toContain("CN-NAT-LCL-14-2-3");
  });

  it("深圳规则与全国规则同时命中时都出现，不互相覆盖", () => {
    const facts = structuredClone(baseExpiry) as Record<string, any>;
    facts["contract"].extension = { nature: "NEGOTIATED", period_expired: true, cumulative_calendar_months: 13 };
    const r = evaluateAllApplicableRules(facts, rules);
    expect(r.firedRuleIds).toContain("CN-SZ-HARMONIOUS-LABOR-18-2");
    expect(r.firedRuleIds).toContain("CN-NAT-SPC-LABOR-II-10-1");
  });
});

describe("语义二 · 最终不确定性取规则与证据两者中的较高者", () => {
  it("规则为 rule-based，但证据只有口头时降为 fact-sensitive", () => {
    const strong = structuredClone(baseExpiry) as Record<string, any>;
    strong["contract"].fixed_term_count = 2;
    const a = evaluateAllApplicableRules(strong, rules).findings
      .find((f) => f.id === "INDEFINITE_TERM_OBLIGATION_CANDIDATE");
    expect(a?.ruleUncertainty).toBe("fact-sensitive");

    const weak = structuredClone(strong);
    weak["renewal"].employee_willingness = "ORAL";
    const b = evaluateAllApplicableRules(weak, rules).findings
      .find((f) => f.id === "INDEFINITE_TERM_OBLIGATION_CANDIDATE");
    expect(b?.uncertainty).toBe("fact-sensitive");
  });

  it("规则声明的档位不会被证据拉低，只会被拉高", () => {
    const facts = structuredClone(baseExpiry) as Record<string, any>;
    facts["contract"].avoidance_patterns = ["NOMINAL_WORK_INTERRUPTION"];
    const f = evaluateAllApplicableRules(facts, rules).findings
      .find((x) => x.id === "GOOD_FAITH_AVOIDANCE_CANDIDATE");
    // 规则本身是 judicial-discretion（最高档），证据充分也不得降为 rule-based
    expect(f?.uncertainty).toBe("judicial-discretion");
  });
});

describe("语义三 · 严重程度与不确定性是两个独立维度", () => {
  it("同一 Finding 同时带 severity 与 uncertainty，互不推导", () => {
    const facts = structuredClone(baseExpiry) as Record<string, any>;
    facts["operation"].selected_shape = "ARTICLE_40_3";
    facts["objective_change"] = {
      cause_category: "AI_AUTOMATION", original_work_continues: "BY_COLLEAGUES_AND_AI",
      consultation_type: "SEVERANCE_ONLY", concrete_offer_terms_complete: false,
      adverse_changes: ["UNKNOWN"], employee_response: "NO_OPPORTUNITY",
      notice_or_one_month_pay: "NEITHER",
    };
    const r = evaluateAllApplicableRules(facts, rules);
    const gap = r.findings.find((f) => f.id === "ARTICLE_40_3_CONSULTATION_GAP");
    const ai = r.findings.find((f) => f.id === "ARTICLE_40_3_CAUSE_NOT_ESTABLISHED_ALONE");
    expect(gap?.severity).toBe("error");
    expect(gap?.uncertainty).toBe("fact-sensitive");
    expect(ai?.severity).toBe("warning");
    expect(ai?.uncertainty).toBe("judicial-discretion");
  });

  it("表面完整规则的 severity 是 info，且不产生违法解除候选", () => {
    const facts = structuredClone(baseExpiry) as Record<string, any>;
    facts["operation"].selected_shape = "ARTICLE_40_3";
    facts["objective_change"] = {
      cause_category: "EXTERNAL_POLICY_OR_FORCE", original_work_continues: "FULLY_STOPPED",
      consultation_type: "CONCRETE_POSITION_OFFERED", concrete_offer_terms_complete: true,
      adverse_changes: ["SUBSTANTIALLY_EQUIVALENT"], employee_response: "REFUSED_WITH_REASONS",
      notice_or_one_month_pay: "THIRTY_DAYS_WRITTEN_NOTICE",
    };
    const r = evaluateAllApplicableRules(facts, rules);
    const f = r.findings.find((x) => x.id === "ARTICLE_40_3_NO_CONFLICT_FOUND_WITHIN_COVERAGE");
    expect(f?.severity).toBe("info");
    expect(r.findings.some((x) => x.id === "UNLAWFUL_TERMINATION_CANDIDATE")).toBe(false);
  });
});

describe("语义四 · 复杂度是触发式判断，不是评分", () => {
  it("结果只有 NORMAL / HIGH 两种，并附具体触发原因", () => {
    const facts = structuredClone(baseExpiry) as Record<string, any>;
    facts["contract"].extension = { nature: "NEGOTIATED", period_expired: true, cumulative_calendar_months: 7 };
    const r = evaluateAllApplicableRules(facts, rules);
    expect(["NORMAL", "HIGH"]).toContain(r.complexity);
    expect(r.complexity).toBe("HIGH");
    expect(r.complexityTriggers).toContain("深圳 6—12 个月延长合同规则成为关键依据");
  });

  it("不输出任何数值评分", () => {
    const r = evaluateAllApplicableRules(baseExpiry, rules);
    expect(JSON.stringify(r)).not.toMatch(/"(score|risk_score|complexity_score)"/);
  });
});

describe("条件求值 · 缺失事实一律为不成立", () => {
  it("缺失事实不因 not_equals 而意外成立", () => {
    expect(evaluateCondition(
      { fact: "contract.type", operator: "not_equals", value: "FIXED_TERM" },
      {},
    )).toBe(false);
  });

  it("缺失事实的 in / includes_any 均为 false", () => {
    expect(evaluateCondition({ fact: "a.b", operator: "in", value: ["X"] }, {})).toBe(false);
    expect(evaluateCondition({ fact: "a.b", operator: "includes_any", value: ["X"] }, {})).toBe(false);
  });

  it("exists 正确区分缺失与存在", () => {
    expect(evaluateCondition({ fact: "a.b", operator: "exists" }, {})).toBe(false);
    expect(evaluateCondition({ fact: "a.b", operator: "exists" }, { a: { b: false } })).toBe(true);
  });
});

describe("派生事实 · 由日期真算，而不是读现成布尔值", () => {
  it("按到期日与异议日计算是否超过一个日历月", () => {
    const d = deriveFacts(
      {
        contract: { expiry_date: "2026-01-31" },
        post_expiry: { actual_work_continued: true, employer_first_objection_date: "2026-03-01" },
      },
      "2026-12-31",
    );
    expect(getFact(d, "post_expiry.no_objection_exceeds_one_calendar_month")).toBe(true);
  });

  it("恰好满一个日历月不算超过", () => {
    const d = deriveFacts(
      {
        contract: { expiry_date: "2026-01-31" },
        post_expiry: { actual_work_continued: true, employer_first_objection_date: "2026-02-28" },
      },
      "2026-12-31",
    );
    expect(getFact(d, "post_expiry.no_objection_exceeds_one_calendar_month")).toBe(false);
  });

  it("时效按日历年计算", () => {
    const d = deriveFacts({ operation: { effective_date: "2025-03-10" } }, "2026-03-10");
    expect(getFact(d, "procedure.limitation_exceeds_one_calendar_year")).toBe(false);
    const e = deriveFacts({ operation: { effective_date: "2025-03-10" } }, "2026-03-11");
    expect(getFact(e, "procedure.limitation_exceeds_one_calendar_year")).toBe(true);
  });
});
