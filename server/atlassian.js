/**
 * Thin clients for the Jira Cloud REST API v3 and the Tempo REST API v4.
 * Everything here runs server-side only, so tokens never reach the browser.
 */

/** A request to Jira/Tempo failed (network error or non-2xx response). */
export class UpstreamError extends Error {
  constructor(message, status, service) {
    super(message);
    this.status = status; // 0 = network error / timeout
    this.service = service;
  }
}

/** Required settings are missing. */
export class ConfigError extends Error {}

const TIMEOUT_MS = 20_000;

/** Pulls a readable message out of Jira's / Tempo's error payloads. */
function extractMessage(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.slice(0, 300);
  const parts = [];
  if (Array.isArray(data.errorMessages)) parts.push(...data.errorMessages); // Jira
  if (data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
    parts.push(...Object.entries(data.errors).map(([k, v]) => `${k}: ${v}`)); // Jira field errors
  }
  if (Array.isArray(data.errors)) parts.push(...data.errors.map((e) => e.message || JSON.stringify(e))); // Tempo
  if (data.message) parts.push(data.message);
  return parts.join('; ');
}

async function call(service, url, { method = 'GET', headers = {}, body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : err.cause?.code || err.message;
    throw new UpstreamError(`Could not reach ${service} (${reason})`, 0, service);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    let hint = '';
    if (res.status === 401) hint = ' — check your email / API token';
    if (res.status === 403) hint = ' — token lacks permission for this action';
    throw new UpstreamError(
      `${service} ${res.status}: ${extractMessage(data) || res.statusText}${hint}`,
      res.status,
      service
    );
  }
  return data;
}

// --------------------------------------------------------------------- Jira

function jira(cfg, path, opts = {}) {
  if (!cfg.jiraBaseUrl || !cfg.jiraEmail || !cfg.jiraApiToken) {
    throw new ConfigError('Jira is not configured yet — open Settings.');
  }
  const auth = Buffer.from(`${cfg.jiraEmail}:${cfg.jiraApiToken}`).toString('base64');
  return call('Jira', cfg.jiraBaseUrl + path, {
    ...opts,
    headers: { Authorization: `Basic ${auth}`, ...opts.headers },
  });
}

const ISSUE_FIELDS = ['summary', 'status', 'project', 'issuetype'];

/** Shape we send to the UI. Tempo needs the numeric `id`, humans need `key`. */
function toTicket(issue) {
  return {
    id: Number(issue.id),
    key: issue.key,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? '',
    project: issue.fields?.project?.key ?? '',
    type: issue.fields?.issuetype?.name ?? '',
  };
}

export async function getMyself(cfg) {
  return jira(cfg, '/rest/api/3/myself');
}

/**
 * Runs a JQL search. Uses the current /rest/api/3/search/jql endpoint
 * (token-based pagination) and falls back to the legacy /rest/api/3/search
 * for sites that do not have the new one.
 */
export async function searchIssues(cfg, jql, limit = 300) {
  const tickets = [];
  let nextPageToken;
  do {
    const body = { jql, fields: ISSUE_FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) };
    let data;
    try {
      data = await jira(cfg, '/rest/api/3/search/jql', { method: 'POST', body });
    } catch (err) {
      if (err instanceof UpstreamError && [404, 405, 410].includes(err.status) && !nextPageToken) {
        data = await jira(cfg, '/rest/api/3/search', {
          method: 'POST',
          body: { jql, fields: ISSUE_FIELDS, maxResults: 100 },
        });
        return (data.issues || []).map(toTicket);
      }
      throw err;
    }
    tickets.push(...(data.issues || []).map(toTicket));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken && tickets.length < limit);
  return tickets;
}

export function getAssignedIssues(cfg) {
  return searchIssues(cfg, 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC');
}

/** Fetch a single issue by key or id (used to log time on a ticket you are not assigned to). */
export async function getIssue(cfg, keyOrId) {
  const data = await jira(cfg, `/rest/api/3/issue/${encodeURIComponent(keyOrId)}?fields=${ISSUE_FIELDS.join(',')}`);
  return toTicket(data);
}

/** Resolve numeric issue ids (e.g. from Tempo worklogs) to tickets. */
export async function getIssuesByIds(cfg, ids) {
  if (!ids.length) return [];
  return searchIssues(cfg, `id in (${ids.map(Number).join(',')})`, ids.length);
}

/**
 * Native Jira worklog (fallback when no Tempo token is configured).
 * POST /rest/api/3/issue/{issueKey}/worklog
 * `started` format: 2026-11-20T09:15:00.000+0100. `comment` must be ADF.
 */
export async function logViaJira(cfg, { issueKey, started, timeSpentSeconds, description }) {
  return jira(cfg, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?notifyUsers=false`, {
    method: 'POST',
    body: {
      started,
      timeSpentSeconds,
      comment: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
    },
  });
}

// -------------------------------------------------------------------- Tempo

function tempo(cfg, path, opts = {}) {
  if (!cfg.tempoApiToken) throw new ConfigError('Tempo API token is not configured.');
  return call('Tempo', cfg.tempoBaseUrl + path, {
    ...opts,
    headers: { Authorization: `Bearer ${cfg.tempoApiToken}`, ...opts.headers },
  });
}

/** POST https://api.tempo.io/4/worklogs */
export async function logViaTempo(cfg, { issueId, authorAccountId, startDate, startTime, timeSpentSeconds, description }) {
  return tempo(cfg, '/4/worklogs', {
    method: 'POST',
    body: { issueId, authorAccountId, startDate, startTime, timeSpentSeconds, description },
  });
}

/** GET /4/worklogs/user/{accountId}?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function getTempoWorklogsForUser(cfg, accountId, from, to) {
  const qs = new URLSearchParams({ from, to, limit: '1000' });
  const data = await tempo(cfg, `/4/worklogs/user/${encodeURIComponent(accountId)}?${qs}`);
  return data?.results || [];
}
