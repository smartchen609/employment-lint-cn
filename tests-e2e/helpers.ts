import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

export const ROOT = resolve(import.meta.dirname, "..");

/** 本地日期 → YYYY-MM-DD。场景日期相对"今天"计算，CI 哪天跑结果都一样。 */
export function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 今天往前 n 天，日固定取 15 号附近以避开月末边界（期间计算的边界另有单元测试）。 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setDate(15);
  return iso(d);
}

export function monthsBefore(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1 - n, d);
  return iso(date);
}

export type AnswerValue =
  | string
  | string[]
  | { value: string; date: string }
  | { ranges: Array<{ from: string; to: string }> };

export type Scenario = Record<string, AnswerValue>;

/**
 * 按题号作答直到进入结果页。
 * 遇到场景里没写的题会直接失败并报出题号 —— 问题树改了，场景要跟着改，不能静默跳过。
 */
export async function answerAll(page: Page, answers: Scenario): Promise<string[]> {
  const seen: string[] = [];
  for (let step = 0; step < 40; step += 1) {
    if ((await page.locator(".result").count()) > 0) return seen;
    const qid = (await page.locator(".question .qid").first().textContent())?.trim() ?? "";
    seen.push(qid);
    const a = answers[qid];
    if (a === undefined) {
      throw new Error(`场景未覆盖题目 ${qid}；已答：${seen.join(" → ")}`);
    }
    if (typeof a === "string") {
      if ((await page.locator("textarea.text-input").count()) > 0) {
        await page.locator("textarea.text-input").fill(a);
      } else {
        await page.locator(`[role=radio][data-value="${a}"]`).click();
      }
    } else if (Array.isArray(a)) {
      for (const v of a) await page.locator(`[role=checkbox][data-value="${v}"]`).click();
    } else if ("ranges" in a) {
      for (let i = 0; i < a.ranges.length; i += 1) {
        if (i > 0) await page.getByRole("button", { name: "再加一段延长" }).click();
        const row = page.locator(".date-ranges .range-row").nth(i);
        await row.locator("input[type=date]").nth(0).fill(a.ranges[i]!.from);
        await row.locator("input[type=date]").nth(1).fill(a.ranges[i]!.to);
      }
    } else {
      await page.locator(`[role=radio][data-value="${a.value}"]`).click();
      await page.locator(".date-inline input[type=date]").fill(a.date);
    }
    await page.getByRole("button", { name: /^(下一题|查看结果)$/ }).click();
  }
  throw new Error("40 步内没有进入结果页");
}

export async function startQuestions(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "开始答题" }).click();
  await expect(page.locator(".question")).toBeVisible();
}

/* ---------------- 场景 ---------------- */

const EXPIRY = daysAgo(60);

export const SCENARIOS: Array<{ name: string; answers: Scenario; primary?: string; cards?: string[] }> = [
  {
    name: "深圳协商延长七个月",
    primary: "C08",
    answers: {
      G01: "FIXED_TERM_EXPIRY",
      G02: { value: "EFFECTIVE", date: EXPIRY },
      G03: "CN-GD-SZ",
      A01: "FIXED_TERM",
      A02: "NONE",
      A03: "1",
      A04: "YES",
      A05: "NEGOTIATED",
      A06: { ranges: [{ from: monthsBefore(EXPIRY, 7), to: EXPIRY }] },
      A09: "false",
      A12: "WRITTEN",
      A13: "false",
      A14: "NONE",
      A15: "false",
      P01: "NOT_FILED",
      P02: "DAMAGES",
    },
  },
  {
    name: "AI 替岗只谈补偿",
    primary: "C14",
    cards: ["C14", "C13"],
    answers: {
      G01: "ARTICLE_40_3",
      G02: { value: "EFFECTIVE", date: daysAgo(60) },
      G03: "CN-GD-SZ",
      B01: "WRITTEN",
      B02: "AT_OR_BEFORE_TERMINATION",
      B02T: "",
      B03: "AI_AUTOMATION",
      B04: "BY_COLLEAGUES_AND_AI",
      B06: "SEVERANCE_ONLY",
      B07: "false",
      B09: "NO_OPPORTUNITY",
      B10: "NEITHER",
      P01: "NOT_FILED",
      P02: "DAMAGES",
    },
  },
  {
    name: "普通一次到期",
    primary: "C04",
    answers: {
      G01: "FIXED_TERM_EXPIRY",
      G02: { value: "EFFECTIVE", date: daysAgo(15) },
      G03: "CN-OTHER",
      A01: "FIXED_TERM",
      A02: "NONE",
      A03: "1",
      A04: "NO",
      A07: "NONE",
      A09: "false",
      A12: "WRITTEN",
      A13: "false",
      A15: "false",
      A16: "NOT_OFFERED",
      P01: "NOT_FILED",
      P02: "UNDECIDED",
    },
  },
  {
    name: "协商解除已签字",
    cards: ["C18", "C02"],
    answers: {
      G01: "MUTUAL_TERMINATION",
      G02: { value: "EFFECTIVE", date: daysAgo(30) },
      G03: "CN-GD-SZ",
      M01: "EMPLOYER",
      M02: "SIGNED_AGREEMENT",
      M03: "true",
    },
  },
  {
    name: "事实解除",
    primary: "C03",
    answers: {
      G01: "DE_FACTO_TERMINATION",
      G02: { value: "EFFECTIVE", date: daysAgo(20) },
      G03: "CN-GD-SZ",
      D01: "ORAL",
      D02: ["ACCOUNT_DISABLED", "NO_WORK_ASSIGNED", "SALARY_STOPPED"],
      D03: "WRITTEN",
      D04: "false",
    },
  },
  {
    name: "看不出文件类型",
    cards: ["C19"],
    answers: {
      G01: "UNCLEAR_DOCUMENT",
      G02: { value: "EFFECTIVE", date: daysAgo(10) },
      G03: "CN-GD-SZ",
      G04: "OTHER",
    },
  },
];

/* ---------------- 数据 ---------------- */

export function handbookMap(): { sections: Array<{ id: string; status?: string; title: string }> } {
  return parse(readFileSync(join(ROOT, "rules/copy/handbook-map.yml"), "utf8"));
}

export function verifiedSourceIds(): string[] {
  const reg = parse(readFileSync(join(ROOT, "sources.yml"), "utf8")) as {
    sources: Array<{ id: string; page_opened_and_checked: boolean; status: string }>;
  };
  return reg.sources.filter((s) => s.page_opened_and_checked && s.status === "active").map((s) => s.id);
}
