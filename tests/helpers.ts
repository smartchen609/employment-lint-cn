import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { RuleRecord, TestFixture } from "../src/schema/index.js";

/**
 * 测试用的共享加载器。
 *
 * P4 时四个测试文件各自抄了一份 walker，`rules/copy/` 一加进来就全挂了。
 * 遍历规则目录这件事只应该有一处实现。
 */

export const ROOT = new URL("..", import.meta.url).pathname;

/** 遍历 YAML。`rules/copy/` 是输出文案，不是 RuleRecord，一律排除。 */
export function walkYaml(dir: string, { excludeCopy = true } = {}): string[] {
  let out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (excludeCopy && e === "copy") continue;
      out = out.concat(walkYaml(p, { excludeCopy }));
    } else if (e.endsWith(".yml")) out.push(p);
  }
  return out.sort();
}

export function parseYamlFile(file: string): unknown {
  return parse(readFileSync(file, "utf8"), { version: "1.2", uniqueKeys: true });
}

export interface LoadedRule {
  file: string;
  rule: RuleRecord;
}

export function loadRules(): LoadedRule[] {
  return walkYaml(join(ROOT, "rules")).map((f) => ({
    file: f.replace(ROOT, ""),
    rule: RuleRecord.parse(parseYamlFile(f)),
  }));
}

export interface LoadedFixture {
  file: string;
  fixture: TestFixture;
}

export function loadFixtures(): LoadedFixture[] {
  return walkYaml(join(ROOT, "tests", "fixtures")).map((f) => ({
    file: f.replace(ROOT, ""),
    fixture: TestFixture.parse(parseYamlFile(f)),
  }));
}
