import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import { useFonts } from 'expo-font';

/** Loads the three families in DESIGN.md. Returns true once they're ready (or failed: we fall back to system fonts). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });
  return loaded || !!error;
}
