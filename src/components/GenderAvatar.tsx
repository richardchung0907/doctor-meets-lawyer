import React from 'react';
import { User } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { theme } from '../theme';

/**
 * 性别化头像：
 * - female → 粉色长发女性小人（SVG，react-native-svg）
 * - 其他（male / other / 未知）→ 与现状一致的灰色中性小人（lucide User）
 */
interface GenderAvatarProps {
  gender?: string | null;
  size?: number;
}

const PINK_DARK = '#EC4899'; // 发色/主色
const PINK_LIGHT = '#F472B6'; // 长发/裙色
const PINK_FACE = '#FDE8F0'; // 肤色

export const GenderAvatar: React.FC<GenderAvatarProps> = ({ gender, size = 24 }) => {
  if (gender !== 'female') {
    return <User size={size} color={theme.colors.textMuted} />;
  }

  // 与 lucide User 相同构图比例（头 18/48、身体 30~44），加长发与裙摆，粉色系
  return (
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
};
