import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MessageSquare, ChevronRight, UserMinus, UserCheck } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Conversation, Profile, ProfessionKey } from '../types/database';
import { ProfessionBadge } from '../components/ProfessionBadge';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { GenderAvatar } from '../components/GenderAvatar';
import { theme } from '../theme';
import { blockUser, unblockUser } from '../lib/blocklist';

interface ConversationsScreenProps {
  onOpenChat: (conversationId: string, recipientName: string, recipientId: string) => void;
  onViewUserProfile: (userId: string) => void;
}

export const ConversationsScreen: React.FC<ConversationsScreenProps> = ({ onOpenChat, onViewUserProfile }) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  // 我已拉黑的用户 id 集合 → 决定名字旁显示“拉黑”还是“移出黑名单”
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const fetchConversations = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 我的拉黑列表（blocked_users RLS 只允许看自己拉黑的，此处方向正确）
      const { data: blkRows } = await supabase
        .from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', user.id);
      setBlockedIds(new Set((blkRows ?? []).map((r) => r.blocked_id)));

      // Query conversations where user is participant1 or participant2
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          participant1:participant1_id (id, username, profession, gender, avatar_url, verification_status),
          participant2:participant2_id (id, username, profession, gender, avatar_url, verification_status)
        `)
        .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
        .order('updated_at', { ascending: false });

      if (!error && data) {
        // Map to include other_participant and fetch last message + unread count
        const processed: Conversation[] = await Promise.all(
          data.map(async (conv: any) => {
            const isP1 = conv.participant1_id === user.id;
            const otherParticipant: Profile = isP1 ? conv.participant2 : conv.participant1;

            // Fetch last message
            const { data: lastMsg } = await supabase
              .from('messages')
              .select('*')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            // Fetch unread count
            const { count: unreadCount } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conv.id)
              .neq('sender_id', user.id)
              .eq('is_read', false);

            return {
              ...conv,
              other_participant: otherParticipant,
              last_message: lastMsg || null,
              unread_count: unreadCount || 0,
            };
          })
        );

        setConversations(processed);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    // Subscribe to conversations & messages changes
    const convChannel = supabase
      .channel('public:conversations_and_messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
    };
  }, [user]);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleBlockUser = (targetId: string) => {
    Alert.alert(t('profile.blocked_confirm_title'), t('profile.blocked_confirm_message'), [
      { text: t('feed.cancel'), style: 'cancel' },
      {
        text: t('profile.block_user'),
        style: 'destructive',
        onPress: async () => {
          await blockUser(targetId);
          fetchConversations();
        },
      },
    ]);
  };

  const handleUnblockUser = async (targetId: string) => {
    const ok = await unblockUser(targetId);
    if (ok) fetchConversations();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Text style={styles.barTitle}>{t('conversations.title')}</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const partner = item.other_participant;
            const partnerProf = (partner?.profession || 'other') as ProfessionKey;
            const partnerName = partner?.username || 'Professional User';
            const unread = item.unread_count || 0;

            return (
              <TouchableOpacity
                style={styles.convItem}
                onPress={() => onOpenChat(item.id, partnerName, partner?.id || '')}
                activeOpacity={0.7}
              >
                <View style={styles.avatar}>
                  <GenderAvatar gender={partner?.gender} size={20} />
                </View>

                <View style={styles.convDetails}>
                  <View style={styles.topRow}>
                    <View style={styles.nameWithBlock}>
                      <TouchableOpacity
                        onPress={() => partner?.id && onViewUserProfile(partner.id)}
                        activeOpacity={0.7}
                        style={styles.nameLink}
                      >
                        <Text style={styles.partnerName} numberOfLines={1}>
                          {partnerName}
                        </Text>
                      </TouchableOpacity>
                      {partner?.id && partner.id !== user?.id && (
                        blockedIds.has(partner.id) ? (
                          <TouchableOpacity
                            onPress={() => handleUnblockUser(partner.id)}
                            activeOpacity={0.7}
                            style={styles.blockIconBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <UserCheck size={14} color={theme.colors.success} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleBlockUser(partner.id)}
                            activeOpacity={0.7}
                            style={styles.blockIconBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <UserMinus size={14} color={theme.colors.danger} />
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                    <Text style={styles.timeText}>
                      {formatDate(item.last_message?.created_at || item.updated_at)}
                    </Text>
                  </View>

                  <View style={styles.profRow}>
                    <ProfessionBadge profession={partnerProf} size="small" />
                    <VerifiedBadge status={partner?.verification_status} size="small" />
                  </View>

                  <Text style={styles.lastMsgText} numberOfLines={1}>
                    {item.last_message ? item.last_message.content : 'Started conversation...'}
                  </Text>
                </View>

                {unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unread}</Text>
                  </View>
                ) : (
                  <ChevronRight size={18} color={theme.colors.textFaint} />
                )}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchConversations();
              }}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MessageSquare size={48} color={theme.colors.textFaint} />
              <Text style={styles.emptyText}>{t('conversations.no_chats')}</Text>
            </View>
          }
        />
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  barTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  convDetails: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  nameWithBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  nameLink: {
    flexShrink: 1,
  },
  blockIconBtn: {
    padding: 2,
  },
  partnerName: {
    color: theme.colors.primaryDark,
    fontSize: 16,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  timeText: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  profRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  lastMsgText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  unreadBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 22,
    alignItems: 'center',
  },
  unreadText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
