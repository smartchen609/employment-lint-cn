/**
 * 运行时数据入口。
 *
 * 读取的是构建期产物 src/generated/*.json（由 scripts/build-content.ts 生成），
 * 运行时不解析 YAML、不读文件系统、不发任何网络请求。round2 §11.1。
 *
 * 这两个 JSON 在构建期已经过 Zod 校验，此处直接断言类型，不重复校验 ——
 * 重复校验会把 zod 打进浏览器 bundle，而它在运行时没有可校验的外部输入。
 */

import type { RuleRecord } from "../schema/rule.js";
import type { EndpointTemplate, EvidenceChecklistFile, HandbookMapFile } from "../schema/copy.js";
import { provideCopy } from "../findings/copy.js";

import rulesJson from "../generated/rules.json";
import copyJson from "../generated/copy.json";

export const RULES = rulesJson as unknown as RuleRecord[];

const copy = copyJson as unknown as {
  classification: EndpointTemplate[];
  claimPaths: EndpointTemplate[];
  evidence: EvidenceChecklistFile;
  handbookMap: HandbookMapFile;
};

provideCopy(copy);

export const ALL_TEMPLATES: EndpointTemplate[] = [...copy.classification, ...copy.claimPaths];
export const EVIDENCE = copy.evidence;
export const HANDBOOK = copy.handbookMap;

/** 某终点对应的手册章节（按映射顺序）。 */
export function handbookSectionsFor(endpointId: string): HandbookMapFile["sections"] {
  const ids = HANDBOOK.endpoints[endpointId] ?? [];
  return ids
    .map((id) => HANDBOOK.sections.find((s) => s.id === id))
    .filter((s): s is HandbookMapFile["sections"][number] => !!s);
}
