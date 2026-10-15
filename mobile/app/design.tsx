// Dev-only specimen of DESIGN.md: every token and motion primitive, live. Open /design in a dev build.
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FlapCode } from '../src/design/FlapCode';
import { FlightTrack, type TrackMode } from '../src/design/FlightTrack';
import { Icon, type IconName } from '../src/design/icons';
import { PressScale } from '../src/design/PressScale';
import { RollingNumber } from '../src/design/RollingNumber';
import { StatusDot } from '../src/design/StatusDot';
import { Text } from '../src/design/Text';
import { type Palette, radius, shadow, space, type, type TypeVariant, useTheme } from '../src/design/tokens';
import type { StatusCode } from '../src/lib/api';
import { countdown } from '../src/lib/time';
import { useNow } from '../src/lib/useNow';

const SWATCHES: (keyof Palette)[] = ['ground', 'surface', 'ink', 'muted', 'line', 'track', 'good', 'changed', 'alert', 'act'];
const ICONS: IconName[] = ['plane', 'back', 'chevron', 'share', 'clock', 'check', 'bell', 'face', 'doc', 'gear', 'calendar', 'arrow', 'close', 'mail'];
const STATUSES: [StatusCode, string][] = [['on_time', 'On time'], ['boarding', 'Boarding'], ['delayed', 'Delayed 25m'], ['departed', 'In the air'], ['landed', 'Landed'], ['cancelled', 'Cancelled']];
const SAMPLE: Partial<Record<TypeVariant, string>> = {
  codeXL: 'BLR', codeL: 'DEL', codeS: 'DXB', displayL: 'Trips', displayM: 'New Delhi', displayS: 'Bengaluru',
  numXL: '06:42:13', numL: '04:25', numM: 'QX7P2M', numS: '16 – 21 Oct',
  title: 'Web check-in', body: 'Round trip · 2 flights', bodyStrong: 'Leave for the airport', label: 'Boarding', caption: 'Times are local to each airport.',
};
const TARGET = Date.now() + (6 * 3600 + 42 * 60 + 13) * 1000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text v="label" color="muted">{title}</Text>
      {children}
    </View>
  );
}

export default function DesignSystem() {
  const { c, dark } = useTheme();
  const now = useNow(1000);
  const [flapKey, setFlapKey] = useState(0);
  const [status, setStatus] = useState(0);
  const [live, setLive] = useState(0.42);
  const [mode, setMode] = useState<TrackMode>('preview');
  if (!__DEV__) return <Redirect href="/" />;

  const card = [styles.card, { backgroundColor: c.surface }, shadow('card', dark)];
  const chip = (label: string, on: boolean, onPress: () => void) => (
    <PressScale key={label} onPress={onPress} style={[styles.chip, { backgroundColor: on ? c.ink : c.surface, borderColor: c.line }]}>
      <Text v="label" color={on ? 'ground' : 'ink'}>{label}</Text>
    </PressScale>
  );

  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentContainerStyle={styles.content}>
      <Section title="Color">
        <View style={styles.swatches}>
          {SWATCHES.map((k) => (
            <View key={k} style={styles.swatch}>
              <View style={[styles.swatchBox, { backgroundColor: c[k], borderColor: c.line }]} />
              <Text v="caption" color="muted">{k}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Type">
        <View style={card}>
          {(Object.keys(type) as TypeVariant[]).map((v) => (
            <View key={v} style={styles.typeRow}>
              <Text v="caption" color="muted" style={styles.typeName}>{v}</Text>
              <Text v={v} numberOfLines={1} style={{ flexShrink: 1 }}>{SAMPLE[v]}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Icons">
        <View style={[card, styles.icons]}>
          {ICONS.map((n) => <Icon key={n} name={n} size={24} color={c.ink} rotate={n === 'plane' ? 90 : 0} />)}
        </View>
      </Section>

      <Section title="Flap · airport codes">
        <PressScale onPress={() => setFlapKey((k) => k + 1)} style={card}>
          <View key={flapKey} style={styles.codes}>
            <FlapCode code="BLR" v="codeXL" />
            <FlapCode code="DEL" v="codeXL" delay={120} />
          </View>
          <Text v="caption" color="muted">Tap to replay</Text>
        </PressScale>
      </Section>

      <Section title="Roll · countdown">
        <View style={card}>
          <Text v="label" color="muted">Boards in</Text>
          <RollingNumber value={countdown(TARGET - now)} />
        </View>
      </Section>

      <Section title="Status">
        <PressScale onPress={() => setStatus((s) => (s + 1) % STATUSES.length)} style={card}>
          <StatusDot code={STATUSES[status][0]} label={STATUSES[status][1]} />
          <Text v="caption" color="muted">Tap to change status</Text>
        </PressScale>
      </Section>

      <Section title="The plane">
        <View style={styles.chips}>
          {(['preview', 'parked', 'boarding', 'live'] as TrackMode[]).map((m) => chip(m, mode === m, () => setMode(m)))}
        </View>
        {mode === 'live' ? (
          <View style={styles.chips}>{[0.12, 0.42, 0.8, 1].map((p) => chip(`${Math.round(p * 100)}%`, live === p, () => setLive(p)))}</View>
        ) : null}
        <View style={card}>
          <View style={styles.route}>
            <FlapCode code="BLR" v="codeL" />
            <View style={{ flex: 1 }}><FlightTrack mode={mode} progress={live} /></View>
            <FlapCode code="DEL" v="codeL" />
          </View>
          <Text v="caption" color="muted">With a connection</Text>
          <FlightTrack mode={mode} progress={live} stops={[0.5]} />
        </View>
      </Section>

      <Section title="Act now">
        <View style={[styles.act, { backgroundColor: c.act }]}>
          <Icon name="clock" size={18} color={c.onAct} />
          <Text v="bodyStrong" style={{ color: c.onAct, flex: 1 }}>Leave for BLR by 02:20</Text>
          <Icon name="arrow" size={18} color={c.onAct} />
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.gutter, paddingBottom: space.huge, gap: space.xxl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  section: { gap: space.s },
  card: { borderRadius: radius.l, padding: space.l, gap: space.m },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  swatch: { width: 56, gap: space.xs },
  swatchBox: { height: 40, borderRadius: radius.s, borderWidth: StyleSheet.hairlineWidth },
  typeRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.m },
  typeName: { width: 76 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  codes: { flexDirection: 'row', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { paddingHorizontal: space.m, paddingVertical: space.s - 2, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  route: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  act: { flexDirection: 'row', alignItems: 'center', gap: space.s + 2, padding: space.m, borderRadius: radius.m },
});
