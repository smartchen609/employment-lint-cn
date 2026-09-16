import { expect, test } from "@playwright/test";
import { answerAll, SCENARIOS, startQuestions } from "./helpers.js";

/**
 * 在真实浏览器里把每条入口路径从首页走到结果页。
 * 单元测试已经验证引擎与组装逻辑；这里验证的是界面真的能被走通、
 * 结果页真的显示了该显示的东西、每张卡片真的链到了手册。
 */

for (const s of SCENARIOS) {
  test(`${s.name}：从首页答题走到结果页`, async ({ page }) => {
    await startQuestions(page);
    const seen = await answerAll(page, s.answers);
    expect(seen.length).toBeGreaterThan(0);

    await expect(page.locator(".primary-warning")).toBeVisible();
    if (s.primary) {
      await expect(page.locator(".primary-warning .endpoint-id")).toHaveText(s.primary);
    }
    const cardIds = await page.locator(".endpoint-card .endpoint-id").allTextContents();
    for (const c of s.cards ?? []) expect(cardIds, `缺少卡片 ${c}`).toContain(c);

    // 结果页至少一张卡片链到手册
    await expect(page.locator(".handbook-links a").first()).toBeVisible();

    // 证据清单与证据边界固定出现
    await expect(page.locator(".evidence-boundary")).toBeVisible();

    // 不出现全局通过状态
    await expect(page.locator("body")).not.toContainText("PASS");
    await expect(page.locator("body")).not.toContainText("通过检查");
  });
}
