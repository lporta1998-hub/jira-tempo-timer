@echo off
rem ---------------------------------------------------------------------------
rem Start the tray app automatically when you log in to Windows:
rem   autostart.cmd install     register it to start at login (and start it now)
rem   autostart.cmd uninstall   remove it from login and quit it
rem   autostart.cmd status      show whether it is registered and running
rem ---------------------------------------------------------------------------
setlocal
where node >/dev/null 2>/dev/null || (
  echo Node.js 20 or newer is required: https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0scripts\autostart-windows.mjs" %*
if errorlevel 1 pause
