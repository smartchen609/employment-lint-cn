import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { PRODUCTION_LAYER, type ContentLayer } from "./layer.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("找不到挂载点 #root");
const mount = root;

async function boot(): Promise<void> {
  let layer: ContentLayer = PRODUCTION_LAYER;
  /**
   * __DRAFTS__ 由 vite.config.ts 在构建期替换为字面量 true/false。
   * 线上构建为 false，这段分支连同动态 import 一起被删除，草稿不进产物。
   * scripts/audit-bundle.ts 另行校验产物里确实没有草稿内容。
   */
  if (__DRAFTS__) {
    const { draftLayer } = await import("./draft-layer.js");
    layer = draftLayer(PRODUCTION_LAYER);
  }
  createRoot(mount).render(
    <StrictMode>
      <App layer={layer} />
    </StrictMode>,
  );
}

boot().catch((error: unknown) => {
  // 只可能发生在草稿预览（线上没有这段分支）：草稿层加载失败时退回线上内容，不留白屏。
  console.error("草稿层加载失败，已退回线上内容：", error);
  createRoot(mount).render(
    <StrictMode>
      <App layer={PRODUCTION_LAYER} />
    </StrictMode>,
  );
});
