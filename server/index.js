/**
 * Local API server / proxy.
 *
 *  - Holds the Jira & Tempo credentials (never sent to the browser).
 *  - Proxies Jira/Tempo calls, which also sidesteps CORS.
 *  - Serves the built frontend from ./dist (after `npm run build`).
 *
 * Security for a localhost-only tool:
 *  - Binds to 127.0.0.1 by default.
 *  - Rejects requests whose Host header is not localhost (blocks DNS-rebinding).
 *  - Requires a custom `X-JTT-Client` header on /api. Browsers will not send a
 *    custom header cross-origin without a CORS preflight, which this server never
 *    approves, so other websites you visit cannot drive this API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';

import { loadConfig, saveConfig, publicConfig, envLockedFields } from './config.js';
import {
  ConfigError,
  UpstreamError,
  getMyself,
  getAssignedIssues,
  getIssue,
  getIssuesByIds,
  logViaJira,
  logViaTempo,
  getTempoWorklogsForUser,
} from './atlassian.js';
import { appendHistory, readHistory } from './history.js';
import { localParts, todayLocal } from './time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the project folder, not the current directory (at Windows login
// the current directory is C:\Windows\System32).
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// --- Guards -----------------------------------------------------------------
app.use((req, res, next) => {
  const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return res.status(403).json({ error: 'Forbidden host' });
  next();
});
app.use('/api', (req, res, next) => {
  if (req.get('X-JTT-Client') !== '1') return res.status(403).json({ error: 'Missing X-JTT-Client header' });
  next();
});

/** Lets async route handlers throw; errors go to the error handler below. */
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Tempo needs the author's Atlassian account ID. If it was not entered,
 * look it up via /myself and remember it (unless it is pinned in .env).
 */
async function ensureAccountId(cfg) {
  if (cfg.jiraAccountId) return cfg.jiraAccountId;
  const me = await getMyself(cfg);
  if (!envLockedFields().includes('jiraAccountId')) saveConfig({ jiraAccountId: me.accountId });
  return me.accountId;
}

// --- Settings -----------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/settings', (req, res) => res.json(publicConfig()));

app.put(
  '/api/settings',
  route(async (req, res) => {
    const patch = { ...req.body };
    // Values pinned in .env cannot be changed from the UI.
    for (const f of envLockedFields()) delete patch[f];
    res.json(publicConfig(saveConfig(patch)));
  })
);

/** Verifies the saved credentials against Jira (and Tempo, if configured). */
app.post(
  '/api/settings/test',
  route(async (req, res) => {
    const cfg = loadConfig();
    const result = { jira: { ok: false }, tempo: { ok: false, skipped: !cfg.tempoApiToken } };
    try {
      const me = await getMyself(cfg);
      result.jira = { ok: true, displayName: me.displayName, accountId: me.accountId, email: me.emailAddress };
    } catch (err) {
      result.jira = { ok: false, error: err.message };
    }
    if (cfg.tempoApiToken) {
      const accountId = cfg.jiraAccountId || result.jira.accountId;
      if (!accountId) {
        result.tempo = { ok: false, error: 'Need a Jira account ID to test Tempo (fix Jira first).' };
      } else {
        try {
          const today = todayLocal();
          await getTempoWorklogsForUser(cfg, accountId, today, today);
          result.tempo = { ok: true };
        } catch (err) {
          result.tempo = { ok: false, error: err.message };
        }
      }
    }
    res.json(result);
  })
);

// --- Issues -------------------------------------------------------------------
app.get(
  '/api/issues',
  route(async (req, res) => {
    res.json(await getAssignedIssues(loadConfig()));
  })
);

/** Look up any issue by key, e.g. one you are not assigned to. */
app.get(
  '/api/issues/:key',
  route(async (req, res) => {
    const key = String(req.params.key).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) throw badRequest('Not a valid issue key');
    res.json(await getIssue(loadConfig(), key));
  })
);

// --- Worklogs -------------------------------------------------------------------
/**
 * Body: { issueId, issueKey, summary?, startedAt (epoch ms), timeSpentSeconds, description? }
 * Sends to Tempo if a Tempo token is configured, otherwise to Jira's native worklog API.
 */
app.post(
  '/api/worklogs',
  route(async (req, res) => {
    const { issueId, issueKey, summary = '', startedAt, timeSpentSeconds } = req.body || {};
    const issueIdNum = Number(issueId);
    const seconds = Math.round(Number(timeSpentSeconds));

    if (!Number.isInteger(issueIdNum) || issueIdNum <= 0) throw badRequest('issueId must be a positive integer');
    if (typeof issueKey !== 'string' || !/^[A-Z][A-Z0-9_]*-\d+$/i.test(issueKey)) throw badRequest('Invalid issueKey');
    if (!Number.isFinite(Number(startedAt))) throw badRequest('startedAt must be an epoch-ms timestamp');
    if (!(seconds >= 60 && seconds <= 24 * 3600)) throw badRequest('timeSpentSeconds must be between 60 and 86400');

    const description = String(req.body.description ?? '').trim().slice(0, 5000) || `Working on issue ${issueKey}`;
    const cfg = loadConfig();
    const { startDate, startTime, jiraStarted } = localParts(Number(startedAt));

    let target;
    let remoteId;
    if (cfg.tempoApiToken) {
      target = 'tempo';
      const authorAccountId = await ensureAccountId(cfg);
      const result = await logViaTempo(cfg, {
        issueId: issueIdNum,
        authorAccountId,
        startDate,
        startTime,
        timeSpentSeconds: seconds,
        description,
      });
      remoteId = result?.tempoWorklogId;
    } else {
      target = 'jira';
      const result = await logViaJira(cfg, { issueKey, started: jiraStarted, timeSpentSeconds: seconds, description });
      remoteId = result?.id;
    }

    const entry = appendHistory({
      issueId: issueIdNum,
      issueKey: issueKey.toUpperCase(),
      summary,
      startDate,
      startTime,
      timeSpentSeconds: seconds,
      description,
      target,
      remoteId: remoteId != null ? String(remoteId) : null,
    });
    res.status(201).json({ ok: true, target, entry });
  })
);

/**
 * Worklogs for one day (default: today).
 * With Tempo: queries Tempo, so it includes time logged from anywhere.
 * Without Tempo (or if Tempo fails): what this app has logged locally.
 */
app.get(
  '/api/worklogs/today',
  route(async (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : todayLocal();
    const cfg = loadConfig();
    let warning;

    if (cfg.tempoApiToken) {
      try {
        const accountId = await ensureAccountId(cfg);
        const results = await getTempoWorklogsForUser(cfg, accountId, date, date);

        // Tempo only returns numeric issue ids; resolve them to keys/summaries.
        const ids = [...new Set(results.map((w) => Number(w.issue?.id)).filter(Boolean))];
        const byId = new Map();
        try {
          for (const t of await getIssuesByIds(cfg, ids)) byId.set(t.id, t);
        } catch {
          for (const h of readHistory()) byId.set(h.issueId, { key: h.issueKey, summary: h.summary });
        }

        const entries = results
          .map((w) => {
            const issue = byId.get(Number(w.issue?.id));
            return {
              id: String(w.tempoWorklogId),
              issueKey: issue?.key || `#${w.issue?.id}`,
              summary: issue?.summary || '',
              startTime: w.startTime,
              timeSpentSeconds: w.timeSpentSeconds,
              description: w.description || '',
            };
          })
          .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
        return res.json({ date, source: 'tempo', entries, totalSeconds: sum(entries) });
      } catch (err) {
        warning = `Could not load from Tempo (${err.message}); showing locally recorded logs.`;
      }
    }

    const entries = readHistory()
      .filter((h) => h.startDate === date)
      .map((h) => ({
        id: h.id,
        issueKey: h.issueKey,
        summary: h.summary,
        startTime: h.startTime,
        timeSpentSeconds: h.timeSpentSeconds,
        description: h.description,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    res.json({ date, source: 'local', entries, totalSeconds: sum(entries), warning });
  })
);

const sum = (entries) => entries.reduce((acc, e) => acc + (e.timeSpentSeconds || 0), 0);

// --- Built frontend (production mode) ------------------------------------------
const DIST = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

// --- Errors -----------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ConfigError) return res.status(400).json({ error: err.message, code: 'NOT_CONFIGURED' });
  if (err instanceof UpstreamError) {
    return res.status(502).json({ error: err.message, code: 'UPSTREAM', upstreamStatus: err.status });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

/**
 * Starts listening. Called below when run with `node server/index.js`, and
 * by the menu bar app (electron/main.js), which runs the server in-process.
 */
export function startServer({ port = PORT, host = HOST } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const ui = fs.existsSync(path.join(DIST, 'index.html'))
        ? `http://localhost:${port}`
        : 'http://localhost:5173 (Vite dev server)';
      console.log(`[jira-tempo-timer] API listening on http://${host}:${port}  —  open ${ui}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// Windows paths are case-insensitive (c:\ vs C:\), so compare them that way there.
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const runDirectly = Boolean(process.argv[1]) && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url));
if (runDirectly) {
  startServer().catch((err) => {
    console.error(`[jira-tempo-timer] Could not start: ${err.message}`);
    process.exit(1);
  });
}
