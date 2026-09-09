/**
 * 第一屏。全文照抄规格书 round2 §4.1。
 *
 * 这一屏没有律师身份、微信、咨询入口，也没有「立即测算 2N」。
 */

export function Intro({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <section className="intro">
      <h1>在签字、回复公司或提交仲裁请求前，先跑一次检查</h1>

      <p className="lede">这不是赔偿计算器，也不会判断你一定能赢。</p>

      <p>它只检查三类问题：</p>
      <ol>
        <li>固定期限合同到期，是否可能被错误地当作普通不续签；</li>
        <li>AI 替岗、团队缩编或岗位取消，是否真的满足「客观情况发生重大变化」；</li>
        <li>违法解除或终止后，你是否可能选错了继续履行、赔偿金或经济补偿的主张路径。</li>
      </ol>

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

      <button className="primary" type="button" onClick={onStart}>
        开始检查
      </button>

      <p className="note handbook-entry">
        不想答题？直接看
        <a href="handbook/" target="_blank" rel="noreferrer noopener">
          劳动者自助仲裁手册
        </a>
        ——每条法条都标了来源与核验状态。答完题，结果页会告诉你该看哪几节。
      </p>
    </section>
  );
}
