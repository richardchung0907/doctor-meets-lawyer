import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Home, User as UserIcon } from 'lucide-react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LandingScreen } from './src/screens/LandingScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { ChatRoomScreen } from './src/screens/ChatRoomScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ProfessionKey } from './src/types/database';
import { loadPersistedLanguage } from './src/i18n';
import { theme } from './src/theme';

type MainTab = 'feed' | 'conversations' | 'profile';

const AppNavigator: React.FC = () => {
  const { t } = useTranslation();
  const { session, isLoading, user } = useAuth();

  const [activeScreen, setActiveScreen] = useState<'landing' | 'auth' | 'main' | 'chat'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [selectedProfession, setSelectedProfession] = useState<ProfessionKey | null>(null);

  const [currentTab, setCurrentTab] = useState<MainTab>('feed');
  const [activeChat, setActiveChat] = useState<{ id: string; recipientName: string } | null>(null);

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

  // 3. Chat Room Screen
  if (activeScreen === 'chat' && activeChat) {
    return (
      <ChatRoomScreen
        conversationId={activeChat.id}
        recipientName={activeChat.recipientName}
        onBack={() => {
          setActiveChat(null);
          setActiveScreen('main');
        }}
      />
    );
  }

  // 4. Main Tab Navigation
  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      
      <View style={{ flex: 1 }}>
        {currentTab === 'feed' && (
          <FeedScreen
            onOpenChat={(convId, name) => {
              setActiveChat({ id: convId, recipientName: name });
              setActiveScreen('chat');
            }}
            onOpenProfile={() => setCurrentTab('profile')}
          />
        )}

        {currentTab === 'conversations' && (
          <ConversationsScreen
            onOpenChat={(convId, name) => {
              setActiveChat({ id: convId, recipientName: name });
              setActiveScreen('chat');
            }}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileScreen
            onBack={() => setCurrentTab('feed')}
            onLoggedOut={() => setActiveScreen('landing')}
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
          <MessageSquare size={22} color={currentTab === 'conversations' ? theme.colors.primary : theme.colors.textMuted} />
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
});
