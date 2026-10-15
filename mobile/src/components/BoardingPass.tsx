import { toSVG } from 'bwip-js/generic';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SvgXml } from 'react-native-svg';

import type { Flight } from '../lib/api';
import { clockAt, wallDate } from '../lib/time';
import { useColors } from '../theme';

const BCID = { pdf417: 'pdf417', qr: 'qrcode', aztec: 'azteccode' } as const;
const INK = '#0E1220';

/** The airline's barcode as an SVG string, or null if there is none (or it can't be encoded). */
function useBarcodeSvg(pass: Flight['boarding_pass']) {
  return useMemo(() => {
    if (!pass) return null;
    try {
      const pdf417 = pass.format === 'pdf417' ? { columns: 4, rowmult: 3 } : {};
      const svg = toSVG({ bcid: BCID[pass.format], text: pass.message, scale: 2, barcolor: INK, ...pdf417 });
      const [w, h] = (svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)?.slice(1) ?? ['1', '1']).map(Number);
      const width = pass.format === 'pdf417' ? 260 : 180;
      return { svg, width, height: (width * h) / w };
    } catch {
      return null;
    }
  }, [pass?.format, pass?.message]);
}

/** The boarding pass: the airline's real barcode once one has arrived (after check-in), a placeholder before that. */
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

  const barcode = useBarcodeSvg(f.boarding_pass);

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
          {barcode ? (
            <SvgXml xml={barcode.svg} width={barcode.width} height={barcode.height} />
          ) : (
            <QRCode value={payload} size={150} backgroundColor="#FFFFFF" color={INK} />
          )}
        </View>
        <Text style={[styles.hint, { color: c.muted }]}>
          {barcode ? 'Scan at the gate. Turn your screen brightness up.' : 'Placeholder. Your real pass will show here after check-in.'}
        </Text>
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
