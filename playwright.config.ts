import { defineConfig, devices } from "@playwright/test";

/**
 * 浏览器端到端测试。
 *
 * 跑的是构建产物（vite preview 读 dist/），和线上部署的是同一份东西。
 * 本机用已安装的 Google Chrome（channel: chrome），不额外下载浏览器；
 * CI 里安装 Playwright 自带的 Chromium。
 *
 * 用法：npm run build && npm run test:e2e
 */

const CI = !!process.env["CI"];
const PORT = 4173;

export default defineConfig({
  testDir: "tests-e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "zh-CN",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], ...(CI ? {} : { channel: "chrome" }) },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], ...(CI ? {} : { channel: "chrome" }) },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
