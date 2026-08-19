import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react-native';
import { SupportedLanguage, setAppLanguage } from '../i18n';
import { theme } from '../theme';

export const LanguageSelector: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);

  const languages: { key: SupportedLanguage; label: string; flag: string }[] = [
    { key: 'zh-Hant', label: '繁體中文 (Traditional Chinese)', flag: '🇭🇰' },
    { key: 'zh-Hans', label: '简体中文 (Simplified Chinese)', flag: '🇨🇳' },
    { key: 'en', label: 'English', flag: '🌐' },
  ];

  const handleSelectLanguage = async (key: SupportedLanguage) => {
    await setAppLanguage(key);
    setModalVisible(false);
  };

  const currentLangLabel = languages.find(l => l.key === i18n.language)?.flag || '🌐';

  return (
    <View>
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Globe size={18} color={theme.colors.primary} />
        <Text style={styles.triggerText}>{currentLangLabel}</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('profile.language_setting')}</Text>
            <ScrollView
              style={styles.langList}
              contentContainerStyle={styles.langListContent}
              bounces={false}
              showsVerticalScrollIndicator={true}
            >
              {languages.map((lang) => {
                const isSelected = i18n.language === lang.key;
                return (
                  <TouchableOpacity
                    key={lang.key}
                    style={[styles.langOption, isSelected && styles.langOptionSelected]}
                    onPress={() => handleSelectLanguage(lang.key)}
                  >
                    <Text style={styles.flagText}>{lang.flag}</Text>
                    <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                      {lang.label}
                    </Text>
                    {isSelected && <Check size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  triggerText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
  },
  langList: {
    flexGrow: 0,
  },
  langListContent: {
    gap: 12,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 12,
  },
  langOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  flagText: {
    fontSize: 20,
  },
  langLabel: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  langLabelSelected: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
});
