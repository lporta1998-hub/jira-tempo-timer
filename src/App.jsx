import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { formatHMS } from './lib/time.js';
import { useTimer } from './hooks/useTimer.js';
import { usePendingQueue } from './hooks/usePendingQueue.js';
import TicketPicker from './components/TicketPicker.jsx';
import TimerCard from './components/TimerCard.jsx';
import LogDialog from './components/LogDialog.jsx';
import PendingQueue from './components/PendingQueue.jsx';
import TodayLogs from './components/TodayLogs.jsx';
import Settings from './components/Settings.jsx';
import Toasts from './components/Toasts.jsx';

export default function App() {
  const timer = useTimer();
  const pending = usePendingQueue();

  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [view, setView] = useState('tracker'); // 'tracker' | 'settings'
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState('');
  const [logging, setLogging] = useState(null); // { elapsedSeconds, startedAt } while the dialog is open
  const [submitting, setSubmitting] = useState(false);
  const [todayKey, setTodayKey] = useState(0);
  const [toasts, setToasts] = useState([]);

  // ---- toasts
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, kind = 'info') => {
      const id = crypto.randomUUID();
      setToasts((t) => [...t, { id, message, kind }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    },
    [dismiss]
  );

  // ---- settings
  useEffect(() => {
    api('/settings')
      .then((s) => {
        setSettings(s);
        if (!s.jiraConfigured) setView('settings');
      })
      .catch((err) => setSettingsError(err.message));
  }, []);

  // ---- tickets
  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError('');
    try {
      setTickets(await api('/issues'));
    } catch (err) {
      setTicketsError(err.message);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (settings?.jiraConfigured) loadTickets();
  }, [settings?.jiraConfigured, settings?.jiraBaseUrl, settings?.jiraEmail, loadTickets]);

  const lookupTicket = useCallback(
    async (key) => {
      try {
        return await api(`/issues/${encodeURIComponent(key)}`);
      } catch (err) {
        toast(err.message, 'error');
        return null;
      }
    },
    [toast]
  );

  // ---- show the running timer in the browser tab title
  useEffect(() => {
    document.title = timer.hasTime
      ? `${timer.running ? '▶' : '❚❚'} ${formatHMS(timer.elapsedSeconds)} · ${timer.ticket?.key ?? ''}`
      : 'Jira Tempo Timer';
  }, [timer.hasTime, timer.running, timer.elapsedSeconds, timer.ticket]);

  // ---- warn before closing while the timer runs (time is still saved, this is just a reminder)
  useEffect(() => {
    if (!timer.running) return undefined;
    const handler = (e) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [timer.running]);

  // ---- stop & log
  function openLogDialog() {
    timer.pause();
    setLogging({ elapsedSeconds: timer.elapsedSeconds, startedAt: timer.firstStartedAt });
  }

  async function submitWorklog(worklog) {
    setSubmitting(true);
    try {
      const res = await api('/worklogs', { method: 'POST', body: worklog });
      toast(`Logged to ${res.target === 'tempo' ? 'Tempo' : 'Jira'}: ${worklog.issueKey}`, 'success');
      setTodayKey((k) => k + 1);
    } catch (err) {
      // Never lose time: park it in the pending queue for a retry.
      pending.add(worklog, err.message);
      toast(`Could not log time — saved locally for retry. ${err.message}`, 'error');
    } finally {
      timer.reset();
      setLogging(null);
      setSubmitting(false);
    }
  }

  async function retryPending(item) {
    const { localId, queuedAt, lastError, ...worklog } = item;
    try {
      await api('/worklogs', { method: 'POST', body: worklog });
      pending.remove(localId);
      setTodayKey((k) => k + 1);
      return true;
    } catch (err) {
      pending.setError(localId, err.message);
      return false;
    }
  }

  async function retryOne(item) {
    if (await retryPending(item)) toast(`Logged ${item.issueKey}`, 'success');
    else toast(`Retry failed for ${item.issueKey}`, 'error');
  }

  async function retryAll() {
    let ok = 0;
    for (const item of pending.items) if (await retryPending(item)) ok++;
    const failed = pending.items.length - ok;
    toast(failed ? `${ok} logged, ${failed} still failing` : `All ${ok} logged`, failed ? 'error' : 'success');
  }

  function discard() {
    if (confirm(`Discard ${formatHMS(timer.elapsedSeconds)} tracked on ${timer.ticket?.key}?`)) timer.reset();
  }

  // ---- render
  if (settingsError) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="card text-rose-600">{settingsError}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">⏱️ Jira Tempo Timer</h1>
        <div className="flex items-center gap-3">
          {settings && (
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs dark:bg-slate-800">
              Logging to {settings.mode === 'tempo' ? 'Tempo' : 'Jira worklogs'}
            </span>
          )}
          {view === 'tracker' && (
            <button className="btn-ghost" onClick={() => setView('settings')}>
              ⚙ Settings
            </button>
          )}
        </div>
      </header>

      {view === 'settings' && settings && (
        <Settings
          settings={settings}
          onSaved={setSettings}
          onClose={settings.jiraConfigured ? () => setView('tracker') : null}
          toast={toast}
        />
      )}

      {view === 'tracker' && (
        <>
          <PendingQueue items={pending.items} onRetry={retryOne} onRetryAll={retryAll} onDiscard={pending.remove} />

          <section className="card space-y-5">
            <div>
              <label className="label">Ticket</label>
              <TicketPicker
                tickets={tickets}
                value={timer.ticket}
                onChange={timer.setTicket}
                onLookup={lookupTicket}
                onRefresh={loadTickets}
                loading={ticketsLoading}
                disabled={timer.hasTime}
              />
              {ticketsError && <p className="mt-1 text-sm text-rose-600">{ticketsError}</p>}
              {timer.ticket && settings?.jiraBaseUrl && (
                <a
                  className="mt-1 inline-block text-xs text-sky-600 hover:underline"
                  href={`${settings.jiraBaseUrl}/browse/${timer.ticket.key}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open {timer.ticket.key} in Jira ↗
                </a>
              )}
            </div>
            <TimerCard timer={timer} onStop={openLogDialog} onDiscard={discard} />
          </section>

          <TodayLogs refreshKey={todayKey} jiraBaseUrl={settings?.jiraBaseUrl} />
        </>
      )}

      {logging && timer.ticket && (
        <LogDialog
          ticket={timer.ticket}
          elapsedSeconds={logging.elapsedSeconds}
          startedAt={logging.startedAt}
          roundingMinutes={settings?.roundingMinutes ?? 1}
          mode={settings?.mode}
          submitting={submitting}
          onSubmit={submitWorklog}
          onCancel={() => !submitting && setLogging(null)}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
