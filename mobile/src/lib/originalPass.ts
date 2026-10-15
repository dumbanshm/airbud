/** The airline's original boarding pass files, fetched with the user's login. */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getApiToken, type Flight } from './api';
import { API_URL } from './config';

const auth = () => ({ Authorization: `Bearer ${getApiToken() ?? ''}` });

/** The airline's barcode exactly as printed, as a data URI for <Image>. */
export async function originalBarcodeUri(flightId: number): Promise<string> {
  const res = await fetch(`${API_URL}/flights/${flightId}/pass/barcode.png`, { headers: auth() });
  if (!res.ok) throw new Error(`Couldn't load the boarding pass (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

/** Download the original pass (PDF / .pkpass) to the phone; returns its local file URI. */
export async function downloadOriginal(f: Flight): Promise<string> {
  const original = f.boarding_pass?.original_file;
  if (!original) throw new Error('No original boarding pass for this flight.');
  const url = `${API_URL}/flights/${f.id}/pass/original`;
  const name = original.filename.replace(/[^\w.\-]+/g, '_') || 'boarding-pass.pdf';
  const file = await File.downloadFileAsync(url, new File(Paths.cache, name), { headers: auth(), idempotent: true });
  return file.uri;
}

/** Open the airline's original pass: a PDF viewer / share sheet (iOS offers "Add to Apple Wallet" for .pkpass). */
export async function openOriginal(f: Flight): Promise<void> {
  const original = f.boarding_pass?.original_file;
  if (!original) return;
  if (Platform.OS === 'web') {
    const res = await fetch(`${API_URL}/flights/${f.id}/pass/original`, { headers: auth() });
    window.open(URL.createObjectURL(await res.blob()), '_blank');
    return;
  }
  const uri = await downloadOriginal(f);
  const pkpass = original.content_type.includes('pkpass');
  await Sharing.shareAsync(uri, {
    mimeType: original.content_type,
    UTI: pkpass ? 'com.apple.pkpass' : 'com.adobe.pdf',
    dialogTitle: `Boarding pass ${f.flight_number}`,
  });
}
