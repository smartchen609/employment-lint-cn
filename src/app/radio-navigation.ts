/**
 * radiogroup 方向键导航的索引计算。
 *
 * 抽成纯函数是为了能直接测试 —— 里面真正容易写错的是边界：
 * 未作答时按上键应该落到最后一项，作答后按到头要回绕，
 * 这些在浏览器里手点很难覆盖全，在代码里却一眼能验。
 *
 * ARIA 规范：radiogroup 内部靠方向键移动并选中，Tab 只在组之间跳。
 * 只写 role 不写键盘行为比不写 role 更糟 —— 读屏会按 radiogroup 的
 * 规则提示用户按方向键，而按了没反应。
 */

export const RADIO_NAV_KEYS = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"] as const;

export type RadioNavKey = (typeof RADIO_NAV_KEYS)[number];

export function isRadioNavKey(key: string): key is RadioNavKey {
  return (RADIO_NAV_KEYS as readonly string[]).includes(key);
}

/**
 * 计算按键后应当选中的选项索引。
 *
 * @param currentIndex 当前选中项索引；未作答传 -1
 * @param key          方向键
 * @param length       选项总数
 * @returns            下一个索引；length 为 0 时返回 -1
 */
export function nextRadioIndex(currentIndex: number, key: RadioNavKey, length: number): number {
  if (length <= 0) return -1;

  const forward = key === "ArrowDown" || key === "ArrowRight";

  // 未作答时：向前落到第一项，向后落到最后一项。
  // 直接从 -1 做模运算会得到 length-1（向前）和 -2（向后），都不对。
  if (currentIndex < 0) return forward ? 0 : length - 1;

  return (currentIndex + (forward ? 1 : -1) + length) % length;
}

/**
 * 漫游 tabindex：组内只能有一个可 Tab 到的目标。
 * 已作答时是选中项，未作答时是第一项。
 */
export function rovingTabIndex(optionIndex: number, selectedIndex: number): 0 | -1 {
  if (selectedIndex < 0) return optionIndex === 0 ? 0 : -1;
  return optionIndex === selectedIndex ? 0 : -1;
}
