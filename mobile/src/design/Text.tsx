import { Text as RNText, type TextProps } from 'react-native';

import { type Palette, type TypeVariant, type, useTheme } from './tokens';

type Props = TextProps & { v?: TypeVariant; color?: keyof Palette };

/** Text in one of the DESIGN.md variants. Never pass fontWeight: each weight is its own family. */
export function Text({ v = 'body', color = 'ink', style, ...rest }: Props) {
  const { c } = useTheme();
  return <RNText {...rest} style={[type[v], { color: c[color] }, style]} />;
}
