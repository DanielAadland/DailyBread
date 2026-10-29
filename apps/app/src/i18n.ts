import i18next from 'i18next';
import { getLocales } from 'expo-localization';
import { initReactI18next } from 'react-i18next';
import { FALLBACK_LANGUAGE, pickLanguage, RESOURCES } from '@bible-app/i18n';

export const language = pickLanguage(getLocales().map((l) => l.languageTag));

i18next.use(initReactI18next).init({
  resources: RESOURCES,
  lng: language,
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18next;
