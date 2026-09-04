/**
 * 条件树求值。
 *
 * ## 缺失事实一律为「不成立」
 *
 * 事实缺失或为 `"UNKNOWN"` 时，条件返回 false，而不是 true。
 * 这是刻意选择的方向：本产品是 linter，宁可漏一条候选，
 * 也不能凭缺失信息替用户断言一项定性成立。
 */

import type { ConditionTree } from "../schema/index.js";
import { getFact, type Facts } from "./facts.js";

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v];
}

function compareNumbers(
  actual: unknown,
  expected: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  return cmp(actual, expected);
}

function evalLeaf(
  leaf: Extract<ConditionTree, { operator: string }>,
  facts: Facts,
): boolean {
  const path = ("fact" in leaf ? leaf.fact : undefined) ?? leaf.derived_fact;
  if (!path) return false;
  const actual = getFact(facts, path);
  const expected = leaf.value;

  switch (leaf.operator) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "equals":
      return actual === expected;
    case "not_equals":
      // 事实缺失时不认定"不等于"成立
      return actual !== undefined && actual !== expected;
    case "in":
      return actual !== undefined && toArray(expected).includes(actual);
    case "not_in":
      return actual !== undefined && !toArray(expected).includes(actual);
    case "includes_any": {
      if (actual === undefined) return false;
      const have = new Set(toArray(actual));
      return toArray(expected).some((v) => have.has(v));
    }
    case "includes_all": {
      if (actual === undefined) return false;
      const have = new Set(toArray(actual));
      return toArray(expected).every((v) => have.has(v));
    }
    case "greater_than":
      return compareNumbers(actual, expected, (a, b) => a > b);
    case "greater_than_or_equal":
      return compareNumbers(actual, expected, (a, b) => a >= b);
    case "less_than":
      return compareNumbers(actual, expected, (a, b) => a < b);
    case "less_than_or_equal":
      return compareNumbers(actual, expected, (a, b) => a <= b);
    default:
      return false;
  }
}

export function evaluateCondition(tree: ConditionTree, facts: Facts): boolean {
  if ("all" in tree) return tree.all.every((c) => evaluateCondition(c, facts));
  if ("any" in tree) return tree.any.some((c) => evaluateCondition(c, facts));
  if ("not" in tree) return !evaluateCondition(tree.not, facts);
  return evalLeaf(tree, facts);
}

/** 收集条件树引用到的全部事实路径，用于证据不确定性判定。 */
export function collectReferencedPaths(tree: ConditionTree, out: string[] = []): string[] {
  if ("all" in tree) tree.all.forEach((c) => collectReferencedPaths(c, out));
  else if ("any" in tree) tree.any.forEach((c) => collectReferencedPaths(c, out));
  else if ("not" in tree) collectReferencedPaths(tree.not, out);
  else {
    const p = ("fact" in tree ? tree.fact : undefined) ?? tree.derived_fact;
    if (p) out.push(p);
  }
  return out;
}
