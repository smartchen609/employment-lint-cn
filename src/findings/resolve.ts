/**
 * 结果组装：把引擎产出的 Finding 与问答答案，映射成结果页要显示的四个模块。
 *
 * round2 §2：
 *   A. 定性候选：可以同时出现多个
 *   B. 主张路径：只能形成一个当前优先方向或停止判断
 *   C. 证据固定：按案件形态生成
 *   D. Case Export：汇总全部输入与 Finding
 *
 * round2 §1甲：结果页第一屏只出现**一条**最高优先级 Warning，
 * 下面最多再显示三条次级。
 */

import type { EndpointTemplate, EvidenceChecklist, Severity } from "../schema/index.js";
import type { EngineResult, Finding } from "../engine/evaluate.js";
import type { Answers } from "../questions/types.js";
import { is } from "../questions/tree.js";

export interface ResolvedResult {
  /** 最高优先级 Warning 所属终点。 */
  primary: EndpointTemplate;
  /** 次级终点，最多三条。 */
  secondary: EndpointTemplate[];
  /** 定性候选卡片（含 primary 与 secondary 中的定性类终点）。 */
  classification: EndpointTemplate[];
  /** 主张方向，或"停止判断"。可能为空。 */
  claimDirection: EndpointTemplate | null;
  /** 两栏证据清单。 */
  evidence: EvidenceChecklist[];
  /** 每条终点对应的 Finding，供展开显示 Rule ID 与依据。 */
  findingsByEndpoint: Record<string, Finding[]>;
}

const SEVERITY_RANK: Record<Severity, number> = {
  blocker: 0,
  error: 1,
  warning: 2,
  info: 3,
};

/**
 * 进入「本工具未覆盖范围」的判断。round2 §7 C18。
 * 命中即停止自动判断，不得用其他分支的结论类推。
 */
function isOutOfScope(a: Answers): boolean {
  if (is(a, "A01", "INDEFINITE", "TASK_BASED", "UNKNOWN")) return true;
  if (is(a, "A02", "MEDICAL_OR_PREGNANCY", "UNKNOWN")) return true;
  if (is(a, "A05", "STATUTORY", "UNKNOWN")) return true;
  if (
    is(
      a,
      "A14",
      "ARTICLE_39_SERIOUS_MISCONDUCT",
      "ARTICLE_40_1_MEDICAL_PERIOD_EXPIRED",
      "ARTICLE_40_2_INCOMPETENT",
      "UNKNOWN",
    )
  ) {
    return true;
  }
  if (is(a, "G03", "REMOTE_UNKNOWN")) return true;
  if (is(a, "M02", "SIGNED_AGREEMENT", "SUBMITTED_RESIGNATION", "UNKNOWN")) return true;
  return false;
}

/** 答案内部冲突。round2 §7 C19。 */
function hasConflict(a: Answers): boolean {
  // 公司到期前说过不续签，但之后仍持续安排工作
  if (is(a, "A15.1", "CONFLICTING")) return true;
  // 既表示拒绝续订，又主张公司应订立无固定期限合同
  if (is(a, "A12", "REFUSED") && is(a, "A03", "2", "MULTI_ENTITY")) return true;
  // 选了没有书面通知，却又填写了书面理由类型
  if (is(a, "B01", "NONE") && is(a, "B02", "AT_OR_BEFORE_TERMINATION")) return true;
  return false;
}

/**
 * 按路径形态挑选**必然出现**的终点（与 Finding 无关的那些）。
 * 顺序即优先级：越靠前越优先成为最高优先级 Warning。
 */
function structuralEndpointIds(a: Answers, findings: Finding[]): string[] {
  const ids: string[] = [];

  // 时效问题应当优先于其他争点处理。round2 §7 R06。
  // 它不是"最严重"的 Finding，但它是唯一一个会让其他所有争点变得无意义的。
  if (findings.some((f) => f.id === "ARBITRATION_LIMITATION_RISK")) ids.push("R06");

  if (is(a, "G02", "NOT_YET_EFFECTIVE")) ids.push("C00");
  if (hasConflict(a)) ids.push("C19");
  if (isOutOfScope(a)) ids.push("C18");

  if (is(a, "G01", "MUTUAL_TERMINATION")) {
    ids.push(is(a, "M02", "SIGNED_AGREEMENT", "SUBMITTED_RESIGNATION", "UNKNOWN") ? "C02" : "C01");
  }
  if (is(a, "G01", "DE_FACTO_TERMINATION")) ids.push("C03");
  if (is(a, "G01", "UNCLEAR_DOCUMENT")) ids.push("C19");

  // 解除理由事后补充
  if (is(a, "B02", "AFTER_TERMINATION", "AFTER_ARBITRATION")) ids.push("C17");

  // 到期路径：既没有命中任何视同规则，也没有第十一条
  if (is(a, "G01", "FIXED_TERM_EXPIRY") && is(a, "A01", "FIXED_TERM")) {
    const hasStructuralFinding = findings.some((f) =>
      [
        "DEEMED_SECOND_FIXED_TERM",
        "SZ_DEEMED_RENEWAL",
        "DEEMED_RENEWAL_CANDIDATE",
        "ENTITY_CHANGE_DOES_NOT_RESET_COUNT",
        "INDEFINITE_TERM_OBLIGATION_CANDIDATE",
      ].includes(f.id),
    );
    if (!hasStructuralFinding) {
      ids.push(is(a, "A16", "OFFERED_AND_REFUSED") ? "C05" : "C04");
    } else if (is(a, "A12", "ORAL", "UNKNOWN", "NONE") || is(a, "A13", "UNKNOWN", "true")) {
      // 结构可能成立但关键条件缺失
      ids.push("C12");
    }
  }

  // 已提交仲裁但方向可能不一致
  if (!is(a, "P01", "NOT_FILED", "UNKNOWN") && a["P01"] !== undefined) {
    const claim = a["P04"];
    const remedy = a["P02"];
    ids.push(claim !== undefined && claim === remedy ? "R04" : "R05");
  }

  return ids;
}

/**
 * 按答案排除**结构上不可能**的终点。
 *
 * 例：C06 的标题是「你已经实际连续履行两次固定期限劳动合同」。
 * 靠视同规则（协商延长、自动续延、变换主体）达到二次的案件，
 * 由 C07–C11 承担，不能显示 C06 —— 那句话对用户是假的。
 */
function excludedEndpoints(a: Answers): Set<string> {
  const out = new Set<string>();
  if (!is(a, "A03", "2", "MULTI_ENTITY")) out.add("C06");
  return out;
}

export function resolveResult(
  engine: EngineResult,
  answers: Answers,
  templates: EndpointTemplate[],
  checklists: EvidenceChecklist[],
): ResolvedResult | null {
  const byId = new Map(templates.map((t) => [t.id, t]));

  const fired = new Set(engine.firedRuleIds);
  const findingsByEndpoint: Record<string, Finding[]> = {};
  const fromFindings: string[] = [];

  for (const t of templates) {
    if (excludedEndpoints(answers).has(t.id)) continue;

    // 规则锚定优先：多条规则共用同一个 Finding 时，只按 Finding 匹配会误命中。
    let matched: Finding[] = [];
    if (t.rule_ids.length > 0) {
      if (!t.rule_ids.some((id) => fired.has(id))) continue;
      matched = engine.findings.filter((f) => t.rule_ids.includes(f.ruleId));
    } else if (t.findings.length > 0) {
      matched = engine.findings.filter((f) => t.findings.includes(f.id));
      if (matched.length === 0) continue;
    } else {
      continue;
    }

    fromFindings.push(t.id);
    findingsByEndpoint[t.id] = matched;
  }

  const structural = structuralEndpointIds(answers, engine.findings);
  const orderedIds = [...new Set([...structural, ...fromFindings])];
  const endpoints = orderedIds.map((id) => byId.get(id)).filter((t): t is EndpointTemplate => !!t);
  if (endpoints.length === 0) return null;

  /**
   * 排序：先按对应 Finding 的最高严重程度，再按结构性顺序。
   * 没有对应 Finding 的结构性终点（C00/C18/C19/C01…）视为 error 级，
   * 因为它们要么停止自动判断，要么涉及不可逆动作。
   */
  const severityOf = (t: EndpointTemplate): number => {
    const fs = findingsByEndpoint[t.id];
    if (!fs || fs.length === 0) return SEVERITY_RANK.error;
    return Math.min(...fs.map((f) => SEVERITY_RANK[f.severity]));
  };
  const sorted = [...endpoints].sort((a, b) => {
    const d = severityOf(a) - severityOf(b);
    if (d !== 0) return d;
    return orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id);
  });

  const claimIds = new Set(["R01", "R02", "R03", "R04", "R05", "R06"]);
  const claimDirection = sorted.find((t) => claimIds.has(t.id) && t.id !== "R06") ?? null;
  const classification = sorted.filter((t) => !claimIds.has(t.id));

  // 时效一旦命中就置顶，压过 severity 排序。
  const limitationFirst =
    structural[0] === "R06" ? [...sorted].sort((a, b) => (a.id === "R06" ? -1 : b.id === "R06" ? 1 : 0)) : sorted;

  const primary = limitationFirst[0]!;
  const secondary = limitationFirst.slice(1, 4);

  return {
    primary,
    secondary,
    classification,
    claimDirection,
    evidence: pickChecklists(answers, checklists),
    findingsByEndpoint,
  };
}

/** 按案件形态挑证据清单。round2 §9。 */
function pickChecklists(a: Answers, all: EvidenceChecklist[]): EvidenceChecklist[] {
  const wanted: string[] = [];
  if (is(a, "G01", "FIXED_TERM_EXPIRY")) wanted.push("P01");
  if (is(a, "G01", "ARTICLE_40_3")) wanted.push("P02");
  if (is(a, "G01", "DE_FACTO_TERMINATION")) wanted.push("P03");
  if (is(a, "G01", "MUTUAL_TERMINATION")) wanted.push("P04");
  if (is(a, "G01", "UNCLEAR_DOCUMENT")) wanted.push("P01", "P02");
  return all.filter((c) => wanted.includes(c.id));
}
