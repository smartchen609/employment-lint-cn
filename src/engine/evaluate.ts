/**
 * 规则引擎 —— P3 待实现。
 *
 * ## 四条不可违反的语义（CLAUDE.md §5）
 *
 * 1. **多 Finding 并行输出**，不得命中一条就 return。
 *    第十条四项之间、第十条与第十一条之间，都必须并行检测。
 * 2. **最终不确定性 = max(规则本身不确定性, 输入证据不确定性)。**
 * 3. **严重程度与不确定性是两个独立维度。**
 * 4. **复杂度用触发式判断，不做评分。**
 *
 * ## 求值必须分两轮（docs/fact-model.md §三）
 *
 * `contract.deemed_second_fixed_term` 与
 * `findings.unlawful_termination_candidate_present`
 * 不是用户回答，而是第一轮规则的产物。
 */

import type { RuleRecord, Severity, Uncertainty } from "../schema/index.js";

/** 引擎输入：扁平化前的事实树。键名见 src/engine/fact-paths.ts。 */
export type Facts = Record<string, unknown>;

export interface Finding {
  /** Finding 标识，如 DEEMED_SECOND_FIXED_TERM。 */
  id: string;
  /** 产生该 Finding 的规则。结果页需展开显示 Rule ID、依据、生效时间。 */
  ruleId: string;
  severity: Severity;
  /** 已按「规则与证据取较高者」折算后的最终档位。 */
  uncertainty: Uncertainty;
}

export interface EngineResult {
  findings: Finding[];
  /** 触发式判断，不是评分。 */
  complexity: "NORMAL" | "HIGH";
}

export function evaluateAllApplicableRules(
  _facts: Facts,
  _rules: readonly RuleRecord[],
): EngineResult {
  throw new Error("evaluateAllApplicableRules 尚未实现（P3）");
}
