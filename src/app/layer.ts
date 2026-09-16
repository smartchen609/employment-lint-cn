/**
 * 内容层：界面用到的问题、规则、卡片、证据清单、手册映射放在一处。
 *
 * 线上只有 PRODUCTION_LAYER。草稿预览（VITE_DRAFTS=1）在它之上叠加
 * docs/drafts/ 里尚未经维护人确认的内容，见 draft-layer.ts。
 * 这样线上代码不需要知道任何草稿入口的存在，草稿也不会误入线上产物。
 */

import { createContext, useContext } from "react";
import type { Facts, Finding } from "../engine/evaluate.js";
import type { RuleRecord } from "../schema/rule.js";
import type { EndpointTemplate, EvidenceChecklist } from "../schema/copy.js";
import { QUESTIONS } from "../questions/tree.js";
import type { Answers, Question } from "../questions/types.js";
import { ALL_TEMPLATES, EVIDENCE, HANDBOOK, RULES } from "./data.js";

export interface ContentLayer {
  /** true 时页面顶部显示「草稿预览」横幅。 */
  preview: boolean;
  questions: readonly Question[];
  rules: readonly RuleRecord[];
  templates: EndpointTemplate[];
  checklists: EvidenceChecklist[];
  handbookEndpoints: Readonly<Record<string, readonly string[]>>;
  extendFacts?: (answers: Answers, facts: Facts) => Facts;
  extraEndpointIds?: (answers: Answers, findings: Finding[]) => string[];
  extraChecklistIds?: (answers: Answers) => string[];
}

export const PRODUCTION_LAYER: ContentLayer = {
  preview: false,
  questions: QUESTIONS,
  rules: RULES,
  templates: ALL_TEMPLATES,
  checklists: EVIDENCE.checklists,
  handbookEndpoints: HANDBOOK.endpoints,
};

export const LayerContext = createContext<ContentLayer>(PRODUCTION_LAYER);

export function useLayer(): ContentLayer {
  return useContext(LayerContext);
}
