import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { formatHMS } from './lib/time.js';
import { useTimer } from './hooks/useTimer.js';
import { usePendingQueue } from './hooks/usePendingQueue.js';
import TicketPicker from './components/TicketPicker.jsx';
import TimerRow from './components/TimerRow.jsx';
import LogForm from './components/LogForm.jsx';
import PendingQueue from './components/PendingQueue.jsx';
import TodayLogs from './components/TodayLogs.jsx';
import Settings from './components/Settings.jsx';
import Toasts from './components/Toasts.jsx';
import { GearIcon } from './components/Icons.jsx';

/** Present only inside the menu bar app (see electron/preload.cjs). */
const bridge = window.trayBridge;
const inTray = Boolean(bridge);
if (inTray) document.documentElement.classList.add('tray');

const TICKETS_STALE_MS = 5 * 60_000;

export default function App() {
  const timer = useTimer();
  const pending = usePendingQueue();

  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [view, setView] = useState('tracker'); // 'tracker' | 'settings'
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState('');
  const [logging, setLogging] = useState(null); // { elapsedSeconds, startedAt } while the log form is shown
  const [submitting, setSubmitting] = useState(false);
  const [todayKey, setTodayKey] = useState(0);
  const [toasts, setToasts] = useState([]);
  const cardRef = useRef(null);
  const ticketsLoadedAt = useRef(0);

  // ---- toasts
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, kind = 'info') => {
      const id = crypto.randomUUID();
      setToasts((t) => [...t, { id, message, kind }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 3500);
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
    ticketsLoadedAt.current = Date.now();
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

  // Refresh the ticket list when the window comes back after a while (e.g. reopening the popover).
  useEffect(() => {
    const onFocus = () => settings?.jiraConfigured && Date.now() - ticketsLoadedAt.current > TICKETS_STALE_MS && loadTickets();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [settings?.jiraConfigured, loadTickets]);

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

  // ---- browser tab title shows the running timer
  useEffect(() => {
    if (inTray) return;
    document.title = timer.hasTime
      ? `${timer.running ? '▶' : '❚❚'} ${formatHMS(timer.elapsedSeconds)} · ${timer.ticket?.key ?? ''}`
      : 'Jira Tempo Timer';
  }, [timer.hasTime, timer.running, timer.elapsedSeconds, timer.ticket]);

  // ---- browser only: remind before closing the tab while running (time is saved either way)
  useEffect(() => {
    if (inTray || !timer.running) return undefined;
    const handler = (e) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [timer.running]);

  // ---- menu bar: report timer state, fit the popover to the content, handle Esc
  const { ticket, runningSince, accumulatedSeconds } = timer.raw;
  useEffect(() => {
    bridge?.sendState({ ticket, runningSince, accumulatedSeconds });
  }, [ticket, runningSince, accumulatedSeconds]);

  useLayoutEffect(() => {
    if (!bridge || !cardRef.current) return undefined;
    const el = cardRef.current;
    const ro = new ResizeObserver(() => bridge.resize(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!bridge) return undefined;
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && bridge.hide();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- stop & log
  function openLogForm() {
    timer.pause();
    setLogging({ elapsedSeconds: timer.elapsedSeconds, startedAt: timer.firstStartedAt });
  }

  // Commands from the tray menu. A ref keeps the handler current without re-subscribing.
  const onCommand = useRef();
  onCommand.current = (command) => {
    if (command === 'toggle') timer.running ? timer.pause() : timer.start();
    if (command === 'stop' && timer.hasTime && !logging) {
      setView('tracker');
      openLogForm();
    }
    if (command === 'settings') setView('settings');
  };
  useEffect(() => bridge?.onCommand((c) => onCommand.current(c)), []);

  async function submitWorklog(worklog) {
    setSubmitting(true);
    try {
      const res = await api('/worklogs', { method: 'POST', body: worklog });
      toast(`Logged to ${res.target === 'tempo' ? 'Tempo' : 'Jira'}: ${worklog.issueKey}`, 'success');
      setTodayKey((k) => k + 1);
    } catch (err) {
      // Never lose time: park it in the pending queue for a retry.
      pending.add(worklog, err.message);
      toast(`Couldn't log — saved for retry. ${err.message}`, 'error');
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

  // ---- render
  return (
    <div className={inTray ? '' : 'flex min-h-screen justify-center p-3 sm:pt-16'}>
      <main
        ref={cardRef}
        className={`w-full self-start bg-white dark:bg-slate-900 ${
          inTray ? '' : 'max-w-sm overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800'
        }`}
      >
        {settingsError && <p className="p-3 text-sm text-rose-600">{settingsError}</p>}

        {view === 'settings' && settings && (
          <Settings
            settings={settings}
            onSaved={setSettings}
            onClose={settings.jiraConfigured ? () => setView('tracker') : null}
            toast={toast}
          />
        )}

        {view === 'tracker' && settings && (
          <>
            <PendingQueue items={pending.items} onRetry={retryOne} onRetryAll={retryAll} onDiscard={pending.remove} />

            <div className="space-y-2.5 p-3">
              <div className="flex items-start gap-1.5">
                <TicketPicker
                  tickets={tickets}
                  value={timer.ticket}
                  onChange={timer.setTicket}
                  onLookup={lookupTicket}
                  onRefresh={loadTickets}
                  loading={ticketsLoading}
                  disabled={timer.hasTime}
                />
                <button className="icon-btn" onClick={() => setView('settings')} title={`Settings · logging to ${settings.mode === 'tempo' ? 'Tempo' : 'Jira worklogs'}`}>
                  <GearIcon />
                </button>
              </div>
              {ticketsError && <p className="text-xs text-rose-600">{ticketsError}</p>}

              {logging && timer.ticket ? (
                <LogForm
                  ticket={timer.ticket}
                  elapsedSeconds={logging.elapsedSeconds}
                  startedAt={logging.startedAt}
                  roundingMinutes={settings.roundingMinutes ?? 1}
                  mode={settings.mode}
                  submitting={submitting}
                  onSubmit={submitWorklog}
                  onCancel={() => !submitting && setLogging(null)}
                />
              ) : (
                <TimerRow timer={timer} onLog={openLogForm} onDiscard={timer.reset} />
              )}
            </div>

            <TodayLogs refreshKey={todayKey} jiraBaseUrl={settings.jiraBaseUrl} />
          </>
        )}
      </main>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
