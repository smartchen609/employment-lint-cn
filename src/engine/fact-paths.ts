/**
 * 事实路径清单 —— 规则层与引擎层之间的契约。
 *
 * `rules/**.yml` 的 conditions 里只能出现本文件声明过的路径。
 * 由 tests/fact-paths.test.ts 强制：规则用了未声明的路径即测试失败。
 *
 * 这不是法律内容，是工程契约，用来防止 P3 实现引擎时踩规则 YAML 的拼写漂移。
 * 命名空间对齐 round2 §10.1 的 Case Export 字段结构。
 */

/** 直接来自用户回答的事实。 */
export const DIRECT_FACT_PATHS = [
  // --- 适用范围 · round2 §4.2 G03 ---
  "scope.principal_place_of_performance",

  // --- 公司本次操作 · round2 §4.2 G01 ---
  "operation.selected_shape",

  // --- 合同历史 · round2 §4.3 A01–A11 ---
  "contract.type",
  "contract.expired",
  "contract.fixed_term_count",
  /** 由第十条各项规则回填：是否已被视为第二次固定期限。 */
  "contract.deemed_second_fixed_term",
  "contract.extension.nature",
  "contract.extension.period_expired",
  "contract.automatic_extension.agreed",
  "contract.automatic_extension.continued_performance",
  "contract.automatic_extension.extended_period_expired",
  "contract.entity_change.occurred",
  "contract.entity_change.not_at_employee_request",
  "contract.entity_change.same_workplace",
  "contract.entity_change.same_role",
  "contract.entity_change.management_continued",
  "contract.avoidance_patterns",

  // --- 期满后继续用工 · round3 §3 A15–A15.5 ---
  "post_expiry.actual_work_continued",
  "post_expiry.employer_later_terminated",

  // --- 续订意愿与排除事由 · round2 §4.3 A12–A14 ---
  "renewal.employee_willingness",
  "renewal.employee_requested_fixed_term",
  "renewal.statutory_exception",
  "indefinite_term.eligibility_candidate",

  // --- 第四十条第三项 · round2 §4.4 B03–B11 ---
  "objective_change.cause_category",
  "objective_change.original_work_continues",
  "objective_change.consultation_type",
  "objective_change.concrete_offer_terms_complete",
  "objective_change.adverse_changes",
  "objective_change.employee_response",
  "objective_change.notice_or_one_month_pay",

  // --- 主张与程序 · round2 §4.7 P01–P07 ---
  "procedure.preferred_remedy",
  "procedure.continued_performance_impossible",

  /**
   * 跨规则依赖：救济路径规则要读取定性阶段是否已产生违法解除/终止候选。
   * 因此引擎必须**分两轮**求值 —— 先跑定性规则，回填后再跑救济规则。
   * 见 docs/fact-model.md「求值顺序」。
   */
  "findings.unlawful_termination_candidate_present",
] as const;

/**
 * 派生事实 —— 由引擎按法律规则计算，**不由用户直接回答**。
 *
 * 两项都是期间计算，一律走《民法典》第二百零二条的日历月规则，
 * 禁止实现为 `days > 30`。CLAUDE.md §E4、round3 §3 A15.3。
 */
export const DERIVED_FACT_PATHS = [
  /** 协商延长累计的日历月数。深圳 >6、全国 >=12。 */
  "contract.extension.cumulative_calendar_months",
  /** 用人单位未表示异议是否超过一个日历月。 */
  "post_expiry.no_objection_exceeds_one_calendar_month",
] as const;

export type DirectFactPath = (typeof DIRECT_FACT_PATHS)[number];
export type DerivedFactPath = (typeof DERIVED_FACT_PATHS)[number];

export const ALL_FACT_PATHS: readonly string[] = [
  ...DIRECT_FACT_PATHS,
  ...DERIVED_FACT_PATHS,
];
