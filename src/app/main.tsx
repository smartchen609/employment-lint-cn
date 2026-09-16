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

void boot();
