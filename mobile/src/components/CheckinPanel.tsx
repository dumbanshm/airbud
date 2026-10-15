import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Flight } from '../lib/api';
import { checkinState } from '../lib/checkin';
import { clockAt, dateAt } from '../lib/time';
import { useNow } from '../lib/useNow';
import { useColors } from '../theme';

/** Web check-in status for an upcoming flight, with a link to the airline's check-in page. */
export function CheckinPanel({ flight: f, compact }: { flight: Flight; compact?: boolean }) {
  const c = useColors();
  const now = useNow(compact ? 30_000 : 1000);
  const s = checkinState(f, now);
  if (s.kind === 'none') return null;

  const at = (utc: string) => `${dateAt(utc, f.departure.local_time)}, ${clockAt(utc, f.departure.local_time)}`;
  const open = () => f.checkin.url && Linking.openURL(f.checkin.url);
  const tone = s.kind === 'open' ? c.accent : s.kind === 'checked_in' ? '#16A34A' : c.muted;

  const [icon, title, detail] = (
    {
      checked_in: ['checkmark-circle', 'Checked in', 'Your boarding pass is below.'],
      upcoming: ['time-outline', `Web check-in opens in ${(s as { opensIn: string }).opensIn}`, `Opens ${at(f.checkin.opens_utc)}`],
      open: ['radio-button-on', 'Web check-in is open', `Closes in ${(s as { closesIn: string }).closesIn} · ${at(f.checkin.closes_utc)}`],
      closed: ['close-circle-outline', 'Web check-in closed', 'Check in at the airport counter.'],
    } as const
  )[s.kind];

  if (compact) {
    return (
      <Pressable onPress={s.kind === 'open' ? open : undefined} style={styles.compact} hitSlop={8}>
        <Ionicons name={icon} size={14} color={tone} />
        <Text style={[styles.compactText, { color: tone }]} numberOfLines={1}>
          {s.kind === 'open' ? `Check-in open · closes in ${s.closesIn}` : title}
        </Text>
        {s.kind === 'open' && f.checkin.url ? <Ionicons name="arrow-forward" size={13} color={tone} /> : null}
      </Pressable>
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.row}>
        <Ionicons name={icon} size={22} color={tone} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.detail, { color: c.muted }]}>{detail}</Text>
        </View>
      </View>
      {f.checkin.url && s.kind !== 'checked_in' ? (
        <Pressable
          onPress={open}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: s.kind === 'open' ? c.accent : c.accentSoft, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: s.kind === 'open' ? '#fff' : c.accent }]}>
            {s.kind === 'open' ? `Check in on ${f.airline_name ?? 'the airline'} site` : `Open ${f.airline_name ?? 'airline'} check-in`}
          </Text>
          <Ionicons name="open-outline" size={16} color={s.kind === 'open' ? '#fff' : c.accent} />
        </Pressable>
      ) : null}
      {s.kind !== 'checked_in' ? (
        <Text style={[styles.note, { color: c.faint }]}>
          {f.checkin.known_airline
            ? 'Times are the airline’s usual window; its site has the final word.'
            : 'Usual window for most airlines. Check your airline’s site.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  detail: { fontSize: 13, marginTop: 2 },
  button: { height: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 11 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
