import * as Haptics from 'expo-haptics';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from './tokens';

const APressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scale?: number; haptic?: boolean };

/** Press feedback from DESIGN.md: springs to 0.98 with a light haptic. */
export function PressScale({ style, scale = 0.98, haptic = true, onPressIn, onPressOut, ...rest }: Props) {
  const s = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        if (!reduced) s.value = withSpring(scale, motion.spring.press);
        if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, motion.spring.press);
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
