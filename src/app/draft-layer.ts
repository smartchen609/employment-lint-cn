/**
 * 【草稿预览】在线上内容层之上叠加 docs/drafts/ 的内容。
 *
 * 只在 VITE_DRAFTS=1 时经 main.tsx 的动态 import 加载；线上构建里这个模块不存在。
 * 草稿规则在 YAML 里是 status: "draft"（引擎跳过），这里仅为预览把它们临时视为 active。
 */

import type { RuleRecord } from "../schema/rule.js";
import type { DraftCopyFile } from "../schema/drafts.js";
import type { Answers } from "../questions/types.js";
import { addDraftFacts, DRAFT_SHAPE, withDraftQuestions } from "../questions/drafts/forced-resignation.js";
import type { ContentLayer } from "./layer.js";
import draftsJson from "../generated/drafts.json";

interface DraftBundle {
  rules: RuleRecord[];
  templates: DraftCopyFile["templates"];
  checklists: DraftCopyFile["checklists"];
  endpoints: DraftCopyFile["endpoints"];
}

const DRAFTS = draftsJson as unknown as DraftBundle;

const isForced = (a: Answers): boolean => a["G01"] === DRAFT_SHAPE;

export function draftLayer(base: ContentLayer, drafts: DraftBundle = DRAFTS): ContentLayer {
  return {
    preview: true,
    questions: withDraftQuestions(base.questions),
    rules: [...base.rules, ...drafts.rules.map((r) => ({ ...r, status: "active" as const }))],
    templates: [...base.templates, ...drafts.templates],
    checklists: [...base.checklists, ...drafts.checklists],
    handbookEndpoints: { ...base.handbookEndpoints, ...drafts.endpoints },
    extendFacts: (answers, facts) => addDraftFacts(answers, facts),
    // 被迫解除入口没有命中任何规则时，落到 C18「本工具未覆盖」，不得显示为空结果。
    extraEndpointIds: (answers, findings) => (isForced(answers) && findings.length === 0 ? ["C18"] : []),
    extraChecklistIds: (answers) => (isForced(answers) ? ["P05"] : []),
  };
}
