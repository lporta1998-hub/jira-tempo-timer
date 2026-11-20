import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const ROUNDING = [1, 5, 6, 10, 15, 30];

/**
 * Credentials and preferences. Tokens are write-only: the server only tells
 * us whether one is saved, never its value. Leave a token field blank to
 * keep the saved token.
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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
    setSaving(true);
    setTest(null);
    try {
      await save();
      toast('Settings saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
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
      setTesting(false);
    }
  }

  async function clearTempo() {
    if (!confirm('Remove the Tempo token? Time will then be logged via Jira native worklogs.')) return;
    onSaved(await api('/settings', { method: 'PUT', body: { tempoApiToken: null } }));
    toast('Tempo token removed', 'success');
  }

  const field = (k, label, props = {}, hint) => (
    <div>
      <label className="label" htmlFor={k}>
        {label} {locked.has(k) && <span className="normal-case text-amber-600">(set in .env)</span>}
      </label>
      <input id={k} className="input" value={form[k]} onChange={set(k)} disabled={locked.has(k)} {...props} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={onSave} className="card space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        {onClose && (
          <button type="button" className="btn-ghost" onClick={onClose}>
            ← Back
          </button>
        )}
      </div>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-medium">Jira Cloud</legend>
        {field('jiraBaseUrl', 'Jira base URL', { placeholder: 'https://your-domain.atlassian.net', required: true })}
        {field('jiraEmail', 'Jira user email', { type: 'email', placeholder: 'you@company.com', required: true, autoComplete: 'off' })}
        {field(
          'jiraApiToken',
          'Jira API token',
          {
            type: 'password',
            autoComplete: 'new-password',
            placeholder: settings?.hasJiraApiToken ? '•••••••• saved — leave blank to keep' : 'Paste API token',
          },
          <>
            Create one at{' '}
            <a className="text-sky-600 underline" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">
              id.atlassian.com → Security → API tokens
            </a>
            .
          </>
        )}
        {field('jiraAccountId', 'Jira account ID', { placeholder: 'Auto-detected on "Test connection"' }, 'Needed by Tempo as authorAccountId.')}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-medium">
          Tempo <span className="text-sm font-normal text-slate-500">(optional — without it, time goes to Jira worklogs)</span>
        </legend>
        <div>
          {field(
            'tempoApiToken',
            'Tempo API token',
            {
              type: 'password',
              autoComplete: 'new-password',
              placeholder: settings?.hasTempoApiToken ? '•••••••• saved — leave blank to keep' : 'Tempo → Settings → API Integration',
            }
          )}
          {settings?.hasTempoApiToken && !locked.has('tempoApiToken') && (
            <button type="button" className="mt-1 text-xs text-rose-600 underline" onClick={clearTempo}>
              Remove saved Tempo token
            </button>
          )}
        </div>
        {field('tempoBaseUrl', 'Tempo API base URL', { placeholder: 'https://api.tempo.io' })}
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-medium">Preferences</legend>
        <label className="label" htmlFor="rounding">
          Round logged time up to {locked.has('roundingMinutes') && <span className="normal-case text-amber-600">(set in .env)</span>}
        </label>
        <select id="rounding" className="input max-w-48" value={form.roundingMinutes} onChange={set('roundingMinutes')} disabled={locked.has('roundingMinutes')}>
          {ROUNDING.map((m) => (
            <option key={m} value={m}>
              {m} minute{m > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </fieldset>

      {test && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <div>
            {test.jira.ok ? '✅' : '❌'} Jira:{' '}
            {test.jira.ok ? `connected as ${test.jira.displayName} (${test.jira.accountId})` : test.jira.error}
          </div>
          <div>
            {test.tempo.skipped ? '➖' : test.tempo.ok ? '✅' : '❌'} Tempo:{' '}
            {test.tempo.skipped ? 'not configured — using Jira worklogs' : test.tempo.ok ? 'connected' : test.tempo.error}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onTest} disabled={testing || saving}>
          {testing ? 'Testing…' : 'Save & test connection'}
        </button>
        <button type="submit" className="btn-primary" disabled={saving || testing}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
