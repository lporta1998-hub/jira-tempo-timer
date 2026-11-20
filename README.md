# ⏱️ Jira Tempo Timer

A small local stopwatch for Jira Cloud. Pick one of your assigned tickets, hit **▶**, then hit **Log**. The time goes straight to **Tempo Timesheets**, or to **Jira's built-in worklogs** if you haven't set a Tempo token.

- **Menu bar / system tray app:** a stopwatch icon with the running time next to it (macOS). Click it for a small popover; right-click for Start/Pause, Stop & Log, Settings and Quit.
- Or use it in the browser: the same compact card at http://localhost:3001.

- React + Vite + Tailwind UI, with a small Express server that holds your tokens and makes the Jira/Tempo calls (no CORS problems, and tokens never reach the browser)
- The timer survives page refreshes, closed tabs and browser restarts (saved in `localStorage`)
- If a worklog can't be submitted, it's saved in a **pending queue** so you can retry it later. Tracked time is never lost.
- A "Logged today" summary (pulled from Tempo when it's set up, so it also shows time you logged elsewhere)

## Project structure

```
jira-tempo-timer/
├── package.json          # scripts: dev / build / start
├── start.sh / start.cmd  # one-command launcher (macOS/Linux / Windows)
├── autostart.sh          # start at login on macOS / Linux
├── autostart.cmd         # start at login on Windows (registry Run key, no admin needed)
├── electron/             # menu bar / system tray app
│   ├── main.js           # tray icon + popover window, runs the server in-process
│   ├── preload.cjs       # minimal bridge between the popover page and the tray
│   └── icons/            # generated tray icons (macOS template + colored)
├── scripts/
│   ├── launch.mjs        # cross-platform launcher behind start.cmd
│   ├── autostart-windows.mjs  # Windows login item behind autostart.cmd
│   ├── build-if-stale.mjs     # rebuilds dist/ only when the UI sources changed
│   └── make-icons.mjs    # regenerates electron/icons (npm run icons)
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
│   └── components/       # TicketPicker, TimerRow, LogForm, PendingQueue,
│                         # TodayLogs, Settings, Toasts, Icons, ConfirmButton
└── data/                 # created at runtime, git-ignored, chmod 700
```

## Setup

**Requirements:** Node.js 20 or newer, on macOS, Linux or Windows 10/11.

> **Windows:** use the `.cmd` files instead of the `.sh` ones (`start.cmd`, `autostart.cmd`). They do the same things. In **Command Prompt** type `autostart.cmd install`; in **PowerShell** add `.\` in front: `.\autostart.cmd install`. Double-clicking also works. Git Bash works with the `.sh` files.

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

### Menu bar app

```bash
./start.sh --tray     # Windows: start.cmd --tray    (or, anywhere: npm run tray)
```

- **Click** the stopwatch icon: open/close the popover (Esc or clicking elsewhere also closes it).
- **Right-click**: Start/Pause, Stop & Log Work…, Show Timer, Settings…, Quit. On Linux, any click opens this menu.
- **macOS:** the elapsed time shows next to the icon. The app has no Dock icon.
- **Windows:** the elapsed time is in the icon's tooltip. New tray icons start hidden under the **^** arrow next to the clock; drag the stopwatch onto the taskbar to keep it visible. The popover opens above the icon.
- The icon changes with the state: idle, running (filled), paused (two bars).
- The popover keeps running while hidden, so the timer never stops because you closed it.

The tray app starts the local server itself (rebuilding the UI first if the sources changed, e.g. after `git pull`), or reuses one that's already running. Its timer is separate from the one in a browser tab (each keeps its own saved state), so pick one and stick with it.

### One-command start: `start.sh` / `start.cmd`

```bash
./start.sh            # build if needed, run on http://localhost:3001 and open the browser
./start.sh --tray     # menu bar app instead of the browser
./start.sh --dev      # hot-reload dev mode on http://localhost:5173
./start.sh --no-open  # don't open the browser
```

On Windows, use `start.cmd` with the same options, e.g. `start.cmd --tray`.

The script checks for Node 20+, and runs `npm install` / `vite build` only when something changed. If the app is already running, it just opens the browser. To launch it from anywhere, add an alias to `~/.bashrc` or `~/.zshrc`:

```bash
alias timer='~/path/to/jira-tempo-timer/start.sh'
```

### Start automatically at login: `autostart.sh` / `autostart.cmd`

**Windows** (in PowerShell, prefix with `.\`):

```bat
autostart.cmd install     :: menu bar app, now and at every login
autostart.cmd status
autostart.cmd uninstall   :: remove from login and quit the app
```

It adds a `JiraTempoTimer` entry under your per-user Run registry key (no admin rights needed), which you can also switch off in **Task Manager → Startup apps**. It launches the tray app directly, so no console window appears. Output goes to `logs\server.log`.

**macOS / Linux:**

```bash
./autostart.sh install                # menu bar app, now and at every login
./autostart.sh install --server-only  # just the background server; use http://localhost:3001
./autostart.sh status                 # is it registered / running?
./autostart.sh uninstall              # stop it and remove it from login
```

Output goes to `logs/server.log`.

| OS | Mechanism |
|---|---|
| macOS | LaunchAgent `~/Library/LaunchAgents/com.jira-tempo-timer.plist` (restarts if it crashes, not after Quit) |
| Linux | `~/.config/autostart` entry. `--server-only` uses a systemd user service (restarts on crash) when available |
| Windows | Use `autostart.cmd` (above). From Git Bash, `./autostart.sh` forwards to it. |

After a `git pull`, the next start rebuilds the UI automatically. If you move the folder or switch Node versions (e.g. via nvm), run `./autostart.sh install` again, because it records the paths at install time.

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
- **Log** pauses the timer and swaps the timer row for a small form. Add a description (Enter submits, Esc goes back) and adjust the duration or start time if needed. Duration is rounded **up** to your rounding setting (minimum 1 minute, because Jira and Tempo reject anything shorter). The server then sends:
  ```json
  POST https://api.tempo.io/4/worklogs
  { "issueId": 10001, "authorAccountId": "…", "startDate": "2026-11-20",
    "startTime": "09:55:13", "timeSpentSeconds": 1800, "description": "Implemented feature logic" }
  ```
  An empty description becomes `Working on issue KEY-1` (Tempo's own default).
- **Failure handling:** if submission fails (local server down, network error, 401, or a Tempo validation error), the worklog goes into the pending queue (`jtt.pending.v1`) with the error message. The timer resets, and a yellow "unsent worklogs" bar offers **Retry** (expand it to retry or discard single entries).

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
| Windows: no tray icon | Click the **^** next to the clock, or **Settings → Personalization → Taskbar → Other system tray icons** and turn on *Electron* / *Jira Tempo Timer*. |
| Windows: `.sh` scripts fail in Git Bash with `$'\r': command not found` | Your checkout converted line endings. Run `git rm --cached -r . && git reset --hard` once; `.gitattributes` keeps them LF from then on. |
| Windows: "Node.js was not found" / "Impossibile trovare il percorso specificato" | Open a **new** terminal after installing Node and check `node -v`. If that fails too, sign out and back in, or reinstall Node (LTS) from nodejs.org with default options. |
| Windows: "autostart.cmd is not recognized" in PowerShell | Type `.\autostart.cmd install`; PowerShell doesn't run files from the current folder without `.\`. |
| Windows: `start.cmd` window closes immediately | Run it from a Command Prompt to see the error, or check `logs\server.log` for the tray app. |
