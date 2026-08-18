import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Clock, UserMinus, UserCheck } from 'lucide-react-native';
import { Topic, ProfessionKey } from '../types/database';
import { ProfessionBadge } from './ProfessionBadge';
import { GenderAvatar } from './GenderAvatar';
import { theme } from '../theme';
import { blockUser, unblockUser, isBlockedByMe } from '../lib/blocklist';

interface TopicCardProps {
  topic: Topic;
  currentUserId?: string;
  onStartChat: (topic: Topic) => void;
  onPressAuthor: (userId: string) => void;
  onUserBlocked?: () => void;
}

export const TopicCard: React.FC<TopicCardProps> = ({
  topic,
  currentUserId,
  onStartChat,
  onPressAuthor,
  onUserBlocked,
}) => {
  const { t } = useTranslation();
  const [blockedByMe, setBlockedByMe] = useState(false);

  // 我是否已拉黑该话题作者 → 决定名字旁显示“拉黑”还是“移出黑名单”
  useEffect(() => {
    let cancelled = false;
    isBlockedByMe(topic.user_id).then((blocked) => {
      if (!cancelled) setBlockedByMe(blocked);
    });
    return () => {
      cancelled = true;
    };
  }, [topic.user_id]);

  const isOwnTopic = currentUserId && topic.user_id === currentUserId;
  const authorProfession = (topic.profiles?.profession || 'other') as ProfessionKey;
  const authorName = topic.profiles?.username || 'Professional User';

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const handleBlockAuthor = () => {
    Alert.alert(t('profile.blocked_confirm_title'), t('profile.blocked_confirm_message'), [
      { text: t('feed.cancel'), style: 'cancel' },
      {
        text: t('profile.block_user'),
        style: 'destructive',
        onPress: async () => {
          const ok = await blockUser(topic.user_id);
          if (ok) {
            setBlockedByMe(true);
            onUserBlocked?.();
          }
        },
      },
    ]);
  };

  const handleUnblockAuthor = async () => {
    const ok = await unblockUser(topic.user_id);
    if (ok) {
      setBlockedByMe(false);
      onUserBlocked?.();
    }
  };

  return (
    <View style={styles.card}>
      {/* Author Header */}
      <View style={styles.header}>
        <View style={styles.userInfoRow}>
          <View style={styles.avatar}>
            <GenderAvatar gender={topic.profiles?.gender} size={18} />
          </View>
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <TouchableOpacity
                onPress={() => onPressAuthor(topic.user_id)}
                activeOpacity={0.7}
                style={styles.nameLink}
              >
                <Text style={styles.username} numberOfLines={1}>
                  {authorName}
                </Text>
              </TouchableOpacity>
              {!isOwnTopic && (
                blockedByMe ? (
                  <TouchableOpacity
                    onPress={handleUnblockAuthor}
                    activeOpacity={0.7}
                    style={styles.blockIconBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <UserCheck size={14} color={theme.colors.success} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleBlockAuthor}
                    activeOpacity={0.7}
                    style={styles.blockIconBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <UserMinus size={14} color={theme.colors.danger} />
                  </TouchableOpacity>
                )
              )}
            </View>
            <View style={styles.timeRow}>
              <Clock size={12} color={theme.colors.textFaint} />
              <Text style={styles.timeText}>{formatDate(topic.created_at)}</Text>
            </View>
          </View>
        </View>

        <ProfessionBadge profession={authorProfession} size="small" />
      </View>

      {/* Content — 话题大厅强制最多 2 行，超出的在行末以 '...' 隐藏（自适应屏宽） */}
      <Text style={styles.content} numberOfLines={2} ellipsizeMode="tail">
        {topic.content}
      </Text>

      {/* Actions */}
      <View style={styles.footer}>
        {!isOwnTopic ? (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => onStartChat(topic)}
            activeOpacity={0.8}
          >
            <MessageSquare size={16} color={theme.colors.white} />
            <Text style={styles.chatButtonText}>{t('feed.start_chat')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.ownTopicBadge}>
            <Text style={styles.ownTopicText}>Your Topic</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  nameBlock: {
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameLink: {
    flexShrink: 1,
  },
  blockIconBtn: {
    padding: 2,
  },
  username: {
    color: theme.colors.primaryDark,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    color: theme.colors.textFaint,
    fontSize: 12,
  },
  content: {
    color: theme.colors.textContent,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chatButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  ownTopicBadge: {
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ownTopicText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
