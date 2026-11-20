#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Start Jira Tempo Timer.
#
#   ./start.sh            build if needed, run on http://localhost:3001, open browser
#   ./start.sh --dev      hot-reload dev mode on http://localhost:5173
#   ./start.sh --no-open  don't open the browser
#   ./start.sh --tray     menu bar / system tray app (small popover, no browser)
#   ./start.sh --background  no browser, log to logs/server.log (for autostart)
#
# Safe to run repeatedly: it only reinstalls / rebuilds when something changed,
# and if the app is already running it just opens the browser.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

DEV=0
OPEN=1
TRAY=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=1 ;;
    --tray) TRAY=1 ;;
    --no-open) OPEN=0 ;;
    --background)
      # Used by autostart: no browser, all output appended to logs/server.log.
      OPEN=0
      mkdir -p logs
      # Keep the log from growing forever: start fresh once it passes ~5 MB.
      if [ -f logs/server.log ] && [ "$(wc -c <logs/server.log)" -gt 5000000 ]; then
        mv logs/server.log logs/server.log.old
      fi
      exec >>logs/server.log 2>&1
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting (background) ==="
      ;;
    -h | --help)
      sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

# --- Node.js >= 20 ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get version 20 or newer from https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $(node -v) is too old; version 20 or newer is required." >&2
  exit 1
fi

# --- Port (same precedence as the server: environment, then .env, then 3001) ---
if [ -z "${PORT:-}" ] && [ -f .env ]; then
  PORT="$(grep -E '^[[:space:]]*PORT=' .env | tail -n1 | cut -d= -f2- | tr -d '[:space:]"'"'" || true)"
fi
PORT="${PORT:-3001}"
export PORT

if [ "$DEV" -eq 1 ]; then URL="http://localhost:5173"; else URL="http://localhost:$PORT"; fi

open_browser() {
  [ "$OPEN" -eq 1 ] || return 0
  if command -v open >/dev/null 2>&1; then open "$1"                 # macOS
  elif command -v wslview >/dev/null 2>&1; then wslview "$1"         # WSL
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 # Linux
  elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$1" # Git Bash on Windows
  else echo "Open $1 in your browser."
  fi
}

is_up() {
  curl -fs -o /dev/null -H 'X-JTT-Client: 1' "$1/api/health" 2>/dev/null
}

# --- Already running? Just open it. -------------------------------------------
if [ "$TRAY" -eq 0 ] && command -v curl >/dev/null 2>&1 && is_up "$URL"; then
  echo "Jira Tempo Timer is already running at $URL"
  open_browser "$URL"
  exit 0
fi

# --- Dependencies: install when missing or when package-lock.json changed -------
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "Installing dependencies…"
  npm install --no-fund --no-audit
fi

# --- Open the browser once the app answers (runs in the background) ------------
if [ "$OPEN" -eq 1 ] && [ "$TRAY" -eq 0 ]; then
  (
    for _ in $(seq 1 60); do
      if command -v curl >/dev/null 2>&1; then
        is_up "$URL" && break
      fi
      sleep 0.5
    done
    open_browser "$URL"
  ) &
fi

# --- Start ---------------------------------------------------------------------
if [ "$DEV" -eq 1 ]; then
  echo "Starting in dev mode at $URL (Ctrl+C to stop)…"
  exec npm run dev
fi

# Rebuild the UI only if the sources are newer than the last build.
if [ ! -f dist/index.html ] ||
  [ -n "$(find src index.html vite.config.js package-lock.json -newer dist/index.html 2>/dev/null | head -n1)" ]; then
  echo "Building the UI…"
  npm run build --silent
fi

if [ "$TRAY" -eq 1 ]; then
  echo "Starting the menu bar app (server at $URL)…"
  # Linux as root (e.g. containers) needs Chromium's sandbox disabled.
  EXTRA=()
  if [ "$(uname -s)" = Linux ] && [ "$(id -u)" -eq 0 ]; then EXTRA=(--no-sandbox); fi
  exec ./node_modules/.bin/electron . ${EXTRA[@]+"${EXTRA[@]}"}
fi

echo "Starting Jira Tempo Timer at $URL (Ctrl+C to stop)…"
exec node server/index.js
