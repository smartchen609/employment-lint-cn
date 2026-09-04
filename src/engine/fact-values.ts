/**
 * 事实取值词表 —— 规则与测试用例之间的第二层契约。
 *
 * `fact-paths.ts` 管住"能不能用这个路径"，本文件管住"这个路径能填什么值"。
 *
 * ## 为什么需要它
 *
 * P3 开工时发现：规则 YAML 写 `"negotiated"`、`SEVERANCE_AND_EXIT_DATE_ONLY`，
 * 而测试 fixture 写 `"NEGOTIATED"`、`SEVERANCE_ONLY`。
 * 路径都合法，取值全对不上，引擎一条规则也不会命中。
 * 这类漂移不会被 schema 发现，只会表现为"规则静默失效" ——
 * 对一个 linter 来说是最坏的失败模式：它不报错，它只是漏报。
 *
 * 由 tests/vocabulary.test.ts 强制：规则条件与 fixture 输入中出现的取值，
 * 必须都在本表内。
 *
 * ## 约定
 *
 * - 一律 `UPPER_SNAKE_CASE`。
 * - `UNKNOWN` 是通用的"不确定"取值，会把最终不确定性抬到 fact-sensitive。
 * - 数组型字段（多选题）在词表中标注 `multi: true`。
 */

export interface FactValueSpec {
  readonly values: readonly string[];
  /** 多选题：事实值是数组，条件用 includes_any / includes_all。 */
  readonly multi?: boolean;
}

export const FACT_VALUES: Readonly<Record<string, FactValueSpec>> = {
  // --- 适用范围 ---
  "scope.principal_place_of_performance": {
    values: ["CN-GD-SZ", "CN-GD-OTHER", "CN-OTHER", "REMOTE_UNKNOWN"],
  },
  "scope.dispute_category": {
    values: ["TERMINATION_OR_EXPIRY", "IN_SERVICE", "WAGE_ARREARS"],
  },

  // --- 公司本次操作 ---
  "operation.selected_shape": {
    values: [
      "FIXED_TERM_EXPIRY",
      "ARTICLE_40_3",
      "MUTUAL_TERMINATION",
      "DE_FACTO_TERMINATION",
      "UNCLEAR_DOCUMENT",
    ],
  },
  "operation.effective_status": {
    values: ["NOT_YET_EFFECTIVE", "EFFECTIVE", "DATE_UNKNOWN"],
  },

  // --- 合同历史 ---
  "contract.type": {
    values: ["FIXED_TERM", "INDEFINITE", "TASK_BASED", "UNKNOWN"],
  },
  "contract.extension.nature": {
    values: ["NONE", "NEGOTIATED", "STATUTORY", "UNKNOWN"],
  },
  "contract.avoidance_patterns": {
    multi: true,
    values: [
      "RESIGN_THEN_IMMEDIATELY_RESIGN_CONTRACT",
      "NOMINAL_WORK_INTERRUPTION",
      "REPEATED_CONTRACT_OR_ENTITY_RENAMING",
      "EMPLOYER_MENTIONED_AVOIDING_INDEFINITE_TERM",
      "OTHER",
    ],
  },

  // --- 续订意愿与排除事由 ---
  "renewal.employee_willingness": {
    values: ["WRITTEN", "ORAL", "NONE", "REFUSED", "UNKNOWN"],
  },
  "renewal.statutory_exception": {
    values: [
      "NONE",
      "MEDICAL_OR_PREGNANCY",
      "ARTICLE_39_SERIOUS_MISCONDUCT",
      "ARTICLE_40_1_MEDICAL_PERIOD_EXPIRED",
      "ARTICLE_40_2_INCOMPETENT",
      "UNKNOWN",
    ],
  },

  // --- 第四十条第三项 ---
  "objective_change.cause_category": {
    values: [
      "AI_AUTOMATION",
      "INTERNAL_EFFICIENCY",
      "TEAM_REDUCTION",
      "BUSINESS_LINE_CANCELLED",
      "EXTERNAL_POLICY_OR_FORCE",
      "OTHER",
      "UNKNOWN",
    ],
  },
  "objective_change.original_work_continues": {
    values: [
      "FULLY_STOPPED",
      "BY_COLLEAGUES",
      "BY_NEW_HIRES",
      "BY_OUTSOURCING",
      "BY_COLLEAGUES_AND_AI",
      "PARTIALLY_STOPPED",
      "UNKNOWN",
    ],
  },
  "objective_change.consultation_type": {
    values: [
      "NONE",
      "SEVERANCE_ONLY",
      "SELF_SERVE_JOB_BOARD_ONLY",
      "CONCRETE_POSITION_OFFERED",
      "TRAINING_OR_TRANSITION_OFFERED",
      "MULTIPLE",
      "UNKNOWN",
    ],
  },
  "objective_change.adverse_changes": {
    multi: true,
    values: [
      "SIGNIFICANT_PAY_CUT",
      "SIGNIFICANT_LEVEL_DEMOTION",
      "CROSS_CITY_OR_COMMUTE_INCREASE",
      "SKILL_MISMATCH",
      "SUBSTANTIALLY_EQUIVALENT",
      "UNKNOWN",
    ],
  },
  "objective_change.employee_response": {
    values: [
      "ACCEPTED",
      "REFUSED_WITH_REASONS",
      "PROPOSED_ALTERNATIVE",
      "NO_OPPORTUNITY",
      "TERMINATED_BEFORE_RESPONSE",
      "UNKNOWN",
    ],
  },
  "objective_change.notice_or_one_month_pay": {
    values: ["THIRTY_DAYS_WRITTEN_NOTICE", "ONE_MONTH_PAY_IN_LIEU", "NEITHER", "UNKNOWN"],
  },

  // --- 主张与程序 ---
  "procedure.preferred_remedy": {
    values: ["CONTINUE_PERFORMANCE", "DAMAGES", "UNDECIDED"],
  },
  "procedure.limitation_interruption_events": {
    values: ["NONE", "WRITTEN_CLAIM_OR_AGENCY_OR_EMPLOYER_CONSENT", "UNKNOWN"],
  },
};

/** 布尔型事实：取值只能是 true / false / "UNKNOWN"。 */
export const BOOLEAN_FACT_PATHS: readonly string[] = [
  "contract.expired",
  "contract.deemed_second_fixed_term",
  "contract.extension.period_expired",
  "contract.automatic_extension.agreed",
  "contract.automatic_extension.continued_performance",
  "contract.automatic_extension.extended_period_expired",
  "contract.entity_change.occurred",
  "contract.entity_change.not_at_employee_request",
  "contract.entity_change.same_workplace",
  "contract.entity_change.same_role",
  "contract.entity_change.management_continued",
  "post_expiry.actual_work_continued",
  "post_expiry.employer_later_terminated",
  "post_expiry.no_objection_exceeds_one_calendar_month",
  "indefinite_term.eligibility_candidate",
  "renewal.employee_requested_fixed_term",
  "objective_change.concrete_offer_terms_complete",
  "procedure.continued_performance_impossible",
  "procedure.limitation_exceeds_one_calendar_year",
  "findings.unlawful_termination_candidate_present",
];

/** 数值型事实。 */
export const NUMERIC_FACT_PATHS: readonly string[] = [
  "contract.fixed_term_count",
  "contract.extension.cumulative_calendar_months",
];

/** 会把最终不确定性抬到 fact-sensitive 的取值。round2 §6.2。 */
export const UNCERTAIN_VALUES: readonly string[] = ["UNKNOWN", "ORAL"];
