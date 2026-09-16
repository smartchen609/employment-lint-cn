import { expect, test } from "@playwright/test";
import { startQuestions } from "./helpers.js";

test("换题后焦点在题干上；单选组可用方向键选择", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "键盘操作只在桌面端验证");
  await startQuestions(page);
  await expect(page.locator(".question h2")).toBeFocused();

  const radios = page.locator("[role=radio]");
  await radios.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown");
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(radios.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");

  // 组内只有一个可 Tab 到的选项
  const tabbable = await radios.evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length);
  expect(tabbable).toBe(1);

  await page.getByRole("button", { name: "下一题" }).click();
  await expect(page.locator(".question h2")).toBeFocused();
});
