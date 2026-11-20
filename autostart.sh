#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Start Jira Tempo Timer automatically when you log in.
#
#   ./autostart.sh install     register it to start at login (and start it now)
#   ./autostart.sh uninstall   remove it from login and stop it
#   ./autostart.sh status      show whether it is registered and running
#
# What it uses on each OS:
#   macOS    LaunchAgent   ~/Library/LaunchAgents/com.jira-tempo-timer.plist
#   Linux    systemd user service (or ~/.config/autostart if there's no systemd)
#   Windows  a hidden launcher in your Startup folder (run this from Git Bash)
#
# The app runs in the background on http://localhost:3001 (or your PORT).
# Output goes to logs/server.log. After a `git pull`, it rebuilds itself on the
# next start.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="jira-tempo-timer"
LABEL="com.jira-tempo-timer"
START="$APP_DIR/start.sh"
LOG="$APP_DIR/logs/server.log"

usage() { sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; }

port() {
  local p="${PORT:-}"
  if [ -z "$p" ] && [ -f "$APP_DIR/.env" ]; then
    p="$(grep -E '^[[:space:]]*PORT=' "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | tr -d '[:space:]"'"'" || true)"
  fi
  echo "${p:-3001}"
}

is_running() {
  curl -fs -o /dev/null -H 'X-JTT-Client: 1' "http://localhost:$(port)/api/health" 2>/dev/null
}

wait_until_up() {
  for _ in $(seq 1 40); do
    if is_running; then
      echo "✔ Running at http://localhost:$(port)"
      return 0
    fi
    sleep 0.5
  done
  echo "⚠ Registered, but the app didn't answer yet. Check the log: $LOG"
}

# Login sessions get a minimal PATH (especially on macOS), so record where
# node and npm live right now, including nvm/Homebrew installs.
service_path() {
  local node_dir
  node_dir="$(dirname "$(command -v node)")"
  echo "$node_dir:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
}

# Install dependencies and build once now, so the first login start is fast
# and any problem shows up here instead of silently at login.
prepare() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js 20+ is required: https://nodejs.org" >&2
    exit 1
  fi
  chmod +x "$START"
  (cd "$APP_DIR" && npm install --no-fund --no-audit --silent && npm run build --silent >/dev/null)
  mkdir -p "$APP_DIR/logs"
}

# Stops an instance started by hand (./start.sh), so the login service can own the port.
stop_manual_instance() {
  if is_running; then
    pkill -f "node server/index.js" 2>/dev/null || true
    sleep 1
  fi
}

xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }

# ------------------------------------------------------------------- macOS
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mac_install() {
  mkdir -p "$(dirname "$PLIST")"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml_escape "$START")</string>
    <string>--background</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml_escape "$APP_DIR")</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(xml_escape "$(service_path)")</string></dict>
  <key>RunAtLoad</key><true/>
  <!-- Restart if it crashes, but not after a clean exit. -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$(xml_escape "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$LOG")</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"
  echo "Installed LaunchAgent: $PLIST"
}

mac_uninstall() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload -w "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed LaunchAgent."
}

mac_registered() { [ -f "$PLIST" ]; }

# ------------------------------------------------------------------- Linux
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/$NAME.service"
DESKTOP="$HOME/.config/autostart/$NAME.desktop"

has_systemd_user() { command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; }

linux_install() {
  if has_systemd_user; then
    mkdir -p "$UNIT_DIR"
    cat >"$UNIT" <<EOF
[Unit]
Description=Jira Tempo Timer (local time tracker)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment="PATH=$(service_path)"
ExecStart=/bin/bash "$START" --background
# Restart if it crashes, but not after a clean exit.
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$NAME.service"
    echo "Installed systemd user service: $UNIT"
  else
    # Desktop sessions without systemd (or WSL): XDG autostart entry.
    mkdir -p "$(dirname "$DESKTOP")"
    local q="${START//\"/\\\"}"
    cat >"$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Jira Tempo Timer
Comment=Local time tracker for Jira and Tempo
Exec=/bin/bash "$q" --background
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
    echo "Installed autostart entry: $DESKTOP"
    echo "(No systemd user session found, so it starts with your desktop login, without crash restarts.)"
    stop_manual_instance
    PATH="$(service_path)" nohup /bin/bash "$START" --background >/dev/null 2>&1 &
  fi
}

linux_uninstall() {
  if [ -f "$UNIT" ]; then
    systemctl --user disable --now "$NAME.service" 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload 2>/dev/null || true
    echo "Removed systemd user service."
  fi
  if [ -f "$DESKTOP" ]; then
    rm -f "$DESKTOP"
    pkill -f "node server/index.js" 2>/dev/null || true
    echo "Removed autostart entry."
  fi
}

linux_registered() { [ -f "$UNIT" ] || [ -f "$DESKTOP" ]; }

# ----------------------------------------------------------------- Windows
win_startup_file() {
  local appdata
  appdata="$(cygpath -u "$APPDATA")"
  echo "$appdata/Microsoft/Windows/Start Menu/Programs/Startup/$NAME.vbs"
}

win_install() {
  local vbs bash_exe app_win
  vbs="$(win_startup_file)"
  bash_exe="$(cygpath -w "$(command -v bash)")"
  app_win="$(cygpath -w "$APP_DIR")"
  # VBScript runs Git Bash with a hidden window (0) so no console pops up at login.
  cat >"$vbs" <<EOF
' Starts Jira Tempo Timer in the background at login. Remove with: ./autostart.sh uninstall
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$app_win"
sh.Run """$bash_exe"" -lc ""./start.sh --background""", 0, False
EOF
  echo "Installed Startup launcher: $(cygpath -w "$vbs")"
  stop_manual_instance
  wscript.exe "$(cygpath -w "$vbs")"
}

win_uninstall() {
  rm -f "$(win_startup_file)"
  taskkill //F //FI "WINDOWTITLE eq $NAME" >/dev/null 2>&1 || true
  pkill -f "server/index.js" 2>/dev/null || true
  echo "Removed Startup launcher. (If it's still running, stop node.exe in Task Manager or restart.)"
}

win_registered() { [ -f "$(win_startup_file)" ]; }

# --------------------------------------------------------------------- main
case "$(uname -s)" in
  Darwin) OS=mac ;;
  Linux) OS=linux ;;
  MINGW* | MSYS* | CYGWIN*) OS=win ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

case "${1:-}" in
  install)
    echo "Preparing (npm install + build)…"
    prepare
    [ "$OS" = mac ] && stop_manual_instance
    [ "$OS" = linux ] && has_systemd_user && stop_manual_instance
    "${OS}_install"
    wait_until_up
    echo "It will now start automatically each time you log in."
    ;;
  uninstall)
    "${OS}_uninstall"
    ;;
  status)
    if "${OS}_registered"; then echo "Autostart: enabled"; else echo "Autostart: not installed"; fi
    if is_running; then echo "App:       running at http://localhost:$(port)"; else echo "App:       not running"; fi
    echo "Log:       $LOG"
    ;;
  *)
    usage
    [ -z "${1:-}" ] || exit 1
    ;;
esac
