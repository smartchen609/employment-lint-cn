/**
 * 突变测试：故意改坏东西，看测试套件抓不抓得到。
 *
 * ## 为什么需要它
 *
 * 340 条测试听起来很多，但数量说明不了任何事。
 * 真正要回答的是：**如果有人把一条规则改错了，测试会失败吗？**
 *
 * 一个不会失败的测试套件比没有测试更糟 —— 它给人虚假的安全感，
 * 而这个项目的全部价值就建立在"规则可核、测试可复现"上。
 *
 * 每个突变都是一处**真实可能发生的错误**：写错阈值、抄错日期、
 * 把日历月改成 30 天、漏掉并行检测、让案例规则覆盖法条。
 * 如果某个突变活了下来（测试仍然全绿），那就是一个真实的护栏缺口。
 *
 * 用法：npm run test:mutation
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

interface Mutant {
  name: string;
  file: string;
  from: string;
  to: string;
  /** 这个突变模拟的是哪一类真实错误。 */
  why: string;
}

const MUTANTS: Mutant[] = [
  {
    name: "深圳阈值 6 → 12",
    file: "rules/shenzhen/contract-extension.yml",
    from: 'operator: "greater_than"\n      value: 6',
    to: 'operator: "greater_than"\n      value: 12',
    why: "把地方规则的阈值抄成了全国标准",
  },
  {
    name: "深圳施行日改回修正决定通过日",
    file: "rules/shenzhen/contract-extension.yml",
    from: 'from: "2008-11-01"',
    to: 'from: "2019-04-24"',
    why: "round3 §0 专门警告过的那个错误",
  },
  {
    name: "全国阈值 12 → 6",
    file: "rules/national/fixed-term/spc-labor-ii-10-1.yml",
    from: 'value: 12',
    to: 'value: 6',
    why: "全国与地方阈值写反",
  },
  {
    name: "日历月改成 30 天",
    file: "src/engine/calendar.ts",
    from: "  const threshold = addOneCalendarMonth(startDate);",
    to: "  const d = new Date(startDate + 'T00:00:00Z');\n  d.setUTCDate(d.getUTCDate() + 30);\n  const threshold = d.toISOString().slice(0, 10);",
    why: "CLAUDE.md §E4 明令禁止的实现方式",
  },
  {
    name: "月末溢出取下月 1 日而非月末",
    file: "src/engine/calendar.ts",
    from: "d: Math.min(d, daysInMonth(ny, nm))",
    to: "d",
    why: "民法典第二百零二条「没有对应日的，月末日为最后一日」被漏掉",
  },
  {
    name: "引擎命中一条就返回",
    file: "src/engine/evaluate.ts",
    from: "    // 注意：这里**没有** break / return。多 Finding 并行是本引擎的核心语义。",
    to: "    break;",
    why: "round2 §5、round3 §4 的核心语义被破坏",
  },
  {
    name: "不确定性取较低者而非较高者",
    file: "src/engine/evaluate.ts",
    from: "  return UNCERTAINTY_ORDER.indexOf(a) >= UNCERTAINTY_ORDER.indexOf(b) ? a : b;",
    to: "  return UNCERTAINTY_ORDER.indexOf(a) <= UNCERTAINTY_ORDER.indexOf(b) ? a : b;",
    why: "round2 §6.2 要求取较高者",
  },
  {
    name: "缺失事实判为成立",
    file: "src/engine/conditions.ts",
    from: '    case "equals":\n      return actual === expected;',
    to: '    case "equals":\n      return actual === undefined || actual === expected;',
    why: "缺失信息被当成条件成立，会替用户凭空断言定性",
  },
  {
    name: "陈旧答案不剪枝",
    file: "src/questions/build-facts.ts",
    from: "  const answers = pruneAnswers(rawAnswers, options.questions);",
    to: "  const answers = rawAnswers;",
    why: "用户看不到的答案仍然驱动规则",
  },
  {
    name: "文案混进禁止表达",
    file: "rules/copy/claim-paths.yml",
    from: "你尚未决定是否希望恢复劳动关系。",
    to: "你尚未决定是否希望恢复劳动关系，不过这个案子基本稳了。",
    why: "round2 §6.5 禁止的承诺式表达",
  },
  {
    name: "源码引入 localStorage",
    file: "src/engine/facts.ts",
    from: "export type Facts = Record<string, unknown>;",
    to: "export type Facts = Record<string, unknown>;\nexport const cache = () => localStorage.getItem('answers');",
    why: "违反「答案只存内存」的产品承诺",
  },
  {
    name: "冲突检测被关掉",
    file: "src/findings/resolve.ts",
    from: "export function detectConflicts(a: Answers): string[] {\n  const out: string[] = [];",
    to: "export function detectConflicts(a: Answers): string[] {\n  const out: string[] = [];\n  if (a) return out;",
    why: "答案互相矛盾时不再提示，用户会拿到一个基于矛盾事实的结论",
  },
  {
    name: "律师复核问题清单变成空",
    file: "src/export/case-export.ts",
    from: "  qs.push(\"是否存在尚未识别的程序或时效问题？\");",
    to: "  qs.length = 0;",
    why: "Case Export 里对接收律师最有用的一节被清空",
  },
  {
    name: "未作答时按上键落到越界索引",
    file: "src/app/radio-navigation.ts",
    from: "  if (currentIndex < 0) return forward ? 0 : length - 1;",
    to: "  if (currentIndex < 0) return forward ? 0 : -2;",
    why: "键盘用户按上键时选项消失，是最典型的 a11y 回归",
  },
  {
    name: "漫游 tabindex 全部可聚焦",
    file: "src/app/radio-navigation.ts",
    from: "  if (selectedIndex < 0) return optionIndex === 0 ? 0 : -1;\n  return optionIndex === selectedIndex ? 0 : -1;",
    to: "  return selectedIndex >= 0 || optionIndex >= 0 ? 0 : -1;",
    why: "Tab 会逐个走完组内每一项，违反 radiogroup 约定",
  },
  {
    name: "来源自称已核验但无记录",
    file: "sources.yml",
    from: '    page_opened_and_checked: true\n    last_verified_at: "2026-09-04"\n    verified_by: "apangchen"\n    status: "active"\n    note: >\n      URL 抄自 round2 脚注 [3]。',
    to: '    page_opened_and_checked: true\n    last_verified_at: ""\n    verified_by: ""\n    status: "active"\n    note: >\n      URL 抄自 round2 脚注 [3]。',
    why: "核验状态与核验记录脱节",
  },
  {
    name: "引擎不再跳过草稿规则",
    file: "src/engine/evaluate.ts",
    from: '    if (rule.status !== "active") continue;',
    to: '    if (rule.status === "deprecated") continue;',
    why: "维护人未确认的草稿规则会在线上命中",
  },
  {
    name: "来源文号与汇编文件对不上",
    file: "sources.yml",
    from: "（粤高法〔2012〕284号）",
    to: "（粤高法发〔2018〕2号）",
    why: "来源页把 2012 年纪要标成 2018 年文件（2026-09-16 实际发生过）",
  },
];

function run(): boolean {
  try {
    execSync("npx vitest run --silent", { cwd: ROOT, stdio: "pipe" });
    return true; // 全绿
  } catch {
    return false; // 有失败
  }
}

console.log("── mutation-test ──");
console.log("  先确认基线是绿的…");
if (!run()) {
  console.error("  ✗ 基线测试就没通过，先修好再跑突变测试。");
  process.exit(1);
}
console.log(`  基线通过。开始注入 ${MUTANTS.length} 个突变。\n`);

const survivors: Mutant[] = [];

for (const m of MUTANTS) {
  const path = join(ROOT, m.file);
  const original = readFileSync(path, "utf8");
  if (!original.includes(m.from)) {
    console.error(`  ? ${m.name} —— 突变点已失效（源码变了），请更新 scripts/mutation-test.ts`);
    survivors.push(m);
    continue;
  }
  writeFileSync(path, original.replace(m.from, m.to));
  const stillGreen = run();
  writeFileSync(path, original);

  if (stillGreen) {
    console.log(`  ✗ 存活  ${m.name}`);
    console.log(`          ${m.why}`);
    survivors.push(m);
  } else {
    console.log(`  ✓ 被抓  ${m.name}`);
  }
}

const killed = MUTANTS.length - survivors.length;
console.log(`\n  ${killed}/${MUTANTS.length} 个突变被测试套件抓到`);

if (survivors.length > 0) {
  console.error("\n存活的突变意味着真实的护栏缺口：");
  for (const s of survivors) console.error(`  · ${s.name} —— ${s.why}`);
  process.exit(1);
}
console.log("  所有突变都被抓到。测试套件是有牙的。");
