@echo off
rem Runs every editor test on this PC (see tools\run-tests.js) and writes test-reports\latest.md.
rem Double-click it, or run it from a terminal in this folder.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed or isn't on the PATH. Install it from https://nodejs.org/ and run this again.
  pause
  exit /b 2
)
node tools\run-tests.js %*
set RESULT=%ERRORLEVEL%
echo.
pause
exit /b %RESULT%
