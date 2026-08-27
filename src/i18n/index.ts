import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../../assets/i18n/en.json';
import zhHant from '../../assets/i18n/zh-Hant.json';
import zhHans from '../../assets/i18n/zh-Hans.json';

export const LANGUAGE_STORAGE_KEY = '@dml_user_language_preference';

export type SupportedLanguage = 'zh-Hant' | 'zh-Hans' | 'en';

export const detectSystemLanguage = (): SupportedLanguage => {
  try {
    const locales = Localization.getLocales();
    const primaryLocale = locales && locales.length > 0 ? locales[0] : null;
    
    if (!primaryLocale) return 'en';

    const languageCode = (primaryLocale.languageCode || '').toLowerCase();
    // expo-localization 的 Locale 类型未声明 scriptCode，但 BCP 47 languageTag
    // （如 zh-Hant-TW / zh-Hans-CN）第二位即 4 字母的 script 段，直接解析，
    // 避免依赖未在类型中声明的原生字段（web 端也兼容）。
    const tagParts = (primaryLocale.languageTag || '').split('-');
    const scriptCode = (tagParts[1] && tagParts[1].length === 4 ? tagParts[1] : '').toLowerCase();
    const regionCode = (primaryLocale.regionCode || '').toLowerCase();
    const fullTag = (primaryLocale.languageTag || '').toLowerCase();

    // Traditional Chinese Detection
    if (
      scriptCode === 'hant' ||
      ['hk', 'tw', 'mo'].includes(regionCode) ||
      fullTag.includes('zh-hant') ||
      fullTag.includes('zh-hk') ||
      fullTag.includes('zh-tw')
    ) {
      return 'zh-Hant';
    }

    // Simplified Chinese Detection
    if (
      scriptCode === 'hans' ||
      ['cn', 'sg', 'my'].includes(regionCode) ||
      fullTag.includes('zh-hans') ||
      fullTag.includes('zh-cn') ||
      fullTag.includes('zh-sg')
    ) {
      return 'zh-Hans';
    }

    if (languageCode === 'zh') {
      return 'zh-Hant';
    }

    return 'en';
  } catch (error) {
    console.warn('Error detecting system language, defaulting to en:', error);
    return 'en';
  }
};

const resources = {
  'zh-Hant': { translation: zhHant },
  'zh-Hans': { translation: zhHans },
  'en': { translation: en },
};

// Initialize i18next synchronously with default fallback, then load persisted language
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectSystemLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already handles escaping
    },
    react: {
      useSuspense: false,
    },
  });

export const loadPersistedLanguage = async (): Promise<SupportedLanguage> => {
  try {
    const savedLang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLang && ['zh-Hant', 'zh-Hans', 'en'].includes(savedLang)) {
      await i18n.changeLanguage(savedLang);
      return savedLang as SupportedLanguage;
    }
  } catch (error) {
    console.warn('Failed to load persisted language preference:', error);
  }
  const detected = detectSystemLanguage();
  await i18n.changeLanguage(detected);
  return detected;
};

export const setAppLanguage = async (language: SupportedLanguage): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    await i18n.changeLanguage(language);
  } catch (error) {
    console.error('Failed to save language preference:', error);
  }
};

export default i18n;
