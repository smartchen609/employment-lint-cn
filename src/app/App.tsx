import { useMemo, useState } from "react";
import { evaluateAllApplicableRules } from "../engine/evaluate.js";
import { resolveResult } from "../findings/resolve.js";
import { buildFacts } from "../questions/build-facts.js";
import { pruneAnswers, visibleQuestions } from "../questions/tree.js";
import type { Answers } from "../questions/types.js";
import { buildCaseExport } from "../export/case-export.js";
import { ALL_TEMPLATES, EVIDENCE, RULES } from "./data.js";
import { Intro } from "./Intro.js";
import { QuestionView } from "./QuestionView.js";
import { ResultView } from "./ResultView.js";
import { ExportView } from "./ExportView.js";

/**
 * 应用主体。
 *
 * **答案只存 React state。** 没有 localStorage、没有 sessionStorage、
 * 没有 Cookie、没有任何网络请求。刷新即清空 —— 这是产品承诺的一部分，
 * 由 tests/guard-privacy.test.ts 守住。CLAUDE.md §P1 §P2。
 *
 * 状态机很小，一个 useState 足够，不需要 reducer 更不需要状态管理框架。
 */

type Stage = "intro" | "questions" | "result" | "export";

export function App(): React.JSX.Element {
  const [stage, setStage] = useState<Stage>("intro");
  const [rawAnswers, setAnswers] = useState<Answers>({});
  const [cursor, setCursor] = useState(0);

  /**
   * 界面一律基于剪枝后的答案渲染：改了前面的答案之后，
   * 已失效的选项不得仍然显示为选中状态。
   */
  const answers = useMemo(() => pruneAnswers(rawAnswers), [rawAnswers]);
  const questions = useMemo(() => visibleQuestions(answers), [answers]);

  const evaluation = useMemo(() => {
    if (stage !== "result" && stage !== "export") return null;
    const facts = buildFacts(answers);
    const engine = evaluateAllApplicableRules(facts, RULES);
    const resolved = resolveResult(engine, answers, ALL_TEMPLATES, EVIDENCE.checklists);
    return { engine, resolved };
  }, [stage, answers]);

  const markdown = useMemo(() => {
    if (!evaluation) return "";
    return buildCaseExport({
      answers,
      engine: evaluation.engine,
      resolved: evaluation.resolved,
      generatedAt: new Date().toISOString(),
    });
  }, [evaluation, answers]);

  const onAnswer = (id: string, value: Answers[string]): void => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const restart = (): void => {
    setAnswers({});
    setCursor(0);
    setStage("intro");
  };

  if (stage === "intro") {
    return (
      <Shell>
        <Intro onStart={() => setStage("questions")} />
      </Shell>
    );
  }

  if (stage === "questions") {
    const index = Math.min(cursor, questions.length - 1);
    const q = questions[index];
    if (!q) {
      return (
        <Shell>
          <p>没有可显示的问题。</p>
        </Shell>
      );
    }
    const answered = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "";
    const canAdvance = answered || q.optional === true;
    const isLast = index >= questions.length - 1;

    return (
      <Shell>
        <QuestionView
          question={q}
          answers={answers}
          answeredCount={
            questions.filter((x) => {
              const v = answers[x.id];
              return v !== undefined && v !== null && v !== "";
            }).length
          }
          onAnswer={onAnswer}
        />
        <div className="nav">
          <button type="button" disabled={index === 0} onClick={() => setCursor(index - 1)}>
            上一题
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canAdvance}
            onClick={() => (isLast ? setStage("result") : setCursor(index + 1))}
          >
            {isLast ? "查看结果" : "下一题"}
          </button>
        </div>
        {!canAdvance && <p className="note">请先作答。若确实不清楚，请选择「不确定」。</p>}
      </Shell>
    );
  }

  if (stage === "export") {
    return (
      <Shell>
        <ExportView markdown={markdown} onBack={() => setStage("result")} />
      </Shell>
    );
  }

  return (
    <Shell>
      <ResultView
        resolved={evaluation?.resolved ?? null}
        engine={evaluation?.engine ?? { findings: [], firedRuleIds: [], complexity: "NORMAL", complexityTriggers: [] }}
        onRestart={restart}
        onExport={() => setStage("export")}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="shell">
      <main>{children}</main>
      <footer>
        <p>
          Employment Lint CN · 这是一个 linter，不是判决器。
          它不会判断你一定能赢，也不会计算或承诺 2N。
        </p>
        <p className="note">答案只保存在当前页面状态中，刷新即清空。</p>
      </footer>
    </div>
  );
}
