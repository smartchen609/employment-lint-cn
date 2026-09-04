# 贡献指南

## 先读这个

**请勿在 Issue、PR 或任何地方提交公司名称、姓名、身份证号、聊天记录、
劳动合同、解除通知、源代码或客户信息。**

如果你要说明一个规则问题，用匿名化的事实结构描述，例如
"深圳，协商延长 7 个月，延长期已届满" —— 不要贴原始文件。

## 三类贡献

### 1. 报告规则错误

最有价值的贡献。请说明：

- 哪条规则（Rule ID，可在结果页展开看到）
- 你认为它在什么事实组合下会给出错误结果
- 依据是什么（条文、司法解释、地方规定）

### 2. 报告未覆盖的情形

本工具 v0.1 只覆盖三个法律支点。如果你遇到的情形应当被覆盖但没有，
请说明该情形以及"如果提前两周看到哪一条 warning，会改变哪一个具体动作"。

**后半句是关键。** 只是"用户不懂劳动法"不构成加规则的理由 ——
那应该写文章，不应该做工具。

### 3. 文案问题

结果页的每一句话都可能被用户理解成承诺。
如果某句话读起来像"你稳了"，那就是 bug。

## 硬约束

以下几条不接受讨论，PR 违反即关闭：

1. **不新增法律内容。** 法条原文、条文编号、生效日期、来源 URL
   只能由维护人核验后加入。缺来源的写 `TODO_VERIFY`，
   并登记到 `docs/sources-to-verify.md`。
2. **不新增规格书之外的规则或输出文案。**
   认为缺规则的，写进 `docs/open-questions.md`。
3. **`sources.yml` 的 `page_opened_and_checked` 只能由维护人修改。**
   它的含义是"我亲自打开官方原文页核对过"，不是"看起来没问题"。
4. **不引入后端、账户、上传、埋点或运行时大模型调用。**
5. **不使用 localStorage / sessionStorage / IndexedDB / Cookie 保存答案。**
6. **不新增依赖。** 技术栈固定为 Vite + React + TypeScript + Zod + Vitest + yaml。
   确需新增的先开 Issue。
7. **不实现赔偿计算器、文书生成、文件上传、OCR，或在首页放律师咨询入口。**

## 本地开发

```bash
npm install
npm run build:content
npm run check          # typecheck + validate + test
npm run dev
```

`npm run check` 必须全绿才提 PR。

改动依赖或构建配置的，还要跑 `npx vite build && npm run audit:bundle`。

注意：`npm run build` 目前**必然失败**，因为还有 5 条法律来源
未完成人工核验。这是设计行为。

## 改规则的流程

1. 改 `rules/**/*.yml`
2. 如果引用了新的法律依据，先在 `sources.yml` 登记来源
   （`page_opened_and_checked` 写 `false`）
3. 在 `tests/fixtures/` 加或改测试用例
   —— **`actual_result` 一栏留空，那栏只能由维护人用真实案件回填**
4. `npm run check`
5. PR 里说明：改了什么规则、依据是什么、影响哪些测试用例

规则 YAML 与执行代码分开，就是为了让 PR 能一眼看出
"法律规则变了"还是"程序逻辑变了"。请不要在一个 PR 里同时做两件事。
