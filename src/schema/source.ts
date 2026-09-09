import { z } from "zod";
import { IsoDateOrEmpty } from "./primitives.js";

/**
 * `sources.yml` —— 唯一来源注册表。round3 §8。
 *
 * URL 从规则中抽离，二十个规则文件不重复维护同一个 URL。
 * 每条规则只写 `legal_basis[].source_id`。
 *
 * **`page_opened_and_checked` 一律先写 false。**
 * 只有维护人亲自打开官方原文页核对后才可改为 true。
 * 程序能检查：source_id 是否存在、pinpoint 是否对得上、字段是否齐全。
 * 程序**不能**检查：页面是不是对应法规、条文是不是最新版、
 * 链接内容有没有被错误理解 —— 语义核验永远是人工责任。
 */

export const SourceAuthorityLevel = z.enum([
  "national-statute",
  "national-judicial",
  "special-economic-zone-legislation",
  "provincial-regulation",
  "local-regulation",
  "published-case",
  /** 法院官方渠道发布的审判实务文章。不是规范性文件，只作实务参考。 */
  "court-practice-article",
  "media-report",
]);

/**
 * 规格书里没有给出 URL 的来源，一律写字面量 "TODO_VERIFY"，
 * 并在 docs/sources-to-verify.md 中登记。
 * **不得由 AI 自行填写或推测 URL。** CLAUDE.md §L1。
 */
export const SourceUrl = z.union([
  z.string().url().startsWith("https://"),
  z.string().url().startsWith("http://"),
  z.literal("TODO_VERIFY"),
]);

export const SourceRecord = z
  .object({
    id: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, "source id 使用大写字母、数字和连字符"),
    publisher: z.string().min(1),
    authority_level: SourceAuthorityLevel,
    page_title: z.string().min(1),
    /** 是否为制定机关／官方发布页面。案例报道等非官方来源为 false。 */
    official: z.boolean(),
    url: SourceUrl,
    /** 本项目实际引用到的条文。规则的 legal_basis[].article 必须落在其中。 */
    pinpoint: z.array(z.string().min(1)).min(1),
    /** 维护人是否亲自打开过原文页。**AI 不得改为 true。** */
    page_opened_and_checked: z.boolean(),
    last_verified_at: IsoDateOrEmpty,
    verified_by: z.string(),
    status: z.enum(["active", "superseded", "forbidden"]),
    /** status 为 forbidden 时必填，说明为何禁止使用。 */
    forbidden_reason: z.string().optional(),
    /**
     * url 为 http（非 https）时必填。
     *
     * 部分中国政府网站至今不提供可用的 https。强制 https 会逼我们改用
     * 转载页，而"来源注册表"的全部意义就在于指向制定机关本身的页面 ——
     * 那是更坏的取舍。所以允许 http，但必须写明为什么。
     */
    insecure_url_reason: z.string().optional(),
    /**
     * 人工核验记录：核了什么、看到了什么。
     * page_opened_and_checked 只是一个布尔值，说明不了核验到什么程度；
     * 这里记录实际看到的条文与日期，让第三方能复核这次核验本身。
     */
    verification_record: z.string().optional(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.page_opened_and_checked && s.last_verified_at === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["last_verified_at"],
        message: "已核验的来源必须填写 last_verified_at",
      });
    }
    if (s.page_opened_and_checked && s.verified_by === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verified_by"],
        message: "已核验的来源必须填写 verified_by",
      });
    }
    if (s.page_opened_and_checked && s.url === "TODO_VERIFY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "URL 仍为 TODO_VERIFY 的来源不可能已被核验",
      });
    }
    if (s.url.startsWith("http://") && !s.insecure_url_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["insecure_url_reason"],
        message: "使用 http（非 https）的来源必须写明 insecure_url_reason",
      });
    }
    if (s.status === "forbidden" && !s.forbidden_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forbidden_reason"],
        message: "status: forbidden 必须写明 forbidden_reason",
      });
    }
  });

export type SourceRecord = z.infer<typeof SourceRecord>;

export const SourceRegistry = z
  .object({
    sources: z.array(SourceRecord).min(1),
  })
  .strict()
  .superRefine((reg, ctx) => {
    const seen = new Set<string>();
    reg.sources.forEach((s, i) => {
      if (seen.has(s.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", i, "id"],
          message: `重复的 source id: ${s.id}`,
        });
      }
      seen.add(s.id);
    });
  });

export type SourceRegistry = z.infer<typeof SourceRegistry>;
