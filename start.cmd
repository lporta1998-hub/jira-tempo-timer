@echo off
rem ---------------------------------------------------------------------------
rem Start Jira Tempo Timer on Windows (same options as start.sh):
rem   start.cmd            build if needed, run on http://localhost:3001, open browser
rem   start.cmd --tray     system tray app
rem   start.cmd --dev      hot-reload dev mode on http://localhost:5173
rem   start.cmd --no-open  do not open the browser
rem In PowerShell, type .\start.cmd instead of start.cmd
rem ---------------------------------------------------------------------------
setlocal
call "%~dp0scripts\find-node.cmd"
if errorlevel 1 goto :failed
node "%~dp0scripts\launch.mjs" %*
if errorlevel 1 goto :failed
exit /b 0

:failed
rem Keep the window open when started by double-click, so the error can be read.
pause
exit /b 1
