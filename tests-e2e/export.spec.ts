import { expect, test } from "@playwright/test";
import { answerAll, SCENARIOS, startQuestions } from "./helpers.js";

test("Case Export 含复核问题清单与对应手册章节，不含身份信息", async ({ page }) => {
  await startQuestions(page);
  await answerAll(page, SCENARIOS[0]!.answers);
  await page.getByRole("button", { name: "导出 Case Export" }).click();
  const md = await page.locator("textarea.export-text").inputValue();
  expect(md).toContain("privacy_mode: local-only");
  expect(md).toContain("## 8. 需要律师重点复核的问题");
  expect(md).toContain("## 8b. 对应手册章节");
  expect(md).not.toContain("[object Object]");
  for (const w of ["姓名", "身份证", "公司全称"]) expect(md).not.toContain(w);
});
