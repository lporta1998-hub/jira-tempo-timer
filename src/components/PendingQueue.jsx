import { useState } from 'react';
import { formatDuration } from '../lib/time.js';
import { ChevronIcon, XIcon } from './Icons.jsx';
import ConfirmButton from './ConfirmButton.jsx';

/** Compact banner for worklogs that failed to submit. Hidden when empty. */
export default function PendingQueue({ items, onRetry, onRetryAll, onDiscard }) {
  const [open, setOpen] = useState(false);
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
    <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <button className="flex flex-1 items-center gap-1 text-left font-medium" onClick={() => setOpen((o) => !o)}>
          ⚠ {items.length} unsent worklog{items.length > 1 ? 's' : ''} <ChevronIcon open={open} width={12} height={12} />
        </button>
        <button className="font-semibold underline disabled:opacity-50" disabled={busy !== null} onClick={() => run('all', onRetryAll)}>
          {busy === 'all' ? 'Retrying…' : 'Retry'}
        </button>
      </div>
      {open && (
        <ul className="mt-1 space-y-1 pb-1">
          {items.map((i) => (
            <li key={i.localId} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <span className="font-mono">{i.issueKey}</span> · {formatDuration(i.timeSpentSeconds)} ·{' '}
                {new Date(i.startedAt).toLocaleDateString()}
                {i.lastError && <div className="truncate text-rose-700 dark:text-rose-400" title={i.lastError}>{i.lastError}</div>}
              </div>
              <button className="underline disabled:opacity-50" disabled={busy !== null} onClick={() => run(i.localId, () => onRetry(i))}>
                {busy === i.localId ? '…' : 'retry'}
              </button>
              <ConfirmButton className="icon-btn !h-5 !w-5" onConfirm={() => onDiscard(i.localId)} armedLabel="discard?" title="Discard">
                <XIcon width={12} height={12} />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
