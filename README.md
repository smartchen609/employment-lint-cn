# Employment Lint CN

> 在签署离职文件或提交仲裁请求前，检查合同到期、AI替岗和
> "客观情况发生重大变化"中的关键法律 warnings。

`LOCAL-ONLY` `NO BACKEND` `NO ACCOUNT`
`NO UPLOAD` `NO APP TELEMETRY` `NO RUNTIME LLM`

---

## What it checks

- 固定期限合同到期，是否可能触发"连续订立二次固定期限劳动合同"
- AI替岗、团队缩编或岗位取消，是否缺少第40条第3项的成立条件
- 继续履行、赔偿金和经济补偿之间是否可能选错主张路径
- 哪些证据现在还能取得，哪些会在账号关闭后消失
- 导出一份可交给任何律师的 Markdown Case Report

## What it does not do

This is a linter, not a verdict.

它不会：

- 判断你一定能赢
- 计算或承诺2N
- 生成仲裁申请书
- 上传、解析或保存劳动合同
- 用大模型读取你的案件
- 把"未命中规则"解释为解除没有问题

## Why the result is inspectable

每一条 Finding 都显示：

- Rule ID
- 依据条文
- 适用地域
- 生效时间
- 所需证据
- 例外
- 不确定性档位
- 对应测试用例

规则以 YAML 版本化，构建时校验，并通过公开测试用例回归。

---

## 可信度来自哪里

不是"作者是专业律师"，而是：

- 没有黑箱大模型
- 规则可见
- 来源可核
- 不确定性显式
- 测试可复现
- 用户数据不进入系统

## 当前状态

**v0.1，构建通过，尚未部署。**

| | |
| --- | --- |
| 规则 | 14 条 |
| 输出模板 | 29 条（C00–C22、R01–R06） |
| 测试 | 329 条 |
| 已人工核验来源 | **6 / 6** |
| 待完成 | 真实案件回放、程序员盲测 |

每条来源的核验记录写在 `sources.yml` 的 `verification_record` 字段里 ——
记录的是**核验时实际看到了什么条文和日期**，不只是一个"已核验"的勾。

---

## 开发

```bash
npm install
npm run build:content   # YAML → JSON
npm run dev             # http://localhost:5173
npm run check           # typecheck + validate + test
npx vite build && npm run audit:bundle   # 产物隐私审计
```

### 目录

```
rules/          法律规则与输出文案（YAML，律师可审）
  copy/         C00–C22、R01–R06、证据清单
src/schema/     Zod schema —— 唯一真相
src/engine/     规则引擎（两轮求值）
src/questions/  问题树
src/findings/   结果组装
src/export/     Markdown Case Export
tests/          317 条测试，含两个守卫测试
scripts/        构建期校验与内容生成
docs/spec/      规格书（round3 优先于 round2）
```

### 两个守卫测试

`tests/guard-copy.test.ts` 扫描全部面向用户的文案，
命中 `稳了` `通过检查` `成功率` 等禁止表达即失败。

`tests/guard-privacy.test.ts` 扫描 `src/` 全部源码，
出现 `localStorage`、`fetch(`、`analytics` 等即失败，
并锁定运行时依赖只能是 react / react-dom。

`scripts/audit-bundle.ts` 扫描**打包产物**，因为依赖和构建工具
可能注入源码里看不到的网络调用。

这些检查保护的是产品承诺本身 —— 否则某次重构顺手加一个缓存，
整个信任结构就悄悄作废了。

---

## 许可

| 目录 | 许可 |
| --- | --- |
| `src/`、`scripts/` | MIT，见 [LICENSE](LICENSE) |
| `rules/`、`docs/` | CC BY 4.0，见 [LICENSE-CONTENT.md](LICENSE-CONTENT.md) |

## 相关文档

- [DISCLAIMER.md](DISCLAIMER.md) — 这不是法律意见
- [PRIVACY.md](PRIVACY.md) — 数据不流向任何地方
- [CONTRIBUTING.md](CONTRIBUTING.md) — 怎么提规则错误
- [CHANGELOG.md](CHANGELOG.md)
- [docs/fact-model.md](docs/fact-model.md) — 事实模型与求值顺序
- [docs/open-questions.md](docs/open-questions.md) — 待决问题

## Maintainer

apangchen · 广东深圳执业律师，劳动法方向。

规则错误、未覆盖情形和文案问题，请提 Issue。
**请勿在 Issue 中提交公司名称、姓名、聊天记录、劳动合同、源代码或客户信息。**
