import { z } from "zod";
import { Uncertainty } from "./primitives.js";

/**
 * TestFixture —— 测试用例。round2 §12、round3 §7。
 *
 * ## `actual_result` 的纪律
 *
 * "预期定性"只是工具应输出什么，**不是案件真实裁判结果**。
 *
 * `actual_result` 一栏由维护人用真实案件回填。
 * **AI 在任何情况下不得填写或推测。** CLAUDE.md §L5。
 *
 * schema 只强制该字段必须存在（不得省略）。
 * 是否为空由 validate-rules 统计报告，不作为校验失败条件 ——
 * 因为维护人后续填入真实结果是合法的。
 */

export const FixtureExpectation = z
  .object({
    /** 预期输出的 Finding 标识，顺序不敏感。 */
    findings: z.array(z.string().min(1)).default([]),
    /** 预期的最高优先级输出模板编号，如 "C06"、"R05"。 */
    primary_endpoint: z.string().regex(/^[CR]\d{2}[A-E]?$/).optional(),
    /** 预期展示的最终不确定性档位（取规则与证据两者中的较高者）。 */
    uncertainty: Uncertainty.optional(),
    /** 预期**不应**出现的 Finding，用于回归防漏／防误报。 */
    not_findings: z.array(z.string().min(1)).default([]),
    /** 预期同时出现的次级模板编号。 */
    secondary_endpoints: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const TestFixture = z
  .object({
    id: z
      .string()
      .regex(/^T\d{2}[A-E]?$/, "测试 ID 形如 T01 或 T11A"),
    title: z.string().min(1),
    /**
     * 输入事实。结构随问题树演进，此处不锁死键名 ——
     * 锁死的是 RuleRecord 的 fact 路径，由引擎在 P3 对齐。
     */
    input: z.record(z.string(), z.unknown()),
    expected: FixtureExpectation,
    /** **由维护人回填真实案件结果。AI 不得填写。** */
    actual_result: z.string(),
    note: z.string().optional(),
  })
  .strict();

export type TestFixture = z.infer<typeof TestFixture>;
