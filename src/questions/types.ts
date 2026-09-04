/**
 * 问题树的数据结构。
 *
 * 问题是**数据**，不是组件。round2 §15.2：用数据驱动节点和普通 reducer 足够，
 * 不要为了状态树引入复杂框架。
 */

export type AnswerValue = string | string[] | number | boolean | null;
export type Answers = Record<string, AnswerValue>;

export interface QuestionOption {
  value: string;
  label: string;
  /** 选中后额外要求填写日期，如 A15.1「到期后一个月以内明确表示」。 */
  requiresDate?: boolean;
}

export interface Question {
  /** 规格书里的编号，如 G01、A15.1、B07。结果页与 Case Export 都按它引用。 */
  id: string;
  /** 所属路径，用于分组显示进度。 */
  section: "global" | "expiry" | "article40" | "mutual" | "defacto" | "claim";
  prompt: string;
  /** 「为什么必须问」—— 规格书里的同名列，展开可见。 */
  why?: string;
  kind: "single" | "multi" | "date" | "date-ranges" | "number" | "text";
  options?: QuestionOption[];
  /** 该题写入的事实路径。仅进 Case Export 不进规则的题目留空。 */
  factPath?: string;
  /** 可见性。返回 false 时该题不出现，也不计入「本次可见问题数」。 */
  visibleWhen?: (a: Answers) => boolean;
  /** 文本题的占位说明。 */
  placeholder?: string;
  /** 是否允许跳过（不确定）。 */
  optional?: boolean;
}
