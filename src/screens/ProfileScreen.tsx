import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, User, LogOut, Globe, Mail, Shield, Check, UserX } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ProfessionBadge } from '../components/ProfessionBadge';
import { LanguageSelector } from '../components/LanguageSelector';
import { SupportedLanguage, setAppLanguage } from '../i18n';
import { theme } from '../theme';
import { BlockedEntry, fetchMyBlocklist, unblockUser } from '../lib/blocklist';

interface ProfileScreenProps {
  onBack: () => void;
  onLoggedOut: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack, onLoggedOut }) => {
  const { t, i18n } = useTranslation();
  const { profile, user, signOut, isLoading } = useAuth();

  const [confirmLogoutModal, setConfirmLogoutModal] = useState(false);
  const [blocklistModal, setBlocklistModal] = useState(false);
  const [blocklist, setBlocklist] = useState<BlockedEntry[]>([]);
  const [blocklistLoading, setBlocklistLoading] = useState(false);

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

  const loadBlocklist = async () => {
    setBlocklistLoading(true);
    const entries = await fetchMyBlocklist();
    setBlocklist(entries);
    setBlocklistLoading(false);
  };

  const openBlocklist = async () => {
    setBlocklistModal(true);
    await loadBlocklist();
  };

  const handleRemoveFromBlocklist = async (blockedId: string) => {
    const ok = await unblockUser(blockedId);
    if (ok) {
      setBlocklist((prev) => prev.filter((e) => e.blocked_id !== blockedId));
    }
  };

  // 挂载时即加载黑名单，保证入口处的数量始终正确
  useEffect(() => {
    loadBlocklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.barTitle}>{t('profile.title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Info Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarLarge}>
            <User size={36} color={theme.colors.primary} />
          </View>

          <Text style={styles.username}>{profile?.username || 'Professional User'}</Text>

          {profile?.profession && (
            <ProfessionBadge profession={profile.profession} size="large" />
          )}

          <View style={styles.emailRow}>
            <Mail size={14} color={theme.colors.textFaint} />
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
              <Globe size={20} color={theme.colors.primary} />
              <View>
                <Text style={styles.itemTitle}>{t('profile.language_setting')}</Text>
                <Text style={styles.itemSub}>{currentLangLabel}</Text>
              </View>
            </View>

            <LanguageSelector />
          </View>
        </View>

        {/* Blocklist Entry */}
        <TouchableOpacity style={styles.sectionCard} onPress={openBlocklist} activeOpacity={0.7}>
          <View style={styles.sectionItem}>
            <View style={styles.itemLeft}>
              <UserX size={20} color={theme.colors.danger} />
              <View>
                <Text style={styles.itemTitle}>{t('profile.blocklist_title')}</Text>
                <Text style={styles.itemSub}>
                  {blocklistLoading ? '…' : `${blocklist.length} ${t('profile.blocked_label')}`}
                </Text>
              </View>
            </View>
            <Text style={styles.chevronText}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Logout Action */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => setConfirmLogoutModal(true)}
          activeOpacity={0.8}
        >
          <LogOut size={18} color={theme.colors.danger} />
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
      {/* Blocklist Modal */}
      <Modal visible={blocklistModal} transparent animationType="fade" onRequestClose={() => setBlocklistModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBlocklistModal(false)}
        >
          <View style={styles.blocklistModalCard}>
            <Text style={styles.modalTitle}>{t('profile.blocklist_title')}</Text>

            {blocklistLoading ? (
              <View style={styles.blocklistCentered}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : blocklist.length === 0 ? (
              <View style={styles.blocklistCentered}>
                <UserX size={28} color={theme.colors.textFaint} />
                <Text style={styles.blocklistEmpty}>{t('profile.blocklist_empty')}</Text>
              </View>
            ) : (
              <ScrollView style={styles.blocklistScroll}>
                {blocklist.map((entry) => {
                  const name = entry.blocked_user?.[0]?.username || 'Professional User';
                  return (
                    <View key={entry.blocked_id} style={styles.blocklistRow}>
                      <View style={styles.blocklistAvatar}>
                        <Text style={styles.blocklistAvatarText}>
                          {name.substring(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.blocklistName} numberOfLines={1}>
                        {name}
                      </Text>
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => handleRemoveFromBlocklist(entry.blocked_id)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.removeBtnText}>{t('profile.unblock_user')}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.blocklistClose} onPress={() => setBlocklistModal(false)}>
              <Text style={styles.blocklistCloseText}>{t('feed.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
  },
  barTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  userCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emailText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  bioBox: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginTop: 4,
  },
  bioText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  itemSub: {
    color: theme.colors.textMuted,
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
    color: theme.colors.danger,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    color: theme.colors.textSecondary,
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
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 12,
  },
  cancelModalText: {
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  confirmLogoutBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderRadius: 12,
  },
  confirmLogoutText: {
    color: theme.colors.white,
    fontWeight: '800',
  },
  chevronText: {
    color: theme.colors.textFaint,
    fontSize: 22,
    fontWeight: '600',
  },
  blocklistModalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  blocklistCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  blocklistEmpty: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  blocklistScroll: {
    alignSelf: 'stretch',
    maxHeight: 260,
  },
  blocklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  blocklistAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blocklistAvatarText: {
    color: theme.colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  blocklistName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  removeBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeBtnText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  blocklistClose: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  blocklistCloseText: {
    color: theme.colors.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },
});
