import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isRadioNavKey,
  nextRadioIndex,
  rovingTabIndex,
} from "../src/app/radio-navigation.js";
import { ROOT } from "./helpers.js";

/**
 * 可访问性。
 *
 * 这个工具面向程序员，其中不少人习惯纯键盘操作；
 * 而"在解除前跑一次检查"的人里，也可能有正处在伤病或医疗期的当事人。
 * 键盘和读屏不是加分项。
 */

describe("radiogroup 方向键导航", () => {
  it("识别四个方向键，忽略其他按键", () => {
    for (const k of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
      expect(isRadioNavKey(k)).toBe(true);
    }
    for (const k of ["Enter", " ", "Tab", "a", "Escape"]) {
      expect(isRadioNavKey(k)).toBe(false);
    }
  });

  it("未作答时：向前落到第一项，向后落到最后一项", () => {
    expect(nextRadioIndex(-1, "ArrowDown", 5)).toBe(0);
    expect(nextRadioIndex(-1, "ArrowRight", 5)).toBe(0);
    expect(nextRadioIndex(-1, "ArrowUp", 5)).toBe(4);
    expect(nextRadioIndex(-1, "ArrowLeft", 5)).toBe(4);
  });

  it("正常前后移动", () => {
    expect(nextRadioIndex(0, "ArrowDown", 5)).toBe(1);
    expect(nextRadioIndex(3, "ArrowDown", 5)).toBe(4);
    expect(nextRadioIndex(3, "ArrowUp", 5)).toBe(2);
  });

  it("到头回绕", () => {
    expect(nextRadioIndex(4, "ArrowDown", 5)).toBe(0);
    expect(nextRadioIndex(0, "ArrowUp", 5)).toBe(4);
  });

  it("单选项时停在原地", () => {
    expect(nextRadioIndex(0, "ArrowDown", 1)).toBe(0);
    expect(nextRadioIndex(0, "ArrowUp", 1)).toBe(0);
  });

  it("空选项组不崩溃", () => {
    expect(nextRadioIndex(-1, "ArrowDown", 0)).toBe(-1);
  });

  it("任意方向键连续按都落在合法范围内", () => {
    const len = 7;
    let i = -1;
    const keys = ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"] as const;
    for (let n = 0; n < 200; n += 1) {
      i = nextRadioIndex(i, keys[n % 4]!, len);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(len);
    }
  });
});

describe("漫游 tabindex", () => {
  it("未作答时只有第一项可 Tab 到", () => {
    expect(rovingTabIndex(0, -1)).toBe(0);
    expect(rovingTabIndex(1, -1)).toBe(-1);
    expect(rovingTabIndex(4, -1)).toBe(-1);
  });

  it("已作答时只有选中项可 Tab 到", () => {
    expect(rovingTabIndex(0, 2)).toBe(-1);
    expect(rovingTabIndex(2, 2)).toBe(0);
    expect(rovingTabIndex(3, 2)).toBe(-1);
  });

  it("组内永远只有一个 tabindex=0", () => {
    for (const selected of [-1, 0, 1, 2, 3]) {
      const zeros = [0, 1, 2, 3].filter((i) => rovingTabIndex(i, selected) === 0);
      expect(zeros.length).toBe(1);
    }
  });
});

describe("界面的可访问性约定", () => {
  const qv = readFileSync(join(ROOT, "src/app/QuestionView.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "src/app/styles.css"), "utf8");

  it("radiogroup 绑定了键盘处理", () => {
    expect(qv).toContain('role="radiogroup"');
    expect(qv).toContain("onKeyDown={onGroupKeyDown}");
  });

  it("换题后把焦点移到题干", () => {
    expect(qv).toContain("headingRef.current?.focus()");
    expect(qv).toContain("[q.id]");
  });

  it("多选组有 group 语义而不是伪装成 radiogroup", () => {
    expect(qv).toContain('role="group"');
    expect(qv).toContain('role="checkbox"');
  });

  it("焦点可见样式存在", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline");
  });

  it("触控目标不小于 44px", () => {
    expect(css).toContain("min-height: 44px");
  });

  it("打印样式隐藏按钮与导航", () => {
    expect(css).toContain("@media print");
    expect(css).toMatch(/button[^{]*\{[^}]*display: none/);
  });
});
