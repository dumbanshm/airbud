import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { Icon } from './icons';
import { motion, useTheme } from './tokens';

export type TrackMode =
  /** Parked at the origin. */
  | 'parked'
  /** A practice run every ~10 s (the next trip, before departure). */
  | 'preview'
  /** Boarding: taxis a few pixels back and forth at the origin. */
  | 'boarding'
  /** In the air or landed: drawn at `progress`. */
  | 'live';

type Props = {
  mode: TrackMode;
  /** 0–1 along the whole route, for `live`. */
  progress?: number;
  /** Positions (0–1) of stops between origin and destination, e.g. [0.5] for one connection. */
  stops?: number[];
  height?: number;
};

const PAD = 6; // keeps the end nodes inside the box
const PLANE = 18;
const FLIGHT_MS = 6200;

/** The dotted route with a solid trail and the plane at its head. See “The plane” in DESIGN.md. */
export function FlightTrack({ mode, progress = 0, stops = [], height = 28 }: Props) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const f = useSharedValue(0);
  const fade = useSharedValue(1);
  const taxi = useSharedValue(0);
  const span = Math.max(0, w - PAD * 2);
  const stopKey = stops.join(',');

  useEffect(() => {
    cancelAnimation(f); cancelAnimation(fade); cancelAnimation(taxi);
    fade.value = 1; taxi.value = 0;
    if (mode === 'live') {
      f.value = reduced ? progress : withTiming(progress, { duration: 1300, easing: motion.ease });
    } else if (mode === 'preview' && !reduced) {
      // Fly origin → each stop (pausing) → destination, fade out, reappear at the origin, rest.
      const points = [...(stopKey ? stopKey.split(',').map(Number) : []), 1];
      const legMs = FLIGHT_MS / points.length;
      const pause = 700;
      const flying = points.length * legMs + (points.length - 1) * pause;
      f.value = 0;
      f.value = withRepeat(withSequence(
        ...points.map((p, i) => withDelay(i ? pause : 900, withTiming(p, { duration: legMs, easing: motion.easeInOut }))),
        withDelay(600, withTiming(0, { duration: 0 })),
        withDelay(2000, withTiming(0, { duration: 0 })),
      ), -1);
      fade.value = withRepeat(withSequence(
        withDelay(900 + flying, withTiming(0, { duration: 500 })),
        withDelay(100, withTiming(1, { duration: 400 })),
        withDelay(1600, withTiming(1, { duration: 0 })),
      ), -1);
    } else {
      f.value = 0;
      if (mode === 'boarding' && !reduced) {
        taxi.value = withRepeat(withSequence(withTiming(5, { duration: 900, easing: motion.easeInOut }), withTiming(0, { duration: 900, easing: motion.easeInOut })), -1);
      }
    }
  }, [mode, progress, reduced, stopKey, f, fade, taxi]);

  const trail = useAnimatedStyle(() => ({ width: f.value * span, opacity: fade.value }));
  const plane = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: PAD + f.value * span + taxi.value - PLANE / 2 }],
  }));

  const y = height / 2;
  const reached = mode === 'live' ? progress : 0;
  const nodes = [0, ...stops, 1];

  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w ? (
        <>
          <Svg width={w} height={height} style={StyleSheet.absoluteFill}>
            <Line x1={PAD} y1={y} x2={w - PAD} y2={y} stroke={c.track} strokeWidth={1.5} strokeDasharray="1.5 5" strokeLinecap="round" />
          </Svg>
          <Animated.View style={[styles.trail, { top: y - 0.75, left: PAD, backgroundColor: c.ink }, trail]} />
          {nodes.map((n, i) => {
            const end = i === 0 || i === nodes.length - 1;
            const lit = (i === 0 && mode !== 'parked') || (mode === 'live' && reached >= n - 1e-3);
            return (
              <View key={i} style={[styles.node, {
                left: PAD + n * span - 4, top: y - 4, borderColor: end ? c.ink : c.muted,
                backgroundColor: lit ? (end ? c.ink : c.muted) : c.surface,
              }]} />
            );
          })}
          <Animated.View style={[styles.plane, { top: y - PLANE / 2, backgroundColor: c.surface }, plane]}>
            <Icon name="plane" size={PLANE} color={c.ink} rotate={90} />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trail: { position: 'absolute', height: 1.5, borderRadius: 1 },
  node: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  plane: { position: 'absolute', left: 0, width: PLANE, height: PLANE, borderRadius: PLANE / 2, alignItems: 'center', justifyContent: 'center' },
});
