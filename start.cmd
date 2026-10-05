@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Open dashboard.html directly in your browser instead.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser.
node server.cjs
pause
