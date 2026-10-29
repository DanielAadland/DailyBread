/**
 * Design tokens. Concept: "first light". Cool paper, deep ink, one warm dawn gold that only marks reading done.
 * Contrast (checked): ink/bg ≥ 10:1, mist/bg ≥ 5:1, tide/bg ≥ 5.9:1, dawn/bg ≥ 3.6:1 (graphics).
 */
export type ThemeName = 'light' | 'dark' | 'sepia';
export type ThemePreference = ThemeName | 'system';

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  mist: string;
  rule: string;
  tide: string;
  onTide: string;
  tideSoft: string;
  /** Meaningful gold (reading done). Meets 3:1 against bg. */
  dawn: string;
  /** Decorative glow behind the sun. */
  dawnSoft: string;
  /** Unfilled arc segments and empty states. */
  dusk: string;
  danger: string;
  focus: string;
  highlight: Record<'yellow' | 'green' | 'blue' | 'pink' | 'purple', string>;
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    bg: '#F5F7F9',
    surface: '#FFFFFF',
    ink: '#1C2B3A',
    mist: '#5F6B7B',
    rule: '#DDE3EA',
    tide: '#2E5E8C',
    onTide: '#FFFFFF',
    tideSoft: '#E3ECF5',
    dawn: '#B07314',
    dawnSoft: '#F6DDAE',
    dusk: '#C9D2DC',
    danger: '#A3302A',
    focus: '#2E5E8C',
    highlight: { yellow: '#FBEBA6', green: '#CDEBC9', blue: '#CFE2F6', pink: '#F7D3DD', purple: '#E1D6F3' },
  },
  dark: {
    bg: '#0F1B27',
    surface: '#172636',
    ink: '#E7ECF2',
    mist: '#A3B0C0',
    rule: '#26394D',
    tide: '#8DB8E0',
    onTide: '#0F1B27',
    tideSoft: '#1E3550',
    dawn: '#F0B95A',
    dawnSoft: '#5A4420',
    dusk: '#2E4258',
    danger: '#F09A92',
    focus: '#8DB8E0',
    highlight: { yellow: '#5C4E1A', green: '#244A2D', blue: '#1F3E5E', pink: '#5A2A3A', purple: '#3D3160' },
  },
  sepia: {
    bg: '#F3EBDA',
    surface: '#FAF4E8',
    ink: '#3E3326',
    mist: '#6E604A',
    rule: '#E2D5BC',
    tide: '#7A4F1E',
    onTide: '#FFFFFF',
    tideSoft: '#EBDDC2',
    dawn: '#A86E12',
    dawnSoft: '#EED39F',
    dusk: '#D8C9AB',
    danger: '#9A2E24',
    focus: '#7A4F1E',
    highlight: { yellow: '#F1DF9A', green: '#D5E3BE', blue: '#D6E0E6', pink: '#EBCFC8', purple: '#DED0E0' },
  },
};

export const FONTS = {
  ui: 'Figtree_400Regular',
  uiMedium: 'Figtree_500Medium',
  uiBold: 'Figtree_700Bold',
  scripture: 'Literata_400Regular',
  scriptureItalic: 'Literata_400Regular_Italic',
  display: 'Literata_500Medium',
  displayBold: 'Literata_700Bold',
} as const;

/** Modular scale (major third, 1.25) on a 16px base. */
export const TYPE = {
  small: 13,
  body: 16,
  lead: 18,
  h3: 20,
  h2: 25,
  h1: 31,
  display: 49,
} as const;

export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Radius by hierarchy: large panels are softer than controls; chips are round. */
export const RADIUS = { control: 10, panel: 16, pill: 999 } as const;

export const LAYOUT = {
  /** Width of the main column on wide screens. */
  column: 600,
  /** Reader column, about 65 characters of Literata at the default size. */
  reader: 680,
  /** From this width, navigation moves to a sidebar. */
  sidebarBreakpoint: 1024,
} as const;

export interface ReadingPrefs {
  fontSize: number;
  lineHeight: number;
  theme: ThemePreference;
  showVerseNumbers: boolean;
}

export const DEFAULT_READING_PREFS: ReadingPrefs = {
  fontSize: 19,
  lineHeight: 1.7,
  theme: 'system',
  showVerseNumbers: true,
};

export const FONT_SIZES = [15, 17, 19, 21, 24, 28] as const;
export const LINE_HEIGHTS = [1.5, 1.7, 1.9] as const;
