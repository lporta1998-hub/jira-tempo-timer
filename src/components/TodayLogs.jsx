import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDuration } from '../lib/time.js';

/** Summary of what has been logged today (from Tempo, or local history in Jira mode). */
export default function TodayLogs({ refreshKey, jiraBaseUrl }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api('/worklogs/today'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Logged today</h2>
          {data && (
            <p className="text-xs text-slate-500">
              {data.source === 'tempo' ? 'From Tempo (all sources)' : 'Logged from this app'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && <span className="font-mono text-lg font-semibold">{formatDuration(data.totalSeconds)}</span>}
          <button className="btn-ghost px-2 py-1" onClick={load} disabled={loading} title="Refresh">
            <span className={loading ? 'animate-spin' : ''}>↻</span>
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {data?.warning && <p className="mb-2 text-xs text-amber-600">{data.warning}</p>}

      {data && !data.entries.length && <p className="text-sm text-slate-500">Nothing logged yet today.</p>}

      {data?.entries.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.entries.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="w-12 shrink-0 font-mono text-xs text-slate-500">{String(e.startTime).slice(0, 5)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex gap-2">
                  {jiraBaseUrl && !e.issueKey.startsWith('#') ? (
                    <a
                      className="shrink-0 font-mono text-sky-700 hover:underline dark:text-sky-400"
                      href={`${jiraBaseUrl}/browse/${e.issueKey}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {e.issueKey}
                    </a>
                  ) : (
                    <span className="shrink-0 font-mono">{e.issueKey}</span>
                  )}
                  <span className="truncate">{e.summary}</span>
                </div>
                {e.description && <div className="truncate text-xs text-slate-500">{e.description}</div>}
              </div>
              <span className="shrink-0 font-mono">{formatDuration(e.timeSpentSeconds)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
