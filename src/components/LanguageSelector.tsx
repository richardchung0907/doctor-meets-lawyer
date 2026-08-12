import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react-native';
import { SupportedLanguage, setAppLanguage } from '../i18n';

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
        <Globe size={18} color="#38BDF8" />
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
                  {isSelected && <Check size={18} color="#38BDF8" />}
                </TouchableOpacity>
              );
            })}
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
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  triggerText: {
    color: '#F8FAFC',
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
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 12,
  },
  langOptionSelected: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  flagText: {
    fontSize: 20,
  },
  langLabel: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '500',
  },
  langLabelSelected: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
});
