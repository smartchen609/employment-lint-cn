/**
 * 【草稿】被迫解除入口新增的事实路径与取值词表。
 * 与 fact-paths.ts / fact-values.ts 同一套契约，维护人确认后并入。
 */

import type { FactValueSpec } from "./fact-values.js";

export const DRAFT_FACT_PATHS = [
  "forced.grounds",
  "forced.arrears_age",
  "forced.social_insurance_demand",
  "forced.exit_status",
] as const;

export const DRAFT_FACT_VALUES: Readonly<Record<string, FactValueSpec>> = {
  "operation.selected_shape": {
    values: [
      "FIXED_TERM_EXPIRY",
      "ARTICLE_40_3",
      "MUTUAL_TERMINATION",
      "DE_FACTO_TERMINATION",
      "UNCLEAR_DOCUMENT",
      "FORCED_RESIGNATION",
    ],
  },
  "forced.grounds": {
    multi: true,
    values: [
      "WAGES_UNPAID",
      "OVERTIME_UNPAID",
      "SI_NONE",
      "SI_MISSING_TYPES",
      "SI_UNDERPAID",
      "DOUBLE_WAGE_UNPAID",
      "ANNUAL_LEAVE_PAY_UNPAID",
      "HIGH_TEMP_ALLOWANCE_UNPAID",
    ],
  },
  "forced.arrears_age": { values: ["WITHIN_ONE_YEAR", "OVER_ONE_YEAR", "UNKNOWN"] },
  "forced.social_insurance_demand": {
    values: ["NOT_YET", "ORAL_ONLY", "WRITTEN_UNDER_ONE_MONTH", "WRITTEN_OVER_ONE_MONTH"],
  },
  "forced.exit_status": {
    values: [
      "STILL_EMPLOYED",
      "LEFT_WITH_WRITTEN_REASON",
      "LEFT_WITH_OTHER_REASON",
      "LEFT_WITHOUT_NOTICE",
      "NOTICE_AFTER_LEAVING",
    ],
  },
  // 协商解除、事实解除草稿规则用到的已有问题（线上已有，未进规则词表）
  "mutual.proposer": { values: ["EMPLOYER", "EMPLOYEE", "BOTH", "UNKNOWN"] },
  "mutual.signed": {
    values: ["NOTHING", "DRAFT_ONLY", "ACKNOWLEDGED_RECEIPT", "SIGNED_AGREEMENT", "SUBMITTED_RESIGNATION", "UNKNOWN"],
  },
  "defacto.employer_statement": { values: ["WRITTEN", "ORAL", "NONE", "UNKNOWN"] },
  "defacto.actions": {
    multi: true,
    values: [
      "ACCOUNT_DISABLED",
      "BADGE_REVOKED",
      "REMOVED_FROM_GROUPS",
      "NO_WORK_ASSIGNED",
      "ACCESS_DENIED",
      "SALARY_STOPPED",
      "EQUIPMENT_RECALLED",
      "OTHER",
    ],
  },
  "defacto.willingness_expressed": { values: ["WRITTEN", "ORAL", "NONE", "UNKNOWN"] },
};

export const DRAFT_BOOLEAN_FACT_PATHS: readonly string[] = ["mutual.asked_personal_reason"];

export const DRAFT_EXTRA_FACT_PATHS = [
  "mutual.proposer",
  "mutual.signed",
  "mutual.asked_personal_reason",
  "defacto.employer_statement",
  "defacto.actions",
  "defacto.willingness_expressed",
] as const;
