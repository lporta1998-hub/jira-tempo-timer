import { formatHMS } from '../lib/time.js';
import { PauseIcon, PlayIcon, XIcon } from './Icons.jsx';
import ConfirmButton from './ConfirmButton.jsx';

/** One row: elapsed time, discard, start/pause, log. */
export default function TimerRow({ timer, onLog, onDiscard }) {
  const { ticket, running, hasTime, elapsedSeconds } = timer;
  const color = running ? 'text-emerald-600 dark:text-emerald-400' : hasTime ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400';

  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex-1 font-mono text-3xl font-semibold tabular-nums tracking-tight ${color}`}>
        {formatHMS(elapsedSeconds)}
      </div>

      {hasTime && !running && (
        <ConfirmButton className="icon-btn" onConfirm={onDiscard} title="Discard tracked time" armedLabel="Discard?">
          <XIcon />
        </ConfirmButton>
      )}

      <button
        className={`${running ? 'btn-warn' : 'btn-success'} h-9 w-9 !p-0`}
        onClick={running ? timer.pause : timer.start}
        disabled={!ticket}
        title={running ? 'Pause' : hasTime ? 'Resume' : 'Start'}
        aria-label={running ? 'Pause' : 'Start'}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button className="btn-primary h-9" onClick={onLog} disabled={!hasTime} title="Stop & log work">
        Log
      </button>
    </div>
  );
}
