export type TranslationId = 'bsb' | 'web';

export interface Translation {
  id: TranslationId;
  abbreviation: string;
  name: string;
  /** Shown under every passage. Public-domain texts need none, but we credit them anyway. */
  attribution: string;
  url: string;
  license: 'public-domain';
}

export const TRANSLATIONS: Record<TranslationId, Translation> = {
  bsb: {
    id: 'bsb',
    abbreviation: 'BSB',
    name: 'Berean Standard Bible',
    attribution: 'Berean Standard Bible (BSB), dedicated to the public domain.',
    url: 'https://berean.bible',
    license: 'public-domain',
  },
  web: {
    id: 'web',
    abbreviation: 'WEB',
    name: 'World English Bible',
    attribution: 'World English Bible (WEB), public domain.',
    url: 'https://worldenglish.bible',
    license: 'public-domain',
  },
};

export const DEFAULT_TRANSLATION: TranslationId = 'bsb';

export function isTranslationId(value: string): value is TranslationId {
  return value in TRANSLATIONS;
}
