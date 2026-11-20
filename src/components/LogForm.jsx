import { useEffect, useRef, useState } from 'react';
import { formatDuration, formatHMS, roundUpSeconds } from '../lib/time.js';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Inline "log work" form that replaces the timer row after Stop.
 * Enter submits, Esc goes back to the (paused) timer.
 */
export default function LogForm({ ticket, elapsedSeconds, startedAt, roundingMinutes, mode, submitting, onSubmit, onCancel }) {
  const rounded = roundUpSeconds(elapsedSeconds, roundingMinutes);
  const startDate = new Date(startedAt ?? Date.now() - elapsedSeconds * 1000);
  const [hours, setHours] = useState(Math.floor(rounded / 3600));
  const [minutes, setMinutes] = useState(Math.round((rounded % 3600) / 60));
  const [time, setTime] = useState(`${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`);
  const [description, setDescription] = useState('');
  const descRef = useRef(null);

  useEffect(() => descRef.current?.focus(), []);

  const totalSeconds = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
  const valid = totalSeconds >= 60 && totalSeconds <= 24 * 3600 && /^\d{2}:\d{2}$/.test(time);

  function submit(e) {
    e.preventDefault();
    if (!valid || submitting) return;
    // Same calendar day the timer started on, at the (possibly edited) time.
    const [hh, mm] = time.split(':').map(Number);
    const start = new Date(startDate);
    start.setHours(hh, mm, startDate.getSeconds(), 0);
    onSubmit({
      issueId: ticket.id,
      issueKey: ticket.key,
      summary: ticket.summary,
      startedAt: start.getTime(),
      timeSpentSeconds: totalSeconds,
      description: description.trim(),
    });
  }

  const num = 'input w-12 px-1.5 text-center tabular-nums';

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      className="space-y-2"
    >
      <div className="flex items-center gap-1.5 text-sm">
        <input className={num} type="number" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" />
        <span className="text-slate-500">h</span>
        <input className={num} type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" />
        <span className="text-slate-500">m</span>
        <span className="ml-auto text-xs text-slate-500">from</span>
        <input className="input w-[5.5rem] px-1.5 tabular-nums" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" />
      </div>
      <input
        ref={descRef}
        className="input"
        placeholder="What did you work on? (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={5000}
      />
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-[11px] text-slate-500" title={`Sends to ${mode === 'tempo' ? 'Tempo' : 'Jira'}`}>
          tracked {formatHMS(elapsedSeconds)} → {mode === 'tempo' ? 'Tempo' : 'Jira'}
        </span>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
          Back
        </button>
        <button type="submit" className="btn-primary" disabled={!valid || submitting}>
          {submitting ? 'Logging…' : `Log ${valid ? formatDuration(totalSeconds) : ''}`}
        </button>
      </div>
    </form>
  );
}
