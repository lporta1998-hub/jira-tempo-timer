const pad = (n) => String(n).padStart(2, '0');

/** 3725 -> "01:02:05" */
export function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 3900 -> "1h 05m", 600 -> "10m" */
export function formatDuration(totalSeconds) {
  const m = Math.round(totalSeconds / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${pad(m % 60)}m` : `${m}m`;
}

/**
 * Round UP to the next multiple of `minutes`, with a 1-minute minimum
 * (Jira and Tempo reject worklogs under 60 seconds).
 */
export function roundUpSeconds(seconds, minutes = 1) {
  const step = Math.max(1, minutes) * 60;
  return Math.max(60, Math.ceil(seconds / step) * step);
}

/** Epoch ms -> value for <input type="datetime-local" step="1"> */
export function toDateTimeLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

export function formatClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
