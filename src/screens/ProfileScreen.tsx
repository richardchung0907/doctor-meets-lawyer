import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, User, LogOut, Globe, Mail, Shield, Check } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ProfessionBadge } from '../components/ProfessionBadge';
import { LanguageSelector } from '../components/LanguageSelector';
import { SupportedLanguage, setAppLanguage } from '../i18n';

interface ProfileScreenProps {
  onBack: () => void;
  onLoggedOut: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack, onLoggedOut }) => {
  const { t, i18n } = useTranslation();
  const { profile, user, signOut, isLoading } = useAuth();

  const [confirmLogoutModal, setConfirmLogoutModal] = useState(false);

  const handleLogout = async () => {
    setConfirmLogoutModal(false);
    await signOut();
    onLoggedOut();
  };

  const currentLangLabel =
    i18n.language === 'zh-Hant'
      ? '繁體中文'
      : i18n.language === 'zh-Hans'
      ? '简体中文'
      : 'English';

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.barTitle}>{t('profile.title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Info Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarLarge}>
            <User size={36} color="#38BDF8" />
          </View>

          <Text style={styles.username}>{profile?.username || 'Professional User'}</Text>

          {profile?.profession && (
            <ProfessionBadge profession={profile.profession} size="large" />
          )}

          <View style={styles.emailRow}>
            <Mail size={14} color="#64748B" />
            <Text style={styles.emailText}>{user?.email}</Text>
          </View>

          {profile?.bio ? (
            <View style={styles.bioBox}>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          ) : null}
        </View>

        {/* Settings List */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionItem}>
            <View style={styles.itemLeft}>
              <Globe size={20} color="#0EA5E9" />
              <View>
                <Text style={styles.itemTitle}>{t('profile.language_setting')}</Text>
                <Text style={styles.itemSub}>{currentLangLabel}</Text>
              </View>
            </View>

            <LanguageSelector />
          </View>
        </View>

        {/* Logout Action */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => setConfirmLogoutModal(true)}
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#EF4444" />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal visible={confirmLogoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('profile.logout')}</Text>
            <Text style={styles.modalSub}>{t('profile.logout_confirm')}</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setConfirmLogoutModal(false)}
              >
                <Text style={styles.cancelModalText}>{t('feed.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmLogoutBtn} onPress={handleLogout}>
                <Text style={styles.confirmLogoutText}>{t('profile.logout')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#1E293B',
  },
  barTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  userCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  username: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emailText: {
    color: '#64748B',
    fontSize: 13,
  },
  bioBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginTop: 4,
  },
  bioText: {
    color: '#CBD5E1',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
  },
  sectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  itemSub: {
    color: '#64748B',
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    paddingVertical: 14,
    gap: 8,
    marginTop: 10,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    color: '#CBD5E1',
    fontSize: 14,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
  },
  cancelModalText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  confirmLogoutBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
  },
  confirmLogoutText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
