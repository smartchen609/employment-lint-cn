import { z } from "zod";

/**
 * 输出文案的数据结构。
 *
 * ## 为什么放在 rules/copy/ 而不是 src/
 *
 * 这些文案是**法律内容**，由律师撰写和审阅，需要能做 Git diff、
 * 能在 PR 里看清"文案变了"而不是"程序逻辑变了"。
 * 因此与规则 YAML 同属 `rules/`，适用 CC BY 4.0（见 LICENSE-CONTENT.md），
 * 而不是 `src/` 的 MIT。round2 §11.1 的同一条理由。
 *
 * 运行时不读 YAML —— 由 scripts/build-content.ts 在构建期生成 JSON。
 *
 * ## 纪律
 *
 * 全部文案一律照抄规格书（round2 §7/§8/§9、round3 §5）。
 * **不得新增规格书之外的输出文案**（CLAUDE.md §L2）。
 * 确需改动的（例如规格书自身用到了 §6.5 的禁止表达），
 * 必须在 `docs/open-questions.md` 留档说明。
 */

/** 小节：要么是段落，要么是条目清单，至少有一样。 */
export const CopySection = z
  .object({
    heading: z.string().min(1),
    paragraphs: z.array(z.string().min(1)).default([]),
    items: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .refine(
    (s) => s.paragraphs.length > 0 || s.items.length > 0,
    "小节必须至少有 paragraphs 或 items",
  );

/**
 * 一个定性终点或主张方向的完整输出模板。
 *
 * `primary_warning` 是"最高优先级 Warning"（round2 §1甲）：
 * 结果页第一屏只显示一条，其余降为次级。
 * 因此它是**必填且唯一**的 —— 不是数组。
 */
export const EndpointTemplate = z
  .object({
    id: z.string().regex(/^[CR]\d{2}$/, "终点编号形如 C07 或 R03"),
    /** 定性标题，对应规格书里的 `### ...` 行。 */
    title: z.string().min(1),
    body: z.array(z.string().min(1)).default([]),
    primary_warning: z.string().min(1),
    sections: z.array(CopySection).default([]),
    /**
     * 该终点由哪几条规则锚定。**优先于 findings 匹配。**
     *
     * 多条规则会产出同一个 Finding（如第十条第一项与第二项都产出
     * DEEMED_SECOND_FIXED_TERM），只按 Finding 匹配会让 C07 与 C09 同时出现。
     * 因此凡是能唯一对应到某条规则的终点，一律用 rule_ids 锚定。
     */
    rule_ids: z.array(z.string().min(1)).default([]),
    /**
     * 该终点关联的 Finding 标识。
     * 仅用于同一条规则内部按 conditional findings 分岔的终点（C20/C21/C22、R01–R03）。
     */
    findings: z.array(z.string().min(1)).default([]),
    /** 与规格书原文的偏离说明。仅在不得不改动时填写。 */
    deviation_note: z.string().optional(),
  })
  .strict();

export type EndpointTemplate = z.infer<typeof EndpointTemplate>;

export const EndpointTemplateFile = z
  .object({
    templates: z.array(EndpointTemplate).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.templates.forEach((t, i) => {
      if (seen.has(t.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["templates", i, "id"],
          message: `重复的终点编号: ${t.id}`,
        });
      }
      seen.add(t.id);
    });
  });

/**
 * 证据固定清单 —— 两栏结构。round2 §9。
 *
 * 左栏"现在还能取得或主动形成"，右栏"解除后很可能难以取得"。
 * 两栏必须等长关系不作要求，但都不得为空：
 * 这张表的全部意义在于对比"现在能拿"与"以后拿不到"。
 */
export const EvidenceChecklist = z
  .object({
    id: z.string().regex(/^P\d{2}$/, "证据清单编号形如 P01"),
    title: z.string().min(1),
    /** 现在还能取得或主动形成。 */
    currently_available: z.array(z.string().min(1)).min(1),
    /** 解除或签署后很可能难以取得。 */
    at_risk_after_exit: z.array(z.string().min(1)).min(1),
    /** 右栏在协商解除路径上的表述不同，允许覆盖列标题。 */
    at_risk_column_title: z.string().optional(),
  })
  .strict();

export type EvidenceChecklist = z.infer<typeof EvidenceChecklist>;

export const EvidenceChecklistFile = z
  .object({
    checklists: z.array(EvidenceChecklist).min(1),
    /** 程序员专属证据边界提示，结果页固定显示。round2 §9。 */
    boundary_notice: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type EvidenceChecklistFile = z.infer<typeof EvidenceChecklistFile>;
