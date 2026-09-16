/**
 * 构建期内容生成：YAML → JSON。round2 §11.1。
 *
 *   YAML            律师可读、可审、可做 Git diff 的规则与文案源
 *   Zod             结构校验
 *   Generated JSON  浏览器运行时读取的静态产物
 *
 * 运行时不解析 YAML，也不读文件系统 —— 产物由 Vite 打包进 bundle。
 * 生成目录 src/generated/ 不进版本库。
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

import { RuleRecord } from "../src/schema/rule.js";
import { EndpointTemplateFile, EvidenceChecklistFile, HandbookMapFile } from "../src/schema/copy.js";
import { DraftCopyFile } from "../src/schema/drafts.js";
import { existsSync } from "node:fs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "src", "generated");

function loadYaml(file: string): unknown {
  return parse(readFileSync(file, "utf8"), { version: "1.2", uniqueKeys: true });
}

function walkRules(dir: string): string[] {
  let out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    // rules/copy 是文案，不是规则，单独处理
    if (statSync(p).isDirectory()) {
      if (e === "copy") continue;
      out = out.concat(walkRules(p));
    } else if (e.endsWith(".yml")) out.push(p);
  }
  return out.sort();
}

mkdirSync(OUT, { recursive: true });

const rules = walkRules(join(ROOT, "rules")).map((f) => RuleRecord.parse(loadYaml(f)));
const classification = EndpointTemplateFile.parse(
  loadYaml(join(ROOT, "rules", "copy", "classification.yml")),
);
const claimPaths = EndpointTemplateFile.parse(
  loadYaml(join(ROOT, "rules", "copy", "claim-paths.yml")),
);
const evidence = EvidenceChecklistFile.parse(
  loadYaml(join(ROOT, "rules", "copy", "evidence.yml")),
);
const handbookMap = HandbookMapFile.parse(
  loadYaml(join(ROOT, "rules", "copy", "handbook-map.yml")),
);

const banner = "// 由 scripts/build-content.ts 生成，请勿手工编辑。改 rules/ 下的 YAML。\n";

writeFileSync(join(OUT, "rules.json"), JSON.stringify(rules, null, 2) + "\n");
writeFileSync(
  join(OUT, "copy.json"),
  JSON.stringify(
    {
      classification: classification.templates,
      claimPaths: claimPaths.templates,
      evidence,
      // 前端包里只放已发布章节：草稿连标题都不进产物
      handbookMap: { ...handbookMap, sections: handbookMap.sections.filter((x) => x.status === "published") },
    },
    null,
    2,
  ) + "\n",
);
/**
 * 草稿层：docs/drafts/。同样过 Zod 校验（草稿写坏了也要在构建期发现），
 * 但**线上应用不导入** drafts.json —— 只有 VITE_DRAFTS=1 的预览构建经动态 import 读取，
 * 生产构建里那段分支是死代码，会被整段删除。scripts/audit-bundle.ts 验证产物里没有草稿内容。
 */
const DRAFTS = join(ROOT, "docs", "drafts");
const draftRules = existsSync(join(DRAFTS, "rules"))
  ? walkRules(join(DRAFTS, "rules")).map((f) => RuleRecord.parse(loadYaml(f)))
  : [];
for (const r of draftRules) {
  if (r.status !== "draft") throw new Error(`docs/drafts/rules 里的规则 ${r.id} 必须是 status: "draft"`);
}
const draftCopy = existsSync(join(DRAFTS, "copy"))
  ? readdirSync(join(DRAFTS, "copy"))
      .filter((f) => f.endsWith(".yml"))
      .sort()
      .map((f) => DraftCopyFile.parse(loadYaml(join(DRAFTS, "copy", f))))
  : [];
writeFileSync(
  join(OUT, "drafts.json"),
  JSON.stringify(
    {
      rules: draftRules,
      templates: draftCopy.flatMap((c) => c.templates),
      checklists: draftCopy.flatMap((c) => c.checklists),
      endpoints: Object.assign({}, ...draftCopy.map((c) => c.endpoints)),
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(OUT, "README.md"),
  banner.replace("// ", "# ") +
    "\n本目录是构建产物，不进版本库。运行 `npm run build:content` 重新生成。\n",
);

console.log(
  `生成完成：规则 ${rules.length} 条，定性模板 ${classification.templates.length} 条，` +
    `主张模板 ${claimPaths.templates.length} 条，证据清单 ${evidence.checklists.length} 组，` +
    `手册章节 ${handbookMap.sections.filter((x) => x.status === "published").length} 节已发布；` +
    `草稿规则 ${draftRules.length} 条（不上线）`,
);
