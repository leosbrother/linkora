@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installa Node.js 18 o superiore e riprova.
  echo https://nodejs.org/
  pause
  exit /b 1
)

start "Linkora server" /min /D "%~dp0" cmd /c node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
endlocal
