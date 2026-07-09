'use client';

/**
 * useGoogleCalendar
 *
 * Calls the `google-calendar-proxy` Supabase Edge Function to securely fetch
 * Google Calendar events for the current authenticated user's team.
 *
 * Usage:
 *   const { events, loading, error, refetch } = useGoogleCalendar({
 *     timeMin: '2026-01-01T00:00:00Z',
 *     timeMax: '2026-12-31T23:59:59Z',
 *     maxResults: 250,
 *     singleEvents: true,
 *     orderBy: 'startTime',
 *   });
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
  colorId?: string;
  created?: string;
  updated?: string;
  creator?: { email?: string; displayName?: string };
  organizer?: { email?: string; displayName?: string };
  [key: string]: unknown;
}

export interface CalendarMeta {
  team_id: string;
  calendar_id: string;
  fetched_at: string;
  fetched_by_role: string;
}

export interface UseGoogleCalendarOptions {
  /** ISO 8601 timestamp — only events ending after this time are returned */
  timeMin?: string;
  /** ISO 8601 timestamp — only events starting before this time are returned */
  timeMax?: string;
  /** Max number of events (default: 250, max: 2500) */
  maxResults?: number;
  /** Expand recurring events into individual instances */
  singleEvents?: boolean;
  /** 'startTime' requires singleEvents=true. 'updated' sorts by last modified */
  orderBy?: 'startTime' | 'updated';
  /** Free-text search query */
  q?: string;
  /** Whether to include cancelled/deleted events */
  showDeleted?: boolean;
  /** If false, the hook will not fetch automatically on mount */
  autoFetch?: boolean;
}

export interface UseGoogleCalendarResult {
  events: GoogleCalendarEvent[];
  meta: CalendarMeta | null;
  loading: boolean;
  error: string | null;
  /** Manually re-trigger the fetch */
  refetch: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGoogleCalendar(
  options: UseGoogleCalendarOptions = {},
): UseGoogleCalendarResult {
  const {
    timeMin,
    timeMax,
    maxResults = 250,
    singleEvents = true,
    orderBy = 'startTime',
    q,
    showDeleted = false,
    autoFetch = true,
  } = options;

  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [meta, setMeta] = useState<CalendarMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a counter to allow manual re-triggers without changing options
  const [fetchTick, setFetchTick] = useState(0);

  // Keep a ref to abort in-flight requests when the component unmounts
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    setFetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!autoFetch && fetchTick === 0) return;

    // Abort any pending request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        // Retrieve the current session JWT to authenticate the Edge Function call
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          setError('You must be signed in to access calendar data.');
          return;
        }

        // Build query params for the edge function
        const params = new URLSearchParams();
        if (timeMin) params.set('timeMin', timeMin);
        if (timeMax) params.set('timeMax', timeMax);
        if (maxResults) params.set('maxResults', String(maxResults));
        params.set('singleEvents', String(singleEvents));
        params.set('orderBy', orderBy);
        if (q) params.set('q', q);
        if (showDeleted) params.set('showDeleted', 'true');

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
          setError('Supabase URL is not configured.');
          return;
        }

        const functionUrl = `${supabaseUrl}/functions/v1/google-calendar-proxy?${params.toString()}`;

        const response = await fetch(functionUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          // The edge function always returns { error: { code, message } } on failure
          const message =
            payload?.error?.message ??
            `Unexpected error (HTTP ${response.status})`;
          setError(message);
          return;
        }

        const items: GoogleCalendarEvent[] =
          (payload.data as any)?.items ?? [];

        setEvents(items);
        setMeta(payload.meta ?? null);
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return; // intentional
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    run();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTick, autoFetch, timeMin, timeMax, maxResults, singleEvents, orderBy, q, showDeleted]);

  return { events, meta, loading, error, refetch };
}
