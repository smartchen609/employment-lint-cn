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
 *
 * ## 实现状态：P3 待实现
 */

/** ISO 日期字符串 `YYYY-MM-DD`。 */
export type IsoDateString = string;

/**
 * 原日期加一个日历月。
 *
 * 1 月 31 日 → 2 月 28 日（平年，无对应日取月末日）
 * 8 月 31 日 → 9 月 30 日（无对应日取月末日）
 */
export function addOneCalendarMonth(_date: IsoDateString): IsoDateString {
  throw new Error("addOneCalendarMonth 尚未实现（P3）");
}

/** 原日期加一个日历年。仲裁时效的一年按此计算，不按 365 天。 */
export function addOneCalendarYear(_date: IsoDateString): IsoDateString {
  throw new Error("addOneCalendarYear 尚未实现（P3）");
}

/**
 * 是否「超过一个月」。
 *
 * 阈值日 = addOneCalendarMonth(起算日)。
 * 严格大于阈值日才算超过；等于阈值日不算（round3 T11B）。
 *
 * @param objectionDate 用人单位首次明确表示异议之日；始终未表示异议的传 null，
 *                      此时以 currentDate 计算。
 */
export function exceedsOneCalendarMonth(
  _startDate: IsoDateString,
  _objectionDate: IsoDateString | null,
  _currentDate: IsoDateString,
): boolean {
  throw new Error("exceedsOneCalendarMonth 尚未实现（P3）");
}

/** 是否「超过一年」。严格大于阈值日才算超过。 */
export function exceedsOneCalendarYear(
  _startDate: IsoDateString,
  _currentDate: IsoDateString,
): boolean {
  throw new Error("exceedsOneCalendarYear 尚未实现（P3）");
}
