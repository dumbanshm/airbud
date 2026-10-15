import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';
import { api, type EmailLog, type Flight, type Me } from './api';
import { getPermission, registerForRemotePush, scheduledReminderCount } from './notifications';

export function useFlights() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['flights'],
    queryFn: () => api<Flight[]>('/flights'),
    enabled: status === 'signedIn',
    refetchInterval: 60_000,
  });
}

export function useMe() {
  const { status } = useAuth();
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), enabled: status === 'signedIn' });
}

export function useEmails() {
  const { status } = useAuth();
  return useQuery({ queryKey: ['emails'], queryFn: () => api<EmailLog[]>('/emails'), enabled: status === 'signedIn' });
}

export function usePermission() {
  return useQuery({ queryKey: ['notif-permission'], queryFn: getPermission, staleTime: 0 });
}

/** Registers this phone for remote push once per app launch (after permission is granted). */
export function usePushStatus() {
  const { status } = useAuth();
  const permission = usePermission();
  return useQuery({
    queryKey: ['push-status', permission.data],
    queryFn: registerForRemotePush,
    enabled: status === 'signedIn' && permission.isSuccess,
    staleTime: Infinity,
  });
}

export function useReminderCount() {
  return useQuery({ queryKey: ['reminder-count'], queryFn: scheduledReminderCount });
}
