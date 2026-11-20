@echo off
rem ---------------------------------------------------------------------------
rem Start Jira Tempo Timer on Windows (same options as start.sh):
rem   start.cmd            build if needed, run on http://localhost:3001, open browser
rem   start.cmd --tray     system tray app
rem   start.cmd --dev      hot-reload dev mode on http://localhost:5173
rem   start.cmd --no-open  do not open the browser
rem ---------------------------------------------------------------------------
setlocal
where node >/dev/null 2>/dev/null || (
  echo Node.js 20 or newer is required: https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0scripts\launch.mjs" %*
rem Keep the window open on errors when started by double-click.
if errorlevel 1 pause
