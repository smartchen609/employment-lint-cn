/**
 * Markdown Case Export。字段结构照 round2 §10。
 *
 * ## 隐私默认值
 *
 * **默认不含姓名、身份证号、公司全称。** round2 §19 第 9 条。
 * 本模块从不接收这些字段 —— 问题树里根本没有它们，
 * 因此这不是"默认关闭"，而是"结构上无法包含"。
 *
 * 用户自行粘贴的解除理由原文（B02T）会进入报告，
 * 界面上对此有明确提示，并要求不要粘贴无关的公司内部资料。
 */

import type { EngineResult } from "../engine/evaluate.js";
import type { ResolvedResult } from "../findings/resolve.js";
import { calendarMonthsBetween } from "../engine/calendar.js";
import { pruneAnswers, QUESTIONS } from "../questions/tree.js";
import type { Answers } from "../questions/types.js";

export const TOOL_NAME = "Employment Lint CN";
export const TOOL_VERSION = "0.1.0";
export const RULESET_VERSION = "2026-09-04";

interface ExportInput {
  answers: Answers;
  engine: EngineResult;
  resolved: ResolvedResult | null;
  generatedAt: string;
}

interface DateRange {
  from?: string;
  to?: string;
}

function isDateRange(v: unknown): v is DateRange {
  return typeof v === "object" && v !== null && ("from" in v || "to" in v);
}

/**
 * 日期区间的呈现。
 *
 * 延长区间是深圳规则与全国一年规则的**关键事实**，
 * 报告里必须能看到每一段的起止和累计月数，
 * 否则律师拿到报告还得回头问用户"到底延长了多久"。
 * 累计按日历月算，与规则层同一套算法。
 */
function formatRanges(ranges: DateRange[]): string[] {
  const lines: string[] = [];
  let total = 0;
  for (const r of ranges) {
    if (!r.from || !r.to) {
      lines.push(`  - ${r.from ?? "（未填）"} 至 ${r.to ?? "（未填）"}`);
      continue;
    }
    const months = calendarMonthsBetween(r.from, r.to);
    total += months;
    lines.push(`  - ${r.from} 至 ${r.to}（${months} 个日历月）`);
  }
  if (ranges.length > 0) {
    lines.push(`  - 累计 ${total} 个日历月（按《民法典》第二百零二条的日历月计算）`);
  }
  return lines;
}

function labelOf(questionId: string, value: unknown): string {
  const q = QUESTIONS.find((x) => x.id === questionId);
  if (!q) return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "（未选择）";
    return value
      .map((v) => q.options?.find((o) => o.value === v)?.label ?? String(v))
      .join("；");
  }
  return q.options?.find((o) => o.value === value)?.label ?? String(value);
}

function section(title: string, lines: string[]): string[] {
  return lines.length > 0 ? [`## ${title}`, "", ...lines, ""] : [];
}

/**
 * 需要律师重点复核的问题。round2 §10.2 第 9 节。
 *
 * 这一节是整份报告里对**接收方**最有用的部分：
 * 律师拿到报告后第一件事是判断"这个案子的争点在哪"，
 * 而不是通读全部问答。
 *
 * 问题一律由本次命中的 Finding 与答案结构生成，
 * **不新增规格书之外的法律判断** —— 每一条都对应一处已经在
 * 规则或模板里写明的不确定性。
 */
function lawyerQuestions(
  answers: Answers,
  engine: EngineResult,
  resolved: ResolvedResult | null,
): string[] {
  const qs: string[] = [];
  const has = (id: string) => engine.findings.some((f) => f.id === id);
  const answer = (id: string) => answers[id];

  if (has("SZ_DEEMED_RENEWAL")) {
    qs.push("深圳地方规则与全国司法解释在本案中如何并行适用？");
  }
  if (has("DEEMED_SECOND_FIXED_TERM") || has("SZ_DEEMED_RENEWAL")) {
    qs.push("本案是否已构成连续订立二次固定期限劳动合同？");
  }
  if (has("ENTITY_CHANGE_DOES_NOT_RESET_COUNT")) {
    qs.push("变更签约主体前后的劳动管理是否具有连续性，能否证明？");
  }
  if (has("GOOD_FAITH_AVOIDANCE_CANDIDATE")) {
    qs.push("公司的用工安排是否构成规避无固定期限合同的诚信问题？");
  }
  if (has("INDEFINITE_TERM_OBLIGATION_CANDIDATE")) {
    qs.push("续订意愿的证据是否已经明确到足以触发无固定期限合同订立义务？");
  }
  if (has("DEEMED_RENEWAL_CANDIDATE")) {
    qs.push("劳动关系结束日应认定为原合同到期日，还是公司后来解除之日？");
  }
  if (has("SUBSEQUENT_TERMINATION_CONSEQUENCES_REVIEW")) {
    qs.push("公司在拟制续订后作出的解除，依据与程序是否成立？");
  }
  if (has("ARTICLE_40_3_CONSULTATION_GAP")) {
    qs.push("公司是否履行了第四十条第三项要求的实质性合同变更协商？");
  }
  if (has("ARTICLE_40_3_OFFER_REASONABLENESS_DISPUTED")) {
    qs.push("公司提出的变更方案是否合理，劳动者拒绝是否有正当理由？");
  }
  if (has("ARTICLE_40_3_CAUSE_NOT_ESTABLISHED_ALONE")) {
    qs.push("公司主张的变化是否属于其控制范围之外的客观情况？");
  }
  if (has("ARBITRATION_LIMITATION_RISK")) {
    qs.push("仲裁时效是否已经届满，期间是否存在中断或中止事由？");
  }
  if (answer("P02") === "UNDECIDED") {
    qs.push("应当选择继续履行还是违法解除赔偿金？");
  }
  if (answer("P01") !== undefined && answer("P01") !== "NOT_FILED") {
    qs.push("现有仲裁请求应否调整，如何表述？");
  }
  if (answer("M02") === "SIGNED_AGREEMENT" || answer("M02") === "SUBMITTED_RESIGNATION") {
    qs.push("已签署的退出文件对后续主张有何影响，是否存在可撤销事由？");
  }
  if (answer("B02") === "AFTER_TERMINATION" || answer("B02") === "AFTER_ARBITRATION") {
    qs.push("公司事后补充的解除理由能否作为解除依据？");
  }
  if (resolved && resolved.classification.some((t) => t.id === "C18")) {
    qs.push("本案涉及本工具未覆盖的法定情形，应如何处理？");
  }

  qs.push("是否存在尚未识别的程序或时效问题？");

  return qs.map((q, i) => `${i + 1}. ${q}`);
}

export function buildCaseExport({
  answers: rawAnswers,
  engine,
  resolved,
  generatedAt,
}: ExportInput): string {
  // 报告里只列用户真正回答过、且当前仍然有效的问题。
  const answers = pruneAnswers(rawAnswers);
  const out: string[] = [];

  out.push(
    "---",
    `tool: ${TOOL_NAME}`,
    `tool_version: ${TOOL_VERSION}`,
    `ruleset_version: ${RULESET_VERSION}`,
    `generated_at: ${generatedAt}`,
    "privacy_mode: local-only",
    "---",
    "",
    "# 劳动关系操作预检摘要",
    "",
    "> 本摘要依据使用者自行填写的事实在浏览器本地生成。",
    "> 它不是证据、裁判结论或律师法律意见。",
    "> 原始合同、通知和沟通记录可能改变以下判断。",
    "",
  );

  /* 1. 已回答的问题，按规格书编号原样列出 */
  const answered = QUESTIONS.filter(
    (q) => answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "",
  );
  out.push(
    ...section(
      "1. 你填写的事实",
      answered.flatMap((q) => {
        const raw = answers[q.id];
        const lines = [`- **${q.id}** ${q.prompt}`];
        if (Array.isArray(raw) && raw.some(isDateRange)) {
          lines.push(...formatRanges(raw as unknown as DateRange[]));
        } else {
          lines.push(`  - ${labelOf(q.id, raw)}`);
        }
        const date = answers[`${q.id}__date`];
        if (typeof date === "string" && date) lines.push(`  - 日期：${date}`);
        return lines;
      }),
    ),
  );

  /* 1b. 公司给出的解除理由原文（用户自行粘贴，工具不解析） */
  const statedReason = answers["B02T"];
  if (typeof statedReason === "string" && statedReason.trim()) {
    out.push(
      ...section("1b. 公司书面理由原文（使用者自行粘贴）", [
        "> " + statedReason.trim().split("\n").join("\n> "),
        "",
        "本工具不解析该文本，也不据此作出任何判断。",
      ]),
    );
  }

  /* 2. 定性候选 */
  if (resolved) {
    const cards = resolved.classification.flatMap((t) => {
      const fs = resolved.findingsByEndpoint[t.id] ?? [];
      const meta =
        fs.length > 0
          ? fs
              .map(
                (f) =>
                  `  - \`${f.severity.toUpperCase()}\` · \`${f.uncertainty}\` · ` +
                  `${f.id}（规则 ${f.ruleId}）`,
              )
              .join("\n")
          : "  - 由问答路径直接得出，未对应具体规则";
      return [`### ${t.id} ${t.title}`, "", meta, ""];
    });
    out.push(...section("2. 定性候选", cards));

    out.push(
      ...section("3. 最高优先级 Warning", [
        `**${resolved.primary.id}**`,
        "",
        resolved.primary.primary_warning.trim(),
      ]),
    );

    if (resolved.secondary.length > 0) {
      out.push(
        ...section(
          "4. 次级提示",
          resolved.secondary.map((t) => `- **${t.id}** ${t.primary_warning.trim()}`),
        ),
      );
    }

    if (resolved.claimDirection) {
      const c = resolved.claimDirection;
      const doNot = c.sections.find((s) => s.heading.includes("不应主张") || s.heading.includes("不应做"));
      out.push(
        ...section("5. 当前主张方向", [
          `**${c.id} ${c.title}**`,
          "",
          ...(doNot ? ["当前不应直接主张：", "", ...doNot.items.map((i) => `- ${i}`)] : []),
        ]),
      );
    }

    /* 6. 证据固定 */
    const ev = resolved.evidence.flatMap((c) => [
      `### ${c.title}`,
      "",
      "**现在还能取得或主动形成**",
      "",
      ...c.currently_available.map((i) => `- ${i}`),
      "",
      `**${c.at_risk_column_title ?? "解除后很可能难以取得"}**`,
      "",
      ...c.at_risk_after_exit.map((i) => `- ${i}`),
      "",
    ]);
    out.push(...section("6. 证据固定", ev));
  } else {
    out.push(
      ...section("2. 定性候选", [
        "本次问答未形成可靠的定性候选。请补齐关键事实后重新运行，或直接交由专业人士复核。",
      ]),
    );
  }

  /* 7. 复杂度 */
  if (engine.complexity === "HIGH") {
    out.push(
      ...section("7. 建议专业复核", [
        "本次结果涉及以下一种或多种不可逆风险：",
        "",
        ...engine.complexityTriggers.map((t) => `- ${t}`),
        "",
        "继续自行签字、回复或提交材料，可能把仍可调整的问题固定为程序记录。",
      ]),
    );
  }

  /* 7b. 答案冲突 —— round2 §10.1 evidence.conflicting_facts */
  if (resolved && resolved.conflicts.length > 0) {
    out.push(
      ...section("7b. 你的答案中存在的冲突", [
        "以下事实互相矛盾，会直接影响定性。请在下一步行动前核对原始材料：",
        "",
        ...resolved.conflicts.map((c) => `- ${c}`),
      ]),
    );
  }

  /* 8. 需要律师重点复核的问题 —— round2 §10.2 第 9 节 */
  out.push(...section("8. 需要律师重点复核的问题", lawyerQuestions(answers, engine, resolved)));

  /* 9. 证据边界 */
  out.push(
    ...section("9. 证据边界", [
      "只保存与本人劳动关系、岗位、绩效和解除事实具有必要关联的材料。",
      "",
      "不要绕过权限控制，不要使用他人账号，不要批量复制源代码、客户数据、模型权重、密钥、商业秘密或与案件无关的公司文件。",
      "",
      "证据固定不等于可以无限制下载公司数据。",
    ]),
  );

  out.push(
    "---",
    "",
    `Generated locally by ${TOOL_NAME}.`,
    "No account. No upload. No application telemetry.",
    "",
  );

  return out.join("\n");
}
