import { z } from "zod";
import { EndpointTemplate, EvidenceChecklist } from "./copy.js";

/**
 * 草稿层文案：docs/drafts/copy/*.yml。
 *
 * 维护人确认前，草稿规则、卡片、证据清单都放在 docs/drafts/，
 * 不进 rules/，不进线上产物（CLAUDE.md §L2、§1b.6）。
 * 只有草稿预览（VITE_DRAFTS=1）与 tests/drafts.test.ts 会读取。
 */
export const DraftCopyFile = z
  .object({
    templates: z.array(EndpointTemplate).default([]),
    checklists: z.array(EvidenceChecklist).default([]),
    /** 草稿终点 → 手册章节。只能指向已发布章节（由 tests/drafts.test.ts 校验）。 */
    endpoints: z.record(z.string().regex(/^[CR]\d{2}$/), z.array(z.string().regex(/^\d{2}$/)).min(1)).default({}),
  })
  .strict();

export type DraftCopyFile = z.infer<typeof DraftCopyFile>;
