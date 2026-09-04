/**
 * 期间计算 —— **这是法律规则，不是工具函数。**
 *
 * 依据《中华人民共和国民法典》第二百零二条：
 * 按照年、月计算期间的，到期月的对应日为期间的最后一日；
 * 没有对应日的，月末日为期间的最后一日。
 *
 * 该依据已登记在 `CN-NAT-SPC-LABOR-II-11` 与 `CN-NAT-LDCA-27-LIMITATION`
 * 的 `legal_basis` 中。CLAUDE.md §E4、round3 §3 A15.3。
 *
 * **禁止实现为 `days > 30` 或 `days > 365`。**
 * tests/calendar.test.ts 中有两条用例专门证明本实现不是按天数算的。
 */

/** ISO 日期字符串 `YYYY-MM-DD`。 */
export type IsoDateString = string;

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parseIso(date: IsoDateString): Ymd {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`不是合法的 ISO 日期: ${date}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function formatIso({ y, m, d }: Ymd): IsoDateString {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(y, 4)}-${p(m)}-${p(d)}`;
}

/** 某年某月的天数。month 为 1–12。 */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * 加 n 个日历月，日期溢出时取该月月末日。
 * 这就是第二百零二条「没有对应日的，月末日为期间的最后一日」。
 */
function addCalendarMonths(date: IsoDateString, n: number): IsoDateString {
  const { y, m, d } = parseIso(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return formatIso({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

/**
 * 原日期加一个日历月。
 *
 * 1 月 31 日 → 2 月 28 日（平年，无对应日取月末日）
 * 8 月 31 日 → 9 月 30 日（无对应日取月末日）
 */
export function addOneCalendarMonth(date: IsoDateString): IsoDateString {
  return addCalendarMonths(date, 1);
}

/** 原日期加一个日历年。仲裁时效的一年按此计算，不按 365 天。 */
export function addOneCalendarYear(date: IsoDateString): IsoDateString {
  return addCalendarMonths(date, 12);
}

/**
 * 两个日历月之间相差几个整月（向下取整）。
 * 用于协商延长期限的累计计算。
 */
export function calendarMonthsBetween(
  from: IsoDateString,
  to: IsoDateString,
): number {
  const a = parseIso(from);
  const b = parseIso(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) {
    // 未走满对应日，且 to 不是当月月末（月末视为已走满整月）
    if (b.d !== daysInMonth(b.y, b.m)) months -= 1;
  }
  return months;
}

/**
 * 是否「超过一个月」。
 *
 * 阈值日 = addOneCalendarMonth(起算日)。
 * **严格大于**阈值日才算超过；等于阈值日不算（round3 T11B）。
 *
 * @param objectionDate 用人单位首次明确表示异议之日；始终未表示异议的传 null，
 *                      此时以 currentDate 计算。
 */
export function exceedsOneCalendarMonth(
  startDate: IsoDateString,
  objectionDate: IsoDateString | null,
  currentDate: IsoDateString,
): boolean {
  const threshold = addOneCalendarMonth(startDate);
  const reference = objectionDate ?? currentDate;
  // ISO 日期字符串可直接按字典序比较
  return reference > threshold;
}

/** 是否「超过一年」。严格大于阈值日才算超过。 */
export function exceedsOneCalendarYear(
  startDate: IsoDateString,
  currentDate: IsoDateString,
): boolean {
  return currentDate > addOneCalendarYear(startDate);
}
