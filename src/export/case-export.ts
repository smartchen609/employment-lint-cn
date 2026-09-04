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
import { QUESTIONS } from "../questions/tree.js";
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

export function buildCaseExport({
  answers,
  engine,
  resolved,
  generatedAt,
}: ExportInput): string {
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

  /* 8. 证据边界 */
  out.push(
    ...section("8. 证据边界", [
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
