import { useEffect, useRef, useState } from "react";
import type { Answers, Question } from "../questions/types.js";
import { isRadioNavKey, nextRadioIndex, rovingTabIndex } from "./radio-navigation.js";

/**
 * 单个问题的渲染。手机端优先：选项是整块可点区域，不是小圆点。
 *
 * 「为什么必须问」默认折叠 —— 规格书给每道题都写了理由，
 * 全部展开会把 12–16 题变成一堵墙。
 */

interface Props {
  question: Question;
  answers: Answers;
  /** 当前可见问题中已作答的数量。 */
  answeredCount: number;
  onAnswer: (id: string, value: Answers[string]) => void;
}

export function QuestionView({
  question: q,
  answers,
  answeredCount,
  onAnswer,
}: Props): React.JSX.Element {
  const [showWhy, setShowWhy] = useState(false);
  const value = answers[q.id];
  const dateKey = `${q.id}__date`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  /**
   * 换题后把焦点移到题干上。
   *
   * 不移焦点的话，读屏用户点完「下一题」还停在按钮上，
   * 完全不知道页面已经换了内容；键盘用户则要从头 Tab 一遍。
   */
  useEffect(() => {
    headingRef.current?.focus();
  }, [q.id]);

  /**
   * radiogroup 的方向键导航。
   *
   * ARIA 规范里 radiogroup 内部靠方向键移动并选中，Tab 只在组之间跳。
   * 之前只写了 role 没写键盘行为 —— 那比不写 role 更糟，
   * 因为读屏会按 radiogroup 的规则提示用户按方向键，而按了没反应。
   */
  const onGroupKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const options = q.options;
    if (!options || options.length === 0) return;
    if (!isRadioNavKey(e.key)) return;
    e.preventDefault();

    const currentIndex = options.findIndex((o) => o.value === value);
    const nextIndex = nextRadioIndex(currentIndex, e.key, options.length);
    const next = options[nextIndex];
    if (!next) return;
    onAnswer(q.id, next.value);

    // 选中后把焦点跟过去，符合 radiogroup 的漫游 tabindex 约定
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  };

  return (
    <section className="question" aria-labelledby={`q-${q.id}`}>
      <div className="question-meta">
        <span className="qid">{q.id}</span>
        {/*
          不显示「第 N / M 题」。
          问题树按答案动态展开，分母会随作答跳变（1/3 → 1/16），
          读起来像是进度在倒退。显示已答题数更诚实：
          它只增不减，也不假装我们知道还剩几题。
        */}
        <span className="progress">已回答 {answeredCount} 题</span>
      </div>

      <h2 id={`q-${q.id}`} ref={headingRef} tabIndex={-1}>
        {q.prompt}
      </h2>

      {q.why && (
        <div className="why">
          <button type="button" className="link" onClick={() => setShowWhy((s) => !s)}>
            {showWhy ? "收起" : "为什么必须问这一题"}
          </button>
          {showWhy && <p>{q.why}</p>}
        </div>
      )}

      {q.kind === "single" && (
        <div
          className="options"
          role="radiogroup"
          aria-labelledby={`q-${q.id}`}
          ref={groupRef}
          onKeyDown={onGroupKeyDown}
        >
          {q.options?.map((o, i) => {
            const selected = value === o.value;
            const roving = rovingTabIndex(
              i,
              q.options!.findIndex((x) => x.value === value),
            );
            return (
              <div key={o.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={roving}
                  className={selected ? "option selected" : "option"}
                  onClick={() => onAnswer(q.id, o.value)}
                >
                  {o.label}
                </button>
                {selected && o.requiresDate && (
                  <label className="date-inline">
                    日期
                    <input
                      type="date"
                      value={typeof answers[dateKey] === "string" ? (answers[dateKey] as string) : ""}
                      onChange={(e) => onAnswer(dateKey, e.target.value)}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      {q.kind === "multi" && (
        <div className="options" role="group" aria-labelledby={`q-${q.id}`}>
          {q.options?.map((o) => {
            const list = Array.isArray(value) ? value : [];
            const selected = list.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={selected}
                className={selected ? "option selected" : "option"}
                onClick={() =>
                  onAnswer(
                    q.id,
                    selected ? list.filter((x) => x !== o.value) : [...list, o.value],
                  )
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "text" && (
        <textarea
          className="text-input"
          rows={5}
          placeholder={q.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onAnswer(q.id, e.target.value)}
        />
      )}

      {q.kind === "date-ranges" && (
        <DateRanges
          value={Array.isArray(value) ? (value as unknown as Range[]) : []}
          onChange={(next) => onAnswer(q.id, next as unknown as Answers[string])}
        />
      )}
    </section>
  );
}

interface Range {
  from: string;
  to: string;
}

/** A06：原到期日与每次延长后的到期日。日期只在本页面本地计算。 */
function DateRanges({
  value,
  onChange,
}: {
  value: Range[];
  onChange: (next: Range[]) => void;
}): React.JSX.Element {
  const rows = value.length > 0 ? value : [{ from: "", to: "" }];
  const update = (i: number, patch: Partial<Range>): void => {
    const next = rows.map((r, j) => (i === j ? { ...r, ...patch } : r));
    onChange(next);
  };
  return (
    <div className="date-ranges">
      {rows.map((r, i) => (
        <div className="range-row" key={i}>
          <label>
            起<input type="date" value={r.from} onChange={(e) => update(i, { from: e.target.value })} />
          </label>
          <label>
            至<input type="date" value={r.to} onChange={(e) => update(i, { to: e.target.value })} />
          </label>
        </div>
      ))}
      <button type="button" className="link" onClick={() => onChange([...rows, { from: "", to: "" }])}>
        再加一段延长
      </button>
      <p className="note">期间按《民法典》第二百零二条的日历月计算，不是按 30 天。</p>
    </div>
  );
}
