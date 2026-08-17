import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProfessionGrid } from '../components/ProfessionGrid';
import { LanguageSelector } from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { ProfessionKey } from '../types/database';
import { Scale, HeartPulse } from 'lucide-react-native';
import { theme } from '../theme';

interface LandingScreenProps {
  onSelectProfessionToSignup: (prof: ProfessionKey) => void;
  onGoToLogin: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onSelectProfessionToSignup,
  onGoToLogin,
}) => {
  const { t } = useTranslation();
  const { selectedOnboardingProfession, setSelectedOnboardingProfession } = useAuth();

  const handleSelectProfession = (prof: ProfessionKey) => {
    setSelectedOnboardingProfession(prof);
    onSelectProfessionToSignup(prof);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.logoRow}>
            <View style={styles.logoIconBg}>
              <HeartPulse size={22} color={theme.colors.primary} />
              <Scale size={22} color={theme.colors.violet} />
            </View>
            <View>
              <Text style={styles.appTitle}>{t('app_title')}</Text>
              <Text style={styles.tagline}>{t('welcome_tagline')}</Text>
            </View>
          </View>

          <LanguageSelector />
        </View>

        {/* Hero Banner Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroHeader}>Connecting Healthcare & Legal Pillars</Text>
          <Text style={styles.heroSub}>
            Join an exclusive cross-disciplinary network of Medical Doctors, Lawyers, TCM Practitioners, Dentists, Vets, and Judges.
          </Text>
        </View>

        {/* Profession Grid */}
        <ProfessionGrid
          onSelectProfession={handleSelectProfession}
          selectedProfession={selectedOnboardingProfession}
        />

        {/* Subtle Login Link */}
        <TouchableOpacity style={styles.loginLinkButton} onPress={onGoToLogin} activeOpacity={0.7}>
          <Text style={styles.loginLinkText}>{t('onboarding.already_have_account')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  topHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIconBg: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  heroCard: {
    width: '100%',
    backgroundColor: 'linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 100%)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    padding: 20,
    marginBottom: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  heroHeader: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  loginLinkButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  loginLinkText: {
    color: theme.colors.primaryDark,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
