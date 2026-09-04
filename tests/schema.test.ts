import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { RuleRecord, SourceRegistry, TestFixture } from "../src/schema/index.js";

/**
 * P0 schema 守卫测试。
 *
 * 这些测试保护的不是代码风格，而是 CLAUDE.md 里的硬约束：
 * 字段命名按 round3、案例规则不得覆盖法律法规、未核验来源不得被当作已核验。
 */

/** 一条结构完整的最小规则，供各用例改写。字段名一律按 round3。 */
function baseRule(): Record<string, unknown> {
  return {
    id: "TEST-RULE-1",
    version: "1.0.0",
    status: "active",
    title: "测试规则",
    jurisdiction: { country: "CN", level: "national" },
    provision_effective: { from: "2025-09-01", to: null },
    authority_type: "judicial-interpretation",
    uncertainty: "rule-based",
    severity: "warning",
    legal_basis: [{ source_id: "SPC-LABOR-II-2025", article: "第十条" }],
    conditions: {
      all: [{ fact: "contract.type", operator: "equals", value: "fixed-term" }],
    },
    findings: { classification_candidates: ["DEEMED_SECOND_FIXED_TERM"] },
    claim_guidance: { review_required: false },
    evidence: {},
    tests: ["T04"],
    last_reviewed_at: "2026-09-03",
  };
}

describe("RuleRecord · 字段命名按 round3", () => {
  it("接受 provision_effective", () => {
    expect(RuleRecord.safeParse(baseRule()).success).toBe(true);
  });

  it("拒绝 round2 的旧字段名 effective", () => {
    const r = baseRule();
    delete r["provision_effective"];
    r["effective"] = { from: "2025-09-01", to: null };
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });

  it("拒绝 round2 的 jurisdiction.regions 写法", () => {
    const r = baseRule();
    r["jurisdiction"] = { country: "CN", level: "national", regions: ["CN"] };
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });

  it("非全国规则必须指定 province", () => {
    const r = baseRule();
    r["jurisdiction"] = { country: "CN", level: "special-economic-zone-regulation" };
    expect(RuleRecord.safeParse(r).success).toBe(false);

    const ok = baseRule();
    ok["jurisdiction"] = {
      country: "CN",
      province: "GD",
      city: "SZ",
      level: "special-economic-zone-regulation",
    };
    expect(RuleRecord.safeParse(ok).success).toBe(true);
  });

  it("level: national 不得同时指定 province 或 city", () => {
    const r = baseRule();
    r["jurisdiction"] = { country: "CN", province: "GD", level: "national" };
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });
});

describe("RuleRecord · 案例规则不得覆盖法律法规（round2 §11.5）", () => {
  it("published-case 规则不得 overrides 任何规则", () => {
    const r = baseRule();
    r["authority_type"] = "published-case";
    r["overrides"] = ["CN-NAT-SPC-LABOR-II-10-1"];
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });

  it("案例来源只能是 interpretive-signal 或 supporting，不能是 binding", () => {
    const r = baseRule();
    r["authority_type"] = "published-case";
    r["sources"] = [{ source_id: "GUANGZHOU-WEI-AI-CASE", binding_role: "binding" }];
    expect(RuleRecord.safeParse(r).success).toBe(false);

    const ok = baseRule();
    ok["authority_type"] = "published-case";
    ok["sources"] = [
      { source_id: "GUANGZHOU-WEI-AI-CASE", binding_role: "interpretive-signal" },
    ];
    expect(RuleRecord.safeParse(ok).success).toBe(true);
  });
});

describe("RuleRecord · 结构纪律", () => {
  it("legal_basis 不得为空", () => {
    const r = baseRule();
    r["legal_basis"] = [];
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });

  it("legal_basis 中不得直接写 URL", () => {
    const r = baseRule();
    r["legal_basis"] = [
      { source_id: "SPC-LABOR-II-2025", article: "第十条", url: "https://example.com" },
    ];
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });

  it("tests 不得为空 —— 每条规则都要能追到回归用例", () => {
    const r = baseRule();
    r["tests"] = [];
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });

  it("叶子条件必须且只能指定 fact 或 derived_fact 之一", () => {
    const both = baseRule();
    both["conditions"] = {
      fact: "a.b",
      derived_fact: "c.d",
      operator: "equals",
      value: 1,
    };
    expect(RuleRecord.safeParse(both).success).toBe(false);

    const neither = baseRule();
    neither["conditions"] = { operator: "equals", value: 1 };
    expect(RuleRecord.safeParse(neither).success).toBe(false);
  });

  it("findings 的两种写法不得混用", () => {
    const r = baseRule();
    r["findings"] = {
      classification_candidates: ["A"],
      base: ["B"],
    };
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });

  it("未知字段一律拒绝（防止字段名漂移悄悄通过）", () => {
    const r = baseRule();
    r["severtiy"] = "warning";
    expect(RuleRecord.safeParse(r).success).toBe(false);
  });
});

describe("SourceRegistry · 核验状态纪律", () => {
  const base = {
    id: "X-SOURCE",
    publisher: "某机关",
    authority_level: "national-statute",
    page_title: "某法",
    official: true,
    url: "https://example.gov.cn/a",
    pinpoint: ["第一条"],
    page_opened_and_checked: false,
    last_verified_at: "",
    verified_by: "",
    status: "active",
  };

  it("未核验来源可以留空 last_verified_at / verified_by", () => {
    expect(SourceRegistry.safeParse({ sources: [base] }).success).toBe(true);
  });

  it("声称已核验但未填 last_verified_at 的，拒绝", () => {
    const s = { ...base, page_opened_and_checked: true, verified_by: "维护人" };
    expect(SourceRegistry.safeParse({ sources: [s] }).success).toBe(false);
  });

  it("声称已核验但未填 verified_by 的，拒绝", () => {
    const s = { ...base, page_opened_and_checked: true, last_verified_at: "2026-09-03" };
    expect(SourceRegistry.safeParse({ sources: [s] }).success).toBe(false);
  });

  it("URL 仍为 TODO_VERIFY 却声称已核验的，拒绝", () => {
    const s = {
      ...base,
      url: "TODO_VERIFY",
      page_opened_and_checked: true,
      last_verified_at: "2026-09-03",
      verified_by: "维护人",
    };
    expect(SourceRegistry.safeParse({ sources: [s] }).success).toBe(false);
  });

  it("source id 重复的，拒绝", () => {
    expect(SourceRegistry.safeParse({ sources: [base, { ...base }] }).success).toBe(false);
  });
});

describe("sources.yml 实文件", () => {
  const registry = SourceRegistry.parse(
    parse(readFileSync(new URL("../sources.yml", import.meta.url), "utf8"), {
      version: "1.2",
      uniqueKeys: true,
    }),
  );

  it("通过 schema", () => {
    expect(registry.sources.length).toBeGreaterThan(0);
  });

  /**
   * 已由维护人亲自打开官方原文页核对过的来源。
   *
   * **这个清单只能由维护人扩充。** 断言用集合相等而非包含关系：
   * 任何一条来源在未登记到本清单的情况下被置为 true，测试立即失败。
   * 这样 AI 无法悄悄放行一条未核验来源。CLAUDE.md §L3。
   */
  const MAINTAINER_VERIFIED = new Set([
    "SPC-LABOR-II-2025",
    "CN-LCL-2012",
    "CN-CIVIL-CODE-2021",
    "CN-LDCA-2008",
    "SZ-HARMONIOUS-LABOR-2008",
    "GUANGZHOU-WEI-AI-CASE",
  ]);

  it("核验状态与维护人清单严格一致（AI 不得代为置 true）", () => {
    const actual = new Set(
      registry.sources.filter((s) => s.page_opened_and_checked).map((s) => s.id),
    );
    expect([...actual].sort()).toEqual([...MAINTAINER_VERIFIED].sort());
  });

  it("已核验来源必须有完整的核验记录", () => {
    for (const s of registry.sources.filter((x) => x.page_opened_and_checked)) {
      expect(s.last_verified_at, `${s.id} 缺 last_verified_at`).not.toBe("");
      expect(s.verified_by, `${s.id} 缺 verified_by`).not.toBe("");
      expect(s.url, `${s.id} 的 URL 仍是 TODO_VERIFY`).not.toBe("TODO_VERIFY");
    }
  });

  it("未核验来源不得声称已核验", () => {
    for (const s of registry.sources.filter((x) => !x.page_opened_and_checked)) {
      expect(s.last_verified_at, `${s.id} 未核验却填了日期`).toBe("");
      expect(s.verified_by, `${s.id} 未核验却填了核验人`).toBe("");
    }
  });

  it("深圳条例的 provision 依据登记为第十八条第二款", () => {
    const sz = registry.sources.find((s) => s.id === "SZ-HARMONIOUS-LABOR-2008");
    expect(sz?.pinpoint).toContain("第十八条第二款");
  });

  it("不含 round2 已作废的脚注 [4][6] 来源", () => {
    const forbidden = ["消防", "国家消防救援"];
    for (const s of registry.sources) {
      for (const f of forbidden) {
        expect(`${s.publisher}${s.page_title}`).not.toContain(f);
      }
    }
  });
});

describe("TestFixture", () => {
  const base = {
    id: "T01",
    title: "示例",
    input: {},
    expected: { primary_endpoint: "C04" },
    actual_result: "",
  };

  it("actual_result 字段不得省略", () => {
    const { actual_result: _omit, ...withoutActual } = base;
    expect(TestFixture.safeParse(withoutActual).success).toBe(false);
  });

  it("接受 T11A 形式的 ID", () => {
    expect(TestFixture.safeParse({ ...base, id: "T11A" }).success).toBe(true);
  });

  it("拒绝不合规的 ID", () => {
    expect(TestFixture.safeParse({ ...base, id: "case-1" }).success).toBe(false);
  });
});
