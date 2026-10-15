import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { motion, type Palette, type, type TypeVariant } from './tokens';

const DIGITS = '0123456789'.split('');

function Digit({ d, v, color, height }: { d: number; v: TypeVariant; color: keyof Palette; height: number }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(-d * height);
  useEffect(() => {
    y.value = reduced ? -d * height : withTiming(-d * height, { duration: motion.slow, easing: motion.ease });
  }, [d, height, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Text v={v} style={styles.ghost}>0</Text>
      <Animated.View style={[styles.col, style]}>
        {DIGITS.map((n) => <Text key={n} v={v} color={color} style={{ height }}>{n}</Text>)}
      </Animated.View>
    </View>
  );
}

/** Text whose digits roll like an odometer when they change (countdowns, times). Other characters stay put. */
export function RollingNumber({ value, v = 'numXL', color = 'ink' }: { value: string; v?: TypeVariant; color?: keyof Palette }) {
  const height = type[v].lineHeight as number;
  return (
    <View style={styles.row} accessible accessibilityLabel={value}>
      {[...value].map((ch, i) =>
        /\d/.test(ch)
          ? <Digit key={i} d={+ch} v={v} color={color} height={height} />
          : <Text key={i} v={v} color={ch === ':' ? 'muted' : color}>{ch}</Text>,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  ghost: { opacity: 0 },
  col: { position: 'absolute', left: 0, right: 0, top: 0 },
});
