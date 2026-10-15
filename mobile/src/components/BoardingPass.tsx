import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { Flight } from '../lib/api';
import { clockAt, wallDate } from '../lib/time';
import { useColors } from '../theme';

/** Placeholder pass. Real ones (IATA BCBP barcodes) only exist after check-in; parsing those is a later step. */
export function BoardingPass({ flight: f }: { flight: Flight }) {
  const c = useColors();
  const passenger = f.passengers[0] ?? 'Passenger';
  const payload = `AIRBUD-PLACEHOLDER ${f.pnr} ${f.flight_number} ${f.departure.airport}${f.arrival.airport} ${passenger}`;
  const fields: [string, string][] = [
    ['Passenger', passenger],
    ['Boarding', `${clockAt(f.boarding_utc, f.departure.local_time)} (est.)`],
    ['Seat', f.seats[0] ?? '—'],
    ['Terminal', f.departure.terminal ?? '—'],
    ['Date', wallDate(f.departure.local_time)],
    ['PNR', f.pnr],
  ];

  return (
    <View style={[styles.pass, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.grid}>
        {fields.map(([label, value]) => (
          <View key={label} style={styles.field}>
            <Text style={[styles.label, { color: c.muted }]}>{label.toUpperCase()}</Text>
            <Text style={[styles.value, { color: c.text }]} numberOfLines={1}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.tear, { borderColor: c.border }]} />
      <View style={styles.qrWrap}>
        <View style={styles.qrBox}>
          <QRCode value={payload} size={150} backgroundColor="#FFFFFF" color="#0E1220" />
        </View>
        <Text style={[styles.hint, { color: c.muted }]}>Placeholder. Your real pass will show here after check-in.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pass: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  field: { width: '33.33%', paddingRight: 8 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  value: { fontSize: 14, fontWeight: '700', marginTop: 3 },
  tear: { borderTopWidth: 1.5, borderStyle: 'dashed', marginVertical: 18 },
  qrWrap: { alignItems: 'center', gap: 10 },
  qrBox: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 14 },
  hint: { fontSize: 12, textAlign: 'center' },
});
