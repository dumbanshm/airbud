import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';
import { api, type EmailLog, type Flight, type Me, type Trip } from './api';
import { queryClient } from './queryClient';
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

/** Trips, oldest first. Also fills the flat flight cache so a flight screen opens instantly. */
export function useTrips() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['trips'],
    queryFn: async () => {
      const trips = await api<Trip[]>('/trips');
      queryClient.setQueryData(['flights'], trips.flatMap((t) => t.flights));
      return trips;
    },
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
