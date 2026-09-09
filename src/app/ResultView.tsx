import { useState } from "react";
import type { EndpointTemplate } from "../schema/copy.js";
import type { EngineResult, Finding } from "../engine/evaluate.js";
import type { ResolvedResult } from "../findings/resolve.js";
import { RULES } from "./data.js";
import { Feedback } from "./Feedback.js";

/**
 * 结果页。round2 §1甲：
 * 第一屏只出现**一条**最高优先级 Warning，下面最多再显示三条次级。
 *
 * 不出现全局 PASS，不出现绿色通过状态，不输出任何金额。
 */

const UNCERTAINTY_LABEL: Record<string, string> = {
  deterministic: "D · 可计算",
  "rule-based": "R · 规则命中",
  "fact-sensitive": "F · 依赖个案事实",
  "judicial-discretion": "J · 存在裁量",
};

const SEVERITY_LABEL: Record<string, string> = {
  blocker: "BLOCKER",
  error: "ERROR",
  warning: "WARNING",
  info: "INFO",
};

export function ResultView({
  resolved,
  engine,
  onRestart,
  onExport,
}: {
  resolved: ResolvedResult | null;
  engine: EngineResult;
  onRestart: () => void;
  onExport: () => void;
}): React.JSX.Element {
  if (!resolved) {
    return (
      <section className="result">
        <h1>当前无法形成可靠候选</h1>
        <p>
          本次问答没有形成足以显示的定性候选。这通常意味着关键事实缺失，
          而不是「没有问题」。请补齐合同历史、续订意愿和解除通知后重新运行。
        </p>
        <button type="button" className="primary" onClick={onRestart}>
          重新开始
        </button>
      </section>
    );
  }

  return (
    <section className="result">
      <p className="disclaimer-top">
        以下是本工具在其覆盖规则内发现的问题。它不是裁判结论，也不是法律意见；
        未命中规则不等于解除没有问题。
      </p>

      <div className="primary-warning">
        <div className="badge-row">
          <span className="endpoint-id">{resolved.primary.id}</span>
          <span className="label">最高优先级</span>
        </div>
        <h1>你现在最不该做</h1>
        <p className="warning-text">{resolved.primary.primary_warning.trim()}</p>
      </div>

      {resolved.secondary.length > 0 && (
        <div className="secondary-warnings">
          <h2>此外还要注意</h2>
          <ul>
            {resolved.secondary.map((t) => (
              <li key={t.id}>
                <span className="endpoint-id">{t.id}</span>
                {t.primary_warning.trim()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolved.conflicts.length > 0 && (
        <div className="conflicts">
          <h2>你的答案中存在冲突</h2>
          <p className="note">
            以下事实互相矛盾，会直接影响定性。在补齐之前，下面的候选都可能是错的。
          </p>
          <ul>
            {resolved.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="section-title">定性候选</h2>
      <p className="note">可以同时存在多项。它们是候选，不是已经成立的结论。</p>
      {resolved.classification.map((t) => (
        <EndpointCard key={t.id} template={t} findings={resolved.findingsByEndpoint[t.id] ?? []} />
      ))}

      {resolved.claimDirection && (
        <>
          <h2 className="section-title">当前主张方向</h2>
          <EndpointCard
            template={resolved.claimDirection}
            findings={resolved.findingsByEndpoint[resolved.claimDirection.id] ?? []}
          />
        </>
      )}

      <h2 className="section-title">证据固定</h2>
      <p className="note">左栏现在还能取得，右栏在账号关闭后通常就拿不到了。</p>
      {resolved.evidence.map((c) => (
        <div className="evidence" key={c.id}>
          <h3>{c.title}</h3>
          <div className="evidence-columns">
            <div>
              <h4>现在还能取得或主动形成</h4>
              <ul>
                {c.currently_available.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{c.at_risk_column_title ?? "解除后很可能难以取得"}</h4>
              <ul>
                {c.at_risk_after_exit.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}

      <div className="evidence-boundary">
        <h3>证据边界</h3>
        <p>只保存与本人劳动关系、岗位、绩效和解除事实具有必要关联的材料。</p>
        <p>
          不要绕过权限控制，不要使用他人账号，不要批量复制源代码、客户数据、
          模型权重、密钥、商业秘密或与案件无关的公司文件。
        </p>
        <p>证据固定不等于可以无限制下载公司数据。</p>
      </div>

      {engine.complexity === "HIGH" && <ProfessionalReview triggers={engine.complexityTriggers} onExport={onExport} />}

      <Feedback ruleIds={engine.firedRuleIds} />

      <div className="actions">
        <button type="button" className="primary" onClick={onExport}>
          导出 Case Export
        </button>
        <button type="button" onClick={onRestart}>
          重新开始
        </button>
      </div>
    </section>
  );
}

/** 每条终点可展开看到 Rule ID、依据、地域、生效时间、不确定性档位、对应测试用例。 */
function EndpointCard({
  template,
  findings,
}: {
  template: EndpointTemplate;
  findings: Finding[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const top = findings[0];

  return (
    <article className="endpoint-card">
      <div className="badge-row">
        <span className="endpoint-id">{template.id}</span>
        {top && <span className={`sev sev-${top.severity}`}>{SEVERITY_LABEL[top.severity]}</span>}
        {top && <span className="unc">{UNCERTAINTY_LABEL[top.uncertainty]}</span>}
      </div>
      <h3>{template.title}</h3>
      {template.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      {template.sections.map((s) => (
        <div className="subsection" key={s.heading}>
          <h4>{s.heading}</h4>
          {s.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.items.length > 0 && (
            <ul>
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {findings.length > 0 && (
        <div className="rule-detail">
          <button type="button" className="link" onClick={() => setOpen((o) => !o)}>
            {open ? "收起规则依据" : "查看规则依据"}
          </button>
          {open && findings.map((f) => <RuleDetail key={`${f.ruleId}-${f.id}`} finding={f} />)}
        </div>
      )}
    </article>
  );
}

function RuleDetail({ finding }: { finding: Finding }): React.JSX.Element {
  const rule = RULES.find((r) => r.id === finding.ruleId);
  if (!rule) return <p className="note">规则 {finding.ruleId} 未找到。</p>;

  const region =
    rule.jurisdiction.level === "national"
      ? "全国"
      : [rule.jurisdiction.province, rule.jurisdiction.city].filter(Boolean).join(" · ");

  return (
    <dl className="rule-meta">
      <dt>Finding</dt>
      <dd>{finding.id}</dd>
      <dt>Rule ID</dt>
      <dd>{rule.id}</dd>
      <dt>依据</dt>
      <dd>
        {rule.legal_basis.map((b, i) => (
          <div key={i}>
            {b.instrument ?? b.source_id} {b.article}
            {b.note ? `（${b.note}）` : ""}
          </div>
        ))}
      </dd>
      <dt>适用地域</dt>
      <dd>{region}</dd>
      <dt>条款生效</dt>
      <dd>
        {rule.provision_effective.from === "TODO_VERIFY" ? (
          <span className="todo">待人工核验</span>
        ) : (
          rule.provision_effective.from
        )}
      </dd>
      <dt>规则档位</dt>
      <dd>{UNCERTAINTY_LABEL[rule.uncertainty]}</dd>
      <dt>本次档位</dt>
      <dd>
        {UNCERTAINTY_LABEL[finding.uncertainty]}
        {finding.uncertainty !== rule.uncertainty && "（已按你的证据状态上调）"}
      </dd>
      <dt>对应测试用例</dt>
      <dd>{rule.tests.join("、")}</dd>
    </dl>
  );
}

/** 高复杂度才出现。round2 §18。只有第三个按钮进入律师信息页。 */
function ProfessionalReview({
  triggers,
  onExport,
}: {
  triggers: string[];
  onExport: () => void;
}): React.JSX.Element {
  return (
    <div className="professional-review">
      <h2>建议进行专业复核</h2>
      <p>本次结果涉及以下一种或多种不可逆风险：</p>
      <ul>
        {triggers.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p>继续自行签字、回复或提交材料，可能把仍可调整的问题固定为程序记录。</p>
      <p>建议在下一次行动前，由劳动法专业人士结合原始文件进行复核。</p>
      <p>你可以先复制下方 Case Export，并交给任何你信任的律师。</p>
      <div className="actions">
        <button type="button" className="primary" onClick={onExport}>
          复制 Case Export
        </button>
      </div>
    </div>
  );
}
