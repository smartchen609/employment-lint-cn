/**
 * 【草稿】被迫解除入口的题目与事实映射。
 *
 * 维护人确认前不上线：线上问题树（tree.ts 的 QUESTIONS）不含这些题目；
 * 只有 VITE_DRAFTS=1 的预览构建与 tests/drafts.test.ts 会用 withDraftQuestions() 叠加它们。
 * 生产产物中不得出现 FORCED_RESIGNATION 字样（scripts/audit-bundle.ts 校验）。
 *
 * 题目与选项的内容全部来自维护人已审定的手册第 03 节「被迫解除」。
 */

import type { Answers, Question } from "../types.js";

export const DRAFT_SHAPE = "FORCED_RESIGNATION";

const isForced = (a: Answers): boolean => a["G01"] === DRAFT_SHAPE;
const picked = (a: Answers, id: string): string[] => {
  const v = a[id];
  return Array.isArray(v) ? v : [];
};

export const DRAFT_G01_OPTION = {
  value: DRAFT_SHAPE,
  label: "公司欠薪或没有缴社保，我想自己提出解除（被迫解除）",
};

export const DRAFT_QUESTIONS: Question[] = [
  {
    id: "F01",
    section: "global",
    prompt: "公司存在下列哪些情形？（多选）",
    why: "劳动合同法第三十八条列明了劳动者可以解除的情形；深圳中院裁判指引第九十二条排除了其中几类欠款。选项不同，能不能走被迫解除这条路就不同。",
    kind: "multi",
    visibleWhen: isForced,
    options: [
      { value: "WAGES_UNPAID", label: "拖欠或少发正常工资" },
      { value: "OVERTIME_UNPAID", label: "拖欠加班费" },
      { value: "SI_NONE", label: "完全没有缴社保" },
      { value: "SI_MISSING_TYPES", label: "缺险种（比如只交了养老、没交医疗）" },
      { value: "SI_UNDERPAID", label: "交了社保，但缴费基数偏低" },
      { value: "DOUBLE_WAGE_UNPAID", label: "没签劳动合同的二倍工资没付" },
      { value: "ANNUAL_LEAVE_PAY_UNPAID", label: "未休年假的工资没付" },
      { value: "HIGH_TEMP_ALLOWANCE_UNPAID", label: "高温津贴没付" },
    ],
  },
  {
    id: "F02",
    section: "global",
    prompt: "被拖欠的工资或加班费，最早是什么时候开始欠的？",
    why: "近一两年，裁审机关越来越多地考虑被迫解除的「紧迫性」：拿一笔很久以前的欠款主张被迫解除，很可能不被支持。",
    kind: "single",
    visibleWhen: (a) => isForced(a) && picked(a, "F01").some((v) => v === "WAGES_UNPAID" || v === "OVERTIME_UNPAID"),
    options: [
      { value: "WITHIN_ONE_YEAR", label: "一年以内" },
      { value: "OVER_ONE_YEAR_RAISED", label: "一年以前，当时向公司提过" },
      { value: "OVER_ONE_YEAR_NOT_RAISED", label: "一年以前，当时没有向公司提过" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "F03",
    section: "global",
    prompt: "社保的事，你是否已经书面要求公司缴纳？",
    why: "深圳中院裁判指引第九十四条：社保没交，要先要求公司缴纳，公司一个月内还不缴，才可以被迫解除。",
    kind: "single",
    // 只有深圳中院裁判指引第九十四条要求先催缴；其他地区不问，免得多答一道不影响结果的题。
    visibleWhen: (a) =>
      isForced(a) && a["G03"] === "CN-GD-SZ" && picked(a, "F01").some((v) => v === "SI_NONE" || v === "SI_MISSING_TYPES"),
    options: [
      { value: "NOT_YET", label: "还没有要求过" },
      { value: "ORAL_ONLY", label: "只口头说过" },
      { value: "WRITTEN_UNDER_ONE_MONTH", label: "书面要求过，还不满一个月" },
      { value: "WRITTEN_OVER_ONE_MONTH", label: "书面要求过，满一个月公司仍未缴" },
    ],
  },
  {
    id: "F04",
    section: "global",
    prompt: "你现在的状态是？",
    why: "走的时候有没有书面说明是因为公司哪项过错而解除，是被迫解除最常出问题的地方（广东高院 2017 年解答第 8 条、深圳中院裁判指引第八十一条第二款）。",
    kind: "single",
    visibleWhen: isForced,
    options: [
      { value: "STILL_EMPLOYED", label: "还在职，还没有提出解除" },
      { value: "LEFT_WITH_WRITTEN_REASON", label: "已经离开，离开时书面写明了是因为公司欠薪或未缴社保而解除" },
      { value: "LEFT_WITH_OTHER_REASON", label: "已经离开，写的是个人原因或其他理由" },
      { value: "LEFT_WITHOUT_NOTICE", label: "已经离开，没有说明理由" },
      { value: "NOTICE_AFTER_LEAVING", label: "先离开了，之后才寄出解除通知" },
    ],
  },
];

/**
 * 在线上问题集上叠加草稿题目：G01 增加被迫解除选项；选了被迫解除时，
 * 隐藏"这次操作何时生效"（G02 问的是公司的操作）与仅适用于公司解除路径的题目，
 * 草稿题目插在 G04 之后。
 */
export function withDraftQuestions(base: readonly Question[]): Question[] {
  const out: Question[] = [];
  for (const q of base) {
    if (q.id === "G01") {
      out.push({ ...q, options: [...(q.options ?? []), DRAFT_G01_OPTION] });
      continue;
    }
    if (q.id === "G02") {
      const prev = q.visibleWhen;
      out.push({ ...q, visibleWhen: (a) => !isForced(a) && (prev ? prev(a) : true) });
      continue;
    }
    out.push(q);
    if (q.id === "G04") out.push(...DRAFT_QUESTIONS);
  }
  return out;
}

/**
 * 草稿题目 → 事实。只做结构映射，不做法律判断。
 *
 * 另外把线上已有的协商解除（M01–M03）、事实解除（D01–D04）答案映射成事实，
 * 供两条草稿规则使用。线上 build-facts.ts 目前没有映射它们（open-questions Q10）。
 */
export function addDraftFacts(answers: Answers, facts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...facts };
  if (isForced(answers)) {
    const forced: Record<string, unknown> = { grounds: picked(answers, "F01") };
    if (typeof answers["F02"] === "string") forced["arrears_age"] = answers["F02"];
    if (typeof answers["F03"] === "string") forced["social_insurance_demand"] = answers["F03"];
    if (typeof answers["F04"] === "string") forced["exit_status"] = answers["F04"];
    out["forced"] = forced;
  }
  if (answers["G01"] === "MUTUAL_TERMINATION") {
    const mutual: Record<string, unknown> = {};
    if (typeof answers["M01"] === "string") mutual["proposer"] = answers["M01"];
    if (typeof answers["M02"] === "string") mutual["signed"] = answers["M02"];
    if (answers["M03"] === "true") mutual["asked_personal_reason"] = true;
    else if (answers["M03"] === "false") mutual["asked_personal_reason"] = false;
    else if (answers["M03"] === "UNKNOWN") mutual["asked_personal_reason"] = "UNKNOWN";
    out["mutual"] = mutual;
  }
  if (answers["G01"] === "DE_FACTO_TERMINATION") {
    const defacto: Record<string, unknown> = { actions: picked(answers, "D02") };
    if (typeof answers["D01"] === "string") defacto["employer_statement"] = answers["D01"];
    if (typeof answers["D03"] === "string") defacto["willingness_expressed"] = answers["D03"];
    out["defacto"] = defacto;
  }
  return out;
}
