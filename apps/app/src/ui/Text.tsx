import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS, TYPE } from '../theme/tokens';

export type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'lead' | 'body' | 'label' | 'small';

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontFamily: FONTS.display, fontSize: TYPE.display, lineHeight: TYPE.display * 1.05 },
  h1: { fontFamily: FONTS.display, fontSize: TYPE.h1, lineHeight: TYPE.h1 * 1.2 },
  h2: { fontFamily: FONTS.display, fontSize: TYPE.h2, lineHeight: TYPE.h2 * 1.25 },
  h3: { fontFamily: FONTS.uiBold, fontSize: TYPE.h3, lineHeight: TYPE.h3 * 1.3 },
  lead: { fontFamily: FONTS.ui, fontSize: TYPE.lead, lineHeight: TYPE.lead * 1.5 },
  body: { fontFamily: FONTS.ui, fontSize: TYPE.body, lineHeight: TYPE.body * 1.5 },
  label: { fontFamily: FONTS.uiMedium, fontSize: TYPE.body, lineHeight: TYPE.body * 1.35 },
  small: { fontFamily: FONTS.ui, fontSize: TYPE.small, lineHeight: TYPE.small * 1.45 },
};

const HEADING_LEVEL: Partial<Record<TextVariant, number>> = { display: 1, h1: 1, h2: 2, h3: 3 };

interface Props extends TextProps {
  variant?: TextVariant;
  tone?: 'ink' | 'mist' | 'tide' | 'dawn' | 'danger' | 'onTide';
  align?: TextStyle['textAlign'];
}

/** Every visible string goes through this, so type and colour follow the theme. */
export function Txt({ variant = 'body', tone = 'ink', align, style, ...rest }: Props) {
  const { colors } = useTheme();
  const level = HEADING_LEVEL[variant];
  return (
    <Text
      {...(level ? { role: 'heading', 'aria-level': level } : {})}
      style={[VARIANTS[variant], { color: colors[tone], textAlign: align }, style]}
      {...rest}
    />
  );
}
