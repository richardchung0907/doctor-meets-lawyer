import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Hourglass, CircleSlash } from 'lucide-react-native';
import { theme } from '../theme';

export type VerificationStatus = 'unverified' | 'pending' | 'verified';

interface VerifiedBadgeProps {
  status?: string | null;
  size?: 'small' | 'medium';
  showUnverified?: boolean;
}

/**
 * 專業身份認證狀態徽章（只讀顯示，無按鈕行為）
 * - verified → 「已認證」（綠）
 * - pending  → 「審核中」（藍）
 * - unverified → 「未認證」（灰，可選顯示）
 */
export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  status,
  size = 'small',
  showUnverified = true,
}) => {
  const { t } = useTranslation();
  const s = (status || 'unverified') as VerificationStatus;

  if (s === 'verified') {
    return (
      <View style={[styles.badge, styles.verifiedBg, size === 'medium' && styles.badgeMedium]}>
        <BadgeCheck size={size === 'medium' ? 15 : 12} color={theme.colors.success} />
        <Text style={[styles.text, styles.verifiedText, size === 'medium' && styles.textMedium]}>
          {t('verification.verified')}
        </Text>
      </View>
    );
  }

  if (s === 'pending') {
    return (
      <View style={[styles.badge, styles.pendingBg, size === 'medium' && styles.badgeMedium]}>
        <Hourglass size={size === 'medium' ? 15 : 12} color={theme.colors.primaryDark} />
        <Text style={[styles.text, styles.pendingText, size === 'medium' && styles.textMedium]}>
          {t('verification.pending')}
        </Text>
      </View>
    );
  }

  if (!showUnverified) return null;

  return (
    <View style={[styles.badge, styles.unverifiedBg, size === 'medium' && styles.badgeMedium]}>
      <CircleSlash size={size === 'medium' ? 15 : 12} color={theme.colors.textFaint} />
      <Text style={[styles.text, styles.unverifiedText, size === 'medium' && styles.textMedium]}>
        {t('verification.unverified')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeMedium: {
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
  },
  textMedium: {
    fontSize: 12,
  },
  verifiedBg: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
  },
  verifiedText: {
    color: theme.colors.success,
  },
  pendingBg: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
  },
  pendingText: {
    color: theme.colors.primaryDark,
  },
  unverifiedBg: {
    backgroundColor: 'rgba(100, 116, 139, 0.10)',
  },
  unverifiedText: {
    color: theme.colors.textMuted,
  },
});
