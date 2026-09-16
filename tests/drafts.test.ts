import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DraftCopyFile,
  EndpointTemplateFile,
  EvidenceChecklistFile,
  HandbookMapFile,
  RuleRecord,
  SourceRegistry,
  TestFixture,
  publishedSections,
} from "../src/schema/index.js";
import { evaluateAllApplicableRules } from "../src/engine/evaluate.js";
import { DERIVED_FACT_PATHS, DIRECT_FACT_PATHS } from "../src/engine/fact-paths.js";
import { BOOLEAN_FACT_PATHS, FACT_VALUES } from "../src/engine/fact-values.js";
import {
  DRAFT_BOOLEAN_FACT_PATHS,
  DRAFT_EXTRA_FACT_PATHS,
  DRAFT_FACT_PATHS,
  DRAFT_FACT_VALUES,
} from "../src/engine/fact-vocabulary.drafts.js";
import { buildFacts } from "../src/questions/build-facts.js";
import { QUESTIONS, visibleQuestions } from "../src/questions/tree.js";
import type { Answers } from "../src/questions/types.js";
import { DRAFT_SHAPE, DRAFT_QUESTIONS, addDraftFacts, withDraftQuestions } from "../src/questions/drafts/forced-resignation.js";
import { resolveResult } from "../src/findings/resolve.js";
import { ROOT, loadRules, parseYamlFile, walkYaml } from "./helpers.js";

/**
 * 草稿层（docs/drafts/）的机械保证。
 *
 * 草稿规则与卡片是「被迫解除入口 + 协商/事实解除规则」的候选实现，
 * 维护人确认前不得上线（CLAUDE.md §L2、§1b.6）。本文件保证两件事：
 *   一、草稿本身写得对：schema、词表、来源条号、禁止表达、用例回放、从答案到结果全链路；
 *   二、草稿确实没有上线：线上规则、线上问题树、线上文案产物里都没有它们。
 */

const DRAFTS = join(ROOT, "docs/drafts");
const draftRules = walkYaml(join(DRAFTS, "rules")).map((f) => ({
  file: f.replace(ROOT, ""),
  rule: RuleRecord.parse(parseYamlFile(f)),
}));
const draftCopyFiles = readdirSync(join(DRAFTS, "copy"))
  .filter((f) => f.endsWith(".yml"))
  .map((f) => DraftCopyFile.parse(parseYamlFile(join(DRAFTS, "copy", f))));
const draftTemplates = draftCopyFiles.flatMap((c) => c.templates);
const draftChecklists = draftCopyFiles.flatMap((c) => c.checklists);
const draftEndpoints: Record<string, string[]> = Object.assign({}, ...draftCopyFiles.map((c) => c.endpoints));
const draftFixtures = walkYaml(join(DRAFTS, "fixtures")).map((f) => TestFixture.parse(parseYamlFile(f)));

const prodRules = loadRules().map((r) => r.rule);
const prodTemplates = [
  ...EndpointTemplateFile.parse(parseYamlFile(join(ROOT, "rules/copy/classification.yml"))).templates,
  ...EndpointTemplateFile.parse(parseYamlFile(join(ROOT, "rules/copy/claim-paths.yml"))).templates,
];
const prodEvidence = EvidenceChecklistFile.parse(parseYamlFile(join(ROOT, "rules/copy/evidence.yml")));
const handbookMap = HandbookMapFile.parse(parseYamlFile(join(ROOT, "rules/copy/handbook-map.yml")));
const registry = SourceRegistry.parse(parseYamlFile(join(ROOT, "sources.yml")));

/** 预览与测试里把草稿规则视为 active；YAML 本身保持 draft。 */
const activated = draftRules.map(({ rule }) => ({ ...rule, status: "active" as const }));
const previewRules = [...prodRules, ...activated];
const previewTemplates = [...prodTemplates, ...draftTemplates];
const previewChecklists = [...prodEvidence.checklists, ...draftChecklists];
const draftQuestions = withDraftQuestions(QUESTIONS);

describe("草稿层：结构", () => {
  it("有 9 条草稿规则，全部 status: draft", () => {
    expect(draftRules.length).toBe(9);
    for (const { file, rule } of draftRules) expect(rule.status, file).toBe("draft");
  });

  it("草稿规则、卡片、证据清单、用例的编号不与线上冲突", () => {
    const prodRuleIds = new Set(prodRules.map((r) => r.id));
    for (const { rule } of draftRules) expect(prodRuleIds.has(rule.id), rule.id).toBe(false);
    const prodTplIds = new Set(prodTemplates.map((t) => t.id));
    for (const t of draftTemplates) expect(prodTplIds.has(t.id), t.id).toBe(false);
    const prodChkIds = new Set(prodEvidence.checklists.map((c) => c.id));
    for (const c of draftChecklists) expect(prodChkIds.has(c.id), c.id).toBe(false);
    const prodFixtureIds = new Set(walkYaml(join(ROOT, "tests/fixtures")).map((f) => f.split("/").pop()!.replace(".yml", "")));
    for (const fx of draftFixtures) expect(prodFixtureIds.has(fx.id), fx.id).toBe(false);
  });

  it("每条草稿规则恰有一张卡片锚定，每张卡片锚定的规则都存在", () => {
    const ids = new Set(draftRules.map((r) => r.rule.id));
    for (const { rule } of draftRules) {
      const cards = draftTemplates.filter((t) => t.rule_ids.includes(rule.id));
      expect(cards.length, `${rule.id} 的卡片数`).toBe(1);
    }
    for (const t of draftTemplates) {
      expect(t.rule_ids.length, `${t.id} 未锚定规则`).toBeGreaterThan(0);
      for (const id of t.rule_ids) expect(ids.has(id), `${t.id} 锚定了不存在的 ${id}`).toBe(true);
    }
  });

  it("每条草稿规则的 tests 指向真实草稿用例，每个草稿用例都被某条规则引用", () => {
    const fxIds = new Set(draftFixtures.map((f) => f.id));
    const referenced = new Set<string>();
    for (const { rule } of draftRules) {
      for (const t of rule.tests) {
        expect(fxIds.has(t), `${rule.id} 引用了不存在的用例 ${t}`).toBe(true);
        referenced.add(t);
      }
    }
    for (const fx of draftFixtures) expect(referenced.has(fx.id), `${fx.id} 没有规则引用`).toBe(true);
  });

  it.each(draftFixtures)("$id 的 actual_result 由维护人回填，AI 不得填写", (fx) => {
    expect(fx.actual_result).toBe("");
  });

  it("草稿终点映射覆盖全部草稿卡片，且只指向已发布章节", () => {
    const published = new Set(publishedSections(handbookMap).map((s) => s.id));
    for (const t of draftTemplates) expect(draftEndpoints[t.id], `${t.id} 缺手册映射`).toBeTruthy();
    for (const [id, secs] of Object.entries(draftEndpoints)) {
      expect(draftTemplates.some((t) => t.id === id), `映射里有幽灵终点 ${id}`).toBe(true);
      for (const s of secs) expect(published.has(s), `${id} 指向未发布章节 ${s}`).toBe(true);
    }
  });

  it("草稿题目编号不与线上题目冲突", () => {
    const prod = new Set(QUESTIONS.map((q) => q.id));
    for (const q of DRAFT_QUESTIONS) expect(prod.has(q.id), q.id).toBe(false);
  });
});

describe("草稿层：词表与来源", () => {
  const knownPaths = new Set<string>([
    ...DIRECT_FACT_PATHS,
    ...DERIVED_FACT_PATHS,
    ...DRAFT_FACT_PATHS,
    ...DRAFT_EXTRA_FACT_PATHS,
  ]);
  const values = { ...FACT_VALUES, ...DRAFT_FACT_VALUES };
  const booleans = new Set([...BOOLEAN_FACT_PATHS, ...DRAFT_BOOLEAN_FACT_PATHS]);

  function leaves(node: unknown, out: Array<{ path: string; op: string; value: unknown }>): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => leaves(n, out));
    const o = node as Record<string, unknown>;
    const path = (o["fact"] ?? o["derived_fact"]) as string | undefined;
    if (typeof path === "string" && typeof o["operator"] === "string") {
      out.push({ path, op: o["operator"], value: o["value"] });
    }
    for (const v of Object.values(o)) leaves(v, out);
  }

  it.each(draftRules)("$file 的事实路径与取值都在词表内", ({ rule }) => {
    const found: Array<{ path: string; op: string; value: unknown }> = [];
    leaves(rule.conditions, found);
    expect(found.length).toBeGreaterThan(0);
    for (const { path, op, value } of found) {
      expect(knownPaths.has(path), `${rule.id}：未声明的事实路径 ${path}`).toBe(true);
      const spec = values[path];
      const vals = ["in", "not_in", "includes_any", "includes_all"].includes(op)
        ? (value as unknown[])
        : [value];
      for (const v of vals) {
        if (spec) expect(spec.values.includes(v as string), `${rule.id}：${path} 取值 ${String(v)} 不在词表`).toBe(true);
        else if (booleans.has(path)) expect(typeof v === "boolean" || v === "UNKNOWN", `${rule.id}：${path}`).toBe(true);
      }
    }
  });

  it("草稿用例输入的取值都在词表内", () => {
    function flatten(obj: unknown, prefix: string, out: Array<[string, unknown]>): void {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) flatten(v, p, out);
        else out.push([p, v]);
      }
    }
    for (const fx of draftFixtures) {
      const found: Array<[string, unknown]> = [];
      flatten(fx.input, "", found);
      for (const [path, value] of found) {
        expect(knownPaths.has(path), `${fx.id}：未声明的事实路径 ${path}`).toBe(true);
        const spec = values[path];
        if (!spec) continue;
        for (const v of Array.isArray(value) ? value : [value]) {
          expect(spec.values.includes(v as string), `${fx.id}：${path} 取值 ${String(v)} 不在词表`).toBe(true);
        }
      }
    }
  });

  it("草稿规则引用的来源都已登记、条号在 pinpoint 里、且已经维护人核验", () => {
    for (const { rule } of draftRules) {
      for (const b of rule.legal_basis) {
        const src = registry.sources.find((s) => s.id === b.source_id);
        expect(src, `${rule.id} 引用了未登记来源 ${b.source_id}`).toBeTruthy();
        expect(src!.pinpoint.includes(b.article), `${rule.id}：${b.source_id} 的 pinpoint 缺 ${b.article}`).toBe(true);
        expect(src!.page_opened_and_checked, `${rule.id}：${b.source_id} 未核验`).toBe(true);
      }
    }
  });

  it("草稿规则没有凭记忆写生效日期：法律规则沿用线上同法条日期，其余一律 TODO_VERIFY", () => {
    const knownDates: Record<string, string> = {};
    for (const r of prodRules) {
      for (const b of r.legal_basis) {
        if (r.provision_effective.from !== "TODO_VERIFY") knownDates[b.source_id] = r.provision_effective.from;
      }
    }
    for (const { rule } of draftRules) {
      const from = rule.provision_effective.from;
      if (from === "TODO_VERIFY") continue;
      const ok = rule.legal_basis.some((b) => knownDates[b.source_id] === from);
      expect(ok, `${rule.id} 的生效日期 ${from} 在线上规则里找不到出处`).toBe(true);
    }
  });
});

describe("草稿层：卡片措辞", () => {
  it("最高优先级 Warning 显示在「你现在最不该做」下面，所以每条都要写成「不要……」", () => {
    for (const t of draftTemplates) expect(t.primary_warning.trim().startsWith("不要"), `${t.id}：${t.primary_warning}`).toBe(true);
  });
});

describe("草稿层：禁止表达", () => {
  const FORBIDDEN = [
    "一定能拿", "稳了", "稳赢", "100%违法", "必然支持", "一定败诉", "足够胜诉",
    "通过检查", "没有风险", "成功率", "系统已经认定", "PASS", "ALL CHECKS PASSED", "建议你马上仲裁",
  ];
  const texts: Array<[string, string]> = [];
  for (const t of draftTemplates) {
    for (const s of [t.title, t.primary_warning, ...t.body, ...t.sections.flatMap((x) => [x.heading, ...x.paragraphs, ...x.items])]) {
      texts.push([t.id, s]);
    }
  }
  for (const c of draftChecklists) for (const s of [c.title, ...c.currently_available, ...c.at_risk_after_exit]) texts.push([c.id, s]);
  for (const { rule } of draftRules) {
    for (const s of [rule.title, ...rule.claim_guidance.recommended, ...rule.claim_guidance.do_not_claim]) texts.push([rule.id, s]);
  }
  for (const q of DRAFT_QUESTIONS) for (const s of [q.prompt, q.why ?? "", ...(q.options ?? []).map((o) => o.label)]) texts.push([q.id, s]);

  it("草稿卡片、证据清单、规则提示、题目都不含禁止表达，也不出现「合法」", () => {
    expect(texts.length).toBeGreaterThan(50);
    for (const [id, s] of texts) {
      for (const bad of FORBIDDEN) expect(s.includes(bad), `${id}：「${s}」含禁止表达 ${bad}`).toBe(false);
      expect(s.includes("合法"), `${id}：「${s}」含「合法」`).toBe(false);
    }
  });
});

/** 由用例的事实输入反推问答答案，用来验证「答案 → 事实 → 规则 → 结果」全链路。 */
function answersFromFixtureInput(input: Record<string, unknown>): Answers {
  const get = (path: string): unknown =>
    path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), input);
  const a: Answers = {};
  const put = (id: string, v: unknown): void => {
    if (typeof v === "string") a[id] = v;
    else if (typeof v === "boolean") a[id] = String(v);
    else if (Array.isArray(v)) a[id] = v as string[];
  };
  put("G01", get("operation.selected_shape"));
  put("G03", get("scope.principal_place_of_performance"));
  put("F01", get("forced.grounds"));
  put("F02", get("forced.arrears_age"));
  put("F03", get("forced.social_insurance_demand"));
  put("F04", get("forced.exit_status"));
  put("M01", get("mutual.proposer"));
  put("M02", get("mutual.signed"));
  put("M03", get("mutual.asked_personal_reason"));
  put("D01", get("defacto.employer_statement"));
  put("D02", get("defacto.actions"));
  put("D03", get("defacto.willingness_expressed"));
  return a;
}

function runPreview(answers: Answers) {
  const facts = addDraftFacts(answers, buildFacts(answers, { questions: draftQuestions, evaluationDate: "2026-09-16" }));
  const engine = evaluateAllApplicableRules(facts, previewRules);
  const isForced = answers["G01"] === DRAFT_SHAPE;
  const resolved = resolveResult(engine, answers, previewTemplates, previewChecklists, {
    questions: draftQuestions,
    extraEndpointIds: (a, findings) => (a["G01"] === DRAFT_SHAPE && findings.length === 0 ? ["C18"] : []),
    extraChecklistIds: () => (isForced ? ["P05"] : []),
  });
  return { facts, engine, resolved };
}

describe("草稿层：用例回放（草稿规则临时视为 active）", () => {
  it.each(draftFixtures)("$id · $title — 事实直接进引擎", (fx) => {
    const got = new Set(evaluateAllApplicableRules(fx.input, previewRules).findings.map((f) => f.id));
    for (const want of fx.expected.findings) expect(got.has(want), `${fx.id} 缺少 ${want}`).toBe(true);
    for (const bad of fx.expected.not_findings) expect(got.has(bad), `${fx.id} 不应出现 ${bad}`).toBe(false);
  });

  it.each(draftFixtures)("$id — 从问答答案走完整链路，主卡片与次级卡片符合预期", (fx) => {
    const { engine, resolved } = runPreview(answersFromFixtureInput(fx.input));
    const got = new Set(engine.findings.map((f) => f.id));
    for (const want of fx.expected.findings) expect(got.has(want), `${fx.id} 缺少 ${want}`).toBe(true);
    for (const bad of fx.expected.not_findings) expect(got.has(bad), `${fx.id} 不应出现 ${bad}`).toBe(false);
    expect(resolved, `${fx.id} 没有形成结果`).not.toBeNull();
    if (fx.expected.primary_endpoint) expect(resolved!.primary.id).toBe(fx.expected.primary_endpoint);
    for (const s of fx.expected.secondary_endpoints) {
      expect(resolved!.secondary.map((t) => t.id), `${fx.id} 次级卡片缺 ${s}`).toContain(s);
    }
  });

  it("被迫解除路径显示被迫解除证据清单 P05", () => {
    const { resolved } = runPreview({ G01: DRAFT_SHAPE, G03: "CN-OTHER", F01: ["WAGES_UNPAID"], F02: "WITHIN_ONE_YEAR", F04: "STILL_EMPLOYED" });
    expect(resolved!.evidence.map((c) => c.id)).toEqual(["P05"]);
  });

  it("被迫解除入口一条规则都没命中时，落到 C18「未覆盖」，不出现空结果", () => {
    // 外地、只有社保基数偏低：深圳口径不适用，第三十八条候选也不成立
    const { engine, resolved } = runPreview({ G01: DRAFT_SHAPE, G03: "CN-OTHER", F01: ["SI_UNDERPAID"], F04: "STILL_EMPLOYED" });
    expect(engine.findings).toEqual([]);
    expect(resolved!.primary.id).toBe("C18");
  });

  it("选了被迫解除才出现 F 题；「公司操作何时生效」对被迫解除隐藏", () => {
    const forced = visibleQuestions({ G01: DRAFT_SHAPE, F01: ["WAGES_UNPAID", "SI_NONE"] }, draftQuestions).map((q) => q.id);
    expect(forced).toEqual(expect.arrayContaining(["F01", "F02", "F03", "F04"]));
    expect(forced).not.toContain("G02");
    const other = visibleQuestions({ G01: "MUTUAL_TERMINATION" }, draftQuestions).map((q) => q.id);
    for (const id of ["F01", "F02", "F03", "F04"]) expect(other).not.toContain(id);
    // F02 只在选了工资或加班费时出现，F03 只在选了未缴或缺险种时出现
    const siOnly = visibleQuestions({ G01: DRAFT_SHAPE, F01: ["SI_UNDERPAID"] }, draftQuestions).map((q) => q.id);
    expect(siOnly).not.toContain("F02");
    expect(siOnly).not.toContain("F03");
  });

  it("改答案后隐藏的草稿题不再影响结果（与线上剪枝同一语义）", () => {
    const { facts } = runPreview({ G01: "MUTUAL_TERMINATION", F01: ["WAGES_UNPAID"], F04: "LEFT_WITHOUT_NOTICE" });
    expect(facts["forced"]).toBeUndefined();
  });
});

describe("草稿层：没有上线", () => {
  it("线上引擎跳过 status: draft 的规则：直接把草稿 YAML 交给引擎，一条也不命中", () => {
    for (const fx of draftFixtures) {
      const r = evaluateAllApplicableRules(fx.input, [...prodRules, ...draftRules.map((d) => d.rule)]);
      const draftIds = new Set(draftRules.map((d) => d.rule.id));
      expect(r.firedRuleIds.filter((id) => draftIds.has(id)), fx.id).toEqual([]);
    }
  });

  it("rules/ 里没有草稿规则", () => {
    const ids = new Set(draftRules.map((d) => d.rule.id));
    for (const r of prodRules) expect(ids.has(r.id), `${r.id} 已进 rules/`).toBe(false);
    for (const r of prodRules) expect(r.status, r.id).toBe("active");
  });

  it("线上问题树没有被迫解除选项，也没有 F 题", () => {
    const g01 = QUESTIONS.find((q) => q.id === "G01")!;
    expect(g01.options!.map((o) => o.value)).not.toContain(DRAFT_SHAPE);
    expect(QUESTIONS.some((q) => q.id.startsWith("F"))).toBe(false);
  });

  it("线上文案产物（src/generated/copy.json）里没有草稿卡片与证据清单", () => {
    const f = join(ROOT, "src/generated/copy.json");
    if (!existsSync(f)) return; // 由 pretypecheck 生成；单独跑 vitest 时可能尚未生成
    const copy = readFileSync(f, "utf8");
    for (const t of draftTemplates) {
      expect(copy.includes(`"${t.id}"`), `copy.json 含草稿终点 ${t.id}`).toBe(false);
      expect(copy.includes(t.title), `copy.json 含草稿标题 ${t.title}`).toBe(false);
    }
    for (const c of draftChecklists) expect(copy.includes(`"${c.id}"`), `copy.json 含草稿清单 ${c.id}`).toBe(false);
  });

  it("除草稿模块外，src/ 下没有任何文件写着草稿入口的取值或草稿规则编号", () => {
    const markers = [DRAFT_SHAPE, ...draftRules.map((d) => d.rule.id)];
    const allowed = new Set([
      "src/questions/drafts/forced-resignation.ts",
      "src/engine/fact-vocabulary.drafts.ts",
    ]);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "generated" ? [] : walk(join(dir, e.name))) : [join(dir, e.name)],
      );
    for (const file of walk(join(ROOT, "src"))) {
      const rel = file.replace(ROOT, "");
      if (allowed.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      for (const m of markers) expect(text.includes(m), `${rel} 含草稿标记 ${m}`).toBe(false);
    }
  });
});
