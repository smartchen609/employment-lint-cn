/**
 * 文案加载器。
 *
 * 运行时读取的是构建期生成的 JSON（src/generated/copy.json），
 * 不解析 YAML、不读文件系统。round2 §11.1。
 *
 * 生成命令：`npm run build:content`
 */

import type { EndpointTemplate, EvidenceChecklistFile } from "../schema/copy.js";

interface CopyBundle {
  classification: EndpointTemplate[];
  claimPaths: EndpointTemplate[];
  evidence: EvidenceChecklistFile;
}

/**
 * 构建产物在类型上无法被 tsc 直接看到（生成目录不进版本库），
 * 故由调用方在应用启动时注入，避免 src/ 依赖一个可能不存在的文件。
 * P5 的应用入口会在这里挂上 generated/copy.json。
 */
let bundle: CopyBundle | null = null;

export function provideCopy(next: CopyBundle): void {
  bundle = next;
}

function requireBundle(): CopyBundle {
  if (!bundle) {
    throw new Error("文案尚未注入：请先运行 npm run build:content 并调用 provideCopy()");
  }
  return bundle;
}

/** 按终点编号取模板，如 "C07"、"R03"。 */
export function getTemplate(id: string): EndpointTemplate | undefined {
  const b = requireBundle();
  return [...b.classification, ...b.claimPaths].find((t) => t.id === id);
}

/**
 * 由引擎产出的 Finding 标识反查对应终点。
 *
 * 一个 Finding 可能对应多个终点（如 DEEMED_SECOND_FIXED_TERM
 * 同时出现在 C07 与 C09），因此返回数组，由结果页按优先级挑选。
 */
export function templatesForFinding(findingId: string): EndpointTemplate[] {
  const b = requireBundle();
  return [...b.classification, ...b.claimPaths].filter((t) => t.findings.includes(findingId));
}

export function getEvidenceChecklists(): EvidenceChecklistFile {
  return requireBundle().evidence;
}
