import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, User, Calendar } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { Profile, ProfessionKey } from '../types/database';
import { ProfessionBadge } from '../components/ProfessionBadge';
import { theme } from '../theme';

interface OtherUserProfileScreenProps {
  userId: string;
  onBack: () => void;
}

export const OtherUserProfileScreen: React.FC<OtherUserProfileScreenProps> = ({ userId, onBack }) => {
  const { t } = useTranslation();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, profession, gender, age, avatar_url, bio, created_at')
          .eq('id', userId)
          .maybeSingle();
        if (!cancelled) {
          if (error || !data) {
            setNotFound(true);
          } else {
            setProfile(data as Profile);
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Public Info Card */}
          <View style={styles.userCard}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarInitial}>
                {profile.username ? profile.username.substring(0, 1).toUpperCase() : '?'}
              </Text>
            </View>

            <Text style={styles.username}>{profile.username || 'Professional User'}</Text>

            {profile.profession && (
              <ProfessionBadge profession={profile.profession as ProfessionKey} size="large" />
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
    gap: 12,
    padding: 20,
  },
  notFoundText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 20,
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
});
