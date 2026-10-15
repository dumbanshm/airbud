import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useAppFonts } from '../src/design/fonts';
import { AuthProvider } from '../src/lib/auth';
import { setupNotifications, supported } from '../src/lib/notifications';
import { queryClient } from '../src/lib/queryClient';
import { useColors } from '../src/theme';

setupNotifications();

/** Tapping a notification opens the flight it's about; a push arriving refreshes the list. */
function NotificationBridge() {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    const url = response.notification.request.content.data?.url;
    if (handled.current === id || typeof url !== 'string') return;
    handled.current = id;
    router.push(url as never);
  }, [response]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => queryClient.invalidateQueries());
    return () => sub.remove();
  }, []);
  return null;
}

export default function RootLayout() {
  const c = useColors();
  const fontsReady = useAppFonts();
  // Hold the first frame until the fonts are in, so nothing flashes in a fallback face.
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {supported ? <NotificationBridge /> : null}
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="flight/[id]" options={{ title: '' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
          <Stack.Screen name="design" options={{ title: 'Design system' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
