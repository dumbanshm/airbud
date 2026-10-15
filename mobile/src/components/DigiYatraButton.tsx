/**
 * "Add to DigiYatra". DigiYatra's direct app-to-app import is only open to partner airlines
 * (IndiGo's "Share with Digi Yatra"), so we do what DigiYatra supports for everyone: it accepts
 * a boarding pass as an image or PDF. We hand it the airline's original PDF when we have it
 * (otherwise a snapshot of the pass) through the share sheet; from there, save it or send it
 * straight to DigiYatra, then add it in the app under your upcoming travel.
 */
import * as Sharing from 'expo-sharing';
import { useState, type RefObject } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { Flight } from '../lib/api';
import { downloadOriginal } from '../lib/originalPass';
import { Text } from '../design/Text';
import { Button } from '../design/ui';

const STORE = Platform.select({
  ios: 'https://apps.apple.com/app/id6479873321',
  android: 'market://details?id=org.digiyatra.org',
  default: 'https://play.google.com/store/apps/details?id=org.digiyatra.org',
});
const STORE_WEB = 'https://play.google.com/store/apps/details?id=org.digiyatra.org';

export function DigiYatraButton({ passRef, flight }: { passRef: RefObject<View | null>; flight: Flight }) {
  const [status, setStatus] = useState<string | null>(null);

  if (Platform.OS === 'web') {
    return <Text v="caption" color="muted" style={styles.note}>Add to DigiYatra works in the phone app.</Text>;
  }

  const share = async () => {
    setStatus(null);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
      const pdf = flight.boarding_pass?.original_file?.content_type === 'application/pdf';
      if (pdf) {
        const uri = await downloadOriginal(flight);
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Boarding pass ${flight.flight_number}` });
      } else {
        const uri = await captureRef(passRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Boarding pass ${flight.flight_number}` });
      }
      setStatus(`In DigiYatra: Upcoming travel → add boarding pass → upload this ${pdf ? 'PDF' : 'image'}.`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const openStore = () => Linking.openURL(STORE).catch(() => Linking.openURL(STORE_WEB));

  return (
    <View style={styles.wrap}>
      <Button title="Add to DigiYatra" icon="face" onPress={share} style={styles.stretch} />
      <Pressable onPress={openStore} hitSlop={8} accessibilityRole="link">
        <Text v="label" color="muted" style={styles.link}>Open or get the DigiYatra app</Text>
      </Pressable>
      {status ? <Text v="caption" color="muted" style={styles.note}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  stretch: { alignSelf: 'stretch' },
  link: { textDecorationLine: 'underline' },
  note: { textAlign: 'center' },
});
