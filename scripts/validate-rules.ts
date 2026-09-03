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
 * ## 两种模式
 *
 *   默认        —— 结构错误 + **被规则引用到的**未核验来源 → 退出码 1
 *   --strict    —— 另加：sources.yml 中**任何**未核验来源 → 退出码 1
 *                  `npm run build` 经 prebuild 走 strict，故未完成人工核验时
 *                  **构建必然失败，这是设计行为，不是 bug。**
 *
 * 程序不能检查的部分（round3 §8）：页面是不是对应法规、条文是不是最新版、
 * 链接内容有没有被错误理解。语义核验永远是人工责任。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { RuleRecord } from "../src/schema/rule.js";
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
    if (statSync(p).isDirectory()) out = out.concat(walkYaml(p));
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
const referencedSourceIds = new Set<string>();

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
/* 9. 未核验来源                                                       */
/* ------------------------------------------------------------------ */

const unverified = (registry?.sources ?? []).filter((s) => !s.page_opened_and_checked);
const unverifiedReferenced = unverified.filter((s) => referencedSourceIds.has(s.id));

for (const s of unverifiedReferenced) {
  err(
    "sources.yml",
    `来源 ${s.id}（${s.page_title}）已被规则引用，但 page_opened_and_checked 仍为 false。` +
      `需维护人亲自打开官方原文页核对后手工置为 true。`,
  );
}

if (STRICT) {
  for (const s of unverified) {
    if (referencedSourceIds.has(s.id)) continue;
    err(
      "sources.yml",
      `[strict] 来源 ${s.id}（${s.page_title}）尚未人工核验，不得部署。`,
    );
  }
} else {
  for (const s of unverified) {
    if (referencedSourceIds.has(s.id)) continue;
    warn("sources.yml", `来源 ${s.id} 尚未人工核验（尚无规则引用）`);
  }
}

const todoUrls = (registry?.sources ?? []).filter((s) => s.url === "TODO_VERIFY");
for (const s of todoUrls) {
  warn("sources.yml", `来源 ${s.id} 的 url 仍为 TODO_VERIFY，见 docs/sources-to-verify.md`);
}

/* ------------------------------------------------------------------ */
/* 输出                                                               */
/* ------------------------------------------------------------------ */

notices.push(`规则文件 ${ruleFiles.length} 个，测试用例 ${fixtureFiles.length} 个，来源 ${sourceById.size} 条`);
notices.push(
  `已人工核验来源 ${sourceById.size - unverified.length}/${sourceById.size}` +
    (unverified.length ? `，待核验 ${unverified.map((s) => s.id).join("、")}` : ""),
);
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
