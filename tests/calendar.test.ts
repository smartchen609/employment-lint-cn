import { describe, expect, it } from "vitest";
import {
  addOneCalendarMonth,
  addOneCalendarYear,
  exceedsOneCalendarMonth,
  exceedsOneCalendarYear,
} from "../src/engine/calendar.js";

/**
 * 日历月／年边界测试 —— round3 §7「另加一个实现层单元测试组」。
 *
 * **P2 阶段这一组应当全红**，因为 P3 尚未实现。
 *
 * 依据《民法典》第二百零二条：没有对应日的，月末日为期间的最后一日。
 * 如果实现成 `days > 30`，下面四条会有两条给出错误答案。
 */

describe("addOneCalendarMonth · 月末对应日规则", () => {
  it.each([
    ["2026-01-31", "2026-02-28"],
    ["2026-08-31", "2026-09-30"],
    ["2026-03-15", "2026-04-15"],
    ["2026-12-31", "2027-01-31"],
    ["2024-01-31", "2024-02-29"],
  ])("%s 加一个日历月为 %s", (from, to) => {
    expect(addOneCalendarMonth(from)).toBe(to);
  });
});

describe("exceedsOneCalendarMonth · round3 §3 A15.3 四条边界", () => {
  const current = "2026-12-31";

  it("2026-01-31 → 2026-02-28：未超过一个月", () => {
    expect(exceedsOneCalendarMonth("2026-01-31", "2026-02-28", current)).toBe(false);
  });

  it("2026-01-31 → 2026-03-01：超过一个月", () => {
    expect(exceedsOneCalendarMonth("2026-01-31", "2026-03-01", current)).toBe(true);
  });

  it("2026-08-31 → 2026-09-30：未超过一个月", () => {
    expect(exceedsOneCalendarMonth("2026-08-31", "2026-09-30", current)).toBe(false);
  });

  it("2026-08-31 → 2026-10-01：超过一个月", () => {
    expect(exceedsOneCalendarMonth("2026-08-31", "2026-10-01", current)).toBe(true);
  });

  it("始终未表示异议时以当前日期计算", () => {
    expect(exceedsOneCalendarMonth("2026-06-30", null, "2026-07-30")).toBe(false);
    expect(exceedsOneCalendarMonth("2026-06-30", null, "2026-07-31")).toBe(true);
  });

  /**
   * 这一条专门证明实现没有用 30 天。
   * 1 月 31 日 + 30 天 = 3 月 2 日；按日历月阈值是 2 月 28 日。
   * 3 月 1 日落在两者之间：日历月规则算"超过"，30 天规则算"未超过"。
   */
  it("30 天实现会在此处给出相反答案", () => {
    expect(exceedsOneCalendarMonth("2026-01-31", "2026-03-01", "2026-12-31")).toBe(true);
  });
});

describe("addOneCalendarYear / exceedsOneCalendarYear · 仲裁时效", () => {
  it.each([
    ["2025-03-10", "2026-03-10"],
    ["2024-02-29", "2025-02-28"],
  ])("%s 加一个日历年为 %s", (from, to) => {
    expect(addOneCalendarYear(from)).toBe(to);
  });

  it("恰好届满日不算超过", () => {
    expect(exceedsOneCalendarYear("2025-03-10", "2026-03-10")).toBe(false);
  });

  it("次日算超过", () => {
    expect(exceedsOneCalendarYear("2025-03-10", "2026-03-11")).toBe(true);
  });

  /** 365 天实现会在闰年区间出错。 */
  it("365 天实现会在闰年区间给出相反答案", () => {
    expect(exceedsOneCalendarYear("2023-03-01", "2024-02-29")).toBe(false);
  });
});
