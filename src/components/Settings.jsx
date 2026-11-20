import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import ConfirmButton from './ConfirmButton.jsx';

const ROUNDING = [1, 5, 6, 10, 15, 30];

/**
 * Credentials and preferences, sized for the popover. Tokens are write-only:
 * the server only says whether one is saved. Leave a token blank to keep it.
 */
export default function Settings({ settings, onSaved, onClose, toast }) {
  const locked = new Set(settings?.envLocked || []);
  const [form, setForm] = useState({
    jiraBaseUrl: '',
    jiraEmail: '',
    jiraApiToken: '',
    jiraAccountId: '',
    tempoApiToken: '',
    tempoBaseUrl: '',
    roundingMinutes: 1,
  });
  const [busy, setBusy] = useState(null); // 'save' | 'test'
  const [test, setTest] = useState(null);

  useEffect(() => {
    if (!settings) return;
    setForm((f) => ({
      ...f,
      jiraBaseUrl: settings.jiraBaseUrl,
      jiraEmail: settings.jiraEmail,
      jiraAccountId: settings.jiraAccountId,
      tempoBaseUrl: settings.tempoBaseUrl,
      roundingMinutes: settings.roundingMinutes,
      jiraApiToken: '',
      tempoApiToken: '',
    }));
  }, [settings]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    const saved = await api('/settings', { method: 'PUT', body: form });
    onSaved(saved);
    return saved;
  }

  async function onSave(e) {
    e.preventDefault();
    setBusy('save');
    setTest(null);
    try {
      const saved = await save();
      toast('Settings saved', 'success');
      if (saved.jiraConfigured && onClose) onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy('test');
    setTest(null);
    try {
      await save();
      const result = await api('/settings/test', { method: 'POST' });
      setTest(result);
      // Fill in the account ID automatically if it was blank.
      if (result.jira.ok && !form.jiraAccountId && !locked.has('jiraAccountId')) {
        setForm((f) => ({ ...f, jiraAccountId: result.jira.accountId }));
        onSaved(await api('/settings', { method: 'PUT', body: { jiraAccountId: result.jira.accountId } }));
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function clearTempo() {
    onSaved(await api('/settings', { method: 'PUT', body: { tempoApiToken: null } }));
    toast('Tempo token removed — logging to Jira worklogs', 'success');
  }

  const field = (k, label, props = {}) => (
    <div>
      <label className="label" htmlFor={k}>
        {label} {locked.has(k) && <span className="normal-case text-amber-600">(.env)</span>}
      </label>
      <input id={k} className="input" value={form[k]} onChange={set(k)} disabled={locked.has(k)} {...props} />
    </div>
  );

  return (
    <form onSubmit={onSave} className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Settings</h2>
        {onClose && (
          <button type="button" className="text-xs text-sky-600 hover:underline" onClick={onClose}>
            ← Back
          </button>
        )}
      </div>

      {field('jiraBaseUrl', 'Jira URL', { placeholder: 'https://your-domain.atlassian.net', required: true })}
      {field('jiraEmail', 'Jira email', { type: 'email', placeholder: 'you@company.com', required: true, autoComplete: 'off' })}
      {field('jiraApiToken', 'Jira API token', {
        type: 'password',
        autoComplete: 'new-password',
        placeholder: settings?.hasJiraApiToken ? '•••••• saved (blank = keep)' : 'id.atlassian.com → Security → API tokens',
      })}
      {field('jiraAccountId', 'Jira account ID', { placeholder: 'Auto-detected by "Test"' })}

      <div>
        {field('tempoApiToken', 'Tempo API token (optional)', {
          type: 'password',
          autoComplete: 'new-password',
          placeholder: settings?.hasTempoApiToken ? '•••••• saved (blank = keep)' : 'Empty = log to Jira worklogs',
        })}
        {settings?.hasTempoApiToken && !locked.has('tempoApiToken') && (
          <ConfirmButton className="mt-1 text-[11px] text-rose-600 underline" onConfirm={clearTempo} armedLabel="Click again to remove">
            Remove saved Tempo token
          </ConfirmButton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {field('tempoBaseUrl', 'Tempo API URL', { placeholder: 'https://api.tempo.io' })}
        <div>
          <label className="label" htmlFor="rounding">
            Round up to
          </label>
          <select id="rounding" className="input" value={form.roundingMinutes} onChange={set('roundingMinutes')} disabled={locked.has('roundingMinutes')}>
            {ROUNDING.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
      </div>

      {test && (
        <div className="space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
          <div>
            {test.jira.ok ? '✅' : '❌'} Jira: {test.jira.ok ? `${test.jira.displayName}` : test.jira.error}
          </div>
          <div>
            {test.tempo.skipped ? '➖' : test.tempo.ok ? '✅' : '❌'} Tempo:{' '}
            {test.tempo.skipped ? 'not set — using Jira worklogs' : test.tempo.ok ? 'connected' : test.tempo.error}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onTest} disabled={busy !== null}>
          {busy === 'test' ? 'Testing…' : 'Test'}
        </button>
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
