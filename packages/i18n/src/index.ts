import en from './en.json';

/** Add a language: create `<code>.json` with the same keys and list it here. */
export const RESOURCES = {
  en: { translation: en },
} as const;

export type Language = keyof typeof RESOURCES;
export const LANGUAGES = Object.keys(RESOURCES) as Language[];
export const FALLBACK_LANGUAGE: Language = 'en';

/** Pick the best supported language from the device's preferred list (e.g. ["it-CH", "en-US"]). */
export function pickLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0] as Language;
    if (LANGUAGES.includes(base)) return base;
  }
  return FALLBACK_LANGUAGE;
}

export { en };
