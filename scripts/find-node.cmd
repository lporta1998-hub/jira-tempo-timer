@echo off
rem ---------------------------------------------------------------------------
rem Makes sure node.exe can be found in this window (used by start.cmd and
rem autostart.cmd). A terminal opened before Node was installed doesn't see it
rem on PATH yet, so also look in the usual install folders and add the one
rem found to PATH for this run (npm lives in the same folder).
rem ---------------------------------------------------------------------------
node -v >nul 2>&1 && exit /b 0

for %%D in ("%ProgramFiles%\nodejs" "%NVM_SYMLINK%" "%LOCALAPPDATA%\Programs\nodejs" "%ProgramW6432%\nodejs") do (
  if exist "%%~D\node.exe" (
    set "PATH=%%~D;%PATH%"
    echo Using Node.js from %%~D
    exit /b 0
  )
)

echo.
echo Node.js was not found.
echo   - If you just installed it: close this window, open a new one and try again.
echo   - Otherwise install Node.js 20 or newer (LTS) from https://nodejs.org
echo   - To check: open a new Command Prompt and run   node -v
echo.
exit /b 1
