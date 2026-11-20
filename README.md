# ⏱️ Jira Tempo Timer

A small local stopwatch for Jira Cloud. Pick one of your assigned tickets, hit **Start**, then hit **Stop & Log Work**. The time goes straight to **Tempo Timesheets**, or to **Jira's built-in worklogs** if you haven't set a Tempo token.

- React + Vite + Tailwind UI, with a small Express server that holds your tokens and makes the Jira/Tempo calls (no CORS problems, and tokens never reach the browser)
- The timer survives page refreshes, closed tabs and browser restarts (saved in `localStorage`)
- If a worklog can't be submitted, it's saved in a **pending queue** so you can retry it later. Tracked time is never lost.
- A "Logged today" summary (pulled from Tempo when it's set up, so it also shows time you logged elsewhere)

## Project structure

```
jira-tempo-timer/
├── package.json          # scripts: dev / build / start
├── vite.config.js        # Vite + React + Tailwind; proxies /api → Express in dev
├── index.html
├── .env.example          # optional env overrides (copy to .env)
├── server/               # Node/Express backend (runs on 127.0.0.1:3001)
│   ├── index.js          # API routes, localhost guards, serves dist/ in prod
│   ├── atlassian.js      # Jira REST v3 + Tempo REST v4 clients
│   ├── config.js         # AES-256-GCM encrypted settings store (data/config.enc.json)
│   ├── history.js        # local log of submitted worklogs (data/history.json)
│   └── time.js           # local date/time formatting for Tempo & Jira
├── src/                  # React frontend
│   ├── main.jsx, App.jsx, index.css
│   ├── lib/              # api.js (fetch wrapper), time.js, storage.js
│   ├── hooks/            # useTimer.js (persisted stopwatch), usePendingQueue.js
│   └── components/       # TicketPicker, TimerCard, LogDialog, PendingQueue,
│                         # TodayLogs, Settings, Toasts
└── data/                 # created at runtime, git-ignored, chmod 700
```

## Setup

**Requirements:** Node.js 20 or newer.

1. **Install:**
   ```bash
   cd jira-tempo-timer
   npm install
   ```
2. **Run in dev mode** (Express on :3001 and Vite on :5173, both with hot reload):
   ```bash
   npm run dev
   ```
   Then open **http://localhost:5173**.
3. **Fill in Settings.** The Settings screen opens automatically the first time. Click **Save & test connection**. Your Jira account ID is detected and filled in for you.

**Run as a single process** (builds the UI, then serves everything from http://localhost:3001):

```bash
npm start
```

### Getting your credentials

| Setting | Where to find it |
|---|---|
| Jira base URL | `https://<your-site>.atlassian.net` |
| Jira email | The email you log in to Atlassian with |
| Jira API token | https://id.atlassian.com/manage-profile/security/api-tokens → *Create API token* |
| Jira account ID | Filled in automatically by *Test connection* (from `/rest/api/3/myself`) |
| Tempo API token | Jira → **Tempo → Settings → API Integration → New Token**. Give it access to *Worklogs* (view + manage). |

Leave the Tempo token empty to log through Jira's native worklog API (`POST /rest/api/3/issue/{key}/worklog`).

### Using `.env` instead of the Settings screen (optional)

```bash
cp .env.example .env
```

Any value set in `.env` overrides the Settings screen, where it shows as *locked*. This is handy if you'd rather keep secrets in your OS keychain or a password manager and export them as environment variables.

## How it works

- **Tickets:** JQL `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC` through `POST /rest/api/3/search/jql`. If your site doesn't have that endpoint, it falls back to the older `/rest/api/3/search`. Each ticket keeps its `key`, `summary` and numeric `id` (Tempo needs the numeric id). To log time on a ticket you're *not* assigned to, type its full key (e.g. `OPS-42`) and choose **Look up**.
- **Timer state** lives in `localStorage` under `jtt.timer.v1` as `{ ticket, runningSince, accumulatedSeconds, firstStartedAt }`. Elapsed time is calculated from timestamps, so it stays correct even if the laptop sleeps. While time is tracked, the ticket is locked; log or discard the time to switch tickets.
- **Stop & Log Work** pauses the timer and opens a dialog. You can add a description and adjust the duration or start time before submitting. Duration is rounded **up** to your rounding setting (minimum 1 minute, because Jira and Tempo reject anything shorter). The server then sends:
  ```json
  POST https://api.tempo.io/4/worklogs
  { "issueId": 10001, "authorAccountId": "…", "startDate": "2026-11-20",
    "startTime": "09:55:13", "timeSpentSeconds": 1800, "description": "Implemented feature logic" }
  ```
  An empty description becomes `Working on issue KEY-1` (Tempo's own default).
- **Failure handling:** if submission fails (local server down, network error, 401, or a Tempo validation error), the worklog goes into the pending queue (`jtt.pending.v1`) with the error message. The timer resets, and a yellow panel offers **Retry**, **Retry all** and **Discard**.

## Security notes

- The server listens on **127.0.0.1 only**. It rejects requests whose `Host` header isn't localhost (this blocks DNS rebinding), and it requires a custom `X-JTT-Client` header on `/api`. Other websites can't send that header cross-origin, so they can't drive your local API.
- Tokens are write-only from the UI. `GET /api/settings` only returns whether a token is set.
- `data/config.enc.json` is encrypted with AES-256-GCM. By default the key is stored next to it in `data/.key` (mode 600). That protects against casual exposure (backups, screen-sharing a folder), **not** against someone who can read your home directory. For stronger protection, set `CONFIG_SECRET` in your environment rather than in a file, or supply the tokens via env vars from your password manager.
- Never commit `data/` or `.env`. Both are already in `.gitignore`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Jira 401 … check your email / API token` | The token must belong to the same Atlassian account as the email. |
| `Tempo 401` / `403` | Regenerate the Tempo token with the Worklogs scope. |
| `Tempo 400 … not allowed / period closed` | The timesheet period is locked in Tempo; ask an admin, or change the start date. |
| "Could not decrypt config" in the server log | `CONFIG_SECRET` or `data/.key` changed. Re-enter your settings to overwrite the file. |
| Port already in use | Set `PORT=3002` in `.env`. Vite's proxy picks up the same variable. |
