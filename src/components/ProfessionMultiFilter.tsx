import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Filter, X } from 'lucide-react-native';
import { ProfessionKey, PROFESSION_KEYS, PROFESSION_COLORS } from '../types/database';

interface ProfessionMultiFilterProps {
  selectedProfessions: ProfessionKey[];
  onToggleProfession: (key: ProfessionKey) => void;
  onClearAll: () => void;
}

export const ProfessionMultiFilter: React.FC<ProfessionMultiFilterProps> = ({
  selectedProfessions,
  onToggleProfession,
  onClearAll,
}) => {
  const { t } = useTranslation();

  const isAllSelected = selectedProfessions.length === 0;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Filter size={16} color="#38BDF8" />
          <Text style={styles.filterTitle}>{t('feed.filter_label')}</Text>
        </View>

        {!isAllSelected && (
          <TouchableOpacity style={styles.clearBtn} onPress={onClearAll} activeOpacity={0.7}>
            <Text style={styles.clearText}>{t('feed.clear_filter')}</Text>
            <X size={14} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 'All' Pill */}
        <TouchableOpacity
          style={[styles.pill, isAllSelected && styles.allPillActive]}
          onPress={onClearAll}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, isAllSelected && styles.allPillTextActive]}>
            {t('feed.all_professions')}
          </Text>
        </TouchableOpacity>

        {/* Profession Pills */}
        {PROFESSION_KEYS.map((key) => {
          const isSelected = selectedProfessions.includes(key);
          const colors = PROFESSION_COLORS[key];
          const label = t(`onboarding.short_professions.${key}`);

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.pill,
                {
                  backgroundColor: isSelected ? colors.bg : '#1E293B',
                  borderColor: isSelected ? colors.border : '#334155',
                },
              ]}
              onPress={() => onToggleProfession(key)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isSelected ? colors.primary : '#64748B' },
                ]}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: isSelected ? colors.primary : '#94A3B8' },
                  isSelected && styles.pillTextBold,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterTitle: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  clearText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  allPillActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  allPillTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  pillTextBold: {
    fontWeight: '700',
  },
});
