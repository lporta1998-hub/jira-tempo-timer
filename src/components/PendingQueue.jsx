import { useState } from 'react';
import { formatDuration } from '../lib/time.js';

/** Worklogs that failed to submit, with Retry / Discard. Hidden when empty. */
export default function PendingQueue({ items, onRetry, onRetryAll, onDiscard }) {
  const [busy, setBusy] = useState(null);
  if (!items.length) return null;

  async function run(id, fn) {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-amber-800 dark:text-amber-300">
          ⚠ {items.length} worklog{items.length > 1 ? 's' : ''} not submitted yet
        </h2>
        <button className="btn-warn" disabled={busy !== null} onClick={() => run('all', onRetryAll)}>
          {busy === 'all' ? 'Retrying…' : 'Retry all'}
        </button>
      </div>
      <p className="mb-3 text-xs text-amber-800/80 dark:text-amber-300/80">
        Saved in this browser so the time isn't lost. Fix the problem (e.g. in Settings) and retry.
      </p>
      <ul className="divide-y divide-amber-200 dark:divide-amber-900">
        {items.map((i) => (
          <li key={i.localId} className="flex items-start gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex gap-2">
                <span className="font-mono">{i.issueKey}</span>
                <span className="font-semibold">{formatDuration(i.timeSpentSeconds)}</span>
                <span className="text-slate-500">{new Date(i.startedAt).toLocaleString()}</span>
              </div>
              {i.description && <div className="truncate text-slate-600 dark:text-slate-400">{i.description}</div>}
              {i.lastError && <div className="text-xs text-rose-700 dark:text-rose-400">{i.lastError}</div>}
            </div>
            <button className="btn-ghost px-2 py-1" disabled={busy !== null} onClick={() => run(i.localId, () => onRetry(i))}>
              {busy === i.localId ? '…' : 'Retry'}
            </button>
            <button
              className="btn-ghost px-2 py-1"
              disabled={busy !== null}
              onClick={() => confirm(`Discard ${formatDuration(i.timeSpentSeconds)} on ${i.issueKey}? This can't be undone.`) && onDiscard(i.localId)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
