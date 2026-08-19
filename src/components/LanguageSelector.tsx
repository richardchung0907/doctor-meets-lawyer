import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react-native';
import { SupportedLanguage, setAppLanguage } from '../i18n';
import { theme } from '../theme';

export const LanguageSelector: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // 自适应屏幕：弹窗最大尺寸按窗口尺寸计算（数值 dp），避免依赖百分比测量。
  // overlay 左右各 padding 20，故宽度上限为 windowWidth - 40，同时保持设计上限 360。
  const modalMaxWidth = Math.min(windowWidth - 40, 360);
  const modalMaxHeight = windowHeight * 0.9;

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
          <View style={[styles.modalContent, { maxWidth: modalMaxWidth, maxHeight: modalMaxHeight }]}>
            <Text style={styles.modalTitle}>{t('profile.language_setting')}</Text>
            {/* 注意：这里刻意不用 ScrollView。语言项固定 3 个、总高很小，无需滚动；
                且 RN 0.76 旧架构在 Android 上存在 Modal 内 ScrollView 首次打开时
                高度计算异常的回归（react-native#48822），实机（Galaxy A5 / Android 8.0）
                表现为只有标题可见、选项区不可见。将来若语言增多需要滚动，
                请先确认该回归已修复，或改用显式高度。 */}
            <View style={styles.langList}>
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
            </View>
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
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
  },
  langList: {
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
