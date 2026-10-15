/**
 * "Add to DigiYatra". DigiYatra's direct app-to-app import is only open to partner airlines
 * (IndiGo's "Share with Digi Yatra"), so we do what DigiYatra supports for everyone: it accepts
 * a boarding pass as an image or PDF. We snapshot the pass (with its real barcode) to a PNG and
 * open the share sheet; from there, save it or send it straight to DigiYatra, then add it in the
 * app under your upcoming travel.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useState, type RefObject } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useColors } from '../theme';

const STORE = Platform.select({
  ios: 'https://apps.apple.com/app/id6479873321',
  android: 'market://details?id=org.digiyatra.org',
  default: 'https://play.google.com/store/apps/details?id=org.digiyatra.org',
});
const STORE_WEB = 'https://play.google.com/store/apps/details?id=org.digiyatra.org';

export function DigiYatraButton({ passRef, flightNumber }: { passRef: RefObject<View | null>; flightNumber: string }) {
  const c = useColors();
  const [status, setStatus] = useState<string | null>(null);

  if (Platform.OS === 'web') {
    return <Text style={[styles.note, { color: c.faint }]}>Add to DigiYatra works in the phone app.</Text>;
  }

  const share = async () => {
    setStatus(null);
    try {
      const uri = await captureRef(passRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Boarding pass ${flightNumber}` });
      setStatus('In DigiYatra: Upcoming travel → add boarding pass → upload this image.');
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const openStore = () => Linking.openURL(STORE).catch(() => Linking.openURL(STORE_WEB));

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={share}
        style={({ pressed }) => [styles.button, { backgroundColor: c.text, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="scan-outline" size={18} color={c.bg} />
        <Text style={[styles.buttonText, { color: c.bg }]}>Add to DigiYatra</Text>
      </Pressable>
      <Pressable onPress={openStore} hitSlop={8}>
        <Text style={[styles.link, { color: c.accent }]}>Open or get the DigiYatra app</Text>
      </Pressable>
      {status ? <Text style={[styles.note, { color: c.muted }]}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, marginTop: 4, alignSelf: 'stretch' },
  button: { height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '600' },
  note: { fontSize: 12, textAlign: 'center' },
});
