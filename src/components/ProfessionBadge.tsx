import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { 
  Stethoscope, 
  Leaf, 
  Smile, 
  Dog, 
  Briefcase, 
  Scale, 
  UserCheck 
} from 'lucide-react-native';
import { ProfessionKey, PROFESSION_COLORS } from '../types/database';

interface ProfessionBadgeProps {
  profession: ProfessionKey;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
}

export const ProfessionBadge: React.FC<ProfessionBadgeProps> = ({ 
  profession, 
  size = 'medium',
  showIcon = true 
}) => {
  const { t } = useTranslation();

  const colors = PROFESSION_COLORS[profession] || PROFESSION_COLORS.other;

  const renderIcon = () => {
    const iconSize = size === 'small' ? 12 : size === 'large' ? 20 : 15;
    const iconColor = colors.primary;

    switch (profession) {
      case 'medical_doctor':
        return <Stethoscope size={iconSize} color={iconColor} />;
      case 'tcm':
        return <Leaf size={iconSize} color={iconColor} />;
      case 'dentist':
        return <Smile size={iconSize} color={iconColor} />;
      case 'veterinarian':
        return <Dog size={iconSize} color={iconColor} />;
      case 'lawyer':
        return <Briefcase size={iconSize} color={iconColor} />;
      case 'judge':
        return <Scale size={iconSize} color={iconColor} />;
      default:
        return <UserCheck size={iconSize} color={iconColor} />;
    }
  };

  const label = t(`onboarding.short_professions.${profession}`, {
    defaultValue: profession,
  });

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        size === 'small' && styles.badgeSmall,
        size === 'large' && styles.badgeLarge,
      ]}
    >
      {showIcon && renderIcon()}
      <Text
        style={[
          styles.badgeText,
          { color: colors.primary },
          size === 'small' && styles.badgeTextSmall,
          size === 'large' && styles.badgeTextLarge,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  badgeLarge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 8,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeTextSmall: {
    fontSize: 11,
  },
  badgeTextLarge: {
    fontSize: 15,
  },
});
