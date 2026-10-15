import { API_URL } from './config';

export type Side = {
  airport: string;
  city: string;
  name: string | null;
  terminal: string | null;
  /** Airport wall-clock time with its offset, e.g. "2026-10-20T18:05:00+05:30" */
  local_time: string | null;
  tz: string;
  utc: string | null;
};

export type StatusCode = 'on_time' | 'delayed' | 'boarding' | 'departed' | 'landed' | 'cancelled';

export type Flight = {
  id: number;
  pnr: string;
  flight_number: string;
  airline_code: string | null;
  airline_name: string | null;
  passengers: string[];
  seats: string[];
  departure: Side;
  arrival: Side;
  boarding_utc: string;
  boarding_is_estimate: boolean;
  duration_minutes: number | null;
  status: { code: StatusCode; label: string; delay_minutes: number; source: string };
  change_note: string | null;
  /** The real boarding pass barcode (IATA BCBP text), once the airline has sent one. */
  boarding_pass: { message: string; format: 'pdf417' | 'qr' | 'aztec' } | null;
};

export type Me = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  is_demo: boolean;
  gmail_connected: boolean;
  gmail_error: string | null;
  last_synced_at: string | null;
};

export type EmailLog = {
  id: number;
  subject: string | null;
  sender: string | null;
  status: 'parsed' | 'no_match' | 'error';
  parser: string | null;
  detail: string | null;
  received_at: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(value: string | null) {
  token = value;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  // Only a 401 for the token we're still using means "signed out". A request sent before the
  // saved token finished loading also gets a 401, and must not wipe the session.
  const sentWith = token;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(sentWith ? { Authorization: `Bearer ${sentWith}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${API_URL}. Is the backend running and on the same Wi-Fi?`);
  }
  if (res.status === 401 && sentWith && sentWith === token) onUnauthorized?.();
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}
