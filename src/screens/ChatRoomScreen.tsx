import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, Check, CheckCheck } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Message } from '../types/database';
import { ConnectionStatusBanner, RealtimeStatus } from '../components/ConnectionStatusBanner';

interface ChatRoomScreenProps {
  conversationId: string;
  recipientName: string;
  onBack: () => void;
}

export const ChatRoomScreen: React.FC<ChatRoomScreenProps> = ({
  conversationId,
  recipientName,
  onBack,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connected');

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

  const handleSendMessage = async () => {
    if (!inputText.trim() || !user || sending) return;

    const messageContent = inputText.trim();
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
          <ArrowLeft size={22} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.recipientName}>{recipientName}</Text>
          <Text style={styles.onlineBadge}>● {t('chat.online')}</Text>
        </View>

        <View style={{ width: 32 }} />
      </View>

      <ConnectionStatusBanner status={realtimeStatus} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0EA5E9" />
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
                          <CheckCheck size={14} color="#38BDF8" />
                        ) : (
                          <Check size={14} color="#94A3B8" />
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
            style={styles.textInput}
            placeholder={t('chat.input_placeholder')}
            placeholderTextColor="#64748B"
            value={inputText}
            onChangeText={setInputText}
            multiline
          />

          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={18} color="#FFFFFF" />
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
    backgroundColor: '#0F172A',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#1E293B',
  },
  headerInfo: {
    alignItems: 'center',
  },
  recipientName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  onlineBadge: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
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
    backgroundColor: '#0EA5E9',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  myText: {
    color: '#FFFFFF',
  },
  theirText: {
    color: '#F8FAFC',
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
    color: '#64748B',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0EA5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#334155',
  },
});
