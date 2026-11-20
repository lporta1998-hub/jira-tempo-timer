import { formatHMS, formatClock } from '../lib/time.js';

/** Big HH:MM:SS display with Start / Pause / Stop & Log / Discard. */
export default function TimerCard({ timer, onStop, onDiscard }) {
  const { ticket, running, hasTime, elapsedSeconds, firstStartedAt } = timer;

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div
        className={`font-mono text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl ${
          running ? 'text-emerald-600 dark:text-emerald-400' : hasTime ? 'text-amber-600 dark:text-amber-400' : ''
        }`}
        aria-live="off"
      >
        {formatHMS(elapsedSeconds)}
      </div>

      <div className="h-5 text-sm text-slate-500">
        {running && `Running since ${formatClock(firstStartedAt)}`}
        {!running && hasTime && 'Paused'}
        {!hasTime && !ticket && 'Pick a ticket to start tracking'}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {!running ? (
          <button className="btn-success min-w-28" onClick={timer.start} disabled={!ticket}>
            ▶ {hasTime ? 'Resume' : 'Start'}
          </button>
        ) : (
          <button className="btn-warn min-w-28" onClick={timer.pause}>
            ❚❚ Pause
          </button>
        )}
        <button className="btn-primary min-w-28" onClick={onStop} disabled={!hasTime}>
          ■ Stop &amp; Log Work
        </button>
        {hasTime && !running && (
          <button className="btn-ghost" onClick={onDiscard} title="Throw away the tracked time">
            Discard
          </button>
        )}
      </div>
    </div>
  );
}
