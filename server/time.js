/**
 * Date helpers. The server runs on your own machine, so the server's local
 * timezone is your timezone — worklogs get the wall-clock time you expect.
 */
const pad = (n) => String(n).padStart(2, '0');

/** Breaks an epoch-ms timestamp into the formats Tempo and Jira want. */
export function localParts(ms) {
  const d = new Date(ms);
  const startDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // Tempo: YYYY-MM-DD
  const startTime = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; // Tempo: HH:MM:SS
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  // Jira: yyyy-MM-dd'T'HH:mm:ss.SSSZ  e.g. 2026-11-20T09:15:00.000+0100
  const jiraStarted = `${startDate}T${startTime}.000${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  return { startDate, startTime, jiraStarted };
}

export function todayLocal() {
  return localParts(Date.now()).startDate;
}
