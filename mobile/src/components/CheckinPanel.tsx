import { Linking, StyleSheet, View } from 'react-native';

import { Icon } from '../design/icons';
import { Text } from '../design/Text';
import { space, useTheme } from '../design/tokens';
import { Button, Card } from '../design/ui';
import type { Flight } from '../lib/api';
import { checkinState } from '../lib/checkin';
import { clockAt, dateAt } from '../lib/time';
import { useNow } from '../lib/useNow';

/** Web check-in for an upcoming flight, with a link to the airline's own check-in page. */
export function CheckinPanel({ flight: f }: { flight: Flight }) {
  const { c } = useTheme();
  const now = useNow(1000);
  const s = checkinState(f, now);
  if (s.kind === 'none' || s.kind === 'checked_in') return null;

  const at = (utc: string) => `${dateAt(utc, f.departure.local_time)}, ${clockAt(utc, f.departure.local_time)} ${f.departure.airport} time`;
  const airline = f.airline_name ?? 'the airline';
  const [title, detail] = {
    upcoming: [`Opens in ${(s as { opensIn: string }).opensIn}`, `From ${at(f.checkin.opens_utc)}`],
    open: ['Open now', `Closes in ${(s as { closesIn: string }).closesIn} · ${at(f.checkin.closes_utc)}`],
    closed: ['Closed', 'Check in at the airport counter.'],
  }[s.kind];

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Icon name={s.kind === 'open' ? 'check' : 'clock'} size={22} color={s.kind === 'open' ? c.good : c.muted} />
        <View style={{ flex: 1 }}>
          <Text v="title">{title}</Text>
          <Text v="caption" color="muted">{detail}</Text>
        </View>
      </View>
      {f.checkin.url && s.kind !== 'closed' ? (
        <Button
          title={s.kind === 'open' ? `Check in on ${airline}` : `Open ${airline} check-in`}
          variant={s.kind === 'open' ? 'ink' : 'quiet'}
          icon="arrow"
          onPress={() => Linking.openURL(f.checkin.url!)}
        />
      ) : null}
      <Text v="caption" color="muted">
        {f.checkin.known_airline
          ? 'Times are the airline’s usual window; its site has the final word.'
          : 'Usual window for most airlines. Check your airline’s site.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.m },
  row: { flexDirection: 'row', gap: space.m, alignItems: 'center' },
});
