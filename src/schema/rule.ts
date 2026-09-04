import { z } from "zod";
import {
  AuthorityType,
  BindingRole,
  IsoDate,
  IsoDateOrTodo,
  JurisdictionLevel,
  RuleStatus,
  SemVer,
  Severity,
  Uncertainty,
} from "./primitives.js";

/**
 * RuleRecord —— 规则层数据结构。
 *
 * 字段命名以 round3 为准（CLAUDE.md §1）：
 *   - `provision_effective`，**不是** `effective`
 *   - `jurisdiction: country / province / city / level`，**不是** `regions`
 *
 * `rules/` 目录只放法律规则数据，不写任何执行逻辑（CLAUDE.md §E5）。
 */

/* ------------------------------------------------------------------ */
/* 条件树                                                              */
/* ------------------------------------------------------------------ */

export const ConditionOperator = z.enum([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "exists",
  "includes_any",
  "includes_all",
]);

const FactPath = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, "fact 路径使用小写下划线点分");

/** 叶子条件：`fact` 直接来自用户回答，`derived_fact` 由引擎计算得出。 */
const LeafCondition = z
  .object({
    fact: FactPath.optional(),
    derived_fact: FactPath.optional(),
    operator: ConditionOperator,
    value: z.unknown().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const hasFact = c.fact !== undefined;
    const hasDerived = c.derived_fact !== undefined;
    if (hasFact === hasDerived) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "叶子条件必须且只能指定 fact 或 derived_fact 之一",
      });
    }
    if (c.operator !== "exists" && c.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `operator ${c.operator} 必须提供 value`,
      });
    }
  });

export type ConditionTree =
  | z.infer<typeof LeafCondition>
  | { all: ConditionTree[] }
  | { any: ConditionTree[] }
  | { not: ConditionTree };

export const ConditionTree: z.ZodType<ConditionTree> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ConditionTree).min(1) }).strict(),
    z.object({ any: z.array(ConditionTree).min(1) }).strict(),
    z.object({ not: ConditionTree }).strict(),
    LeafCondition,
  ]),
);

/* ------------------------------------------------------------------ */
/* 组成部分                                                            */
/* ------------------------------------------------------------------ */

export const Jurisdiction = z
  .object({
    country: z.literal("CN"),
    province: z.string().optional(),
    city: z.string().optional(),
    level: JurisdictionLevel,
  })
  .strict()
  .superRefine((j, ctx) => {
    if (j.level === "national" && (j.province || j.city)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "level: national 不得同时指定 province 或 city",
      });
    }
    if (j.level !== "national" && !j.province) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["province"],
        message: "非全国规则必须指定 province",
      });
    }
  });

/**
 * `provision_effective` 表达的是**条款本身何时生效**，
 * 与"法规最近一次何时修正""这次修正有没有改到该条款"分开记录。
 * round3 §0/§1：不得再用一个含义模糊的 `effective.from` 同时表达三件事。
 */
export const ProvisionEffective = z
  .object({
    from: IsoDateOrTodo,
    to: IsoDate.nullable(),
  })
  .strict();

export const InstrumentHistory = z
  .object({
    adopted_at: IsoDate.optional(),
    promulgated_at: IsoDate.optional(),
    original_effective_from: IsoDate.optional(),
    last_amendment_adopted_at: IsoDate.optional(),
    last_amendment_promulgated_at: IsoDate.optional(),
    /** 最近一次修正是否改到了本条款。深圳第十八条第二款为 false。 */
    provision_changed_by_last_amendment: z.boolean(),
  })
  .strict();

/**
 * 法律依据。**URL 不写在这里**，只写 source_id，指向 sources.yml。
 * `article` 必须能在对应 source 的 pinpoint 中找到（由 validate-rules 强制）。
 */
export const LegalBasis = z
  .object({
    source_id: z.string().min(1),
    instrument: z.string().optional(),
    document_no: z.string().optional(),
    article: z.string().min(1),
    quote: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

const FindingId = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, "Finding 标识使用大写下划线");

/** 条件性 Finding：命中主条件后，再按 when 追加。round3 §6。 */
const ConditionalFinding = z
  .object({
    when: ConditionTree,
    add: z.array(FindingId).min(1),
  })
  .strict();

export const RuleFindings = z
  .object({
    /** round2 §11.3 写法 */
    classification_candidates: z.array(FindingId).min(1).optional(),
    /** round3 §6 写法 */
    base: z.array(FindingId).min(1).optional(),
    conditional: z.array(ConditionalFinding).optional(),
    headline: z.string().optional(),
    explanation: z.string().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (!f.classification_candidates && !f.base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "findings 必须提供 classification_candidates 或 base",
      });
    }
    if (f.classification_candidates && f.base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "classification_candidates 与 base 是同一含义的两种写法，只能用其一",
      });
    }
  });

export const EvidenceRequirement = z
  .object({
    id: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/, "证据标识使用大写下划线"),
    label: z.string().min(1),
  })
  .strict();

export const RuleEvidence = z
  .object({
    required: z.array(EvidenceRequirement).default([]),
    supporting: z.array(EvidenceRequirement).default([]),
    contrary: z.array(EvidenceRequirement).default([]),
    at_risk_after_exit: z.array(EvidenceRequirement).default([]),
  })
  .strict();

export const ClaimGuidance = z
  .object({
    recommended: z.array(z.string().min(1)).default([]),
    /** 反向清单是规则引擎的核心。round2 §1甲。 */
    do_not_claim: z.array(z.string().min(1)).default([]),
    review_required: z.boolean(),
  })
  .strict();

export const RuleException = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    /** block：阻断本规则命中；downgrade：降级；note：仅提示。 */
    effect: z.enum(["block", "downgrade", "note"]),
  })
  .strict();

export const RuleSourceRef = z
  .object({
    source_id: z.string().min(1),
    binding_role: BindingRole,
  })
  .strict();

export const SourceReview = z
  .object({
    last_verified_at: IsoDate,
    verified_status: z.string().min(1),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* RuleRecord                                                          */
/* ------------------------------------------------------------------ */

export const RuleRecord = z
  .object({
    id: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, "rule id 使用大写字母、数字和连字符"),
    version: SemVer,
    status: RuleStatus,

    title: z.string().min(1),
    description: z.string().optional(),

    jurisdiction: Jurisdiction,

    /** 数值越大越优先。深圳与全国规则**并行展示**，不靠 priority 互相覆盖。 */
    priority: z.number().int().default(0),
    /** 显式声明本规则覆盖哪些规则。案例规则不得覆盖法律法规。 */
    overrides: z.array(z.string()).default([]),

    provision_effective: ProvisionEffective,
    instrument_history: InstrumentHistory.optional(),

    authority_type: AuthorityType,
    uncertainty: Uncertainty,
    severity: Severity,

    legal_basis: z.array(LegalBasis).min(1),
    conditions: ConditionTree,
    findings: RuleFindings,
    claim_guidance: ClaimGuidance,
    evidence: RuleEvidence,

    exceptions: z.array(RuleException).default([]),
    sources: z.array(RuleSourceRef).default([]),
    source_review: SourceReview.optional(),

    /** 对应测试用例 ID，供结果页展开显示。至少一条。 */
    tests: z.array(z.string().min(1)).min(1),

    last_reviewed_at: IsoDate,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      r.provision_effective.to &&
      r.provision_effective.from !== "TODO_VERIFY" &&
      r.provision_effective.to < r.provision_effective.from
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provision_effective"],
        message: "provision_effective.to 早于 from",
      });
    }
    // 案例规则永远不能覆盖法律、司法解释或地方有效法规。round2 §11.5。
    if (r.authority_type === "published-case" && r.overrides.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overrides"],
        message: "published-case 规则不得 override 任何规则",
      });
    }
    if (
      r.authority_type === "published-case" &&
      r.sources.some((s) => s.binding_role === "binding")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sources"],
        message: "案例来源只能是 interpretive-signal 或 supporting",
      });
    }
  });

export type RuleRecord = z.infer<typeof RuleRecord>;
