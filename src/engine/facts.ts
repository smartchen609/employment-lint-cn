/**
 * 事实读取与派生。
 *
 * 用户答案是嵌套对象，规则条件用点分路径引用。
 * 派生事实由本模块按法律规则计算，**不由用户直接回答**。
 */

import {
  calendarMonthsBetween,
  exceedsOneCalendarMonth,
  exceedsOneCalendarYear,
  type IsoDateString,
} from "./calendar.js";

export type Facts = Record<string, unknown>;

/** 按点分路径读取。路径不存在返回 undefined。 */
export function getFact(facts: Facts, path: string): unknown {
  let node: unknown = facts;
  for (const seg of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[seg];
  }
  return node;
}

function asIsoDate(v: unknown): IsoDateString | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * 计算全部派生事实，返回补齐后的事实树。
 *
 * 优先按日期真算；只有在缺少日期时才回落到用户/用例直接给出的数值，
 * 这样日历月规则确实被执行，而不是被一个现成的布尔值绕过去。
 */
export function deriveFacts(facts: Facts, evaluationDate: IsoDateString): Facts {
  const out: Facts = structuredClone(facts);

  const setPath = (path: string, value: unknown): void => {
    const segs = path.split(".");
    let node = out as Record<string, unknown>;
    for (const seg of segs.slice(0, -1)) {
      if (node[seg] === null || typeof node[seg] !== "object") node[seg] = {};
      node = node[seg] as Record<string, unknown>;
    }
    node[segs[segs.length - 1]!] = value;
  };

  // --- 协商延长累计日历月数 ---
  const periods = getFact(out, "contract.extension.periods");
  if (Array.isArray(periods) && periods.length > 0) {
    let total = 0;
    for (const p of periods) {
      const from = asIsoDate((p as Record<string, unknown>)?.["from"]);
      const to = asIsoDate((p as Record<string, unknown>)?.["to"]);
      if (from && to) total += calendarMonthsBetween(from, to);
    }
    setPath("contract.extension.cumulative_calendar_months", total);
  }

  // --- 期满后未表示异议是否超过一个日历月 ---
  const expiry = asIsoDate(getFact(out, "contract.expiry_date"));
  if (expiry !== null && getFact(out, "post_expiry.actual_work_continued") === true) {
    const objectionRaw = getFact(out, "post_expiry.employer_first_objection_date");
    const objection = asIsoDate(objectionRaw);
    setPath(
      "post_expiry.no_objection_exceeds_one_calendar_month",
      exceedsOneCalendarMonth(expiry, objection, evaluationDate),
    );
  }

  // --- 仲裁时效是否超过一个日历年 ---
  const effectiveDate = asIsoDate(getFact(out, "operation.effective_date"));
  if (effectiveDate !== null) {
    setPath(
      "procedure.limitation_exceeds_one_calendar_year",
      exceedsOneCalendarYear(effectiveDate, evaluationDate),
    );
  }

  return out;
}
