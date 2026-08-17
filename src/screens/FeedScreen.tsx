import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Plus, MessageSquarePlus, RefreshCw, X, Send } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Topic, ProfessionKey } from '../types/database';
import { TopicCard } from '../components/TopicCard';
import { ProfessionMultiFilter } from '../components/ProfessionMultiFilter';
import { ConnectionStatusBanner, RealtimeStatus } from '../components/ConnectionStatusBanner';
import { LanguageSelector } from '../components/LanguageSelector';
import { theme } from '../theme';

interface FeedScreenProps {
  onOpenChat: (conversationId: string, recipientName: string) => void;
  onOpenProfile: () => void;
}

/** Topic Hall 展示窗口：仅抓取并显示最近 24 小时内的话题 */
const TOPIC_HALL_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 每个用户在展示窗口内最多可出现在 Topic Hall 的话题数 */
const MAX_ACTIVE_TOPICS_PER_USER = 3;

export const FeedScreen: React.FC<FeedScreenProps> = ({ onOpenChat, onOpenProfile }) => {
  const { t } = useTranslation();
  const { user, profile } = useAuth();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedProfessions, setSelectedProfessions] = useState<ProfessionKey[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connected');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTopicContent, setNewTopicContent] = useState<string>('');
  const [isPosting, setIsPosting] = useState<boolean>(false);

  const fetchTopics = async () => {
    try {
      setLoading(true);
      // 仅抓取 24 小时内的有效话题，超过窗口的话题不再出现在 Topic Hall
      const cutoff = new Date(Date.now() - TOPIC_HALL_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from('topics')
        .select(`
          *,
          profiles:user_id (
            id,
            username,
            profession,
            avatar_url
          )
        `)
        .eq('is_active', true)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTopics(data as Topic[]);
      }
    } catch (err) {
      console.error('Error fetching topics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTopics();

    // Setup Supabase Realtime Subscription on topics table
    const topicsChannel = supabase
      .channel('public:topics')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topics' },
        async (payload) => {
          console.log('Realtime topic change received:', payload);
          // Refetch feed to ensure user profiles are properly joined
          fetchTopics();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus('offline');
        } else {
          setRealtimeStatus('connecting');
        }
      });

    return () => {
      supabase.removeChannel(topicsChannel);
    };
  }, []);

  const handleToggleProfessionFilter = (key: ProfessionKey) => {
    setSelectedProfessions((prev) => {
      if (prev.includes(key)) {
        return prev.filter((p) => p !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleClearFilter = () => {
    setSelectedProfessions([]);
  };

  const filteredTopics = topics.filter((topic) => {
    if (selectedProfessions.length === 0) return true;
    const authorProf = topic.profiles?.profession;
    return authorProf ? selectedProfessions.includes(authorProf as ProfessionKey) : false;
  });

  const handlePostTopic = async () => {
    if (!newTopicContent.trim() || !user) return;

    try {
      // 发布前校验：每名用户在 24 小时窗口内最多 3 个话题可出现在 Topic Hall。
      // 超过窗口的话题不显示、也不计入名额。
      const cutoff = new Date(Date.now() - TOPIC_HALL_WINDOW_MS).toISOString();
      const { count, error: countError } = await supabase
        .from('topics')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gte('created_at', cutoff);

      if (!countError && (count ?? 0) >= MAX_ACTIVE_TOPICS_PER_USER) {
        Alert.alert(
          t('feed.topic_limit_title'),
          t('feed.topic_limit_message')
        );
        return;
      }

      setIsPosting(true);
      const { error } = await supabase.from('topics').insert({
        user_id: user.id,
        content: newTopicContent.trim(),
        is_active: true,
      });

      if (!error) {
        setNewTopicContent('');
        setIsModalOpen(false);
        fetchTopics();
      } else {
        console.error('Error posting topic:', error);
      }
    } catch (err) {
      console.error('Failed to post topic:', err);
    } finally {
      setIsPosting(false);
    }
  };

  const handleStartChatFromTopic = async (topic: Topic) => {
    if (!user || user.id === topic.user_id) return;

    try {
      // 1. Check if conversation already exists between current user & topic author for this topic or overall
      const { data: existingConvs, error: findError } = await supabase
        .from('conversations')
        .select('*')
        .or(`and(participant1_id.eq.${user.id},participant2_id.eq.${topic.user_id}),and(participant1_id.eq.${topic.user_id},participant2_id.eq.${user.id})`);

      let conversationId: string;

      if (!findError && existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
      } else {
        // 2. Create new conversation
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            participant1_id: user.id,
            participant2_id: topic.user_id,
            topic_id: topic.id,
          })
          .select()
          .single();

        if (createError || !newConv) {
          console.error('Error creating conversation:', createError);
          return;
        }
        conversationId = newConv.id;
      }

      const recipientName = topic.profiles?.username || 'Professional';
      onOpenChat(conversationId, recipientName);
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <Text style={styles.barTitle}>{t('feed.title')}</Text>
        <View style={styles.rightHeaderRow}>
          <LanguageSelector />
          <TouchableOpacity style={styles.profileAvatarBtn} onPress={onOpenProfile} activeOpacity={0.8}>
            <Text style={styles.avatarInitial}>
              {profile?.username ? profile.username.substring(0, 1).toUpperCase() : 'U'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ConnectionStatusBanner status={realtimeStatus} />

      {/* Multi-Select Profession Filter */}
      <ProfessionMultiFilter
        selectedProfessions={selectedProfessions}
        onToggleProfession={handleToggleProfessionFilter}
        onClearAll={handleClearFilter}
      />

      {/* Topics Feed List */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredTopics}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TopicCard
              topic={item}
              currentUserId={user?.id}
              onStartChat={handleStartChatFromTopic}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchTopics();
              }}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MessageSquarePlus size={48} color={theme.colors.textFaint} />
              <Text style={styles.emptyText}>{t('feed.no_topics')}</Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button (FAB) to Post Topic */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setIsModalOpen(true)}
        activeOpacity={0.85}
      >
        <Plus size={24} color={theme.colors.white} />
        <Text style={styles.fabText}>{t('feed.publish_button')}</Text>
      </TouchableOpacity>

      {/* Post Topic Modal */}
      <Modal visible={isModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('feed.modal_title')}</Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <X size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder={t('feed.topic_placeholder')}
              placeholderTextColor={theme.colors.textFaint}
              multiline
              value={newTopicContent}
              onChangeText={setNewTopicContent}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>{t('feed.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handlePostTopic}
                disabled={isPosting || !newTopicContent.trim()}
              >
                {isPosting ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <>
                    <Send size={16} color={theme.colors.white} />
                    <Text style={styles.submitBtnText}>{t('feed.submit')}</Text>
                  </>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  barTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  rightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileAvatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: theme.colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    padding: 14,
    height: 120,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  cancelBtnText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  submitBtnText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
