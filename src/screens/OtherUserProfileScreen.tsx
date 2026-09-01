import React, { useEffect, useState, useCallback } from 'react';
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
import { ArrowLeft, User, Calendar, UserMinus, UserCheck } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { Profile, ProfessionKey } from '../types/database';
import { ProfessionBadge } from '../components/ProfessionBadge';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { GenderAvatar } from '../components/GenderAvatar';
import { theme } from '../theme';
import { isBlockedWith, isBlockedByMe, blockUser, unblockUser } from '../lib/blocklist';

interface OtherUserProfileScreenProps {
  userId: string;
  onBack: () => void;
}

export const OtherUserProfileScreen: React.FC<OtherUserProfileScreenProps> = ({ userId, onBack }) => {
  const { t } = useTranslation();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const [{ data, error }, blockActive, mine] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, profession, gender, age, avatar_url, bio, created_at, verification_status')
          .eq('id', userId)
          .maybeSingle(),
        isBlockedWith(userId),
        isBlockedByMe(userId),
      ]);
      if (error || !data) {
        setNotFound(true);
      } else {
        setProfile(data as Profile);
      }
      setBlocked(blockActive);
      setBlockedByMe(mine);
    } catch (err) {
      console.error('Error loading profile:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBlock = () => {
    Alert.alert(t('profile.blocked_confirm_title'), t('profile.blocked_confirm_message'), [
      { text: t('feed.cancel'), style: 'cancel' },
      {
        text: t('profile.block_user'),
        style: 'destructive',
        onPress: async () => {
          const ok = await blockUser(userId);
          if (ok) {
            setBlocked(true);
            setBlockedByMe(true);
          }
        },
      },
    ]);
  };

  // 解封：低风险可逆操作，直接执行，不弹确认（与名字旁/黑名单列表一致）
  const handleUnblock = async () => {
    const ok = await unblockUser(userId);
    if (ok) {
      // 仅当双方都不再拉黑时，黑名单效力才取消
      const stillBlocked = await isBlockedWith(userId);
      setBlocked(stillBlocked);
      setBlockedByMe(false);
    }
  };

  const joinDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '';
  const metaParts = [
    profile?.gender ? t(`auth.gender_${profile.gender}`) : null,
    profile?.age != null ? String(profile.age) : null,
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.barTitle}>{t('profile.other_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : notFound || !profile ? (
        <View style={styles.centered}>
          <User size={40} color={theme.colors.textFaint} />
          <Text style={styles.notFoundText}>{t('profile.not_found')}</Text>
        </View>
      ) : blocked ? (
        /* 黑名单生效：双方均不能查看对方资料 */
        <View style={styles.centered}>
          <UserMinus size={40} color={theme.colors.danger} />
          <Text style={styles.blockedText}>{t('profile.profile_unavailable')}</Text>
          {blockedByMe && (
            <TouchableOpacity style={styles.unblockBtn} onPress={handleUnblock} activeOpacity={0.8}>
              <UserCheck size={16} color={theme.colors.success} />
              <Text style={styles.unblockBtnText}>{t('profile.unblock_user')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Public Info Card */}
          <View style={styles.userCard}>
            <View style={styles.avatarLarge}>
              <GenderAvatar gender={profile.gender} size={48} />
            </View>

            <Text style={styles.username}>{profile.username || 'Professional User'}</Text>

            {profile.profession && (
              <View style={styles.professionRow}>
                <ProfessionBadge profession={profile.profession as ProfessionKey} size="large" />
                <VerifiedBadge status={profile.verification_status} size="medium" />
              </View>
            )}

            {metaParts.length > 0 && (
              <Text style={styles.metaText}>{metaParts.join(' · ')}</Text>
            )}

            {profile.bio ? (
              <View style={styles.bioBox}>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </View>
            ) : null}

            {joinDate ? (
              <View style={styles.joinRow}>
                <Calendar size={14} color={theme.colors.textFaint} />
                <Text style={styles.joinText}>{t('profile.member_since', { date: joinDate })}</Text>
              </View>
            ) : null}
          </View>

          {/* Block Action */}
          <TouchableOpacity style={styles.blockBtn} onPress={handleBlock} activeOpacity={0.8}>
            <UserMinus size={16} color={theme.colors.danger} />
            <Text style={styles.blockBtnText}>{t('profile.block_user')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    padding: 20,
  },
  notFoundText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  blockedText: {
    color: theme.colors.danger,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  unblockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  unblockBtnText: {
    color: theme.colors.success,
    fontSize: 14,
    fontWeight: '700',
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
  avatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  professionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  metaText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
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
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  joinText: {
    color: theme.colors.textFaint,
    fontSize: 12,
  },
  blockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  blockBtnText: {
    color: theme.colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
});
