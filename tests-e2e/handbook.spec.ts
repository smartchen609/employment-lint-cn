import { expect, test } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { handbookMap, ROOT, verifiedSourceIds } from "./helpers.js";

const map = handbookMap();
const published = map.sections.filter((s) => (s.status ?? "published") === "published");
const drafts = map.sections.filter((s) => s.status === "draft");

test("首页先给手册目录，列出全部已发布章节且每个链接都能打开", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "手册目录" })).toBeVisible();
  const links = page.locator(".chapter-list a");
  await expect(links).toHaveCount(published.length);
  for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
    const res = await request.get(`/${href}`);
    expect(res.status(), href!).toBe(200);
  }
  await expect(page.getByRole("button", { name: "开始答题" })).toBeVisible();
});

test("章节页：目录、加框、来源链接、翻页", async ({ page }) => {
  await page.goto("/handbook/02.html");
  await expect(page.locator("h1")).toContainText("02 ·");
  await expect(page.locator("details.toc")).toHaveCount(1);
  await expect(page.locator(".callout-intro")).toBeVisible();
  await expect(page.locator("blockquote.law").first()).toBeVisible();
  await expect(page.locator("p.plain").first()).toBeVisible();

  // 目录锚点跳转
  await page.locator("details.toc summary").click();
  const firstAnchor = page.locator("details.toc a").first();
  const target = (await firstAnchor.getAttribute("href"))!;
  await firstAnchor.click();
  await expect(page.locator(target)).toBeInViewport();

  // 来源编号 → 来源页锚点
  const src = page.locator("a.src").first();
  const id = (await src.textContent())!.trim();
  await src.click();
  await expect(page).toHaveURL(new RegExp(`sources\\.html#${id}$`));
  await expect(page.locator(`article[id="${id}"]`)).toBeInViewport();

  // 翻页
  await page.goto("/handbook/02.html");
  await page.locator(".pager a[rel=next]").click();
  await expect(page).toHaveURL(/03\.html$/);
});

test("来源页只列已核验来源，每条都有锚点", async ({ page }) => {
  await page.goto("/handbook/sources.html");
  const ids = verifiedSourceIds();
  await expect(page.locator("article.source")).toHaveCount(ids.length);
  for (const id of ids) await expect(page.locator(`article[id="${id}"]`)).toHaveCount(1);
});

test("草稿章节不存在于线上产物", async ({ request }) => {
  // vite preview 对不存在的路径会回退到 index.html（200），GitHub Pages 则是 404。
  // 所以这里既查产物目录本身，也查服务器返回的内容里没有草稿。
  const dist = join(ROOT, "dist", "handbook");
  expect(existsSync(join(dist, "drafts")), "dist 里出现了 drafts 目录").toBe(false);
  const built = readdirSync(dist);
  for (const s of drafts) {
    expect(built, `草稿 ${s.id} 被构建了`).not.toContain(`${s.id}.html`);
    const body = await (await request.get(`/handbook/${s.id}.html`)).text();
    expect(body.includes(s.title), `线上能取到草稿 ${s.id} 的内容`).toBe(false);
  }
  const index = await (await request.get("/handbook/")).text();
  for (const s of drafts) expect(index.includes(s.title), `目录页出现草稿 ${s.id}`).toBe(false);
});
