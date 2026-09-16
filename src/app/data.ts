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

/**
 * 首页目录只列已发布章节。
 * build-content 已经只把已发布章节写进 copy.json（草稿连标题都不进前端包），
 * 这里再过滤一次是双保险。
 */
export const PUBLISHED_SECTIONS = HANDBOOK.sections.filter((s) => (s.status ?? "published") === "published");

/** 某终点对应的手册章节（按映射顺序）。草稿预览传入叠加草稿终点后的映射。 */
export function handbookSectionsFor(
  endpointId: string,
  endpoints: Readonly<Record<string, readonly string[]>> = HANDBOOK.endpoints,
): HandbookMapFile["sections"] {
  const ids = endpoints[endpointId] ?? [];
  return ids
    .map((id) => HANDBOOK.sections.find((s) => s.id === id))
    .filter((s): s is HandbookMapFile["sections"][number] => !!s);
}
