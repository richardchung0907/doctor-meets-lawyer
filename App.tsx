import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, StatusBar, AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Home, User as UserIcon } from 'lucide-react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LandingScreen } from './src/screens/LandingScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { ChatRoomScreen } from './src/screens/ChatRoomScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { OtherUserProfileScreen } from './src/screens/OtherUserProfileScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { ProfessionKey } from './src/types/database';
import { Message } from './src/types/database';
import { loadPersistedLanguage } from './src/i18n';
import { theme } from './src/theme';
import { supabase } from './src/lib/supabase';
import { syncPushToken, showLocalNotification } from './src/lib/notifications';

type MainTab = 'feed' | 'conversations' | 'profile';

const AppNavigator: React.FC = () => {
  const { t } = useTranslation();
  const { session, isLoading, user } = useAuth();

  const [activeScreen, setActiveScreen] = useState<'landing' | 'auth' | 'main' | 'chat' | 'paywall'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [selectedProfession, setSelectedProfession] = useState<ProfessionKey | null>(null);

  const [currentTab, setCurrentTab] = useState<MainTab>('feed');
  const [activeChat, setActiveChat] = useState<{ id: string; recipientName: string; recipientId: string } | null>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);

  // 查看他人资料：不允许查看自己（防止从话题大厅自己的名字进入含拉黑按钮的资料页）
  const handleViewUserProfile = useCallback((userId: string) => {
    if (user && userId !== user.id) {
      setViewingProfileId(userId);
    }
  }, [user]);

  // refs to avoid re-subscribing the realtime channel on every screen change
  const activeChatRef = useRef(activeChat);
  const activeScreenRef = useRef(activeScreen);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);
  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  const fetchUnreadTotal = useCallback(async () => {
    if (!user) {
      setTotalUnread(0);
      return;
    }
    try {
      const { data: convs, error } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`);
      if (error || !convs || convs.length === 0) {
        setTotalUnread(0);
        return;
      }
      const ids = convs.map((c) => c.id);
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', ids)
        .eq('is_read', false)
        .neq('sender_id', user.id);
      setTotalUnread(count ?? 0);
    } catch (err) {
      console.error('Error fetching unread total:', err);
    }
  }, [user]);

  // 在线心跳：app 在前台时每 60s 更新 profiles.last_seen（聊天室在线状态依据）；
  // 退到后台暂停，回到前台立即报活。
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id);
        if (error) console.warn('heartbeat failed:', error.message);
      } catch (e) {
        console.warn('heartbeat error:', String(e));
      }
    };
    const handleAppState = (state: string) => {
      if (state === 'active') {
        beat();
        if (!timer) timer = setInterval(beat, 60000);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    beat();
    timer = setInterval(beat, 60000);
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [user]);

  // Global unread badge + new-message notifications
  useEffect(() => {
    if (!user) return;

    fetchUnreadTotal();
    syncPushToken(); // 登录后同步远程推送 token

    const channel = supabase
      .channel('app-global-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as Message;
          if (!msg || msg.sender_id === user.id) return;

          const { data: conv } = await supabase
            .from('conversations')
            .select('participant1_id, participant2_id')
            .eq('id', msg.conversation_id)
            .maybeSingle();
          if (!conv) return;
          const isMine = conv.participant1_id === user.id || conv.participant2_id === user.id;
          if (!isMine) return;

          fetchUnreadTotal();

          // 若当前正停留在该会话聊天室，消息已实时展示，不再弹通知
          const inActiveChat =
            activeScreenRef.current === 'chat' && activeChatRef.current?.id === msg.conversation_id;
          if (inActiveChat) return;

          const { data: sender } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', msg.sender_id)
            .maybeSingle();
          showLocalNotification(sender?.username || 'New message', msg.content);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => fetchUnreadTotal()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnreadTotal]);

  useEffect(() => {
    // Load persisted i18n language on mount
    loadPersistedLanguage();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (session) {
        setActiveScreen('main');
      } else {
        if (activeScreen === 'main' || activeScreen === 'chat') {
          setActiveScreen('landing');
        }
      }
    }
  }, [session, isLoading]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>{t('app_title')}</Text>
      </View>
    );
  }

  // 1. Landing / Onboarding Screen
  if (activeScreen === 'landing') {
    return (
      <LandingScreen
        onSelectProfessionToSignup={(prof) => {
          setSelectedProfession(prof);
          setAuthMode('signup');
          setActiveScreen('auth');
        }}
        onGoToLogin={() => {
          setSelectedProfession(null);
          setAuthMode('login');
          setActiveScreen('auth');
        }}
      />
    );
  }

  // 2. Auth Screen
  if (activeScreen === 'auth') {
    return (
      <AuthScreen
        initialMode={authMode}
        initialProfession={selectedProfession}
        onBack={() => setActiveScreen('landing')}
        onSuccess={() => setActiveScreen('main')}
      />
    );
  }

  // 3. Other user's public profile (full-screen, with back)
  if (viewingProfileId) {
    return (
      <OtherUserProfileScreen
        userId={viewingProfileId}
        onBack={() => setViewingProfileId(null)}
      />
    );
  }

  // 4. Chat Room Screen
  if (activeScreen === 'chat' && activeChat) {
    return (
      <ChatRoomScreen
        conversationId={activeChat.id}
        recipientName={activeChat.recipientName}
        recipientId={activeChat.recipientId}
        onPressRecipient={() => handleViewUserProfile(activeChat.recipientId)}
        onBack={() => {
          setActiveChat(null);
          setActiveScreen('main');
        }}
      />
    );
  }

  // 5. Paywall Screen（高级会员升级页，全屏）
  if (activeScreen === 'paywall') {
    return (
      <PaywallScreen
        onBack={() => setActiveScreen('main')}
      />
    );
  }

  // 6. Main Tab Navigation
  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      
      <View style={{ flex: 1 }}>
        {currentTab === 'feed' && (
          <FeedScreen
            onOpenChat={(convId, name, partnerId) => {
              setActiveChat({ id: convId, recipientName: name, recipientId: partnerId });
              setActiveScreen('chat');
            }}
            onOpenProfile={() => setCurrentTab('profile')}
            onViewUserProfile={handleViewUserProfile}
          />
        )}

        {currentTab === 'conversations' && (
          <ConversationsScreen
            onOpenChat={(convId, name, partnerId) => {
              setActiveChat({ id: convId, recipientName: name, recipientId: partnerId });
              setActiveScreen('chat');
            }}
            onViewUserProfile={handleViewUserProfile}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileScreen
            onBack={() => setCurrentTab('feed')}
            onLoggedOut={() => setActiveScreen('landing')}
            onOpenPaywall={() => setActiveScreen('paywall')}
          />
        )}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'feed' && styles.activeTabItem]}
          onPress={() => setCurrentTab('feed')}
          activeOpacity={0.7}
        >
          <Home size={22} color={currentTab === 'feed' ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.tabLabel, currentTab === 'feed' && styles.activeTabLabel]}>
            {t('nav.feed')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'conversations' && styles.activeTabItem]}
          onPress={() => setCurrentTab('conversations')}
          activeOpacity={0.7}
        >
          <View>
            <MessageSquare size={22} color={currentTab === 'conversations' ? theme.colors.primary : theme.colors.textMuted} />
            {totalUnread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.tabLabel, currentTab === 'conversations' && styles.activeTabLabel]}>
            {t('nav.messages')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'profile' && styles.activeTabItem]}
          onPress={() => setCurrentTab('profile')}
          activeOpacity={0.7}
        >
          <UserIcon size={22} color={currentTab === 'profile' ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.tabLabel, currentTab === 'profile' && styles.activeTabLabel]}>
            {t('nav.profile')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingVertical: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  activeTabItem: {},
  tabLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  activeTabLabel: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
});
