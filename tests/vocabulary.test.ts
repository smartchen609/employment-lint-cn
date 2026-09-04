import { describe, expect, it } from "vitest";
import { DERIVED_FACT_PATHS, DIRECT_FACT_PATHS } from "../src/engine/fact-paths.js";
import { loadFixtures, loadRules, type LoadedFixture, type LoadedRule } from "./helpers.js";
import {
  BOOLEAN_FACT_PATHS,
  FACT_VALUES,
  NUMERIC_FACT_PATHS,
} from "../src/engine/fact-values.js";

/**
 * 取值词表守卫。
 *
 * P3 开工时发现规则与 fixture 的取值词表整体漂移（"negotiated" vs "NEGOTIATED"、
 * SEVERANCE_AND_EXIT_DATE_ONLY vs SEVERANCE_ONLY），路径合法但一条规则也命中不了。
 * 这类漂移的失败模式是**静默漏报**，对 linter 来说最危险，因此必须机器强制。
 */


const rules = loadRules();
const fixtures = loadFixtures();

const KNOWN = new Set<string>([...DIRECT_FACT_PATHS, ...DERIVED_FACT_PATHS]);

/** 校验单个「路径 → 取值」是否在词表内。返回错误信息，合法则返回 null。 */
function checkValue(path: string, value: unknown): string | null {
  const spec = FACT_VALUES[path];
  if (spec) {
    const vals = Array.isArray(value) ? value : [value];
    for (const v of vals) {
      if (typeof v !== "string") return `${path} 的取值应为字符串，实为 ${JSON.stringify(v)}`;
      if (!spec.values.includes(v)) {
        return `${path} 的取值「${v}」不在词表内；允许：${spec.values.join("、")}`;
      }
    }
    if (spec.multi && !Array.isArray(value)) {
      return `${path} 是多选字段，取值必须是数组`;
    }
    if (!spec.multi && Array.isArray(value)) {
      return `${path} 是单选字段，取值不得是数组`;
    }
    return null;
  }
  if (BOOLEAN_FACT_PATHS.includes(path)) {
    if (typeof value === "boolean" || value === "UNKNOWN" || value === null) return null;
    return `${path} 是布尔事实，取值只能是 true / false / "UNKNOWN"，实为 ${JSON.stringify(value)}`;
  }
  if (NUMERIC_FACT_PATHS.includes(path)) {
    if (typeof value === "number" || value === "UNKNOWN") return null;
    return `${path} 是数值事实，实为 ${JSON.stringify(value)}`;
  }
  return null; // 未登记取值约束的路径（如日期）不在本测试范围
}

describe("规则条件的取值都在词表内", () => {
  function collect(node: unknown, out: Array<[string, unknown]>): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => collect(n, out));
    const o = node as Record<string, unknown>;
    const path = (o["fact"] ?? o["derived_fact"]) as string | undefined;
    if (typeof path === "string" && "operator" in o && "value" in o) {
      const op = o["operator"];
      const val = o["value"];
      // in / not_in / includes_any / includes_all 的 value 是候选集合
      if (op === "in" || op === "not_in" || op === "includes_any" || op === "includes_all") {
        for (const v of Array.isArray(val) ? val : [val]) out.push([path, v]);
      } else {
        out.push([path, val]);
      }
    }
    for (const v of Object.values(o)) collect(v, out);
  }

  it.each<LoadedRule>(rules)("$file", ({ rule }) => {
    const found: Array<[string, unknown]> = [];
    collect(rule.conditions, found);
    collect(rule.findings, found);
    for (const [path, value] of found) {
      expect(KNOWN.has(path), `未声明的事实路径 ${path}`).toBe(true);
      const spec = FACT_VALUES[path];
      // 集合型操作符里逐个取值校验时不检查 multi 形态
      if (spec) {
        expect(
          typeof value === "string" && spec.values.includes(value),
          `${rule.id}：${path} 的取值「${String(value)}」不在词表内`,
        ).toBe(true);
      } else {
        expect(checkValue(path, value), `${rule.id}`).toBeNull();
      }
    }
  });
});

describe("fixture 输入的取值都在词表内", () => {
  function flatten(obj: unknown, prefix: string, out: Array<[string, unknown]>): void {
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      if (prefix) out.push([prefix, obj]);
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
      else out.push([path, v]);
    }
  }

  it.each<LoadedFixture>(fixtures)("$file", ({ fixture }) => {
    const found: Array<[string, unknown]> = [];
    flatten(fixture.input, "", found);
    for (const [path, value] of found) {
      const problem = checkValue(path, value);
      expect(problem, `${fixture.id}`).toBeNull();
    }
  });
});

describe("词表自身", () => {
  it("取值一律 UPPER_SNAKE_CASE 或带连字符的地区码", () => {
    for (const [path, spec] of Object.entries(FACT_VALUES)) {
      for (const v of spec.values) {
        expect(v, `${path} 的取值 ${v} 命名不规范`).toMatch(/^[A-Z0-9_-]+$/);
      }
    }
  });

  it("词表覆盖的路径都是已声明的事实路径", () => {
    for (const path of Object.keys(FACT_VALUES)) {
      expect(KNOWN.has(path), `词表登记了未声明的路径 ${path}`).toBe(true);
    }
  });
});
