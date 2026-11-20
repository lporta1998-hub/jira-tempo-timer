import { useEffect, useRef, useState } from 'react';
import { formatDuration, formatHMS, roundUpSeconds, toDateTimeLocal } from '../lib/time.js';

/**
 * Shown after "Stop & Log Work". Lets you add a description and, if needed,
 * correct the duration or start time before submitting.
 */
export default function LogDialog({ ticket, elapsedSeconds, startedAt, roundingMinutes, mode, submitting, onSubmit, onCancel }) {
  const rounded = roundUpSeconds(elapsedSeconds, roundingMinutes);
  const [hours, setHours] = useState(Math.floor(rounded / 3600));
  const [minutes, setMinutes] = useState(Math.round((rounded % 3600) / 60));
  const [start, setStart] = useState(toDateTimeLocal(startedAt ?? Date.now() - elapsedSeconds * 1000));
  const [description, setDescription] = useState('');
  const textRef = useRef(null);

  useEffect(() => textRef.current?.focus(), []);

  const totalSeconds = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
  const startMs = new Date(start).getTime();
  const valid = totalSeconds >= 60 && totalSeconds <= 24 * 3600 && Number.isFinite(startMs);

  function submit(e) {
    e.preventDefault();
    if (!valid || submitting) return;
    onSubmit({
      issueId: ticket.id,
      issueKey: ticket.key,
      summary: ticket.summary,
      startedAt: startMs,
      timeSpentSeconds: totalSeconds,
      description: description.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onCancel}>
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        className="card w-full max-w-lg space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold">Log work</h2>
          <p className="text-sm text-slate-500">
            <span className="font-mono text-sky-700 dark:text-sky-400">{ticket.key}</span> — {ticket.summary}
          </p>
        </div>

        <div className="grid grid-cols-[1fr_1fr_2fr] gap-3">
          <div>
            <label className="label" htmlFor="h">Hours</label>
            <input id="h" className="input" type="number" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="m">Minutes</label>
            <input id="m" className="input" type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="start">Started</label>
            <input id="start" className="input" type="datetime-local" step="1" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          Tracked {formatHMS(elapsedSeconds)}
          {roundingMinutes > 1 ? `, rounded up to the next ${roundingMinutes} min` : ', rounded up to the minute'} →{' '}
          <strong>{formatDuration(totalSeconds)}</strong>
        </p>

        <div>
          <label className="label" htmlFor="desc">Work description (optional)</label>
          <textarea
            id="desc"
            ref={textRef}
            rows={3}
            className="input resize-y"
            placeholder={`Working on issue ${ticket.key}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Sends to <strong>{mode === 'tempo' ? 'Tempo' : 'Jira worklog'}</strong> · Ctrl/⌘+Enter
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
              Back to timer
            </button>
            <button type="submit" className="btn-primary" disabled={!valid || submitting}>
              {submitting ? 'Logging…' : 'Log time'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
