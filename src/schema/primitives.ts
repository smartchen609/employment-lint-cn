import { z } from "zod";

/**
 * 基础枚举与标量。
 *
 * 命名一律采用 YAML 中的 snake_case —— YAML 是律师可审的规则源，
 * schema 必须贴着 YAML 走，不得为了 TypeScript 习惯改成 camelCase。
 * 见 CLAUDE.md §E2。
 */

/** ISO 日期，YAML 中必须加引号。 */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须为 YYYY-MM-DD 且在 YAML 中加引号")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "不是有效日期");

export const IsoDateOrEmpty = z.union([IsoDate, z.literal("")]);

/**
 * 规格书未给出的日期，一律写字面量 "TODO_VERIFY"，
 * 并在 docs/sources-to-verify.md 登记。
 * **不得由 AI 凭记忆或推测填写生效日期。** CLAUDE.md §L1。
 * validate-rules 会把这些日期单列出来，构建（--strict）不放行。
 */
export const IsoDateOrTodo = z.union([IsoDate, z.literal("TODO_VERIFY")]);

export const SemVer = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "version 必须为 x.y.z");

/**
 * 不确定性四档。**不是胜诉概率。** round2 §6.1。
 */
export const Uncertainty = z.enum([
  "deterministic",
  "rule-based",
  "fact-sensitive",
  "judicial-discretion",
]);
export type Uncertainty = z.infer<typeof Uncertainty>;

/**
 * 严重程度。与 Uncertainty 是**两个独立维度**，
 * `blocker` + `fact-sensitive` 是合法组合。round2 §6.3。
 */
export const Severity = z.enum(["info", "warning", "error", "blocker"]);
export type Severity = z.infer<typeof Severity>;

/** 证据覆盖状态。禁止写"证据充分""足以胜诉"。round2 §6.4。 */
export const EvidenceStatus = z.enum([
  "direct",
  "indirect",
  "self-reported",
  "missing",
  "conflicting",
  "unknown",
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const AuthorityType = z.enum([
  "statute",
  "judicial-interpretation",
  "local-regulation",
  "published-case",
  /** 地方法院裁判指引、解答、座谈会纪要。不是法律法规，但对本地裁审有直接影响。 */
  "local-court-guidance",
  /** 维护人依司法实践作出的判断，无单独文件依据。 */
  "internal-methodology",
]);
export type AuthorityType = z.infer<typeof AuthorityType>;

export const RuleStatus = z.enum(["active", "deprecated", "draft"]);

/**
 * 地域层级。
 * `special-economic-zone-regulation` 供深圳经济特区法规使用（round3 §1）。
 */
export const JurisdictionLevel = z.enum([
  "national",
  "province",
  "city",
  "special-economic-zone-regulation",
]);

/**
 * 案例来源在规则中的作用。
 * 案件规则**永远**只能是 interpretive-signal，
 * 不得覆盖法律、司法解释或地方有效法规。round2 §11.5。
 */
export const BindingRole = z.enum([
  "binding",
  "supporting",
  "interpretive-signal",
]);
