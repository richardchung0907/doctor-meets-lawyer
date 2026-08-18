import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, Check, CheckCheck, UserMinus } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Message } from '../types/database';
import { truncateByWidth, exceedsWidthLimit, MESSAGE_MAX_UNITS } from '../lib/textLimit';
import { ConnectionStatusBanner, RealtimeStatus } from '../components/ConnectionStatusBanner';
import { theme } from '../theme';
import { isBlockedWith, blockUser } from '../lib/blocklist';

interface ChatRoomScreenProps {
  conversationId: string;
  recipientName: string;
  recipientId: string;
  onPressRecipient: () => void;
  onBack: () => void;
}

export const ChatRoomScreen: React.FC<ChatRoomScreenProps> = ({
  conversationId,
  recipientName,
  recipientId,
  onPressRecipient,
  onBack,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  // 对方在线状态：last_seen 距今 < 2 分钟判定在线（心跳每 60s 一次）
  const [partnerOnline, setPartnerOnline] = useState(true);
  const ONLINE_WINDOW_MS = 2 * 60 * 1000;

  const fetchPartnerPresence = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('last_seen')
      .eq('id', recipientId)
      .maybeSingle();
    if (data?.last_seen) {
      setPartnerOnline(Date.now() - new Date(data.last_seen).getTime() < ONLINE_WINDOW_MS);
    } else {
      setPartnerOnline(false);
    }
  }, [recipientId]);

  // 进入时查询 + 每 30s 刷新
  useEffect(() => {
    fetchPartnerPresence();
    const timer = setInterval(fetchPartnerPresence, 30000);
    return () => clearInterval(timer);
  }, [fetchPartnerPresence]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connected');
  const [blocked, setBlocked] = useState<boolean>(false);

  const flatListRef = useRef<FlatList>(null);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
        // Mark unread messages sent by the other party as read
        if (user) {
          await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('conversation_id', conversationId)
            .neq('sender_id', user.id)
            .eq('is_read', false);
        }
      }
    } catch (err) {
      console.error('Error fetching chat messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Subscribe to realtime messages for this conversation room
    const chatChannel = supabase
      .channel(`public:messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);

          // Automatically mark as read if received from other party while in room
          if (user && newMsg.sender_id !== user.id) {
            await supabase
              .from('messages')
              .update({ is_read: true })
              .eq('id', newMsg.id);
          }
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
      supabase.removeChannel(chatChannel);
    };
  }, [conversationId, user]);

  useEffect(() => {
    let cancelled = false;
    isBlockedWith(recipientId).then((blockedActive) => {
      if (!cancelled) setBlocked(blockedActive);
    });
    return () => {
      cancelled = true;
    };
  }, [recipientId]);

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    // 防御：输入框已限制，提交前再兜底一次（100 全角 / 半角按宽度）
    if (!trimmed || !user || sending || exceedsWidthLimit(trimmed, MESSAGE_MAX_UNITS)) return;

    const messageContent = trimmed;
    setInputText('');

    try {
      setSending(true);
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageContent,
        is_read: false,
      });

      if (error) {
        console.error('Error sending message:', error);
      } else {
        // Touch updated_at on conversation
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleBlockRecipient = () => {
    Alert.alert(t('profile.blocked_confirm_title'), t('profile.blocked_confirm_message'), [
      { text: t('feed.cancel'), style: 'cancel' },
      {
        text: t('profile.block_user'),
        style: 'destructive',
        onPress: async () => {
          const ok = await blockUser(recipientId);
          if (ok) setBlocked(true);
        },
      },
    ]);
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.headerNameRow}>
            <TouchableOpacity onPress={onPressRecipient} activeOpacity={0.7} style={styles.headerNameLink}>
              <Text style={styles.recipientName} numberOfLines={1}>
                {recipientName}
              </Text>
            </TouchableOpacity>
            {!blocked && (
              <TouchableOpacity
                onPress={handleBlockRecipient}
                activeOpacity={0.7}
                style={styles.blockIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <UserMinus size={14} color={theme.colors.danger} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.onlineBadge, !partnerOnline && styles.offlineBadge]}>
            ● {partnerOnline ? t('chat.online') : t('chat.offline')}
          </Text>
        </View>

        <View style={{ width: 32 }} />
      </View>

      <ConnectionStatusBanner status={realtimeStatus} />

      {blocked && (
        <View style={styles.blockedBanner}>
          <Text style={styles.blockedBannerText}>{t('chat.blocked_hint')}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isMine = item.sender_id === user?.id;

              return (
                <View
                  style={[
                    styles.messageBubbleWrapper,
                    isMine ? styles.myWrapper : styles.theirWrapper,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.myBubble : styles.theirBubble,
                    ]}
                  >
                    <Text style={[styles.messageText, isMine ? styles.myText : styles.theirText]}>
                      {item.content}
                    </Text>

                    <View style={styles.bubbleFooter}>
                      <Text style={[styles.timeText, isMine ? styles.myTime : styles.theirTime]}>
                        {formatTime(item.created_at)}
                      </Text>
                      {isMine && (
                        item.is_read ? (
                          <CheckCheck size={14} color={theme.colors.primaryLight} />
                        ) : (
                          <Check size={14} color={theme.colors.textFaint} />
                        )
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            contentContainerStyle={styles.messageListContent}
          />
        )}

        {/* Input Dock */}
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.textInput, blocked && styles.textInputDisabled]}
            placeholder={blocked ? t('chat.blocked_hint') : t('chat.input_placeholder')}
            placeholderTextColor={theme.colors.textFaint}
            value={inputText}
            onChangeText={(t) => setInputText(truncateByWidth(t, MESSAGE_MAX_UNITS))}
            multiline
            maxLength={MESSAGE_MAX_UNITS * 2}
            editable={!blocked}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending || blocked) && styles.sendBtnDisabled]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || sending || blocked}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Send size={18} color={theme.colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
  },
  headerInfo: {
    alignItems: 'center',
    flexShrink: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerNameLink: {
    flexShrink: 1,
  },
  blockIconBtn: {
    padding: 2,
  },
  recipientName: {
    color: theme.colors.primaryDark,
    fontSize: 16,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  onlineBadge: {
    color: theme.colors.success,
    fontSize: 11,
    fontWeight: '600',
  },
  offlineBadge: {
    color: theme.colors.textFaint,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageListContent: {
    padding: 16,
    gap: 10,
  },
  messageBubbleWrapper: {
    width: '100%',
    flexDirection: 'row',
  },
  myWrapper: {
    justifyContent: 'flex-end',
  },
  theirWrapper: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  myBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  myText: {
    color: theme.colors.white,
  },
  theirText: {
    color: theme.colors.textPrimary,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  timeText: {
    fontSize: 10,
  },
  myTime: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  theirTime: {
    color: theme.colors.textFaint,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.borderStrong,
  },
  blockedBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  blockedBannerText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  textInputDisabled: {
    opacity: 0.6,
  },
});
