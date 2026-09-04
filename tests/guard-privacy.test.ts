import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * 守卫测试 B · 源码隐私扫描。CLAUDE.md §P1 §P2、round2 §15.1。
 *
 * 产品承诺：纯前端、无后端、无账户、无上传、无埋点、无运行时大模型调用；
 * 用户答案只存 React state，刷新即清空。
 *
 * 这些承诺写在 README 和 PRIVACY.md 里，但**承诺必须由测试守住**，
 * 否则某次重构顺手加一个 localStorage 缓存就会悄悄作废整个信任结构。
 *
 * 扫描范围：src/ 下的全部 .ts / .tsx（生成产物除外）。
 * 本文件自身位于 tests/，不在扫描范围内，因此可以安全地写出这些字符串。
 */

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/** 违反承诺的标识。分组只为报错信息更清楚。 */
const FORBIDDEN_TOKENS: ReadonlyArray<{ group: string; tokens: readonly string[] }> = [
  {
    group: "持久化存储（答案只存内存，刷新即清空）",
    tokens: ["localStorage", "sessionStorage", "indexedDB", "IndexedDB", "document.cookie"],
  },
  {
    group: "网络请求（无后端、无上传、无运行时大模型）",
    tokens: ["fetch(", "XMLHttpRequest", "axios", "navigator.sendBeacon", "EventSource", "WebSocket"],
  },
  {
    group: "分析埋点（无应用遥测）",
    tokens: ["gtag", "analytics", "dataLayer", "posthog", "mixpanel", "sentry"],
  },
];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "generated") continue; // 构建产物
      out = out.concat(walk(p));
      continue;
    }
    if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out.sort();
}

const files = walk(SRC).map((f) => ({ file: relative(ROOT, f), path: f }));

describe("守卫 B · 源码不含违反隐私承诺的调用", () => {
  it("扫描范围非空（防止 walk 写错导致测试空转）", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("$file", ({ path, file }) => {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    for (const { group, tokens } of FORBIDDEN_TOKENS) {
      for (const token of tokens) {
        const hit = lines.findIndex((l) => {
          // 注释行允许提及这些名字（例如说明"不得使用 localStorage"）
          const trimmed = l.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
            return false;
          }
          return l.includes(token);
        });
        expect(
          hit,
          `${file}:${hit + 1} 出现 ${group} 的「${token}」\n  ${lines[hit]?.trim()}`,
        ).toBe(-1);
      }
    }
  });
});

describe("守卫 B · 依赖清单不含被禁的运行时依赖", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("运行时依赖只有 react 与 react-dom", () => {
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(["react", "react-dom"]);
  });

  it("不含 HTTP 客户端、状态管理框架、UI 组件库或路由库", () => {
    const banned = [
      "axios", "ky", "superagent", "got",
      "redux", "@reduxjs/toolkit", "zustand", "jotai", "mobx", "recoil",
      "antd", "@mui/material", "@chakra-ui/react", "react-bootstrap",
      "react-router", "react-router-dom", "@tanstack/react-router",
      "@tanstack/react-query", "swr",
    ];
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const b of banned) {
      expect(b in all, `引入了被禁依赖 ${b}（新增依赖必须先问维护人）`).toBe(false);
    }
  });
});
