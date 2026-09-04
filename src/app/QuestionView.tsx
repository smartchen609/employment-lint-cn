import { useState } from "react";
import type { Answers, Question } from "../questions/types.js";

/**
 * 单个问题的渲染。手机端优先：选项是整块可点区域，不是小圆点。
 *
 * 「为什么必须问」默认折叠 —— 规格书给每道题都写了理由，
 * 全部展开会把 12–16 题变成一堵墙。
 */

interface Props {
  question: Question;
  answers: Answers;
  index: number;
  total: number;
  onAnswer: (id: string, value: Answers[string]) => void;
}

export function QuestionView({ question: q, answers, index, total, onAnswer }: Props): React.JSX.Element {
  const [showWhy, setShowWhy] = useState(false);
  const value = answers[q.id];
  const dateKey = `${q.id}__date`;

  return (
    <section className="question" aria-labelledby={`q-${q.id}`}>
      <div className="question-meta">
        <span className="qid">{q.id}</span>
        <span className="progress">
          第 {index + 1} / {total} 题
        </span>
      </div>

      <h2 id={`q-${q.id}`}>{q.prompt}</h2>

      {q.why && (
        <div className="why">
          <button type="button" className="link" onClick={() => setShowWhy((s) => !s)}>
            {showWhy ? "收起" : "为什么必须问这一题"}
          </button>
          {showWhy && <p>{q.why}</p>}
        </div>
      )}

      {q.kind === "single" && (
        <div className="options" role="radiogroup" aria-labelledby={`q-${q.id}`}>
          {q.options?.map((o) => {
            const selected = value === o.value;
            return (
              <div key={o.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
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
        <div className="options">
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
