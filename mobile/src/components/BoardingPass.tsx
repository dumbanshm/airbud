import { toSVG } from 'bwip-js/generic';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SvgXml } from 'react-native-svg';

import { Text } from '../design/Text';
import { radius, space } from '../design/tokens';
import type { Flight } from '../lib/api';
import { originalBarcodeUri } from '../lib/originalPass';

// The barcode area never follows the theme: black on pure white, so it scans at the gate.
const PAPER = '#FFFFFF';
const INK = '#000000';
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

/** True once there is a real, scannable pass to show. */
export function useHasPass(f: Flight) {
  const svg = useBarcodeSvg(f.boarding_pass);
  return !!f.boarding_pass && (!!svg || !!f.boarding_pass.original_image);
}

/**
 * The barcode block of the pass: the airline's real barcode once one has arrived (after check-in),
 * a blurred placeholder before that. The airline's image is shown exactly as issued: no tint, blur,
 * scaling artefacts or rounding on the code itself.
 */
export function Barcode({ flight: f }: { flight: Flight }) {
  const svg = useBarcodeSvg(f.boarding_pass);
  const original = useQuery({
    queryKey: ['pass-barcode', f.id],
    queryFn: () => originalBarcodeUri(f.id),
    enabled: !!f.boarding_pass?.original_image,
    staleTime: Infinity,
  });
  const passenger = f.passengers[0] ?? 'Passenger';
  const payload = `AIRBUD-PLACEHOLDER ${f.pnr} ${f.flight_number} ${f.departure.airport}${f.arrival.airport} ${passenger}`;
  const hasPass = !!f.boarding_pass && (!!svg || !!f.boarding_pass.original_image);

  return (
    <View style={styles.wrap}>
      {f.boarding_pass?.original_image ? (
        <View style={styles.paper}>
          {original.data ? (
            <Image source={{ uri: original.data }} style={styles.original} resizeMode="contain" accessibilityLabel="Boarding pass barcode" />
          ) : (
            <View style={[styles.original, styles.center]}>
              {original.error ? <Text v="caption" style={{ color: '#4B5263' }}>Couldn’t load the pass</Text> : <ActivityIndicator color="#4B5263" />}
            </View>
          )}
        </View>
      ) : svg ? (
        <View style={styles.paper} accessibilityLabel="Boarding pass barcode">
          <SvgXml xml={svg.svg} width={svg.width} height={svg.height} />
        </View>
      ) : (
        // Blurred on purpose: it must never look scannable at the gate.
        <View style={[styles.paper, styles.placeholder]} accessibilityLabel="Placeholder, not a boarding pass">
          <QRCode value={payload} size={140} backgroundColor={PAPER} color="#9AA0AE" />
          <BlurView intensity={28} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Text v="title" style={{ color: '#16181A', letterSpacing: 2 }}>PLACEHOLDER</Text>
            <Text v="caption" style={{ color: '#4B5263' }}>Not a boarding pass</Text>
          </View>
        </View>
      )}
      <Text v="caption" color="muted" style={styles.hint}>
        {hasPass
          ? f.boarding_pass?.original_image
            ? `${f.airline_name ?? 'The airline'}’s pass, as issued. Turn brightness up at the gate.`
            : 'Scan at the gate. Turn your screen brightness up.'
          : 'Your real pass shows here once you check in.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.s + 2 },
  paper: { padding: space.m, backgroundColor: PAPER, borderRadius: radius.s },
  placeholder: { overflow: 'hidden' },
  original: { width: 240, height: 200 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  hint: { textAlign: 'center' },
});
