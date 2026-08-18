import React from 'react';
import { User } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { theme } from '../theme';

/**
 * 性别化头像：
 * - female → 粉色长发女性小人（SVG）
 * - male → 主题蓝色短发男性小人（SVG）
 * - 其他（other / 未知）→ 中性灰色小人（lucide User）
 */
interface GenderAvatarProps {
  gender?: string | null;
  size?: number;
}

const PINK_DARK = '#EC4899'; // 女：发色/主色
const PINK_LIGHT = '#F472B6'; // 女：长发/裙色
const PINK_FACE = '#FDE8F0'; // 女：肤色

/** 男性：主题蓝短发 + 宽肩身体（与女性 SVG 同构图比例，对称风格） */
const MaleSvg: React.FC<{ size: number }> = ({ size }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    {/* 短发（覆盖头顶，不垂至肩） */}
    <Path
      d="M24 4 C16.5 4 11.5 9.5 11.5 16.5 C11.5 20 12.5 23 14 25.5 L34 25.5 C35.5 23 36.5 20 36.5 16.5 C36.5 9.5 31.5 4 24 4 Z"
      fill={theme.colors.primaryDark}
    />
    {/* 脸 */}
    <Circle cx="24" cy="19" r="9" fill="#E0F2FE" />
    {/* 身体（宽肩） */}
    <Path
      d="M15 32 C18.5 30.8 29.5 30.8 33 32 L35.5 44 L12.5 44 Z"
      fill={theme.colors.primary}
    />
  </Svg>
);

/** 女性：粉色长发 + 裙摆 */
const FemaleSvg: React.FC<{ size: number }> = ({ size }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    {/* 长发（头部两侧垂至肩） */}
    <Path
      d="M24 4 C16 4 11 9.5 11 17 C11 22.5 12.5 26.5 15 31 L33 31 C35.5 26.5 37 22.5 37 17 C37 9.5 32 4 24 4 Z"
      fill={PINK_LIGHT}
    />
    {/* 脸 */}
    <Circle cx="24" cy="18" r="9" fill={PINK_FACE} />
    {/* 刘海/头顶发 */}
    <Path d="M24 9 C18.5 9 15.5 12 15.5 16 L32.5 16 C32.5 12 29.5 9 24 9 Z" fill={PINK_DARK} />
    {/* 身体（圆肩 + 裙形） */}
    <Path d="M16.5 32 C20 30.8 28 30.8 31.5 32 L34 44 L14 44 Z" fill={PINK_LIGHT} />
  </Svg>
);

export const GenderAvatar: React.FC<GenderAvatarProps> = ({ gender, size = 24 }) => {
  if (gender === 'female') {
    return <FemaleSvg size={size} />;
  }
  if (gender === 'male') {
    return <MaleSvg size={size} />;
  }
  return <User size={size} color={theme.colors.textMuted} />;
};
