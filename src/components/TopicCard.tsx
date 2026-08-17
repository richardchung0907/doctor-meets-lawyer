import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Clock, User } from 'lucide-react-native';
import { Topic, ProfessionKey } from '../types/database';
import { ProfessionBadge } from './ProfessionBadge';
import { theme } from '../theme';

interface TopicCardProps {
  topic: Topic;
  currentUserId?: string;
  onStartChat: (topic: Topic) => void;
}

export const TopicCard: React.FC<TopicCardProps> = ({
  topic,
  currentUserId,
  onStartChat,
}) => {
  const { t } = useTranslation();

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

  return (
    <View style={styles.card}>
      {/* Author Header */}
      <View style={styles.header}>
        <View style={styles.userInfoRow}>
          <View style={styles.avatar}>
            <User size={18} color={theme.colors.textMuted} />
          </View>
          <View style={styles.nameBlock}>
            <Text style={styles.username}>{authorName}</Text>
            <View style={styles.timeRow}>
              <Clock size={12} color={theme.colors.textFaint} />
              <Text style={styles.timeText}>{formatDate(topic.created_at)}</Text>
            </View>
          </View>
        </View>

        <ProfessionBadge profession={authorProfession} size="small" />
      </View>

      {/* Content */}
      <Text style={styles.content}>{topic.content}</Text>

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
  username: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
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
