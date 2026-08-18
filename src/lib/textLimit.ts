// 输入宽度限制工具：全角（CJK/emoji 等）按 2 个宽度单位计，半角（ASCII）按 1 个。
// 用于话题发布与私讯的输入框直接限制，防止用户粘贴超长文本冲击数据库。

/** 话题上限：30 个全型字元 / 60 个半型字元 / 混合按宽度 → 60 单位 */
export const TOPIC_MAX_UNITS = 60;

/** 私讯上限：100 个全型字元 / 半型按宽度 → 200 单位（半角约 200 字） */
export const MESSAGE_MAX_UNITS = 200;

/** 单个字符的宽度单位（码点 > 0xFF 视为全角） */
export const charWidth = (ch: string): number => {
  const cp = ch.codePointAt(0) ?? 0;
  return cp > 0xff ? 2 : 1;
};

/** 文本总宽度单位 */
export const textWidth = (text: string): number =>
  Array.from(text).reduce((sum, ch) => sum + charWidth(ch), 0);

/** 截取不超过 maxUnits 宽度单位的最长前缀（按码点遍历，不会切坏 emoji 代理对） */
export const truncateByWidth = (text: string, maxUnits: number): string => {
  let units = 0;
  let out = '';
  for (const ch of Array.from(text)) {
    const w = charWidth(ch);
    if (units + w > maxUnits) break;
    units += w;
    out += ch;
  }
  return out;
};

/** 是否超过上限 */
export const exceedsWidthLimit = (text: string, maxUnits: number): boolean =>
  textWidth(text) > maxUnits;
