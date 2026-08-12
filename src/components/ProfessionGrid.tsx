import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { 
  Stethoscope, 
  Leaf, 
  Smile, 
  Dog, 
  Briefcase, 
  Scale, 
  UserCheck 
} from 'lucide-react-native';
import { ProfessionKey, PROFESSION_KEYS, PROFESSION_COLORS } from '../types/database';

interface ProfessionGridProps {
  onSelectProfession: (profession: ProfessionKey) => void;
  selectedProfession?: ProfessionKey | null;
}

export const ProfessionGrid: React.FC<ProfessionGridProps> = ({
  onSelectProfession,
  selectedProfession,
}) => {
  const { t } = useTranslation();

  const renderIcon = (key: ProfessionKey) => {
    const colors = PROFESSION_COLORS[key];
    const size = 32;

    switch (key) {
      case 'medical_doctor':
        return <Stethoscope size={size} color={colors.primary} />;
      case 'tcm':
        return <Leaf size={size} color={colors.primary} />;
      case 'dentist':
        return <Smile size={size} color={colors.primary} />;
      case 'veterinarian':
        return <Dog size={size} color={colors.primary} />;
      case 'lawyer':
        return <Briefcase size={size} color={colors.primary} />;
      case 'judge':
        return <Scale size={size} color={colors.primary} />;
      default:
        return <UserCheck size={size} color={colors.primary} />;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('onboarding.select_profession')}</Text>
      
      <View style={styles.grid}>
        {PROFESSION_KEYS.map((key) => {
          const colors = PROFESSION_COLORS[key];
          const isSelected = selectedProfession === key;
          const label = t(`onboarding.professions.${key}`);

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.squareCard,
                {
                  backgroundColor: isSelected ? colors.bg : 'rgba(30, 41, 59, 0.7)',
                  borderColor: isSelected ? colors.primary : 'rgba(51, 65, 85, 0.6)',
                },
              ]}
              activeOpacity={0.8}
              onPress={() => onSelectProfession(key)}
            >
              <View style={[styles.iconContainer, { backgroundColor: colors.bg }]}>
                {renderIcon(key)}
              </View>
              <Text style={[styles.cardText, { color: isSelected ? colors.primary : '#F1F5F9' }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const windowWidth = Dimensions.get('window').width;
const cardWidth = Math.min((windowWidth - 48) / 2 - 8, 160);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 16,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 360,
  },
  squareCard: {
    width: cardWidth,
    height: cardWidth,
    borderRadius: 20,
    borderWidth: 2,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
