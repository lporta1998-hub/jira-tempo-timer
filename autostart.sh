#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Start Jira Tempo Timer automatically when you log in.
#
#   ./autostart.sh install                start the menu bar app at login (and now)
#   ./autostart.sh install --server-only  only the background server (use the browser)
#   ./autostart.sh uninstall              remove it from login and stop it
#   ./autostart.sh status                 show whether it is registered and running
#
# What it uses on each OS:
#   macOS    LaunchAgent   ~/Library/LaunchAgents/com.jira-tempo-timer.plist
#   Linux    ~/.config/autostart entry (server-only: systemd user service if available)
#   Windows  a hidden launcher in your Startup folder (run this from Git Bash)
#
# Output goes to logs/server.log. After a `git pull`, it rebuilds itself on the
# next start.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="jira-tempo-timer"
LABEL="com.jira-tempo-timer"
START="$APP_DIR/start.sh"
LOG="$APP_DIR/logs/server.log"

# Menu bar app by default; `install --server-only` runs just the server.
MODE=tray
[ "${2:-}" = "--server-only" ] && MODE=server
if [ "$MODE" = tray ]; then START_ARGS=(--tray --background); else START_ARGS=(--background); fi
ARGS_STR="${START_ARGS[*]}"

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

# Stops copies started by hand (./start.sh, the menu bar app), so the login item can own the port.
stop_all() {
  pkill -f "node server/index.js" 2>/dev/null || true
  # Only the main Electron process (its helpers exit with it): ".../electron ." or ".../Electron ."
  pkill -f "$APP_DIR/node_modules/electron/dist/.*lectron \\." 2>/dev/null || true
  sleep 1
}
stop_manual_instance() { if is_running; then stop_all; fi; }

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
$(for a in "${START_ARGS[@]}"; do echo "    <string>$a</string>"; done)
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
  stop_all
  echo "Removed LaunchAgent."
}

mac_registered() { [ -f "$PLIST" ]; }

# ------------------------------------------------------------------- Linux
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/$NAME.service"
DESKTOP="$HOME/.config/autostart/$NAME.desktop"

has_systemd_user() { command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; }

linux_install() {
  # The tray app needs your desktop session (display), so it always uses XDG autostart.
  if [ "$MODE" = server ] && has_systemd_user; then
    rm -f "$DESKTOP"
    mkdir -p "$UNIT_DIR"
    cat >"$UNIT" <<EOF
[Unit]
Description=Jira Tempo Timer (local time tracker)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment="PATH=$(service_path)"
ExecStart=/bin/bash "$START" $ARGS_STR
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
    # Desktop session login item (tray app, or server without systemd).
    if [ -f "$UNIT" ]; then
      systemctl --user disable --now "$NAME.service" 2>/dev/null || true
      rm -f "$UNIT"
    fi
    mkdir -p "$(dirname "$DESKTOP")"
    local q="${START//\"/\\\"}"
    cat >"$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Jira Tempo Timer
Comment=Local time tracker for Jira and Tempo
Exec=/bin/bash "$q" $ARGS_STR
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
    echo "Installed autostart entry: $DESKTOP"
    [ "$MODE" = server ] && echo "(No systemd user session found, so it starts with your desktop login, without crash restarts.)"
    stop_all
    PATH="$(service_path)" nohup /bin/bash "$START" "${START_ARGS[@]}" >/dev/null 2>&1 &
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
    echo "Removed autostart entry."
  fi
  stop_all
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
sh.Run """$bash_exe"" -lc ""./start.sh $ARGS_STR""", 0, False
EOF
  echo "Installed Startup launcher: $(cygpath -w "$vbs")"
  stop_all
  wscript.exe "$(cygpath -w "$vbs")"
}

win_uninstall() {
  rm -f "$(win_startup_file)"
  stop_all
  echo "Removed Startup launcher. (If it's still running, quit it from the tray icon.)"
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
    [ "$OS" = mac ] && stop_all
    [ "$OS" = linux ] && [ "$MODE" = server ] && has_systemd_user && stop_manual_instance
    "${OS}_install"
    wait_until_up
    if [ "$MODE" = tray ]; then
      echo "The menu bar app will now start each time you log in. Look for the stopwatch icon."
    else
      echo "The server will now start each time you log in."
    fi
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
