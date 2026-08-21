import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Crown, Sparkles, ShieldCheck, Ticket } from 'lucide-react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '../context/AuthContext';
import {
  getPremiumPackage,
  purchasePremiumPackage,
  restorePremiumPurchase,
  ensurePurchasesConfigured,
} from '../lib/purchases';
import { theme } from '../theme';

interface PaywallScreenProps {
  onBack: () => void;
}

export const PaywallScreen: React.FC<PaywallScreenProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const { isPremium, profile, refreshPremiumStatus } = useAuth();

  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const loadOffer = useCallback(async () => {
    setLoading(true);
    const ready = await ensurePurchasesConfigured();
    setSdkReady(ready);
    if (ready) {
      const p = await getPremiumPackage();
      setPkg(p);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  const handlePurchase = async () => {
    if (!pkg || busy) return;
    setBusy('purchase');
    const info = await purchasePremiumPackage(pkg);
    setBusy(null);
    if (info) {
      await refreshPremiumStatus();
      Alert.alert(t('premium.upgrade_success_title'), t('premium.upgrade_success_message'));
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    setBusy('restore');
    const info = await restorePremiumPurchase();
    setBusy(null);
    if (info) {
      await refreshPremiumStatus();
      Alert.alert(t('premium.restore_success_title'), t('premium.restore_success_message'));
    }
  };

  const priceLabel = pkg?.product?.localizedPriceString ?? '';

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶栏 */}
      <View style={styles.bar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.barTitle}>{t('premium.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 皇冠 + 早鸟标识 */}
        <View style={styles.hero}>
          <View style={styles.crownBadge}>
            <Crown size={40} color={theme.colors.white} />
          </View>
          <Text style={styles.heroTitle}>{t('premium.hero_title')}</Text>
          <View style={styles.earlyBadge}>
            <Ticket size={14} color={theme.colors.primaryDark} />
            <Text style={styles.earlyBadgeText}>{t('premium.early_badge')}</Text>
          </View>
        </View>

        {isPremium ? (
          /* 已是会员 */
          <View style={styles.memberCard}>
            <Crown size={22} color={theme.colors.warning} />
            <Text style={styles.memberTitle}>{t('premium.already')}</Text>
            {profile?.premium_expires_at && (
              <Text style={styles.memberExpiry}>
                {t('premium.expires_at', {
                  date: new Date(profile.premium_expires_at).toLocaleDateString(),
                })}
              </Text>
            )}
          </View>
        ) : (
          <>
            {/* 卖点列表 */}
            <View style={styles.benefitCard}>
              <BenefitRow icon={<ShieldCheck size={20} color={theme.colors.primary} />} text={t('premium.benefit_identity')} />
              <BenefitRow icon={<Sparkles size={20} color={theme.colors.violet} />} text={t('premium.benefit_future')} />
            </View>

            {/* 价格 */}
            <View style={styles.priceCard}>
              {loading ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <>
                  <Text style={styles.pricePeriod}>{t('premium.price_period')}</Text>
                  <Text style={styles.priceValue}>
                    {priceLabel ? `${priceLabel} / ${t('premium.year_unit')}` : t('premium.price_placeholder')}
                  </Text>
                  {priceLabel ? (
                    <Text style={styles.priceNote}>{t('premium.price_note')}</Text>
                  ) : null}
                </>
              )}
            </View>

            {/* 购买按钮 */}
            <TouchableOpacity
              style={[styles.upgradeButton, (busy || !pkg || loading) && styles.buttonDisabled]}
              onPress={handlePurchase}
              disabled={busy || !pkg || loading}
              activeOpacity={0.85}
            >
              {busy === 'purchase' ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <>
                  <Crown size={18} color={theme.colors.white} />
                  <Text style={styles.upgradeButtonText}>{t('premium.upgrade')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={busy === 'purchase'}
              activeOpacity={0.7}
            >
              {busy === 'restore' ? (
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
              ) : (
                <Text style={styles.restoreText}>{t('premium.restore')}</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {!sdkReady && !isPremium && (
          <Text style={styles.sdkWarn}>{t('premium.sdk_unavailable')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const BenefitRow: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <View style={styles.benefitRow}>
    <View style={styles.benefitIcon}>{icon}</View>
    <Text style={styles.benefitText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  crownBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  earlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  earlyBadgeText: {
    color: theme.colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  benefitCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.textContent,
    lineHeight: 20,
  },
  priceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  pricePeriod: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  priceValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginTop: 6,
  },
  priceNote: {
    fontSize: 12,
    color: theme.colors.textFaint,
    marginTop: 8,
    textAlign: 'center',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    color: theme.colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  restoreText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  memberCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  memberTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  memberExpiry: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  sdkWarn: {
    marginTop: 16,
    fontSize: 12,
    color: theme.colors.warning,
    textAlign: 'center',
  },
});
