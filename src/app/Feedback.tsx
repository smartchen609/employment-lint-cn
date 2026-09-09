import { RULESET_VERSION, TOOL_VERSION } from "../export/case-export.js";

/**
 * 自愿反馈入口。round2 §1乙。
 *
 * ## 这是零埋点产品唯一的反馈通道
 *
 * 没有后端就没有漏斗数据，这两件事不能同时成立。
 * 所以用户主动点的这两个按钮，是我们唯一能知道"哪里出了问题"的地方。
 *
 * ## 只预填版本与 Rule ID
 *
 * **不自动带入用户的任何答案。** 链接里只有工具版本、规则集版本和
 * 用户当前看到的 Rule ID —— 这些都不是案件信息。
 *
 * 用的是 GitHub Issue Form 的 URL 参数预填，跳转由用户点击发起，
 * 页面本身不发任何请求。
 */

const REPO = "https://github.com/smartchen609/employment-lint-cn";

function issueUrl(template: string, ruleIds: string[]): string {
  const params = new URLSearchParams({
    template,
    versions: `tool ${TOOL_VERSION} / ruleset ${RULESET_VERSION}`,
  });
  if (ruleIds.length > 0) params.set("rule_id", ruleIds.join(", "));
  return `${REPO}/issues/new?${params.toString()}`;
}

export function Feedback({ ruleIds }: { ruleIds: string[] }): React.JSX.Element {
  return (
    <div className="feedback">
      <h3>发现问题？</h3>
      <p className="note">
        本工具没有埋点，无法知道你遇到了什么。
        如果结果不对或你的情况没被覆盖，只能靠你主动告诉我们。
      </p>
      <div className="actions">
        <a
          className="button-link"
          href={issueUrl("rule-error.yml", ruleIds)}
          target="_blank"
          rel="noreferrer noopener"
        >
          报告规则错误
        </a>
        <a
          className="button-link"
          href={issueUrl("not-covered.yml", [])}
          target="_blank"
          rel="noreferrer noopener"
        >
          这个问题没有被覆盖
        </a>
      </div>
      <p className="note">
        链接只预填工具版本和 Rule ID，<strong>不包含你的任何答案</strong>。
        提交时也请不要粘贴公司名称、聊天记录或合同原文。
      </p>
    </div>
  );
}
