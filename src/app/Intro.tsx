import { PUBLISHED_SECTIONS } from "./data.js";

/**
 * 首页。
 *
 * 2026-09-09 方向修订后（docs/decisions-2026-09-09.md）：手册是骨架，工具是皮。
 * 所以首页先给手册目录；答题工具退到"不确定看哪节？答几道题帮你定位"。
 *
 * 这一屏仍然没有律师身份、微信、咨询入口，也没有「立即测算 2N」。
 */

export function Intro({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <section className="intro">
      <h1>劳动者自助仲裁手册</h1>

      <p className="lede">写给在签字、回复公司、提交仲裁之前，想先把事情弄清楚的人。</p>

      <p>
        这不是赔偿计算器，也不会判断你一定能赢。每一节讲清楚法律怎么规定、常见的误解、
        广东和深圳的裁判口径、你现在该做什么。每条法条都标了出处，可以在
        <a href="handbook/sources.html">来源与核验</a>里查到原文。
      </p>

      <p className="jump">
        <a href="#locate">不确定看哪节？答几道题帮你定位 ↓</a>
      </p>

      <h2 id="chapters">手册目录</h2>
      <ol className="chapter-list">
        {PUBLISHED_SECTIONS.map((s) => (
          <li key={s.id}>
            <a href={`handbook/${s.id}.html`}>
              <span className="num">{s.id}</span>
              <span className="title">{s.title}</span>
              {s.summary && <span className="sum">{s.summary}</span>}
            </a>
          </li>
        ))}
      </ol>

      <div className="locate" id="locate">
        <h2>不确定看哪节？</h2>
        <p>
          回答十几道选择题，帮你找到该看的章节，并指出你现在最不该做的一件事。
          目前覆盖：固定期限合同到期不续签；公司以 AI 替岗、团队缩编、岗位取消等理由单方解除；
          公司提出协商解除；没有书面通知但已经不让你工作。
        </p>
        <button className="primary" type="button" onClick={onStart}>
          开始答题
        </button>
      </div>

      <div className="privacy-badges" aria-label="隐私承诺">
        <span>无账户</span>
        <span>无后端</span>
        <span>无文件上传</span>
        <span>无分析埋点</span>
        <span>运行时不调用大模型</span>
      </div>

      <p className="note">你的回答仅保存在当前页面状态中。</p>
      <p className="note">
        关闭或刷新页面后，未导出的内容将不会由本工具保存。
        静态托管平台仍可能按照其自身政策记录基础访问日志，但你的问答内容不会被本工具发送。
      </p>
    </section>
  );
}
