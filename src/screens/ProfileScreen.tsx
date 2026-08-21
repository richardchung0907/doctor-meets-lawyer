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
  TextInput,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LogOut, Globe, Mail, Shield, Check, UserX, UserCheck, Pencil, Crown, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ProfessionBadge } from '../components/ProfessionBadge';
import { GenderAvatar } from '../components/GenderAvatar';
import { LanguageSelector } from '../components/LanguageSelector';
import { SupportedLanguage, setAppLanguage } from '../i18n';
import { theme } from '../theme';
import { BlockedEntry, fetchMyBlocklist, unblockUser } from '../lib/blocklist';

interface ProfileScreenProps {
  onBack: () => void;
  onLoggedOut: () => void;
  onOpenPaywall: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack, onLoggedOut, onOpenPaywall }) => {
  const { t, i18n } = useTranslation();
  const { profile, user, signOut, isLoading, refreshProfile, isPremium } = useAuth();

  const [confirmLogoutModal, setConfirmLogoutModal] = useState(false);
  const [blocklistModal, setBlocklistModal] = useState(false);
  const [blocklist, setBlocklist] = useState<BlockedEntry[]>([]);
  const [blocklistLoading, setBlocklistLoading] = useState(false);
  // ScrollView 是否已挂载（延迟到 Modal 打开后的下一渲染周期，见下方 useEffect 说明）
  const [blocklistRendered, setBlocklistRendered] = useState(false);
  // 编辑个人简介
  const [bioModalVisible, setBioModalVisible] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [bioSaving, setBioSaving] = useState(false);

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
    setBlocklistRendered(false);
    await loadBlocklist();
  };

  const handleRemoveFromBlocklist = async (blockedId: string) => {
    const ok = await unblockUser(blockedId);
    if (ok) {
      setBlocklist((prev) => prev.filter((e) => e.blocked_id !== blockedId));
    }
  };

  // ---- 编辑个人简介 ----
  const openBioModal = () => {
    setBioDraft(profile?.bio ?? '');
    setBioModalVisible(true);
  };

  const saveBio = async () => {
    if (!user) return;
    setBioSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ bio: bioDraft.trim() })
      .eq('id', user.id);
    setBioSaving(false);
    if (error) {
      Alert.alert(t('profile.title'), error.message);
      return;
    }
    setBioModalVisible(false);
    await refreshProfile();
  };

  // 挂载时即加载黑名单，保证入口处的数量始终正确
  useEffect(() => {
    loadBlocklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RN 0.76 旧架构 Android 回归（react-native#48822）：Modal 与 ScrollView 在同一
  // 渲染批次挂载时，ScrollView 高度测量异常（实机表现：列表内容不可见/不可滚）。
  // 把 ScrollView 的挂载推迟到 Modal 打开后的下一渲染周期，规避该回归；
  // 50ms 保证覆盖旧设备的低帧率场景，且用户无感。
  useEffect(() => {
    if (!blocklistModal) return;
    const timer = setTimeout(() => setBlocklistRendered(true), 50);
    return () => clearTimeout(timer);
  }, [blocklistModal]);

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
            <GenderAvatar gender={profile?.gender} size={36} />
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
          ) : (
            <Text style={styles.noBioText}>{t('profile.bio_placeholder')}</Text>
          )}

          {/* 编辑简介入口 */}
          <TouchableOpacity style={styles.editBioBtn} onPress={openBioModal} activeOpacity={0.7}>
            <Pencil size={13} color={theme.colors.primaryDark} />
            <Text style={styles.editBioBtnText}>{t('profile.edit_bio')}</Text>
          </TouchableOpacity>
        </View>

        {/* Premium Membership Card（高级会员 = 身份标识，暂无功能权益） */}
        <TouchableOpacity
          style={styles.premiumCard}
          onPress={onOpenPaywall}
          activeOpacity={0.85}
        >
          <View style={[styles.premiumIcon, isPremium && styles.premiumIconActive]}>
            <Crown size={20} color={isPremium ? theme.colors.white : theme.colors.warning} />
          </View>
          <View style={styles.premiumInfo}>
            <Text style={styles.premiumTitle}>
              {isPremium ? t('premium.member_label') : t('premium.cta_title')}
            </Text>
            <Text style={styles.premiumSub}>
              {isPremium
                ? profile?.premium_expires_at
                  ? t('premium.expires_at', { date: new Date(profile.premium_expires_at).toLocaleDateString() })
                  : t('premium.member_lifetime')
                : t('premium.cta_sub')}
            </Text>
          </View>
          <ChevronRight size={20} color={theme.colors.textFaint} />
        </TouchableOpacity>

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
            ) : blocklistRendered ? (
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
                        <UserCheck size={14} color={theme.colors.success} />
                        <Text style={styles.removeBtnText}>{t('profile.unblock_user')}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              // 延迟挂载生效前的占位，保持分支结构稳定，避免布局跳动
              <View style={styles.blocklistScroll} />
            )}

            <TouchableOpacity style={styles.blocklistClose} onPress={() => setBlocklistModal(false)}>
              <Text style={styles.blocklistCloseText}>{t('feed.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Bio Modal */}
      <Modal
        visible={bioModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBioModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bioModalCard}>
            <Text style={styles.modalTitle}>{t('profile.edit_bio')}</Text>
            <TextInput
              style={styles.bioInput}
              placeholder={t('profile.bio_placeholder')}
              placeholderTextColor={theme.colors.textFaint}
              multiline
              maxLength={500}
              value={bioDraft}
              onChangeText={setBioDraft}
            />
            <View style={styles.bioModalActions}>
              <TouchableOpacity
                style={styles.bioCancelBtn}
                onPress={() => setBioModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.bioCancelText}>{t('feed.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bioSaveBtn}
                onPress={saveBio}
                disabled={bioSaving}
                activeOpacity={0.8}
              >
                {bioSaving ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.bioSaveText}>{t('profile.save_bio')}</Text>
                )}
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
  noBioText: {
    color: theme.colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  editBioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 6,
  },
  editBioBtnText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  bioModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    gap: 12,
  },
  bioInput: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    padding: 12,
    minHeight: 110,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  bioModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  bioCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  bioCancelText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  bioSaveBtn: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  bioSaveText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  premiumIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumIconActive: {
    backgroundColor: theme.colors.warning,
  },
  premiumInfo: {
    flex: 1,
    gap: 2,
  },
  premiumTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  premiumSub: {
    color: theme.colors.textMuted,
    fontSize: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeBtnText: {
    color: theme.colors.success,
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
