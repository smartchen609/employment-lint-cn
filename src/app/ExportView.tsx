import { useState } from "react";

/**
 * Case Export 面板：复制 + 下载。
 *
 * 下载用 Blob + object URL，不发任何网络请求。
 * 复制优先用 Clipboard API，失败时退回手动全选 —— 不静默失败。
 */

export function ExportView({
  markdown,
  onBack,
}: {
  markdown: string;
  onBack: () => void;
}): React.JSX.Element {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  const download = (): void => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employment-lint-cn-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="export">
      <h1>Case Export</h1>
      <p className="note">
        这份摘要在你的浏览器本地生成，没有上传到任何地方。
        它默认不包含姓名、身份证号和公司全称 —— 本工具从头到尾就没有问过这些。
      </p>

      <div className="actions">
        <button type="button" className="primary" onClick={() => void copy()}>
          复制
        </button>
        <button type="button" onClick={download}>
          下载 Markdown
        </button>
        <button type="button" onClick={onBack}>
          返回结果
        </button>
      </div>

      {status === "copied" && <p className="ok">已复制到剪贴板。</p>}
      {status === "failed" && (
        <p className="warn">浏览器拒绝了复制请求。请在下方文本框中手动全选复制。</p>
      )}

      <textarea className="export-text" readOnly rows={24} value={markdown} />
    </section>
  );
}
