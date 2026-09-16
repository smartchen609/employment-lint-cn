import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /**
   * 相对路径。GitHub Pages 的项目页挂在 /employment-lint-cn/ 子路径下，
   * 绝对路径 /assets/... 会 404。用 "./" 之后放在任何路径都能跑，
   * 包括直接双击 dist/index.html。
   */
  base: "./",
  /**
   * 草稿预览开关。只有 `npm run dev:drafts`（VITE_DRAFTS=1）为 true。
   * 线上构建为 false：src/app/main.tsx 里的草稿分支成为死代码被删除。
   */
  define: {
    __DRAFTS__: JSON.stringify(process.env["VITE_DRAFTS"] === "1"),
  },
  build: {
    // 纯静态产物，无后端。
    target: "es2022",
    sourcemap: false,
    /**
     * 关闭 modulepreload polyfill。
     *
     * 该 polyfill 会往产物里注入一处 `fetch(link.href)` 用于预加载自身 chunk。
     * 它只会请求本站自己的 JS，不涉及用户数据 —— 但产品承诺是
     * "运行期不得有任何 fetch"，而承诺要经得起用户自己打开 devtools 查。
     * 本应用是单 bundle、无动态 import，target 为 es2022，
     * 目标浏览器原生支持 modulepreload，polyfill 本就是死代码。
     *
     * 由 scripts/audit-bundle.ts 验证产物中确实没有网络调用。
     */
    modulePreload: { polyfill: false },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
});
