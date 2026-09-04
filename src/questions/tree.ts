/**
 * 问题树。全部题目、选项与「为什么必须问」照抄规格书
 * round2 §4.1–§4.7 与 round3 §3（A15 分支）。
 *
 * **不得新增规格书之外的问题。** 需要新问题时写进 docs/open-questions.md。
 *
 * 单次实际可见问题控制在 12–16 个（round2 §15.1），
 * 由 tests/questions.test.ts 对五条主要路径逐一验证。
 */

import { addOneCalendarMonth } from "../engine/calendar.js";
import type { Answers, Question } from "./types.js";

const is = (a: Answers, id: string, ...values: string[]): boolean => {
  const v = a[id];
  return typeof v === "string" && values.includes(v);
};
const has = (a: Answers, id: string, ...values: string[]): boolean => {
  const v = a[id];
  return Array.isArray(v) && values.some((x) => v.includes(x));
};

/** 是否走「固定期限合同到期」路径。 */
const inExpiry = (a: Answers) => is(a, "G01", "FIXED_TERM_EXPIRY");
/** 是否走第四十条第三项路径。 */
const inArticle40 = (a: Answers) => is(a, "G01", "ARTICLE_40_3");
const inMutual = (a: Answers) => is(a, "G01", "MUTUAL_TERMINATION");
const inDeFacto = (a: Answers) => is(a, "G01", "DE_FACTO_TERMINATION");

/**
 * 是否进入主张与程序路径。
 * round2 §4.7：所有出现「违法解除或违法终止候选」的案件都要问。
 * 界面在结果生成前无法预知 Finding，故按路径形态近似判断 ——
 * 到期路径要求已表达续订意愿，40 条路径要求已生效。
 */
const inClaim = (a: Answers): boolean => {
  if (is(a, "G02", "NOT_YET_EFFECTIVE")) return false;
  if (inArticle40(a)) return true;
  if (inExpiry(a)) {
    return !is(a, "A12", "REFUSED") && !is(a, "A01", "INDEFINITE", "TASK_BASED");
  }
  return false;
};

export const QUESTIONS: Question[] = [
  /* ---------------- 全局 ---------------- */
  {
    id: "G01",
    section: "global",
    prompt: "公司这次正在做什么？",
    why: "决定进入合同到期、第四十条第三项、协商解除或事实解除路径，也决定整个规则集。",
    kind: "single",
    factPath: "operation.selected_shape",
    options: [
      { value: "FIXED_TERM_EXPIRY", label: "固定期限劳动合同到期，公司明确不续签或可能不续签" },
      { value: "ARTICLE_40_3", label: "公司以 AI 替代、团队缩编、岗位取消、业务调整等理由单方解除" },
      { value: "MUTUAL_TERMINATION", label: "公司提出协商解除，或要求我写个人辞职、签离职文件" },
      { value: "DE_FACTO_TERMINATION", label: "没有明确书面通知，但已经不让我工作、关闭权限、停发工资或要求离开" },
      { value: "UNCLEAR_DOCUMENT", label: "我收到了一份书面文件，但看不出它属于哪一种" },
    ],
  },
  {
    id: "G02",
    section: "global",
    prompt: "这次操作何时生效？",
    why: "区分事前证据窗口、解释二生效范围和仲裁时效。",
    kind: "single",
    factPath: "operation.effective_status",
    options: [
      { value: "NOT_YET_EFFECTIVE", label: "尚未生效" },
      { value: "EFFECTIVE", label: "已生效", requiresDate: true },
      { value: "DATE_UNKNOWN", label: "日期不确定" },
    ],
  },
  {
    id: "G03",
    section: "global",
    prompt: "主要劳动合同履行地在哪里？",
    why: "深圳协商延长合同超过六个月的规则与全国不同。",
    kind: "single",
    factPath: "scope.principal_place_of_performance",
    options: [
      { value: "CN-GD-SZ", label: "深圳" },
      { value: "CN-GD-OTHER", label: "广东其他城市" },
      { value: "CN-OTHER", label: "中国内地其他地区" },
      { value: "REMOTE_UNKNOWN", label: "远程办公且无法判断" },
    ],
  },
  {
    id: "G04",
    section: "global",
    prompt: "文件写的是哪一类理由？",
    why: "解除通知中写明的理由决定公司需要证明的法律路径；原文也进入 Case Export。",
    kind: "single",
    visibleWhen: (a) => is(a, "G01", "UNCLEAR_DOCUMENT"),
    options: [
      { value: "EXPIRY_NO_RENEWAL", label: "到期不续签" },
      { value: "OBJECTIVE_CHANGE", label: "客观情况重大变化" },
      { value: "MUTUAL_OR_RESIGNATION", label: "协商一致或个人辞职" },
      { value: "OTHER", label: "其他" },
    ],
  },

  /* ---------------- 到期路径 ---------------- */
  {
    id: "A01",
    section: "expiry",
    prompt: "现在到期的是哪种合同？",
    why: "只有固定期限合同才能直接进入本路径。",
    kind: "single",
    factPath: "contract.type",
    visibleWhen: inExpiry,
    options: [
      { value: "FIXED_TERM", label: "固定期限" },
      { value: "INDEFINITE", label: "无固定期限" },
      { value: "TASK_BASED", label: "以完成任务为期限" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A02",
    section: "expiry",
    prompt: "合同到期时是否存在依法可能需要续延的特殊情况？",
    why: "法定续延不能被误当成双方协商延长，也可能阻止正常到期终止。",
    kind: "single",
    factPath: "renewal.statutory_exception",
    visibleWhen: (a) => inExpiry(a) && is(a, "A01", "FIXED_TERM"),
    options: [
      { value: "NONE", label: "均无" },
      { value: "MEDICAL_OR_PREGNANCY", label: "医疗期、孕期产期哺乳期、职业病未体检、工伤、服务期、工会任期等" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A03",
    section: "expiry",
    prompt: "到这次到期前，你实际签过并履行过几份固定期限劳动合同？",
    why: "判断是否已经直接达到二次固定期限。",
    kind: "single",
    factPath: "contract.fixed_term_count",
    visibleWhen: (a) => inExpiry(a) && is(a, "A01", "FIXED_TERM"),
    options: [
      { value: "1", label: "一份" },
      { value: "2", label: "两份及以上" },
      { value: "MULTI_ENTITY", label: "不同主体多份" },
      { value: "UNKNOWN", label: "记不清" },
    ],
  },
  {
    id: "A04",
    section: "expiry",
    prompt: "原合同期限是否被双方协商向后延长过？",
    why: "对应《解释二》第十条第一项和深圳地方规则。",
    kind: "single",
    // 已实际签过两次的，视同规则不再影响合同次数结论，不必再问。
    visibleWhen: (a) =>
      inExpiry(a) && is(a, "A01", "FIXED_TERM") && !is(a, "A03", "2", "MULTI_ENTITY"),
    options: [
      { value: "YES", label: "是" },
      { value: "NO", label: "否" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A05",
    section: "expiry",
    prompt: "这次延长属于哪一种？",
    why: "法定续延与协商延长法律性质不同。",
    kind: "single",
    factPath: "contract.extension.nature",
    visibleWhen: (a) => is(a, "A04", "YES"),
    options: [
      { value: "NEGOTIATED", label: "双方自愿协商延长" },
      { value: "STATUTORY", label: "因医疗期等依法自动续延" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A06",
    section: "expiry",
    prompt: "填写原到期日及每次延长后的到期日",
    why: "用日历区间计算累计延长是否超过六个月或达到一年。日期只在本页面本地计算，不上传。",
    kind: "date-ranges",
    visibleWhen: (a) => is(a, "A05", "NEGOTIATED"),
  },
  {
    id: "A07",
    section: "expiry",
    prompt: "原合同中是否约定「到期自动续延」，且到期后确实继续履行？",
    why: "对应《解释二》第十条第二项。",
    kind: "single",
    visibleWhen: (a) =>
      inExpiry(a) &&
      is(a, "A01", "FIXED_TERM") &&
      !is(a, "A04", "YES") &&
      !is(a, "A03", "2", "MULTI_ENTITY"),
    options: [
      { value: "AGREED_AND_CONTINUED", label: "有约定并继续履行" },
      { value: "AGREED_NOT_CONTINUED", label: "有约定但未继续" },
      { value: "NONE", label: "没有" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A08",
    section: "expiry",
    prompt: "自动续延后的期限是否也已经届满？",
    why: "只有续延期限届满时才进入本次终止审查。",
    kind: "single",
    factPath: "contract.automatic_extension.extended_period_expired",
    visibleWhen: (a) => is(a, "A07", "AGREED_AND_CONTINUED"),
    options: [
      { value: "true", label: "是" },
      { value: "false", label: "尚未届满" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A09",
    section: "expiry",
    prompt: "连续工作期间，劳动合同签约主体是否被更换？",
    why: "对应《解释二》第十条第三项。",
    kind: "single",
    factPath: "contract.entity_change.occurred",
    visibleWhen: (a) => inExpiry(a) && is(a, "A01", "FIXED_TERM"),
    options: [
      { value: "true", label: "是" },
      { value: "false", label: "否" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A10",
    section: "expiry",
    prompt: "下列各项是否成立？（多选，请勾选成立的项）",
    why: "四项共同决定是否命中变换签约主体规则。部分成立时不直接命中。",
    kind: "multi",
    visibleWhen: (a) => is(a, "A09", "true"),
    options: [
      { value: "NOT_AT_EMPLOYEE_REQUEST", label: "并非我主动要求更换主体" },
      { value: "SAME_WORKPLACE", label: "工作场所基本相同" },
      { value: "SAME_ROLE", label: "岗位或核心职责基本相同" },
      { value: "MANAGEMENT_CONTINUED", label: "实际管理、考核或汇报关系持续" },
    ],
  },
  {
    id: "A11",
    section: "expiry",
    prompt: "是否存在其他可能为规避无固定期限合同而安排的做法？（多选）",
    why: "对应第十条第四项，但需要个案和诚信判断。",
    kind: "multi",
    factPath: "contract.avoidance_patterns",
    // 只在存在多段用工信号时才问：先辞职再重签必然产生两份合同，
    // 故 A03 >= 2 或主体变更已覆盖第十条第四项的典型情形。
    visibleWhen: (a) =>
      inExpiry(a) &&
      is(a, "A01", "FIXED_TERM") &&
      (is(a, "A03", "2", "MULTI_ENTITY", "UNKNOWN") || is(a, "A09", "true")),
    options: [
      { value: "RESIGN_THEN_IMMEDIATELY_RESIGN_CONTRACT", label: "被要求先个人辞职后立即重签" },
      { value: "NOMINAL_WORK_INTERRUPTION", label: "形式上短暂停工但实际工作连续" },
      { value: "REPEATED_CONTRACT_OR_ENTITY_RENAMING", label: "反复更换合同名称或主体但工作不变" },
      { value: "EMPLOYER_MENTIONED_AVOIDING_INDEFINITE_TERM", label: "公司明确提及避免无固定期限" },
      { value: "OTHER", label: "其他" },
    ],
    optional: true,
  },
  {
    id: "A12",
    section: "expiry",
    prompt: "在到期前或到期时，你是否明确表示愿意继续工作、续订合同？",
    why: "第十条只解决「第二次合同」，无固定期限订立义务还涉及劳动者续订意愿。",
    kind: "single",
    factPath: "renewal.employee_willingness",
    visibleWhen: (a) => inExpiry(a) && is(a, "A01", "FIXED_TERM"),
    options: [
      { value: "WRITTEN", label: "有书面表达" },
      { value: "ORAL", label: "只有口头表达" },
      { value: "NONE", label: "没有表达" },
      { value: "REFUSED", label: "明确拒绝续订" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A13",
    section: "expiry",
    prompt: "你是否明确要求「仍然只签固定期限合同」？",
    why: "劳动者主动要求固定期限是劳动合同法第十四条中的例外。",
    kind: "single",
    factPath: "renewal.employee_requested_fixed_term",
    visibleWhen: (a) => inExpiry(a) && is(a, "A12", "WRITTEN", "ORAL"),
    options: [
      { value: "true", label: "是" },
      { value: "false", label: "否" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A14",
    section: "expiry",
    prompt: "公司是否主张你存在以下情形？",
    why: "这些情形会影响应否订立无固定期限合同，但不在 v0.1 实质审查范围。",
    kind: "single",
    // 只在二次合同结构确实在场时才问 —— 这些排除事由只影响无固定期限订立义务。
    visibleWhen: (a) =>
      inExpiry(a) &&
      is(a, "A01", "FIXED_TERM") &&
      (is(a, "A03", "2", "MULTI_ENTITY") ||
        is(a, "A04", "YES") ||
        is(a, "A07", "AGREED_AND_CONTINUED") ||
        is(a, "A09", "true")),
    options: [
      { value: "NONE", label: "均无" },
      { value: "ARTICLE_39_SERIOUS_MISCONDUCT", label: "严重违纪等第三十九条情形" },
      { value: "ARTICLE_40_1_MEDICAL_PERIOD_EXPIRED", label: "医疗期满不能工作" },
      { value: "ARTICLE_40_2_INCOMPETENT", label: "经培训或调岗仍不能胜任" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A15",
    section: "expiry",
    prompt: "合同到期后是否继续实际工作？",
    why: "决定是否进入《解释二》第十一条，而不只是普通合同到期终止。",
    kind: "single",
    factPath: "post_expiry.actual_work_continued",
    visibleWhen: (a) => inExpiry(a) && is(a, "A01", "FIXED_TERM") && !is(a, "G02", "NOT_YET_EFFECTIVE"),
    options: [
      { value: "false", label: "没有，到期后即停止工作" },
      { value: "true", label: "有，仍然正常工作" },
      { value: "HANDOVER_ONLY", label: "有，但只工作了几天或处于交接状态" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A15.1",
    section: "expiry",
    prompt: "公司最早在什么时候明确表示不同意你继续工作或不同意续订？",
    why: "第十一条要求的是用人单位「未表示异议超过一个月」。公司先说不续签、之后仍持续安排工作，属于事实冲突，需专业复核。",
    kind: "single",
    visibleWhen: (a) => is(a, "A15", "true"),
    options: [
      { value: "BEFORE_EXPIRY", label: "合同到期前已经明确表示" },
      { value: "WITHIN_ONE_MONTH", label: "到期后一个月以内明确表示", requiresDate: true },
      { value: "AFTER_ONE_MONTH", label: "到期超过一个月后才明确表示", requiresDate: true },
      { value: "NEVER", label: "到现在仍未明确表示" },
      { value: "CONFLICTING", label: "公司说过不续签，但之后仍持续安排我工作" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "A15.2",
    section: "expiry",
    prompt: "到期后继续工作的状态是什么？（多选）",
    why: "改变「仍在用人单位工作」的证据状态，用于区分继续履行、短期交接与单方留守。",
    kind: "multi",
    // 只在状态确实含糊时才问。公司持续派活、发薪且从未表示异议的，
    // 这张清单问不出新东西。
    visibleWhen: (a) =>
      is(a, "A15", "HANDOVER_ONLY") || is(a, "A15.1", "CONFLICTING", "UNKNOWN"),
    options: [
      { value: "TASKS_ASSIGNED", label: "公司继续安排任务" },
      { value: "ATTENDANCE_REQUIRED", label: "公司继续要求考勤" },
      { value: "SALARY_PAID", label: "公司继续支付工资" },
      { value: "PERFORMANCE_MANAGED", label: "公司继续进行绩效或工作管理" },
      { value: "SYSTEM_ACCESS", label: "我继续使用公司账号和系统" },
      { value: "HANDOVER_ONLY", label: "只是处理离职交接，没有继续承担正常工作" },
      { value: "UNKNOWN", label: "以上都不确定" },
    ],
  },
  {
    id: "A15.4",
    section: "expiry",
    prompt: "现在的状态是什么？",
    why: "决定第十一条对应三种输出中的哪一种：原条件续订、原条件订立无固定期限，或后续解除的法律后果审查。",
    kind: "single",
    visibleWhen: (a) => is(a, "A15", "true"),
    options: [
      { value: "STILL_WORKING", label: "目前仍在继续工作" },
      { value: "WRITTEN_DISMISSAL", label: "公司后来书面通知我离开" },
      { value: "ORAL_DISMISSAL", label: "公司后来口头要求我离开或关闭权限" },
      { value: "SELF_RESIGNED", label: "我自己提出了离职" },
      { value: "ENDED_UNCLEAR", label: "已经不再工作，但无法确定是谁结束的" },
    ],
  },
  {
    id: "A15.5",
    section: "expiry",
    prompt: "公司后来结束劳动关系时写的理由是什么？",
    why: "第十一条不能单独判断后续解除是否成立，只能把案件推进为「劳动关系已续存，后来另有一次解除行为」。",
    kind: "single",
    visibleWhen: (a) => is(a, "A15.4", "WRITTEN_DISMISSAL", "ORAL_DISMISSAL"),
    options: [
      { value: "ORIGINAL_CONTRACT_EXPIRED", label: "原劳动合同早已到期" },
      { value: "OBJECTIVE_CHANGE", label: "客观情况发生重大变化" },
      { value: "SERIOUS_MISCONDUCT", label: "严重违纪" },
      { value: "INCOMPETENT", label: "不能胜任工作" },
      { value: "MUTUAL_OR_RESIGNATION", label: "协商解除或个人辞职" },
      { value: "NO_WRITTEN_REASON", label: "没有书面理由" },
      { value: "OTHER", label: "其他" },
    ],
  },
  {
    id: "A16",
    section: "expiry",
    prompt: "公司是否提出以维持或提高原条件续订，而你拒绝？",
    why: "决定普通到期终止是否存在经济补偿候选。",
    kind: "single",
    visibleWhen: (a) =>
      inExpiry(a) &&
      is(a, "A01", "FIXED_TERM") &&
      !is(a, "A03", "2", "MULTI_ENTITY") &&
      !is(a, "A05", "NEGOTIATED") &&
      !is(a, "A07", "AGREED_AND_CONTINUED") &&
      // 到期后继续工作的，已进入《解释二》第十一条，不再是普通到期终止
      !is(a, "A15", "true"),
    options: [
      { value: "OFFERED_AND_REFUSED", label: "是" },
      { value: "NOT_OFFERED", label: "没有提出" },
      { value: "OFFERED_WORSE_TERMS", label: "提出但降低条件" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },

  /* ---------------- 第四十条第三项路径 ---------------- */
  {
    id: "B01",
    section: "article40",
    prompt: "公司是否出具书面解除或终止文件？",
    why: "识别事实解除、正式解除及解除理由证据。",
    kind: "single",
    visibleWhen: inArticle40,
    options: [
      { value: "WRITTEN", label: "有" },
      { value: "ORAL_ONLY", label: "只有口头通知" },
      { value: "NONE", label: "没有" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "B02",
    section: "article40",
    prompt: "公司给出的理由首次出现在什么时候？",
    why: "公司当时使用的解除理由与事后补充理由不能被工具混为一谈。",
    kind: "single",
    visibleWhen: inArticle40,
    options: [
      { value: "AT_OR_BEFORE_TERMINATION", label: "解除前或解除通知中" },
      { value: "AFTER_TERMINATION", label: "解除后补充" },
      { value: "AFTER_ARBITRATION", label: "仲裁后首次提出" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "B02T",
    section: "article40",
    prompt: "公司给出的理由原文（可选）",
    why: "原文只进入 Case Export，本工具不解析自由文本，也不调用大模型判断。",
    kind: "text",
    placeholder: "粘贴解除通知中的理由原文。请勿粘贴与本人劳动关系无关的公司内部资料。",
    visibleWhen: inArticle40,
    optional: true,
  },
  {
    id: "B03",
    section: "article40",
    prompt: "公司理由最接近哪一类？",
    why: "区分内部经营决定与可能的外部客观事件。",
    kind: "single",
    factPath: "objective_change.cause_category",
    visibleWhen: inArticle40,
    options: [
      { value: "AI_AUTOMATION", label: "AI 或自动化替代" },
      { value: "INTERNAL_EFFICIENCY", label: "内部降本增效" },
      { value: "TEAM_REDUCTION", label: "团队缩编" },
      { value: "BUSINESS_LINE_CANCELLED", label: "公司主动取消业务线或部门" },
      { value: "EXTERNAL_POLICY_OR_FORCE", label: "外部政策、灾害、场地或其他公司控制外事件" },
      { value: "OTHER", label: "其他" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "B04",
    section: "article40",
    prompt: "原岗位对应的工作是否真的停止？",
    why: "判断劳动合同是否达到「无法履行」，而非仅岗位名称变化。",
    kind: "single",
    factPath: "objective_change.original_work_continues",
    visibleWhen: inArticle40,
    options: [
      { value: "FULLY_STOPPED", label: "完全停止" },
      { value: "BY_COLLEAGUES", label: "仍由同事承担" },
      { value: "BY_NEW_HIRES", label: "由新员工承担" },
      { value: "BY_OUTSOURCING", label: "由外包承担" },
      { value: "BY_COLLEAGUES_AND_AI", label: "由 AI 与其他人员共同承担" },
      { value: "PARTIALLY_STOPPED", label: "部分停止" },
      { value: "UNKNOWN", label: "不清楚" },
    ],
  },
  {
    id: "B06",
    section: "article40",
    prompt: "解除前，公司与你谈过什么？",
    why: "区分离职协商和劳动合同变更协商。",
    kind: "single",
    factPath: "objective_change.consultation_type",
    visibleWhen: inArticle40,
    options: [
      { value: "NONE", label: "没有谈" },
      { value: "SEVERANCE_ONLY", label: "只谈补偿与离职日期" },
      { value: "SELF_SERVE_JOB_BOARD_ONLY", label: "只让我自己看内部招聘" },
      { value: "CONCRETE_POSITION_OFFERED", label: "提出过具体岗位" },
      { value: "TRAINING_OR_TRANSITION_OFFERED", label: "提出过培训或技能转型方案" },
      { value: "MULTIPLE", label: "多项并存" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "B07",
    section: "article40",
    prompt: "如果提出过岗位，是否同时说清楚了岗位名称、核心职责、工资待遇、工作地点和生效时间？",
    why: "没有关键条款的「岗位机会」难以判断为真实具体的变更方案。",
    kind: "single",
    factPath: "objective_change.concrete_offer_terms_complete",
    visibleWhen: (a) => inArticle40(a),
    options: [
      { value: "true", label: "全部说清楚了" },
      { value: "false", label: "信息严重不足，或根本没有提出岗位" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "B08",
    section: "article40",
    prompt: "新方案相较原合同存在哪些变化？（多选）",
    why: "影响协商方案的真实性和合理性。法律没有可机械适用的固定降薪比例。",
    kind: "multi",
    factPath: "objective_change.adverse_changes",
    visibleWhen: (a) => is(a, "B07", "true"),
    options: [
      { value: "SIGNIFICANT_PAY_CUT", label: "明显降薪" },
      { value: "SIGNIFICANT_LEVEL_DEMOTION", label: "职级明显降低" },
      { value: "CROSS_CITY_OR_COMMUTE_INCREASE", label: "跨城市或显著增加通勤" },
      { value: "SKILL_MISMATCH", label: "核心技能完全不匹配" },
      { value: "SUBSTANTIALLY_EQUIVALENT", label: "基本相当" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "B09",
    section: "article40",
    prompt: "你对具体方案的反应是？",
    why: "判断是否真的「协商未果」。",
    kind: "single",
    factPath: "objective_change.employee_response",
    visibleWhen: inArticle40,
    options: [
      { value: "ACCEPTED", label: "接受" },
      { value: "REFUSED_WITH_REASONS", label: "拒绝并说明理由" },
      { value: "PROPOSED_ALTERNATIVE", label: "提出替代方案" },
      { value: "NO_OPPORTUNITY", label: "尚未获得回应机会" },
      { value: "TERMINATED_BEFORE_RESPONSE", label: "公司在我回应前已经解除" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "B10",
    section: "article40",
    prompt: "公司是否提前 30 日书面通知，或额外支付一个月工资？",
    why: "第四十条的通知或代通知金条件。",
    kind: "single",
    factPath: "objective_change.notice_or_one_month_pay",
    visibleWhen: inArticle40,
    options: [
      { value: "THIRTY_DAYS_WRITTEN_NOTICE", label: "提前 30 日书面通知" },
      { value: "ONE_MONTH_PAY_IN_LIEU", label: "额外支付一个月工资" },
      { value: "NEITHER", label: "两者均无" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },

  /* ---------------- 协商解除路径 ---------------- */
  {
    id: "M01",
    section: "mutual",
    prompt: "谁先提出结束劳动关系？",
    why: "区分公司提出协商解除和个人主动辞职。",
    kind: "single",
    visibleWhen: inMutual,
    options: [
      { value: "EMPLOYER", label: "公司" },
      { value: "EMPLOYEE", label: "我本人" },
      { value: "BOTH", label: "双方同时" },
      { value: "UNKNOWN", label: "不清楚" },
    ],
  },
  {
    id: "M02",
    section: "mutual",
    prompt: "目前签署或提交过什么？",
    why: "签收、协商解除和个人辞职的法律含义不同。签署后本工具停止自动判断。",
    kind: "single",
    visibleWhen: inMutual,
    options: [
      { value: "NOTHING", label: "什么都没签" },
      { value: "DRAFT_ONLY", label: "只收到草案" },
      { value: "ACKNOWLEDGED_RECEIPT", label: "只在通知上签收" },
      { value: "SIGNED_AGREEMENT", label: "签了协商解除协议" },
      { value: "SUBMITTED_RESIGNATION", label: "写了或提交个人辞职" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "M03",
    section: "mutual",
    prompt: "公司是否要求你在文件中写「个人原因」「自愿辞职」或「双方再无争议」？",
    why: "这是用户最容易把公司操作改写成个人行为的节点。",
    kind: "single",
    visibleWhen: inMutual,
    options: [
      { value: "true", label: "是" },
      { value: "false", label: "否" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },

  /* ---------------- 事实解除路径 ---------------- */
  {
    id: "D01",
    section: "defacto",
    prompt: "公司是否明确说过「你已被解除」「不用再来」「公司不再提供工作」？",
    why: "明确拒绝用工是事实解除的重要信号。",
    kind: "single",
    visibleWhen: inDeFacto,
    options: [
      { value: "WRITTEN", label: "书面说过" },
      { value: "ORAL", label: "口头说过" },
      { value: "NONE", label: "没有" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "D02",
    section: "defacto",
    prompt: "已发生哪些行为？（多选）",
    why: "单一管理动作未必构成解除，多项组合才形成候选。",
    kind: "multi",
    visibleWhen: inDeFacto,
    options: [
      { value: "ACCOUNT_DISABLED", label: "关闭工作账号" },
      { value: "BADGE_REVOKED", label: "撤销门禁" },
      { value: "REMOVED_FROM_GROUPS", label: "移出项目和工作群" },
      { value: "NO_WORK_ASSIGNED", label: "停止安排工作" },
      { value: "ACCESS_DENIED", label: "拒绝进入办公地点" },
      { value: "SALARY_STOPPED", label: "停发工资" },
      { value: "EQUIPMENT_RECALLED", label: "要求交还设备" },
      { value: "OTHER", label: "其他" },
    ],
  },
  {
    id: "D03",
    section: "defacto",
    prompt: "你是否书面表示仍愿意正常工作、要求公司安排工作？",
    why: "区分公司拒绝用工与劳动者自行不到岗或默认离开。",
    kind: "single",
    visibleWhen: inDeFacto,
    options: [
      { value: "WRITTEN", label: "有" },
      { value: "ORAL", label: "只有口头表达" },
      { value: "NONE", label: "没有" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "D04",
    section: "defacto",
    prompt: "公司是否仍要求你考勤、汇报或待命？",
    why: "判断劳动关系是否事实上仍在履行。",
    kind: "single",
    visibleWhen: inDeFacto,
    options: [
      { value: "true", label: "是" },
      { value: "false", label: "否" },
      { value: "PARTIAL", label: "部分" },
      { value: "UNKNOWN", label: "不清楚" },
    ],
  },

  /* ---------------- 主张与程序路径 ---------------- */
  {
    id: "P01",
    section: "claim",
    prompt: "是否已经提交劳动仲裁？",
    why: "决定主张是否仍有充分调整空间。",
    kind: "single",
    factPath: "procedure.arbitration_filed",
    visibleWhen: inClaim,
    options: [
      { value: "NOT_FILED", label: "尚未" },
      { value: "FILED_NO_HEARING", label: "已提交但未开庭" },
      { value: "HEARD_NO_AWARD", label: "已开庭未裁决" },
      { value: "AWARD_RECEIVED", label: "已收到裁决" },
      { value: "IN_COURT", label: "已进入一审或二审" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "P02",
    section: "claim",
    prompt: "你的真实目标是什么？",
    why: "劳动合同法第四十八条是两条替代性路径，必须先选方向，不能同时累加。",
    kind: "single",
    factPath: "procedure.preferred_remedy",
    visibleWhen: inClaim,
    options: [
      { value: "CONTINUE_PERFORMANCE", label: "希望回原单位继续工作" },
      { value: "DAMAGES", label: "不想回去，希望获得赔偿" },
      { value: "UNDECIDED", label: "尚未决定" },
    ],
  },
  {
    id: "P03",
    section: "claim",
    prompt: "是否存在下列情况？",
    why: "判断继续履行是否可能已客观不能实现。",
    kind: "single",
    factPath: "procedure.continued_performance_impossible",
    visibleWhen: (a) => inClaim(a) && is(a, "P02", "CONTINUE_PERFORMANCE"),
    options: [
      { value: "false", label: "均无" },
      { value: "true", label: "公司破产或解散、已领取养老待遇、已建立严重冲突的新劳动关系、原合同已届满且无续订权利，或其他客观不能履行" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
  {
    id: "P04",
    section: "claim",
    prompt: "已提交的核心请求是什么？",
    why: "检查现有诉请是否与当前定性和真实目标一致。",
    kind: "single",
    factPath: "procedure.current_claim",
    visibleWhen: (a) => inClaim(a) && !is(a, "P01", "NOT_FILED", "UNKNOWN"),
    options: [
      { value: "CONTINUE_PERFORMANCE", label: "继续履行" },
      { value: "DAMAGES", label: "违法解除/终止赔偿金" },
      { value: "SEVERANCE_ONLY", label: "经济补偿" },
      { value: "DECLARATION_ONLY", label: "只要求确认违法" },
      { value: "OTHER", label: "其他" },
      { value: "UNKNOWN", label: "记不清" },
    ],
  },
  {
    id: "P07",
    section: "claim",
    prompt: "解除或终止后，期间是否有书面向公司主张权利、向有关部门请求救济，或者公司书面同意履行？",
    why: "可能导致仲裁时效中断、重新计算。本工具不会因为你曾经口头沟通过就自动认定中断。",
    kind: "single",
    factPath: "procedure.limitation_interruption_events",
    // 只在时效可能成为问题时才问：解除已满十个日历月以上。
    // 上个月刚被解除的人不需要回答中断事由，那只是噪音。
    visibleWhen: (a) => inClaim(a) && is(a, "G02", "EFFECTIVE") && limitationNear(a),
    options: [
      { value: "WRITTEN_CLAIM_OR_AGENCY_OR_EMPLOYER_CONSENT", label: "有" },
      { value: "NONE", label: "没有" },
      { value: "UNKNOWN", label: "不确定" },
    ],
  },
];

/**
 * 解除或终止是否已满十个日历月 —— 时效开始值得追问的时点。
 * 十个月按日历月推算，与规则层同一套算法，不用 300 天之类的近似。
 */
function limitationNear(a: Answers): boolean {
  const d = a["G02__date"];
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  let threshold = d;
  for (let i = 0; i < 10; i += 1) threshold = addOneCalendarMonth(threshold);
  return new Date().toISOString().slice(0, 10) >= threshold;
}

/** 当前答案下实际可见的问题。 */
export function visibleQuestions(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => !q.visibleWhen || q.visibleWhen(answers));
}

export { has, is };
