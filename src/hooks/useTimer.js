import { useCallback, useEffect, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage.js';

/**
 * Stopwatch whose whole state lives in localStorage, so a refresh, closed
 * tab or browser restart never loses tracked time.
 *
 * Elapsed time is derived from timestamps rather than counted ticks, so it
 * stays correct while the tab is in the background or the laptop sleeps.
 *
 *   ticket             { id, key, summary } the time belongs to
 *   runningSince       epoch ms the current running segment started (null = paused/stopped)
 *   accumulatedSeconds seconds from earlier segments (before the last pause)
 *   firstStartedAt     epoch ms of the very first Start (becomes the worklog start time)
 */
const KEY = 'jtt.timer.v1';
const EMPTY = { ticket: null, runningSince: null, accumulatedSeconds: 0, firstStartedAt: null };

const load = () => ({ ...EMPTY, ...loadJSON(KEY, {}) });
const segmentSeconds = (since, now) => (since ? Math.max(0, (now - since) / 1000) : 0);

export function useTimer() {
  const [state, setState] = useState(load);
  const [now, setNow] = useState(Date.now());

  // Persist every change.
  useEffect(() => saveJSON(KEY, state), [state]);

  // Re-render once a second while running.
  useEffect(() => {
    if (!state.runningSince) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.runningSince]);

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setState(load());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const elapsedSeconds = state.accumulatedSeconds + segmentSeconds(state.runningSince, now);

  const setTicket = useCallback((ticket) => setState((s) => ({ ...s, ticket })), []);

  const start = useCallback(() => {
    setState((s) => {
      if (!s.ticket || s.runningSince) return s;
      const t = Date.now();
      return { ...s, runningSince: t, firstStartedAt: s.firstStartedAt ?? t };
    });
  }, []);

  const pause = useCallback(() => {
    setState((s) =>
      s.runningSince
        ? {
            ...s,
            accumulatedSeconds: s.accumulatedSeconds + segmentSeconds(s.runningSince, Date.now()),
            runningSince: null,
          }
        : s
    );
  }, []);

  /** Clears tracked time but keeps the selected ticket. */
  const reset = useCallback(() => setState((s) => ({ ...EMPTY, ticket: s.ticket })), []);

  return {
    ticket: state.ticket,
    running: Boolean(state.runningSince),
    hasTime: elapsedSeconds > 0 || Boolean(state.runningSince),
    elapsedSeconds,
    firstStartedAt: state.firstStartedAt,
    raw: state, // persisted fields, mirrored to the menu bar app
    setTicket,
    start,
    pause,
    reset,
  };
}
