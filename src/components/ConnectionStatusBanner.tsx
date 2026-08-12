import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react-native';

export type RealtimeStatus = 'connected' | 'connecting' | 'offline';

interface ConnectionStatusBannerProps {
  status: RealtimeStatus;
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({ status }) => {
  const { t } = useTranslation();

  if (status === 'connected') {
    return null; // Silent when cleanly connected
  }

  const isConnecting = status === 'connecting';

  return (
    <View style={[styles.banner, isConnecting ? styles.connectingBanner : styles.offlineBanner]}>
      {isConnecting ? (
        <RefreshCw size={14} color="#F59E0B" />
      ) : (
        <WifiOff size={14} color="#EF4444" />
      )}
      <Text style={[styles.text, isConnecting ? styles.connectingText : styles.offlineText]}>
        {isConnecting ? t('feed.realtime_connecting') : t('feed.realtime_offline')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  connectingBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.3)',
  },
  offlineBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.3)',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  connectingText: {
    color: '#F59E0B',
  },
  offlineText: {
    color: '#EF4444',
  },
});
