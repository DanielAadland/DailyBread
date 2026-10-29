import { useId } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { Txt } from './Text';

interface Props extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
}

export function TextField({ label, hint, error, style, multiline, ...rest }: Props) {
  const { colors } = useTheme();
  const id = useId();
  return (
    <View style={styles.wrap}>
      <Txt variant="label" nativeID={`${id}-label`}>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        aria-labelledby={`${id}-label`}
        aria-invalid={!!error}
        placeholderTextColor={colors.mist}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.rule },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Txt variant="small" tone="danger" accessibilityLiveRegion="polite" role="alert">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="small" tone="mist">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.xs + 2 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACE.md - 2,
    paddingVertical: SPACE.sm + 2,
    fontFamily: FONTS.ui,
    fontSize: TYPE.body,
  },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
});
