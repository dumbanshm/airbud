import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { motion } from './tokens';

/**
 * The "Enter" pattern from DESIGN.md: fade in and rise 14px, staggered by `index`. Runs once on
 * mount. Plain shared values rather than layout animations, so it behaves the same on web.
 */
export function Enter({ index = 0, rise = motion.rise, style, children }: {
  index?: number; rise?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) t.value = withDelay(Math.min(index, 8) * motion.stagger, withTiming(1, { duration: motion.slow, easing: motion.ease }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount
  const a = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * rise }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}
