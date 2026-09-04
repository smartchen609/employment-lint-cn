import { describe, expect, it } from "vitest";
import { DERIVED_FACT_PATHS, DIRECT_FACT_PATHS } from "../src/engine/fact-paths.js";
import { loadRules } from "./helpers.js";

/**
 * P1 规则层守卫测试。
 *
 * 这些测试不判断法律内容是否正确 —— 那是人工核验的责任。
 * 它们保护的是 CLAUDE.md 里可以机器检查的那部分硬约束。
 */



const rules = loadRules();

describe("规则文件", () => {
  it("目录非空", () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it("全部通过 RuleRecord schema", () => {
    // 上面的 parse 已在模块加载时抛错；此处断言 id 唯一。
    const ids = rules.map((r) => r.rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("事实路径契约", () => {
  const direct = new Set<string>(DIRECT_FACT_PATHS);
  const derived = new Set<string>(DERIVED_FACT_PATHS);

  function collect(node: unknown, out: { fact: string[]; derived: string[] }): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => collect(n, out));
      return;
    }
    const o = node as Record<string, unknown>;
    if (typeof o["fact"] === "string") out.fact.push(o["fact"]);
    if (typeof o["derived_fact"] === "string") out.derived.push(o["derived_fact"]);
    for (const v of Object.values(o)) collect(v, out);
  }

  it.each(rules)("$file 只使用已声明的事实路径", ({ rule }) => {
    const found = { fact: [] as string[], derived: [] as string[] };
    collect(rule.conditions, found);
    collect(rule.findings, found);
    for (const f of found.fact) {
      expect(direct.has(f), `未声明的 fact 路径: ${f}（见 src/engine/fact-paths.ts）`).toBe(true);
    }
    for (const d of found.derived) {
      expect(derived.has(d), `未声明的 derived_fact 路径: ${d}`).toBe(true);
    }
  });
});

describe("法律护栏（round2 §3、§11.5）", () => {
  it("案例规则不得 override 任何规则，且来源只能是 interpretive-signal", () => {
    for (const { rule } of rules.filter((r) => r.rule.authority_type === "published-case")) {
      expect(rule.overrides).toEqual([]);
      for (const s of rule.sources) expect(s.binding_role).toBe("interpretive-signal");
    }
  });

  it("深圳规则与全国规则并行，不得互相覆盖", () => {
    const sz = rules.find((r) => r.rule.id === "CN-SZ-HARMONIOUS-LABOR-18-2")!.rule;
    const nat = rules.find((r) => r.rule.id === "CN-NAT-SPC-LABOR-II-10-1")!.rule;
    expect(sz.overrides).toEqual([]);
    expect(nat.overrides).toEqual([]);
  });

  it("深圳条例的 provision_effective.from 是 2008-11-01，不是修正决定通过日", () => {
    const sz = rules.find((r) => r.rule.id === "CN-SZ-HARMONIOUS-LABOR-18-2")!.rule;
    expect(sz.provision_effective.from).toBe("2008-11-01");
    expect(sz.provision_effective.from).not.toBe("2019-04-24");
    expect(sz.instrument_history?.provision_changed_by_last_amendment).toBe(false);
  });

  it("第十条与第十一条是各自独立的规则，可并行命中", () => {
    const ten = rules.filter((r) => r.rule.id.startsWith("CN-NAT-SPC-LABOR-II-10-"));
    const eleven = rules.find((r) => r.rule.id === "CN-NAT-SPC-LABOR-II-11")?.rule;
    expect(ten.length).toBe(4);
    expect(eleven).toBeDefined();
    for (const t of ten) expect(t.rule.overrides).not.toContain("CN-NAT-SPC-LABOR-II-11");
    expect(eleven!.overrides).toEqual([]);
  });

  it("第十一条挂了民法典第二百零二条作为期间计算依据", () => {
    const r = rules.find((x) => x.rule.id === "CN-NAT-SPC-LABOR-II-11")!.rule;
    const arts = r.legal_basis.map((b) => `${b.source_id}/${b.article}`);
    expect(arts).toContain("CN-CIVIL-CODE-2021/第二百零二条");
  });

  it("表面完整规则的 severity 是 info，不得升格为通过状态", () => {
    const r = rules.find((x) => x.rule.id === "CN-NAT-LCL-40-3-SURFACE-COMPLETE")!.rule;
    expect(r.severity).toBe("info");
  });
});

describe("文案纪律（round2 §6.5）", () => {
  /**
   * 完整的禁止词守卫测试在 P4（覆盖全部面向用户文案）。
   * 这里先守住规则层自身的文案字段。
   *
   * 注意「合法」是裸词，会误伤"不能单独证明合法""不得理解为解除合法"
   * 这类正当句子，因此改用断言式搭配匹配。
   */
  const FORBIDDEN = [
    "一定能拿", "稳了", "稳赢", "100%违法", "必然支持", "一定败诉",
    "足够胜诉", "通过检查", "没有风险", "成功率", "系统已经认定",
    "ALL CHECKS PASSED", "建议你马上仲裁",
  ];
  function textOf(rule: unknown): string {
    return JSON.stringify(rule);
  }

  it.each(rules)("$file 不含禁止表达", ({ rule }) => {
    const text = textOf(rule);
    for (const w of FORBIDDEN) {
      expect(text.includes(w), `命中禁止表达「${w}」`).toBe(false);
    }
  });

  it("「解除合法」只出现在明确否定的语境中", () => {
    const surface = rules.find((x) => x.rule.id === "CN-NAT-LCL-40-3-SURFACE-COMPLETE")!.rule;
    const text = JSON.stringify(surface);
    // 该规则确实提到"解除合法"，但必须是"不得把本结果理解为解除合法"这类否定句
    expect(text).toContain("不得把本结果理解为解除合法");
    expect(text).not.toMatch(/[^得]把本结果理解为解除合法/);
  });

  it("赔偿金规则不得输出任何金额或倍数结论", () => {
    const r = rules.find((x) => x.rule.id === "CN-NAT-LCL-87-DAMAGES")!.rule;
    const guidance = JSON.stringify(r.claim_guidance) + JSON.stringify(r.findings);
    expect(guidance).toContain("不得由本工具输出任何赔偿金额或倍数结论");
  });
});

describe("每条规则都能追到回归用例", () => {
  it.each(rules)("$file 的 tests 非空", ({ rule }) => {
    expect(rule.tests.length).toBeGreaterThan(0);
  });
});
