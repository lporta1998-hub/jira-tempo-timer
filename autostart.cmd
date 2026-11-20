@echo off
rem ---------------------------------------------------------------------------
rem Start the tray app automatically when you log in to Windows:
rem   autostart.cmd install     register it to start at login (and start it now)
rem   autostart.cmd uninstall   remove it from login and quit it
rem   autostart.cmd status      show whether it is registered and running
rem In PowerShell, type .\autostart.cmd instead of autostart.cmd
rem ---------------------------------------------------------------------------
setlocal
call "%~dp0scripts\find-node.cmd"
if errorlevel 1 goto :failed
node "%~dp0scripts\autostart-windows.mjs" %*
if errorlevel 1 goto :failed
exit /b 0

:failed
pause
exit /b 1
