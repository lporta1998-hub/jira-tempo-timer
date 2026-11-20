import { useCallback, useEffect, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage.js';

/**
 * Worklogs that could not be submitted (network down, bad token, Tempo
 * outage...). Kept in localStorage until they are retried successfully or
 * explicitly discarded, so tracked time is never silently lost.
 */
const KEY = 'jtt.pending.v1';

export function usePendingQueue() {
  const [items, setItems] = useState(() => loadJSON(KEY, []));

  useEffect(() => saveJSON(KEY, items), [items]);

  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setItems(loadJSON(KEY, []));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((worklog, error) => {
    setItems((list) => [
      ...list,
      { ...worklog, localId: crypto.randomUUID(), queuedAt: Date.now(), lastError: error },
    ]);
  }, []);

  const remove = useCallback((localId) => setItems((list) => list.filter((i) => i.localId !== localId)), []);

  const setError = useCallback(
    (localId, lastError) => setItems((list) => list.map((i) => (i.localId === localId ? { ...i, lastError } : i))),
    []
  );

  return { items, add, remove, setError };
}
