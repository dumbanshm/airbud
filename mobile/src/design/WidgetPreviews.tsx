// Visual designs for the surfaces that need a development build (WIDGETS.md): home-screen widgets,
// the lock-screen widget, the Live Activity and the Dynamic Island. Drawn with the same tokens so
// they can be judged next to the app; the native versions are built from the same WidgetSnapshot.
import { StyleSheet, View } from 'react-native';

import type { WidgetSnapshot } from '../lib/widgetData';
import { countdown } from '../lib/time';
import { FlightTrack } from './FlightTrack';
import { Icon } from './icons';
import { RollingNumber } from './RollingNumber';
import { Text } from './Text';
import { type Palette, radius, space, useTheme } from './tokens';

function Caption({ children }: { children: string }) {
  return <Text v="caption" color="muted" style={{ marginTop: space.xs }}>{children}</Text>;
}

function Dot({ tone }: { tone: WidgetSnapshot['statusTone'] }) {
  const { c } = useTheme();
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c[tone as keyof Palette] }} />;
}

function next(s: WidgetSnapshot, now: number): [string, string] {
  const b = Date.parse(s.boardingAt);
  const d = Date.parse(s.departAt);
  const a = Date.parse(s.arriveAt);
  if (now < b) return ['Boards in', countdown(b - now)];
  if (now < d) return ['Departs in', countdown(d - now)];
  if (now < a) return ['Lands in', countdown(a - now)];
  return ['Landed', ''];
}

export function WidgetGallery({ s, now }: { s: WidgetSnapshot; now: number }) {
  const { c } = useTheme();
  const [label, value] = next(s, now);
  const inAir = now >= Date.parse(s.departAt) && now < Date.parse(s.arriveAt);
  const progress = Math.min(1, Math.max(0, (now - Date.parse(s.departAt)) / (Date.parse(s.arriveAt) - Date.parse(s.departAt))));
  const surface = { backgroundColor: c.surface };
  // Live Activities and the Dynamic Island sit on the system's dark material in both themes.
  const night = { bg: '#141516', ink: '#EDEEEF', muted: '#8D9297', line: '#2A2C2F' };

  return (
    <View style={styles.gallery}>
      <View>
        <View style={[styles.small, surface]}>
          <View style={styles.rowBetween}>
            <Text v="label" color="muted">{s.day}</Text>
            <Dot tone={s.statusTone} />
          </View>
          <Text v="displayM" style={{ marginTop: 'auto' }}>{s.from} → {s.to}</Text>
          <Text v="label" color="muted">{label}</Text>
          <RollingNumber value={value} v="numL" />
        </View>
        <Caption>iOS small · Android 2×2</Caption>
      </View>

      <View style={{ alignSelf: 'stretch' }}>
        <View style={[styles.medium, surface]}>
          <View style={styles.rowBetween}>
            <Text v="displayS">{s.tripTitle}</Text>
            <Text v="numS" color="muted">{s.dates}</Text>
          </View>
          <View style={styles.route}>
            <View>
              <Text v="codeL">{s.from}</Text>
              <Text v="numS">{s.departs}</Text>
            </View>
            <View style={{ flex: 1 }}><FlightTrack mode={inAir ? 'live' : 'parked'} progress={progress} /></View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text v="codeL">{s.to}</Text>
              <Text v="numS">{s.arrives}</Text>
            </View>
          </View>
          <View style={styles.rowBetween}>
            <Text v="label" color="muted">{s.day} · {s.flightNumbers}{s.seat ? ` · ${s.seat}` : ''}</Text>
            <Text v="numM">{label} {value}</Text>
          </View>
        </View>
        <Caption>iOS medium · Android 4×2</Caption>
      </View>

      <View>
        <View style={[styles.lock, { backgroundColor: c.line }]}>
          <View style={styles.inline}>
            <Icon name="plane" size={13} color={c.ink} rotate={90} />
            <Text v="label">{s.flightNumbers} · {s.from} → {s.to}</Text>
          </View>
          <Text v="numS">{label} {value}</Text>
          <Text v="caption" color="muted">Boards {s.boards}{s.terminal ? ` · T${s.terminal}` : ''}</Text>
        </View>
        <Caption>Lock screen (accessory rectangular)</Caption>
      </View>

      <View style={{ alignSelf: 'stretch' }}>
        <View style={[styles.activity, { backgroundColor: night.bg }]}>
          <View style={styles.rowBetween}>
            <Text v="label" style={{ color: night.muted }}>{s.flightNumbers} · {s.day}</Text>
            <View style={styles.inline}><Dot tone={s.statusTone} /><Text v="label" style={{ color: night.ink }}>{s.statusLabel}</Text></View>
          </View>
          <View style={styles.route}>
            <Text v="codeL" style={{ color: night.ink }}>{s.from}</Text>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={[styles.bar, { backgroundColor: night.line }]}>
                <View style={[styles.barFill, { width: `${Math.max(progress * 100, 2)}%`, backgroundColor: night.ink }]} />
              </View>
            </View>
            <Text v="codeL" style={{ color: night.ink }}>{s.to}</Text>
          </View>
          <View style={styles.rowBetween}>
            <View>
              <Text v="caption" style={{ color: night.muted }}>{label}</Text>
              <Text v="numL" style={{ color: night.ink }}>{value}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text v="caption" style={{ color: night.muted }}>Boards {s.boards}{s.terminal ? ` · T${s.terminal}` : ''}</Text>
              <Text v="numM" style={{ color: night.ink }}>{s.seat ? `Seat ${s.seat}` : s.departs}</Text>
            </View>
          </View>
        </View>
        <Caption>Live Activity · lock screen (from 4 h before departure until landing)</Caption>
      </View>

      <View style={{ alignSelf: 'stretch', gap: space.s }}>
        <View style={[styles.island, { backgroundColor: '#000' }]}>
          <View style={styles.inline}>
            <Icon name="plane" size={13} color={night.ink} rotate={90} />
            <Text v="numS" style={{ color: night.ink }}>{s.from}</Text>
          </View>
          <View style={styles.camera} />
          <Text v="numS" style={{ color: night.ink }}>{value.split(':').slice(0, 2).join(':') || '—'}</Text>
        </View>
        <View style={[styles.islandBig, { backgroundColor: '#000' }]}>
          <View style={styles.route}>
            <View><Text v="codeS" style={{ color: night.ink }}>{s.from}</Text><Text v="numS" style={{ color: night.muted }}>{s.departs}</Text></View>
            <View style={[styles.bar, { flex: 1, backgroundColor: night.line }]}>
              <View style={[styles.barFill, { width: `${Math.max(progress * 100, 2)}%`, backgroundColor: night.ink }]} />
            </View>
            <View style={{ alignItems: 'flex-end' }}><Text v="codeS" style={{ color: night.ink }}>{s.to}</Text><Text v="numS" style={{ color: night.muted }}>{s.arrives}</Text></View>
          </View>
          <Text v="label" style={{ color: night.muted, textAlign: 'center' }}>{label} {value}</Text>
        </View>
        <Caption>Dynamic Island · compact and expanded</Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { gap: space.xl, alignItems: 'flex-start' },
  small: { width: 170, height: 170, borderRadius: 22, padding: space.l, gap: 2 },
  medium: { height: 170, borderRadius: 22, padding: space.l, justifyContent: 'space-between' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s },
  route: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lock: { width: 172, borderRadius: radius.m, padding: space.s + 2, gap: 1 },
  activity: { borderRadius: 22, padding: space.l, gap: space.m },
  bar: { height: 3, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2 },
  island: { alignSelf: 'center', width: 250, height: 36, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.l },
  camera: { width: 90 },
  islandBig: { borderRadius: 40, padding: space.xl, gap: space.s },
});
