/**
 * 应用主题色板（浅色主题）
 *
 * 所有屏幕与组件应引用本文件的颜色令牌，而非硬编码颜色值。
 * 若需调整主题或扩展深色模式，只改这一个文件。
 *
 * 命名语义：
 *  - background  页面底色
 *  - surface     卡片 / 顶栏 / 输入条等主要表面
 *  - surfaceMuted 次级表面（输入框内部、头像底、浅灰块）
 *  - border      常规边框 / 分隔线
 *  - textPrimary 主文本
 *  - textSecondary 次级文本（标签、说明）
 *  - textMuted   弱化文本（时间、占位、次要说明）
 *  - textFaint   更弱化的文本 / 图标
 *  - textContent 正文内容（卡片内段落）
 */
export const theme = {
  colors: {
    // 背景层级
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',

    // 边框
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',

    // 文本
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    textFaint: '#94A3B8',
    textContent: '#334155',

    // 品牌色
    primary: '#0EA5E9',
    primaryDark: '#0284C7', // 浅色背景上的链接/标题文字（对比度更佳）
    primaryLight: '#38BDF8', // 装饰图标 / 深色气泡上的强调
    violet: '#8B5CF6',

    // 状态色
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    dangerText: '#DC2626', // 浅色背景上的错误文本
    white: '#FFFFFF',
    black: '#000000',
  },
} as const;

export type ThemeColors = typeof theme.colors;
