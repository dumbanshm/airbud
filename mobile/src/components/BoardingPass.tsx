import { toSVG } from 'bwip-js/generic';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SvgXml } from 'react-native-svg';

import type { Flight } from '../lib/api';
import { originalBarcodeUri, openOriginal } from '../lib/originalPass';
import { clockAt, wallDate } from '../lib/time';
import { DigiYatraButton } from './DigiYatraButton';
import { useColors } from '../theme';

const INK = '#0E1220';
const BCID = { pdf417: 'pdf417', qr: 'qrcode', aztec: 'azteccode' } as const;

/**
 * Fallback when we don't have the airline's printed image (e.g. Apple Wallet passes): the same
 * data drawn in the airline's own format (Aztec stays Aztec, PDF417 stays PDF417).
 */
function useBarcodeSvg(pass: Flight['boarding_pass']) {
  return useMemo(() => {
    if (!pass || pass.original_image) return null;
    try {
      const pdf417 = pass.format === 'pdf417' ? { columns: 4, rowmult: 3 } : {};
      const svg = toSVG({ bcid: BCID[pass.format], text: pass.message, scale: 3, barcolor: INK, ...pdf417 });
      const [w, h] = (svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)?.slice(1) ?? ['1', '1']).map(Number);
      const width = pass.format === 'pdf417' ? 260 : 200;
      return { svg, width, height: (width * h) / w };
    } catch {
      return null;
    }
  }, [pass?.format, pass?.message, pass?.original_image]);
}

/** The airline's barcode image exactly as printed on its pass. */
function useOriginalImage(f: Flight) {
  return useQuery({
    queryKey: ['pass-barcode', f.id],
    queryFn: () => originalBarcodeUri(f.id),
    enabled: !!f.boarding_pass?.original_image,
    staleTime: Infinity,
  });
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
  const original = useOriginalImage(f);
  const hasPass = !!f.boarding_pass && (!!barcode || !!f.boarding_pass.original_image);
  const passRef = useRef<View>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  return (
    <View>
    <View ref={passRef} collapsable={false} style={[styles.pass, { backgroundColor: c.card, borderColor: c.border }]}>
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
        {f.boarding_pass?.original_image ? (
          <View style={styles.qrBox}>
            {original.data ? (
              <Image source={{ uri: original.data }} style={styles.originalImage} resizeMode="contain" />
            ) : (
              <View style={[styles.originalImage, styles.center]}>
                {original.error ? <Text style={styles.overlayText}>Couldn’t load the pass</Text> : <ActivityIndicator />}
              </View>
            )}
          </View>
        ) : barcode ? (
          <View style={styles.qrBox}>
            <SvgXml xml={barcode.svg} width={barcode.width} height={barcode.height} />
          </View>
        ) : (
          // Blurred on purpose: it must never look scannable at the gate.
          <View style={[styles.qrBox, styles.placeholder]}>
            <QRCode value={payload} size={150} backgroundColor="#FFFFFF" color="#9AA0AE" />
            <BlurView intensity={28} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>PLACEHOLDER</Text>
              <Text style={styles.overlayText}>Not a boarding pass</Text>
            </View>
          </View>
        )}
        <Text style={[styles.hint, { color: c.muted }]}>
          {hasPass
            ? f.boarding_pass?.original_image
              ? `${f.airline_name ?? 'Airline'}’s boarding pass, as issued. Scan at the gate with brightness up.`
              : 'Scan at the gate. Turn your screen brightness up.'
            : 'Your real pass shows here once you check in.'}
        </Text>
      </View>
    </View>
    {f.boarding_pass?.original_file ? (
      <Pressable
        onPress={() => openOriginal(f).catch((e) => setOpenError((e as Error).message))}
        style={({ pressed }) => [styles.openButton, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[styles.openText, { color: c.text }]}>
          {f.boarding_pass.original_file.content_type.includes('pkpass') ? 'Open original pass (Apple Wallet)' : 'Open original boarding pass (PDF)'}
        </Text>
      </Pressable>
    ) : null}
    {openError ? <Text style={[styles.hint, { color: '#DC2626' }]}>{openError}</Text> : null}
    {hasPass && f.digiyatra ? <DigiYatraButton passRef={passRef} flight={f} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pass: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 18, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  field: { width: '33.33%', paddingRight: 8 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  value: { fontSize: 14, fontWeight: '700', marginTop: 3 },
  tear: { borderTopWidth: 1.5, borderStyle: 'dashed', marginVertical: 18 },
  qrWrap: { alignItems: 'center', gap: 10 },
  qrBox: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 14 },
  placeholder: { overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  overlayTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 2, color: INK },
  overlayText: { fontSize: 12, fontWeight: '600', color: '#4B5263' },
  hint: { fontSize: 12, textAlign: 'center' },
  originalImage: { width: 220, height: 220 },
  center: { alignItems: 'center', justifyContent: 'center' },
  openButton: { height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  openText: { fontSize: 14, fontWeight: '700' },
});
