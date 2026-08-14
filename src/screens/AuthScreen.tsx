import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Mail, Lock, User, FileText, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ProfessionKey, PROFESSION_KEYS, PROFESSION_COLORS } from '../types/database';
import { ProfessionBadge } from '../components/ProfessionBadge';

interface AuthScreenProps {
  initialMode?: 'login' | 'signup';
  initialProfession?: ProfessionKey | null;
  onBack: () => void;
  onSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialMode = 'signup',
  initialProfession = null,
  onBack,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { signUpWithProfession, signIn } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [profession, setProfession] = useState<ProfessionKey>(
    initialProfession || 'medical_doctor'
  );
  const [gender, setGender] = useState('other');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage(t('auth.err_invalid'));
      return;
    }

    if (mode === 'signup') {
      if (!username) {
        setErrorMessage(t('auth.err_invalid'));
        return;
      }
      const parsedAge = age ? parseInt(age, 10) : undefined;
      setIsSubmitting(true);
      const { error } = await signUpWithProfession(
        email.trim(),
        password,
        profession,
        username.trim(),
        gender,
        parsedAge,
        bio.trim()
      );
      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error.message || t('auth.err_auth_failed'));
      } else {
        onSuccess();
      }
    } else {
      setIsSubmitting(true);
      const { error } = await signIn(email.trim(), password);
      setIsSubmitting(false);
      if (error) {
        setErrorMessage(error.message || t('auth.err_auth_failed'));
      } else {
        onSuccess();
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'signup' ? t('auth.signup_title') : t('auth.login_title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {mode === 'signup' && (
          <View style={styles.professionBanner}>
            <Text style={styles.profBannerLabel}>{t('auth.profession')}:</Text>
            <ProfessionBadge profession={profession} size="large" />
          </View>
        )}

        {/* Mode Switch Pills */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'signup' && styles.activeTab]}
            onPress={() => {
              setMode('signup');
              setErrorMessage(null);
            }}
          >
            <Text style={[styles.tabText, mode === 'signup' && styles.activeTabText]}>
              {t('auth.signup')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.activeTab]}
            onPress={() => {
              setMode('login');
              setErrorMessage(null);
            }}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.activeTabText]}>
              {t('auth.login')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input Fields */}
        <View style={styles.formContainer}>
          {mode === 'signup' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.username')} *</Text>
                <View style={styles.inputWrapper}>
                  <User size={18} color="#64748B" />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Dr. John / Attorney Smith"
                    placeholderTextColor="#64748B"
                    value={username}
                    onChangeText={setUsername}
                  />
                </View>
              </View>

              {/* Profession Selector Dropdown/List */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.profession')} *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profSelectorRow}>
                  {PROFESSION_KEYS.map((key) => {
                    const isSelected = profession === key;
                    const colors = PROFESSION_COLORS[key];
                    const label = t(`onboarding.short_professions.${key}`);
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.profPill,
                          {
                            backgroundColor: isSelected ? colors.bg : '#1E293B',
                            borderColor: isSelected ? colors.primary : '#334155',
                          },
                        ]}
                        onPress={() => setProfession(key)}
                      >
                        <Text style={{ color: isSelected ? colors.primary : '#94A3B8', fontWeight: isSelected ? '700' : '500' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.email')} *</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color="#64748B" />
              <TextInput
                style={styles.textInput}
                placeholder="name@example.com"
                placeholderTextColor="#64748B"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.password')} *</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color="#64748B" />
              <TextInput
                style={styles.textInput}
                placeholder="••••••••"
                placeholderTextColor="#64748B"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          {mode === 'signup' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.bio')}</Text>
                <View style={[styles.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: 10 }]}>
                  <FileText size={18} color="#64748B" />
                  <TextInput
                    style={[styles.textInput, { height: '100%', textAlignVertical: 'top' }]}
                    placeholder="Brief professional background or area of practice..."
                    placeholderTextColor="#64748B"
                    multiline
                    value={bio}
                    onChangeText={setBio}
                  />
                </View>
              </View>
            </>
          )}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.submitBtnText}>
                  {mode === 'signup' ? t('auth.signup') : t('auth.login')}
                </Text>
                <ChevronRight size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleModeBtn}
            onPress={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setErrorMessage(null);
            }}
          >
            <Text style={styles.toggleModeText}>
              {mode === 'signup' ? t('auth.have_account') : t('auth.no_account')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#1E293B',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  professionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  profBannerLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#0EA5E9',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  formContainer: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
  },
  profSelectorRow: {
    gap: 8,
    paddingVertical: 4,
  },
  profPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: '#0EA5E9',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  toggleModeBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  toggleModeText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
});
