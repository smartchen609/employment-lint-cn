/**
 * 构建时规则校验。round3 §8「构建时强制检查」。
 *
 * 检查项：
 *   1. sources.yml 结构合法、id 不重复
 *   2. 每条规则通过 RuleRecord schema
 *   3. rule id 不重复
 *   4. 每条 legal_basis 都有 source_id，且该 source_id 存在于 sources.yml
 *   5. legal_basis[].article 落在该 source 的 pinpoint 中
 *   6. rules[].sources[].source_id 同样必须存在
 *   7. 被引用的 source 其 status 必须为 active
 *   8. 被引用的 source 其 official 必须为 true —— 例外：
 *      binding_role 为 interpretive-signal 的案例来源允许 official: false
 *   9. 未核验来源（page_opened_and_checked !== true）拦截
 *  10. 测试 fixture 结构合法、id 不重复；rules[].tests 指向的用例存在
 *
 * ## "上线内容"与"草稿"
 *
 * 上线内容 = rules/ 下的规则 + handbook-map.yml 里 status: published 的章节正文。
 * 草稿 = docs/handbook/drafts/ 的章节、docs/drafts/ 的规则与文案 —— 不构建、不部署。
 *
 * **不变式：任何上线内容都不得引用未经维护人核验的来源。**
 * 草稿可以引用待核验来源，那正是它们等待维护人批量确认的原因（CLAUDE.md §1b）。
 *
 * ## 两种模式
 *
 *   默认        —— 结构错误 + 上线内容引用了未核验来源 → 退出码 1
 *   --strict    —— 另加：规则 provision_effective 仍为 TODO_VERIFY → 退出码 1
 *                  `npm run build` 经 prebuild 走 strict。
 *
 * 只被草稿引用、或尚无任何引用的未核验来源，两种模式都只警告。
 * （2026-09-16 前，strict 对 sources.yml 里**任何**未核验来源都报错；
 *  这使草稿无法与上线内容共存于主分支。改为按"是否被上线内容引用"判定后，
 *  "未核验内容不上线"的承诺由更精确的检查守住，并有突变测试覆盖。）
 *
 * 程序不能检查的部分（round3 §8）：页面是不是对应法规、条文是不是最新版、
 * 链接内容有没有被错误理解。语义核验永远是人工责任。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { RuleRecord } from "../src/schema/rule.js";
import { EndpointTemplateFile, EvidenceChecklistFile, HandbookMapFile } from "../src/schema/copy.js";
import { SourceRegistry } from "../src/schema/source.js";
import { TestFixture } from "../src/schema/fixture.js";

const ROOT = resolve(import.meta.dirname, "..");
const STRICT = process.argv.includes("--strict");

const errors: string[] = [];
const warnings: string[] = [];
const notices: string[] = [];

const err = (file: string, msg: string) => errors.push(`${file}: ${msg}`);
const warn = (file: string, msg: string) => warnings.push(`${file}: ${msg}`);

function rel(p: string): string {
  return relative(ROOT, p) || p;
}

function walkYaml(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "copy") continue; // 文案单独校验，不是 RuleRecord
      out = out.concat(walkYaml(p));
    }
    else if (e.endsWith(".yml") || e.endsWith(".yaml")) out.push(p);
  }
  return out.sort();
}

/** YAML 1.2；构建时拒绝重复键。CLAUDE.md §E3。 */
function loadYaml(file: string): unknown {
  const text = readFileSync(file, "utf8");
  return parse(text, {
    version: "1.2",
    uniqueKeys: true,
    strict: true,
  });
}

function formatZod(e: z.ZodError): string[] {
  return e.issues.map((i) => {
    const path = i.path.length ? i.path.join(".") : "<root>";
    return `  ${path}: ${i.message}`;
  });
}

/* ------------------------------------------------------------------ */
/* 1. sources.yml                                                      */
/* ------------------------------------------------------------------ */

const sourcesPath = join(ROOT, "sources.yml");
let registry: z.infer<typeof SourceRegistry> | null = null;

try {
  const raw = loadYaml(sourcesPath);
  const parsed = SourceRegistry.safeParse(raw);
  if (!parsed.success) {
    err(rel(sourcesPath), "结构校验失败:\n" + formatZod(parsed.error).join("\n"));
  } else {
    registry = parsed.data;
  }
} catch (e) {
  err(rel(sourcesPath), `无法解析: ${(e as Error).message}`);
}

const sourceById = new Map<string, z.infer<typeof SourceRegistry>["sources"][number]>();
for (const s of registry?.sources ?? []) sourceById.set(s.id, s);

/* ------------------------------------------------------------------ */
/* 2. 测试 fixture                                                     */
/* ------------------------------------------------------------------ */

const fixtureFiles = walkYaml(join(ROOT, "tests", "fixtures"));
const fixtureIds = new Set<string>();
let filledActualResults = 0;

for (const file of fixtureFiles) {
  let raw: unknown;
  try {
    raw = loadYaml(file);
  } catch (e) {
    err(rel(file), `无法解析: ${(e as Error).message}`);
    continue;
  }
  const parsed = TestFixture.safeParse(raw);
  if (!parsed.success) {
    err(rel(file), "结构校验失败:\n" + formatZod(parsed.error).join("\n"));
    continue;
  }
  const fx = parsed.data;
  if (fixtureIds.has(fx.id)) err(rel(file), `重复的测试 ID: ${fx.id}`);
  fixtureIds.add(fx.id);
  if (fx.actual_result.trim() !== "") filledActualResults += 1;
}

/* ------------------------------------------------------------------ */
/* 3. 规则                                                             */
/* ------------------------------------------------------------------ */

const ruleFiles = walkYaml(join(ROOT, "rules"));
const ruleIds = new Set<string>();
const todoEffectiveDates: string[] = [];
/** 被 rules/ 下（上线）规则引用的来源。 */
const referencedSourceIds = new Set<string>();
/** 被已发布手册章节正文引用的来源。 */
const publishedSectionSourceIds = new Set<string>();
/** 被草稿章节引用的来源。 */
const draftOnlySourceIds = new Set<string>();
const sourceUsers = new Map<string, string[]>();
let draftSectionCount = 0;

for (const file of ruleFiles) {
  let raw: unknown;
  try {
    raw = loadYaml(file);
  } catch (e) {
    err(rel(file), `无法解析: ${(e as Error).message}`);
    continue;
  }

  const parsed = RuleRecord.safeParse(raw);
  if (!parsed.success) {
    err(rel(file), "结构校验失败:\n" + formatZod(parsed.error).join("\n"));
    continue;
  }
  const rule = parsed.data;
  const at = rel(file);

  if (ruleIds.has(rule.id)) err(at, `重复的 rule id: ${rule.id}`);
  ruleIds.add(rule.id);

  // provision_effective.from 仍为 TODO_VERIFY 的，登记为待人工补齐
  if (rule.provision_effective.from === "TODO_VERIFY") {
    todoEffectiveDates.push(`${rule.id}（${at}）`);
    if (STRICT) {
      err(at, `[strict] provision_effective.from 仍为 TODO_VERIFY，不得部署。`);
    }
  }

  // 4/5. legal_basis → sources.yml
  for (const basis of rule.legal_basis) {
    referencedSourceIds.add(basis.source_id);
    const src = sourceById.get(basis.source_id);
    if (!src) {
      err(at, `legal_basis 引用了 sources.yml 中不存在的 source_id: ${basis.source_id}`);
      continue;
    }
    if (!src.pinpoint.includes(basis.article)) {
      err(
        at,
        `legal_basis 的 article「${basis.article}」不在 source ${src.id} 的 pinpoint 中；` +
          `已登记的 pinpoint: ${src.pinpoint.join("、")}`,
      );
    }
    if (!src.official) {
      err(at, `legal_basis 不得引用 official: false 的来源（${src.id}）；案例来源请写在 sources 字段并标注 binding_role`);
    }
    if (src.status !== "active") {
      err(at, `legal_basis 引用了 status: ${src.status} 的来源 ${src.id}`);
    }
  }

  // 6/7/8. rules[].sources
  for (const ref of rule.sources) {
    referencedSourceIds.add(ref.source_id);
    const src = sourceById.get(ref.source_id);
    if (!src) {
      err(at, `sources 引用了不存在的 source_id: ${ref.source_id}`);
      continue;
    }
    if (src.status !== "active") {
      err(at, `sources 引用了 status: ${src.status} 的来源 ${src.id}`);
    }
    if (!src.official && ref.binding_role !== "interpretive-signal") {
      err(
        at,
        `非官方来源 ${src.id} 只能以 binding_role: interpretive-signal 引用，` +
          `当前为 ${ref.binding_role}`,
      );
    }
  }

  // 10. tests 指向的 fixture 必须存在（fixture 尚未建立时只警告）
  if (fixtureFiles.length > 0) {
    for (const t of rule.tests) {
      if (!fixtureIds.has(t)) err(at, `tests 指向不存在的测试用例: ${t}`);
    }
  } else {
    warn(at, `tests 引用了 ${rule.tests.join("、")}，但 tests/fixtures 尚未建立（P2 阶段补齐）`);
  }
}

/* ------------------------------------------------------------------ */
/* 3b. 输出文案                                                        */
/* ------------------------------------------------------------------ */

const copyFiles: Array<[string, "endpoints" | "evidence"]> = [
  ["rules/copy/classification.yml", "endpoints"],
  ["rules/copy/claim-paths.yml", "endpoints"],
  ["rules/copy/evidence.yml", "evidence"],
];

const endpointIds = new Set<string>();

for (const [relPath, kind] of copyFiles) {
  const file = join(ROOT, relPath);
  let raw: unknown;
  try {
    raw = loadYaml(file);
  } catch (e) {
    err(relPath, `无法解析: ${(e as Error).message}`);
    continue;
  }
  const schema = kind === "endpoints" ? EndpointTemplateFile : EvidenceChecklistFile;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    err(relPath, "结构校验失败:\n" + formatZod(parsed.error).join("\n"));
    continue;
  }
  if (kind === "endpoints") {
    for (const t of (parsed.data as { templates: Array<{ id: string }> }).templates) {
      if (endpointIds.has(t.id)) err(relPath, `重复的终点编号: ${t.id}`);
      endpointIds.add(t.id);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3c. 终点 → 手册章节映射                                             */
/* ------------------------------------------------------------------ */

{
  const relPath = "rules/copy/handbook-map.yml";
  try {
    const parsed = HandbookMapFile.safeParse(loadYaml(join(ROOT, relPath)));
    if (!parsed.success) {
      err(relPath, "结构校验失败:\n" + formatZod(parsed.error).join("\n"));
    } else {
      const map = parsed.data;
      // 每个终点都必须有章节可看 —— "工具是皮"的意思就是每张卡片都能翻到骨架
      for (const id of endpointIds) {
        if (!map.endpoints[id]) err(relPath, `终点 ${id} 没有对应的手册章节`);
      }
      for (const id of Object.keys(map.endpoints)) {
        if (!endpointIds.has(id)) err(relPath, `映射里的 ${id} 不是已登记的终点`);
      }
      // 章节文件必须存在：已发布的在 docs/handbook/，草稿在 docs/handbook/drafts/
      for (const sec of map.sections) {
        const dir = sec.status === "published" ? ["docs", "handbook"] : ["docs", "handbook", "drafts"];
        const f = join(ROOT, ...dir, sec.file);
        try {
          statSync(f);
        } catch {
          err(relPath, `章节 ${sec.id}（${sec.status}）指向不存在的文件 ${dir.join("/")}/${sec.file}`);
          continue;
        }
        const text = readFileSync(f, "utf8");
        const ids = [...sourceById.keys()].filter((id) =>
          new RegExp(`(?<![A-Z0-9-])${id.replace(/-/g, "\\-")}(?![A-Z0-9-])`).test(text),
        );
        if (sec.status === "published") {
          for (const id of ids) {
            publishedSectionSourceIds.add(id);
            sourceUsers.set(id, [...(sourceUsers.get(id) ?? []), `手册 ${sec.id} 节`]);
          }
        } else {
          draftSectionCount += 1;
          for (const id of ids) draftOnlySourceIds.add(id);
        }
      }
    }
  } catch (e) {
    err(relPath, `无法解析: ${(e as Error).message}`);
  }
}

/*
 * 草稿里引用的来源：docs/handbook/drafts/ 下全部文件（含已发布章节的修订稿，它们不在映射里）
 * 与 docs/drafts/ 下的草稿规则、文案。只用于把「仅被草稿引用」与「没人引用」区分开。
 */
{
  const ids = [...sourceById.keys()];
  const scan = (text: string) => {
    for (const id of ids) {
      if (new RegExp(`(?<![A-Z0-9-])${id.replace(/-/g, "\\-")}(?![A-Z0-9-])`).test(text)) draftOnlySourceIds.add(id);
    }
  };
  const walk = (dir: string, ext: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : [],
      );
    } catch {
      return [];
    }
  };
  for (const f of walk(join(ROOT, "docs", "handbook", "drafts"), ".md")) scan(readFileSync(f, "utf8"));
  for (const f of walk(join(ROOT, "docs", "drafts"), ".yml")) scan(readFileSync(f, "utf8"));
}

/* ------------------------------------------------------------------ */
/* 9. 未核验来源：上线内容不得引用                                     */
/* ------------------------------------------------------------------ */

const unverified = (registry?.sources ?? []).filter((s) => !s.page_opened_and_checked);
const liveReferenced = new Set<string>([...referencedSourceIds, ...publishedSectionSourceIds]);

for (const s of unverified) {
  if (liveReferenced.has(s.id)) {
    const users = [
      ...(referencedSourceIds.has(s.id) ? ["规则"] : []),
      ...(sourceUsers.get(s.id) ?? []),
    ].join("、");
    err(
      "sources.yml",
      `来源 ${s.id}（${s.page_title}）被上线内容引用（${users}），但 page_opened_and_checked 仍为 false。` +
        `需维护人核验后手工置为 true；或把引用它的内容移回草稿。`,
    );
  } else if (draftOnlySourceIds.has(s.id)) {
    warn("sources.yml", `来源 ${s.id} 尚未核验，仅被草稿引用（不会上线）`);
  } else {
    warn("sources.yml", `来源 ${s.id} 尚未核验，目前没有任何内容引用`);
  }
}

for (const r of todoEffectiveDates) {
  warn("rules", `${r} 的 provision_effective.from 仍为 TODO_VERIFY，见 docs/sources-to-verify.md`);
}

const todoUrls = (registry?.sources ?? []).filter((s) => s.url === "TODO_VERIFY");
for (const s of todoUrls) {
  warn("sources.yml", `来源 ${s.id} 的 url 仍为 TODO_VERIFY，见 docs/sources-to-verify.md`);
}

/* ------------------------------------------------------------------ */
/* 输出                                                               */
/* ------------------------------------------------------------------ */

notices.push(
  `规则文件 ${ruleFiles.length} 个，输出模板 ${endpointIds.size} 条，` +
    `测试用例 ${fixtureFiles.length} 个，来源 ${sourceById.size} 条`,
);
notices.push(
  `已人工核验来源 ${sourceById.size - unverified.length}/${sourceById.size}` +
    (unverified.length ? `，待核验 ${unverified.length} 条（均未被上线内容引用时不阻断构建）` : ""),
);
notices.push(`上线内容引用的来源 ${liveReferenced.size} 条；草稿章节 ${draftSectionCount} 节`);
notices.push(
  filledActualResults > 0
    ? `测试用例中已由维护人回填 actual_result 的有 ${filledActualResults} 条`
    : `测试用例中尚无 actual_result 回填（该栏只能由维护人填写）`,
);

console.log("── validate-rules" + (STRICT ? " --strict" : "") + " ──");
for (const n of notices) console.log(`  · ${n}`);

if (warnings.length) {
  console.log("\n警告:");
  for (const w of warnings) console.log(`  ! ${w}`);
}

if (errors.length) {
  console.error("\n错误:");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\n校验未通过：${errors.length} 项错误。构建不得继续。`);
  process.exit(1);
}

console.log("\n在本次校验覆盖的检查项内，未发现结构性冲突。");
console.log("这不代表法律内容正确 —— 条文、版本和链接语义的核验是人工责任。");
