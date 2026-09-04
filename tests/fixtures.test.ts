import { describe, expect, it } from "vitest";
import { evaluateAllApplicableRules } from "../src/engine/evaluate.js";
import { loadFixtures, loadRules } from "./helpers.js";

/**
 * 规格书测试用例回归。
 *
 * **P2 阶段「引擎回放」一组应当全红**，因为 P3 尚未实现。
 * 「fixture 自身纪律」一组应当是绿的 —— 它检查的是用例本身写得对不对。
 */



const fixtures = loadFixtures().map((f) => f.fixture);
const rules = loadRules().map((r) => r.rule);

describe("fixture 自身纪律", () => {
  it("共 25 条（T01–T20 + T11A–T11E，维护人 2026-09-04 决定放宽自 20 条）", () => {
    expect(fixtures.length).toBe(25);
  });

  it("ID 不重复", () => {
    const ids = fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("T11A–T11E 齐全", () => {
    const ids = new Set(fixtures.map((f) => f.id));
    for (const s of ["A", "B", "C", "D", "E"]) expect(ids.has(`T11${s}`)).toBe(true);
  });

  it.each(fixtures)("$id 的 actual_result 由维护人回填，AI 不得填写", (fx) => {
    // 该断言在维护人回填真实案件结果后应当被移除或改写；
    // 在此之前它保证 AI 没有代填。见 CLAUDE.md §L5。
    expect(fx.actual_result).toBe("");
  });

  it("每条规则的 tests 都指向真实存在的用例", () => {
    const ids = new Set(fixtures.map((f) => f.id));
    for (const r of rules) {
      for (const t of r.tests) {
        expect(ids.has(t), `规则 ${r.id} 引用了不存在的用例 ${t}`).toBe(true);
      }
    }
  });

  it("每条用例至少声明一项预期（findings / not_findings / primary_endpoint）", () => {
    for (const fx of fixtures) {
      const e = fx.expected;
      const declared =
        e.findings.length > 0 || e.not_findings.length > 0 || e.primary_endpoint !== undefined;
      expect(declared, `${fx.id} 没有任何预期断言`).toBe(true);
    }
  });

  it("成对边界用例都在（Q4 决定保留全部 20 条的理由）", () => {
    const ids = new Set(fixtures.map((f) => f.id));
    for (const pair of [["T04", "T05"], ["T09", "T10"], ["T17", "T18"]]) {
      expect(ids.has(pair[0]!) && ids.has(pair[1]!), `${pair.join("/")} 必须成对存在`).toBe(true);
    }
  });
});

describe("引擎回放（P3 前应当全红）", () => {
  it.each(fixtures)("$id · $title", (fx) => {
    const result = evaluateAllApplicableRules(fx.input, rules);
    const got = new Set(result.findings.map((f) => f.id));

    for (const want of fx.expected.findings) {
      expect(got.has(want), `${fx.id} 缺少预期 Finding ${want}`).toBe(true);
    }
    for (const unwanted of fx.expected.not_findings) {
      expect(got.has(unwanted), `${fx.id} 出现了不应有的 Finding ${unwanted}`).toBe(false);
    }
  });
});
