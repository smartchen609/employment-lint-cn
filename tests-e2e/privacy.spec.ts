import { expect, test } from "@playwright/test";
import { answerAll, SCENARIOS, startQuestions } from "./helpers.js";

/**
 * 隐私承诺的端到端验证 —— 用户自己打开 devtools 能看到的东西，我们先看。
 *
 *   - 全程（首页 → 答题 → 结果 → 导出 → 手册）不发出任何非本站请求
 *   - localStorage / sessionStorage / Cookie / IndexedDB 全部为空
 *   - 刷新后回到首页，答案不恢复
 */

test("全程不发出任何非本站请求，也不在浏览器里存任何东西", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    if (u.origin !== origin) external.push(r.url());
  });

  await startQuestions(page);
  await answerAll(page, SCENARIOS[0]!.answers);
  await page.getByRole("button", { name: "导出 Case Export" }).click();
  await expect(page.locator("textarea.export-text")).toBeVisible();
  await page.getByRole("button", { name: "返回结果" }).click();

  // 走一趟手册
  await page.goto("/handbook/");
  await page.locator(".chapter-list a").first().click();
  await page.goto("/handbook/sources.html");

  expect(external, "出现了非本站请求").toEqual([]);

  await page.goto("/");
  const storage = await page.evaluate(async () => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    cookie: document.cookie,
    idb: "databases" in indexedDB ? (await indexedDB.databases()).length : 0,
  }));
  expect(storage).toEqual({ local: 0, session: 0, cookie: "", idb: 0 });
});

test("刷新后答案不恢复", async ({ page }) => {
  await startQuestions(page);
  await page.locator('[role=radio][data-value="FIXED_TERM_EXPIRY"]').click();
  await page.getByRole("button", { name: "下一题" }).click();
  await expect(page.locator(".question .qid")).toHaveText("G02");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "劳动者自助仲裁手册" })).toBeVisible();
  await expect(page.locator(".question")).toHaveCount(0);

  await page.getByRole("button", { name: "开始答题" }).click();
  await expect(page.locator(".question .qid")).toHaveText("G01");
  await expect(page.locator('[role=radio][aria-checked="true"]')).toHaveCount(0);
});
