import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDuration } from '../lib/time.js';
import { loadJSON, saveJSON } from '../lib/storage.js';
import { ChevronIcon } from './Icons.jsx';

/**
 * One-line "Today 3h 20m" footer; click to expand the list.
 * Reloads after each log, and when the window regains focus (at most once a minute).
 */
export default function TodayLogs({ refreshKey, jiraBaseUrl }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(() => loadJSON('jtt.todayOpen', false));
  const loadedAt = useRef(0);

  const load = useCallback(async () => {
    loadedAt.current = Date.now();
    try {
      setData(await api('/worklogs/today'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onFocus = () => Date.now() - loadedAt.current > 60_000 && load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  function toggle() {
    setOpen((o) => {
      saveJSON('jtt.todayOpen', !o);
      return !o;
    });
  }

  const n = data?.entries.length ?? 0;

  return (
    <div className="border-t border-slate-200 text-xs dark:border-slate-800">
      <button className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={toggle}>
        <span className="text-slate-500">Today</span>
        <span className="font-mono font-semibold">{data ? formatDuration(data.totalSeconds) : '–'}</span>
        {n > 0 && <span className="text-slate-400">· {n} log{n > 1 ? 's' : ''}</span>}
        {error && <span className="truncate text-rose-600" title={error}>· couldn't load</span>}
        <span className="ml-auto text-slate-400">
          <ChevronIcon open={open} width={12} height={12} />
        </span>
      </button>

      {open && (
        <div className="max-h-48 overflow-auto px-3 pb-2">
          {data?.warning && <p className="mb-1 text-amber-600">{data.warning}</p>}
          {n === 0 && <p className="text-slate-500">Nothing logged yet today.</p>}
          <ul className="space-y-0.5">
            {data?.entries.map((e) => (
              <li key={e.id} className="flex items-baseline gap-2" title={[e.summary, e.description].filter(Boolean).join('\n')}>
                <span className="w-9 shrink-0 font-mono text-slate-400">{String(e.startTime).slice(0, 5)}</span>
                {jiraBaseUrl && !e.issueKey.startsWith('#') ? (
                  <a className="shrink-0 font-mono text-sky-700 hover:underline dark:text-sky-400" href={`${jiraBaseUrl}/browse/${e.issueKey}`} target="_blank" rel="noreferrer">
                    {e.issueKey}
                  </a>
                ) : (
                  <span className="shrink-0 font-mono">{e.issueKey}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-slate-500">{e.description || e.summary}</span>
                <span className="shrink-0 font-mono">{formatDuration(e.timeSpentSeconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
