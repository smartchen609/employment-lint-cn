/**
 * 规则引擎。
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
import { collectReferencedPaths, evaluateCondition } from "./conditions.js";
import { deriveFacts, getFact, type Facts } from "./facts.js";
import { UNCERTAIN_VALUES } from "./fact-values.js";

export type { Facts };

export interface Finding {
  /** Finding 标识，如 DEEMED_SECOND_FIXED_TERM。 */
  id: string;
  /** 产生该 Finding 的规则。结果页需展开显示 Rule ID、依据、生效时间。 */
  ruleId: string;
  severity: Severity;
  /** 规则自身声明的档位。 */
  ruleUncertainty: Uncertainty;
  /** 已按「规则与证据取较高者」折算后的最终档位。 */
  uncertainty: Uncertainty;
}

export interface EngineResult {
  findings: Finding[];
  /** 命中的规则 ID，按优先级降序。 */
  firedRuleIds: string[];
  /** 触发式判断，不是评分。 */
  complexity: "NORMAL" | "HIGH";
  /** 触发高复杂度的具体原因，供结果页说明。 */
  complexityTriggers: string[];
}

export interface EvaluateOptions {
  /** 评估日。依赖"截至当前"的期间计算以此为准。 */
  evaluationDate?: string;
}

/* ------------------------------------------------------------------ */
/* 不确定性                                                            */
/* ------------------------------------------------------------------ */

/** 档位由低到高。**这是不确定性排序，不是胜诉概率。** round2 §6.1。 */
const UNCERTAINTY_ORDER: readonly Uncertainty[] = [
  "deterministic",
  "rule-based",
  "fact-sensitive",
  "judicial-discretion",
];

function maxUncertainty(a: Uncertainty, b: Uncertainty): Uncertainty {
  return UNCERTAINTY_ORDER.indexOf(a) >= UNCERTAINTY_ORDER.indexOf(b) ? a : b;
}

/**
 * 输入证据的不确定性。
 *
 * 规则本身可能是 rule-based，但用户只有口头回忆或答不确定时，
 * 最终展示不能仍是规则判断。round2 §6.2。
 */
function evidenceUncertainty(rule: RuleRecord, facts: Facts): Uncertainty {
  for (const path of collectReferencedPaths(rule.conditions)) {
    const value = getFact(facts, path);
    const values = Array.isArray(value) ? value : [value];
    if (values.some((v) => typeof v === "string" && UNCERTAIN_VALUES.includes(v))) {
      return "fact-sensitive";
    }
  }
  return "deterministic";
}

/* ------------------------------------------------------------------ */
/* 单条规则                                                            */
/* ------------------------------------------------------------------ */

/** 规则例外：effect 为 block 的例外命中时阻断整条规则。 */
function blockedByException(_rule: RuleRecord, _facts: Facts): boolean {
  // 例外的条件表达式尚未进入 schema（round2 §11.2 只定义了 id/description/effect）。
  // 在补齐之前，例外由问题树前置分流处理，引擎不做静默阻断。
  // 见 docs/open-questions.md Q7。
  return false;
}

function findingIdsOf(rule: RuleRecord, facts: Facts): string[] {
  const ids: string[] = [
    ...(rule.findings.classification_candidates ?? []),
    ...(rule.findings.base ?? []),
  ];
  for (const c of rule.findings.conditional ?? []) {
    if (evaluateCondition(c.when, facts)) ids.push(...c.add);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

/** 第一轮产出会回填这两个事实，供第二轮的义务与救济规则读取。 */
const DEEMED_SECOND_FIXED_TERM_FINDINGS = new Set([
  "DEEMED_SECOND_FIXED_TERM",
  "SZ_DEEMED_RENEWAL",
]);
const UNLAWFUL_TERMINATION_FINDINGS = new Set([
  "UNLAWFUL_TERMINATION_CANDIDATE",
  "INDEFINITE_TERM_OBLIGATION_CANDIDATE",
  "ARTICLE_40_3_CONSULTATION_GAP",
]);

/** 第二轮规则：依赖第一轮回填结果。 */
const SECOND_ROUND_RULE_IDS = new Set([
  "CN-NAT-LCL-14-2-3",
  "CN-NAT-LCL-48-REMEDY-ELECTION",
  "CN-NAT-LCL-87-DAMAGES",
]);

function runRound(
  rules: readonly RuleRecord[],
  facts: Facts,
): { findings: Finding[]; firedRuleIds: string[] } {
  const findings: Finding[] = [];
  const firedRuleIds: string[] = [];

  // 按 priority 降序，仅决定展示顺序；**不用于互相覆盖**。
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of ordered) {
    if (rule.status !== "active") continue;
    if (!evaluateCondition(rule.conditions, facts)) continue;
    if (blockedByException(rule, facts)) continue;

    firedRuleIds.push(rule.id);
    const finalUncertainty = maxUncertainty(
      rule.uncertainty,
      evidenceUncertainty(rule, facts),
    );
    for (const id of findingIdsOf(rule, facts)) {
      findings.push({
        id,
        ruleId: rule.id,
        severity: rule.severity,
        ruleUncertainty: rule.uncertainty,
        uncertainty: finalUncertainty,
      });
    }
    // 注意：这里**没有** break / return。多 Finding 并行是本引擎的核心语义。
  }

  return { findings, firedRuleIds };
}

/**
 * 高复杂度触发项。round2 §5。
 *
 * **满足任一项即为 HIGH，不做评分。**
 * 只实现当前事实模型能判断的触发项；其余在 P5 问题树补齐后接入。
 */
function resolveComplexity(
  facts: Facts,
  findings: Finding[],
): { complexity: "NORMAL" | "HIGH"; triggers: string[] } {
  const triggers: string[] = [];
  const has = (id: string) => findings.some((f) => f.id === id);

  if (has("ARBITRATION_LIMITATION_RISK")) triggers.push("仲裁时效可能届满");

  const filed = getFact(facts, "procedure.arbitration_filed");
  const claim = getFact(facts, "procedure.current_claim");
  const remedy = getFact(facts, "procedure.preferred_remedy");
  if (
    typeof filed === "string" &&
    filed !== "NOT_FILED" &&
    typeof claim === "string" &&
    claim === "SEVERANCE_ONLY" &&
    remedy === "DAMAGES"
  ) {
    triggers.push("已提出的仲裁请求可能与当前建议方向不一致");
  }

  if (remedy === "UNDECIDED") triggers.push("继续履行与赔偿金路径尚未确定");
  if (
    remedy === "CONTINUE_PERFORMANCE" &&
    getFact(facts, "procedure.continued_performance_impossible") !== false
  ) {
    triggers.push("希望继续履行，但存在可能无法继续履行的情形");
  }

  if (has("SZ_DEEMED_RENEWAL") && !has("DEEMED_SECOND_FIXED_TERM")) {
    triggers.push("深圳 6—12 个月延长合同规则成为关键依据");
  }
  if (has("GOOD_FAITH_AVOIDANCE_CANDIDATE")) {
    triggers.push("规避无固定期限合同涉及诚信判断");
  }
  if (findings.some((f) => f.uncertainty === "judicial-discretion")) {
    triggers.push("关键规则依赖裁判评价");
  }
  if (getFact(facts, "renewal.statutory_exception") === "MEDICAL_OR_PREGNANCY") {
    triggers.push("涉及本工具未覆盖的法定续延情形");
  }

  return { complexity: triggers.length > 0 ? "HIGH" : "NORMAL", triggers };
}

export function evaluateAllApplicableRules(
  facts: Facts,
  rules: readonly RuleRecord[],
  options: EvaluateOptions = {},
): EngineResult {
  const evaluationDate =
    options.evaluationDate ??
    (typeof getFact(facts, "evaluation_date") === "string"
      ? (getFact(facts, "evaluation_date") as string)
      : new Date().toISOString().slice(0, 10));

  const derived = deriveFacts(facts, evaluationDate);

  const firstRoundRules = rules.filter((r) => !SECOND_ROUND_RULE_IDS.has(r.id));
  const secondRoundRules = rules.filter((r) => SECOND_ROUND_RULE_IDS.has(r.id));

  // --- 第一轮：定性 ---
  const first = runRound(firstRoundRules, derived);

  // --- 回填 ---
  const afterFirst: Facts = structuredClone(derived);
  const contract = (afterFirst["contract"] ??= {}) as Record<string, unknown>;
  if (first.findings.some((f) => DEEMED_SECOND_FIXED_TERM_FINDINGS.has(f.id))) {
    contract["deemed_second_fixed_term"] = true;
  }
  (afterFirst["findings"] ??= {}) as Record<string, unknown>;
  (afterFirst["findings"] as Record<string, unknown>)[
    "unlawful_termination_candidate_present"
  ] = first.findings.some((f) => UNLAWFUL_TERMINATION_FINDINGS.has(f.id));

  // --- 第二轮：义务与救济 ---
  // 第十四条可能新产生 UNLAWFUL_TERMINATION_CANDIDATE，
  // 故第二轮内部再回填一次，供第四十八条、第八十七条读取。
  const obligation = runRound(
    secondRoundRules.filter((r) => r.id === "CN-NAT-LCL-14-2-3"),
    afterFirst,
  );
  const afterObligation: Facts = structuredClone(afterFirst);
  const allSoFar = [...first.findings, ...obligation.findings];
  (afterObligation["findings"] as Record<string, unknown>)[
    "unlawful_termination_candidate_present"
  ] = allSoFar.some((f) => UNLAWFUL_TERMINATION_FINDINGS.has(f.id));

  const remedy = runRound(
    secondRoundRules.filter((r) => r.id !== "CN-NAT-LCL-14-2-3"),
    afterObligation,
  );

  const findings = dedupe([...first.findings, ...obligation.findings, ...remedy.findings]);
  const firedRuleIds = [
    ...first.firedRuleIds,
    ...obligation.firedRuleIds,
    ...remedy.firedRuleIds,
  ];
  const { complexity, triggers } = resolveComplexity(afterObligation, findings);

  return { findings, firedRuleIds, complexity, complexityTriggers: triggers };
}

/** 同一 Finding 可能由多条规则产生（如第十条多项并行命中），保留不确定性最高的一条。 */
function dedupe(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const prev = byId.get(f.id);
    if (!prev) {
      byId.set(f.id, f);
      continue;
    }
    if (maxUncertainty(prev.uncertainty, f.uncertainty) === f.uncertainty && prev.uncertainty !== f.uncertainty) {
      byId.set(f.id, f);
    }
  }
  return [...byId.values()];
}
