/**
 * 问答结果 → 引擎事实。
 *
 * 这一层是问题树与规则层之间的唯一转换点。
 * 它只做**结构映射**，不做法律判断 —— 任何"如果 A 则可能构成 B"的推理
 * 都必须写在 rules/ 的 YAML 里，不能藏在这里。
 */

import type { Facts } from "../engine/evaluate.js";
import { pruneAnswers } from "./tree.js";
import type { Answers } from "./types.js";

const str = (a: Answers, id: string): string | undefined => {
  const v = a[id];
  return typeof v === "string" ? v : undefined;
};
const arr = (a: Answers, id: string): string[] => {
  const v = a[id];
  return Array.isArray(v) ? v : [];
};

/** "true" / "false" / "UNKNOWN" → boolean | "UNKNOWN" | undefined */
function tri(a: Answers, id: string): boolean | "UNKNOWN" | undefined {
  const v = str(a, id);
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "UNKNOWN") return "UNKNOWN";
  return undefined;
}

function set(target: Record<string, unknown>, path: string, value: unknown): void {
  if (value === undefined) return;
  const segs = path.split(".");
  let node = target;
  for (const seg of segs.slice(0, -1)) {
    if (node[seg] === null || typeof node[seg] !== "object") node[seg] = {};
    node = node[seg] as Record<string, unknown>;
  }
  node[segs[segs.length - 1]!] = value;
}

export interface BuildFactsOptions {
  /** 评估日。默认取今天；测试注入固定值。 */
  evaluationDate?: string;
}

export function buildFacts(rawAnswers: Answers, options: BuildFactsOptions = {}): Facts {
  /**
   * 只采纳当前仍然可见的问题的答案。
   * 用户改了前面的答案后，后面被隐藏的题不得继续影响定性 ——
   * 否则规则会依据用户看不到也改不了的事实命中。见 pruneAnswers。
   */
  const answers = pruneAnswers(rawAnswers);
  const f: Record<string, unknown> = {};
  const evaluationDate = options.evaluationDate ?? new Date().toISOString().slice(0, 10);
  f["evaluation_date"] = evaluationDate;

  /* --- 适用范围 --- */
  set(f, "scope.principal_place_of_performance", str(answers, "G03"));
  /**
   * 本工具只覆盖解除、终止类争议（round2 §17 明确不做欠薪、加班费等）。
   * 时效规则的离职日起算结论也只在这个范围内成立，见 open-questions Q5。
   */
  set(f, "scope.dispute_category", "TERMINATION_OR_EXPIRY");

  /* --- 公司本次操作 --- */
  set(f, "operation.selected_shape", str(answers, "G01"));
  set(f, "operation.effective_status", str(answers, "G02"));
  set(f, "operation.effective_date", str(answers, "G02__date"));

  /* --- 合同 --- */
  set(f, "contract.type", str(answers, "A01"));
  set(f, "contract.expired", str(answers, "G02") === "EFFECTIVE" ? true : undefined);

  const count = str(answers, "A03");
  if (count === "1") set(f, "contract.fixed_term_count", 1);
  else if (count === "2" || count === "MULTI_ENTITY") set(f, "contract.fixed_term_count", 2);
  else if (count === "UNKNOWN") set(f, "contract.fixed_term_count", "UNKNOWN");

  set(f, "contract.deemed_second_fixed_term", false);

  /* 协商延长 */
  if (str(answers, "A04") === "YES") {
    set(f, "contract.extension.nature", str(answers, "A05"));
    const ranges = answers["A06"];
    if (Array.isArray(ranges) && ranges.length > 0) {
      set(f, "contract.extension.periods", ranges);
      // 延长期是否届满：以最后一段的到期日与评估日比较
      const last = ranges[ranges.length - 1] as unknown as { to?: string };
      if (last && typeof last.to === "string") {
        set(f, "contract.extension.period_expired", last.to <= evaluationDate);
      }
    }
  } else {
    set(f, "contract.extension.nature", "NONE");
  }

  /* 自动续延 */
  const a07 = str(answers, "A07");
  set(f, "contract.automatic_extension.agreed", a07 === undefined ? undefined : a07 !== "NONE");
  set(
    f,
    "contract.automatic_extension.continued_performance",
    a07 === undefined ? undefined : a07 === "AGREED_AND_CONTINUED",
  );
  set(f, "contract.automatic_extension.extended_period_expired", tri(answers, "A08"));

  /* 变更签约主体 */
  set(f, "contract.entity_change.occurred", tri(answers, "A09"));
  if (str(answers, "A09") === "true") {
    const picked = arr(answers, "A10");
    set(f, "contract.entity_change.not_at_employee_request", picked.includes("NOT_AT_EMPLOYEE_REQUEST"));
    set(f, "contract.entity_change.same_workplace", picked.includes("SAME_WORKPLACE"));
    set(f, "contract.entity_change.same_role", picked.includes("SAME_ROLE"));
    set(f, "contract.entity_change.management_continued", picked.includes("MANAGEMENT_CONTINUED"));
  }

  set(f, "contract.avoidance_patterns", arr(answers, "A11"));

  /* --- 期满后继续用工 --- */
  const a15 = str(answers, "A15");
  set(f, "post_expiry.actual_work_continued", a15 === "true" ? true : a15 === undefined ? undefined : false);
  set(f, "contract.expiry_date", str(answers, "G02__date"));
  const objection = str(answers, "A15.1");
  if (objection === "NEVER" || objection === "CONFLICTING") {
    set(f, "post_expiry.employer_first_objection_date", null);
  } else if (objection === "BEFORE_EXPIRY") {
    // 到期前已明确表示异议：以到期日本身作为异议日，必然不超过一个月
    set(f, "post_expiry.employer_first_objection_date", str(answers, "G02__date"));
  } else if (objection === "WITHIN_ONE_MONTH" || objection === "AFTER_ONE_MONTH") {
    set(f, "post_expiry.employer_first_objection_date", str(answers, "A15.1__date"));
  }
  const a154 = str(answers, "A15.4");
  set(
    f,
    "post_expiry.employer_later_terminated",
    a154 === undefined ? undefined : a154 === "WRITTEN_DISMISSAL" || a154 === "ORAL_DISMISSAL",
  );

  /* --- 续订意愿与无固定期限资格 --- */
  set(f, "renewal.employee_willingness", str(answers, "A12"));
  set(f, "renewal.employee_requested_fixed_term", tri(answers, "A13"));
  // A02 是法定续延，A14 是第 39 / 40 条排除事由；两者都写入同一路径，A14 优先。
  const a14 = str(answers, "A14");
  const a02 = str(answers, "A02");
  set(f, "renewal.statutory_exception", a14 && a14 !== "NONE" ? a14 : (a02 ?? a14));
  /**
   * 是否可能符合订立无固定期限合同的条件。
   * 只做结构判断（已签两次），不判断是否真的产生订立义务 ——
   * 那是 CN-NAT-LCL-14-2-3 规则的事。
   */
  set(f, "indefinite_term.eligibility_candidate", count === "2" || count === "MULTI_ENTITY");

  /* --- 第四十条第三项 --- */
  set(f, "objective_change.cause_category", str(answers, "B03"));
  set(f, "objective_change.original_work_continues", str(answers, "B04"));
  set(f, "objective_change.consultation_type", str(answers, "B06"));
  set(f, "objective_change.concrete_offer_terms_complete", tri(answers, "B07"));
  set(f, "objective_change.adverse_changes", arr(answers, "B08"));
  set(f, "objective_change.employee_response", str(answers, "B09"));
  set(f, "objective_change.notice_or_one_month_pay", str(answers, "B10"));

  /* --- 主张与程序 --- */
  set(f, "procedure.arbitration_filed", str(answers, "P01"));
  set(f, "procedure.preferred_remedy", str(answers, "P02"));
  set(f, "procedure.continued_performance_impossible", tri(answers, "P03"));
  set(f, "procedure.current_claim", str(answers, "P04"));
  set(f, "procedure.limitation_interruption_events", str(answers, "P07"));

  return f;
}
